import express from 'express';
import { Server } from 'socket.io';
import { createServer } from 'http';
import { Client, LocalAuth, Message } from 'whatsapp-web.js';
import qrcode from 'qrcode';
import fs from 'fs';
import dotenv from 'dotenv';
import path from 'path';
import cors from 'cors';
import { loadChats, addMessage, saveChats } from './utils/chatStorage';
import { ChatMessage, Chat } from './types/chat';

// Загружаем переменные окружения
const envPath = path.resolve(__dirname, '../.env');
console.log('Путь к .env файлу:', envPath);
dotenv.config({ path: envPath });
console.log('Переменные окружения загружены');

const app = express();
const httpServer = createServer(app);

// Список разрешенных источников
const allowedOrigins = [
    'http://localhost:5173',
    'http://localhost:5174',
    'https://2wix.ru',
    'https://www.2wix.ru',
    'https://netlify.app',
    'http://192.168.100.36:5173'
];

// Настройка CORS
const corsOptions = {
    origin: function (origin: string | undefined, callback: (err: Error | null, allow?: boolean) => void) {
        // Разрешаем запросы без origin (например, от Postman или curl)
        if (!origin) {
            return callback(null, true);
        }
        
        if (allowedOrigins.includes(origin)) {
            callback(null, true);
        } else {
            callback(new Error('Not allowed by CORS'));
        }
    },
    methods: ['GET', 'POST'],
    credentials: true
};

app.use(cors(corsOptions));
app.use(express.json());

// Настройка Socket.IO
const io = new Server(httpServer, {
    cors: {
        origin: allowedOrigins,
        methods: ["GET", "POST"],
        credentials: true
    },
    pingTimeout: 60000
});

// Инициализация WhatsApp клиента
const client = new Client({
    authStrategy: new LocalAuth(),
    puppeteer: {
        args: ['--no-sandbox'],
        headless: true
    }
});

// API endpoint для получения сохраненных чатов
app.get('/chats', async (req, res) => {
    console.log('GET /chats запрос получен');
    try {
        const chats = await loadChats();
        console.log('Чаты загружены:', chats);
        res.json(chats);
    } catch (error) {
        console.error('Ошибка при загрузке чатов:', error);
        res.status(500).json({ error: 'Failed to load chats' });
    }
});

// API endpoint для создания нового чата
app.post('/chat', async (req, res) => {
    try {
        const { phoneNumber } = req.body;

        if (!phoneNumber) {
            return res.status(400).json({ 
                success: false, 
                error: 'Необходимо указать номер телефона' 
            });
        }

        // Форматируем номер телефона
        const formattedNumber = phoneNumber.includes('@c.us') 
            ? phoneNumber 
            : `${phoneNumber.replace(/[^\d]/g, '')}@c.us`;

        // Проверяем существование контакта в WhatsApp
        const contactExists = await client.isRegisteredUser(formattedNumber);
        
        if (!contactExists) {
            return res.status(404).json({ 
                success: false, 
                error: 'Номер не зарегистрирован в WhatsApp' 
            });
        }

        // Получаем информацию о контакте
        const contact = await client.getContactById(formattedNumber);
        
        // Создаем новый чат
        const newChat: Chat = {
            phoneNumber: formattedNumber,
            name: contact.pushname || phoneNumber,
            messages: [],
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
        };

        // Получаем текущие чаты и добавляем новый
        const chats = await loadChats();
        chats[formattedNumber] = newChat;
        
        // Сохраняем обновленные чаты
        await saveChats(chats);

        // Оповещаем всех клиентов о новом чате
        io.emit('chat-created', newChat);

        res.json({ 
            success: true, 
            chat: newChat
        });
    } catch (error) {
        console.error('Ошибка при создании чата:', error);
        res.status(500).json({ 
            success: false, 
            error: 'Ошибка при создании чата' 
        });
    }
});

// Обработка socket.io подключений
io.on('connection', async (socket) => {
    console.log('Новое Socket.IO подключение');

    // Отправляем текущие чаты при подключении
    try {
        const chats = await loadChats();
        socket.emit('chats', chats);
    } catch (error) {
        console.error('Ошибка при отправке чатов через сокет:', error);
    }

    socket.on('disconnect', () => {
        console.log('Socket.IO клиент отключился');
    });
});

// Обработчики событий WhatsApp
client.on('qr', async (qr) => {
    try {
        const qrCode = await qrcode.toDataURL(qr);
        io.emit('qr', qrCode.split(',')[1]);
    } catch (error) {
        console.error('Error generating QR code:', error);
    }
});

client.on('ready', () => {
    console.log('WhatsApp клиент готов');
    console.log('Состояние клиента:', {
        authenticated: client.info ? true : false,
        pushname: client.info?.pushname,
        wid: client.info?.wid
    });
    io.emit('ready');
});

client.on('authenticated', () => {
    console.log('WhatsApp аутентифицирован');
    io.emit('authenticated');
});

client.on('auth_failure', (msg) => {
    console.error('Ошибка аутентификации:', msg);
    io.emit('auth_failure', msg);
});

client.on('disconnected', (reason) => {
    console.log('WhatsApp отключен:', reason);
    io.emit('disconnected', reason);
});

// Добавляем обработчик для проверки состояния соединения
setInterval(() => {
    if (client.info) {
        console.log('WhatsApp клиент активен:', {
            authenticated: true,
            pushname: client.info.pushname,
            wid: client.info.wid
        });
    } else {
        console.log('WhatsApp клиент не авторизован или не готов');
    }
}, 30000);

// Обработка входящих сообщений
client.on('message', async (message: Message) => {
    try {
        const chat = await message.getChat();
        const contact = await message.getContact();
        
        const whatsappMessage: ChatMessage = {
            id: message.id.id, // Добавляем ID сообщения
            from: message.from,
            to: message.to,
            body: message.body,
            timestamp: new Date(message.timestamp * 1000).toISOString(),
            isGroup: chat.isGroup,
            fromMe: message.fromMe,
            sender: chat.isGroup ? contact.pushname || contact.number : undefined
        };

        console.log('Получено новое сообщение:', whatsappMessage);

        // Сохраняем сообщение локально
        const updatedChat = addMessage(whatsappMessage);
        
        // Отправляем обновление всем клиентам
        io.emit('whatsapp-message', whatsappMessage);
        io.emit('chat-updated', updatedChat);

        console.log('Сообщение обработано и отправлено клиентам');
    } catch (error) {
        console.error('Ошибка при обработке сообщения:', error);
    }
});

// API для отправки сообщений
app.post('/send-message', async (req, res) => {
    try {
        const { phoneNumber, message } = req.body;
        console.log('Получен запрос на отправку сообщения:', { phoneNumber, message });

        // Проверяем авторизацию
        if (!client.info) {
            console.error('WhatsApp клиент не авторизован!');
            return res.status(500).json({
                success: false,
                error: 'WhatsApp клиент не авторизован. Пожалуйста, отсканируйте QR-код'
            });
        }

        // Проверяем формат номера
        if (!phoneNumber.match(/^\d+@c\.us$/)) {
            console.error('Неверный формат номера телефона:', phoneNumber);
            return res.status(400).json({
                success: false,
                error: 'Неверный формат номера телефона'
            });
        }

        try {
            // Проверяем доступность номера
            console.log('Проверка номера в WhatsApp:', phoneNumber);
            const isRegistered = await client.isRegisteredUser(phoneNumber);
            if (!isRegistered) {
                console.error('Номер не зарегистрирован в WhatsApp:', phoneNumber);
                return res.status(400).json({
                    success: false,
                    error: 'Номер не зарегистрирован в WhatsApp'
                });
            }

            // Пытаемся отправить сообщение
            console.log('Отправка сообщения...', { to: phoneNumber, message });
            const response = await client.sendMessage(phoneNumber, message);
            console.log('Ответ от отправки:', response);

            if (!response || !response.id) {
                throw new Error('Не получен ID сообщения');
            }

            // Сохраняем сообщение
            const sentMessage: ChatMessage = {
                id: response.id.id,
                from: client.info.wid._serialized,
                to: phoneNumber,
                body: message,
                timestamp: new Date().toISOString(),
                isGroup: false,
                fromMe: true
            };

            const updatedChat = addMessage(sentMessage);
            io.emit('whatsapp-message', sentMessage);
            io.emit('chat-updated', updatedChat);

            res.json({
                success: true,
                message: 'Сообщение отправлено',
                messageId: response.id.id
            });
        } catch (error) {
            console.error('Ошибка при отправке:', error);
            throw error;
        }
    } catch (error) {
        console.error('Ошибка при отправке сообщения:', error);
        res.status(500).json({ 
            success: false, 
            error: 'Ошибка при отправке сообщения' 
        });
    }
});

const port = 3000;

// Запуск сервера
httpServer.listen(port, () => {
    console.log(`Сервер запущен на порту ${port}`);
    
    // Инициализируем хранилище чатов
    try {
        const chats = loadChats();
        console.log('Chat storage initialized successfully');
    } catch (error) {
        console.error('Error initializing chat storage:', error);
    }
    
    // Инициализация WhatsApp клиента
    client.initialize()
        .catch(error => console.error('Ошибка при инициализации WhatsApp клиента:', error));
});
