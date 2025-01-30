import express from 'express';
import { Server } from 'socket.io';
import { createServer } from 'http';
import cors from 'cors';
import { Client, LocalAuth, Message } from 'whatsapp-web.js';
import qrcode from 'qrcode';
import { loadChats, addMessage, saveChats } from './utils/chatStorage';
import { Chat, ChatMessage } from './types/chat';
import fileUpload from 'express-fileupload';
import { uploadMediaToSupabase, initializeMediaBucket } from './config/supabase';
import axios from 'axios';
import path from 'path';
import dotenv from 'dotenv';

// Загружаем переменные окружения
const envPath = path.resolve(__dirname, '../.env');
dotenv.config({ path: envPath });

// Настройка Express
const app = express();
const httpServer = createServer(app);

const corsOptions = {
    origin: process.env.FRONTEND_URL || 'http://localhost:5173',
    methods: ['GET', 'POST'],
    credentials: true
};

app.use(cors(corsOptions));
app.use(express.json());
app.use(fileUpload());

// Настройка Socket.IO
const io = new Server(httpServer, {
    cors: {
        origin: process.env.FRONTEND_URL || 'http://localhost:5173',
        methods: ['GET', 'POST'],
        credentials: true
    }
});

// Инициализация WhatsApp клиента
const client = new Client({
    authStrategy: new LocalAuth(),
    puppeteer: {
        args: ['--no-sandbox']
    }
});

// Обработчик для загрузки медиафайлов
app.post('/upload-media', async (req, res) => {
    try {
        if (!req.files || !req.files.file) {
            return res.status(400).json({ error: 'No file uploaded' });
        }

        const file = req.files.file as fileUpload.UploadedFile;
        const buffer = Buffer.from(file.data);
        const mediaUrl = await uploadMediaToSupabase(
            buffer,
            file.name,
            file.mimetype
        );

        res.json({ mediaUrl });
    } catch (error) {
        console.error('Error uploading media:', error);
        res.status(500).json({ error: 'Failed to upload media' });
    }
});

// API endpoint для получения сохраненных чатов
app.get('/chats', async (req, res) => {
    try {
        console.log('Loading chats...');
        const chats = loadChats();
        res.json(chats);
    } catch (error) {
        console.error('Error loading chats:', error);
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
                error: 'Phone number is required' 
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
                error: 'Phone number is not registered in WhatsApp' 
            });
        }

        // Получаем информацию о контакте
        const contact = await client.getContactById(formattedNumber);
        
        // Создаем новый чат
        const newChat: Chat = {
            phoneNumber: formattedNumber,
            name: contact.pushname || phoneNumber,
            messages: [],
            unreadCount: 0,
            lastMessage: undefined
        };

        // Получаем текущие чаты и добавляем новый
        const chats = loadChats();
        chats[formattedNumber] = newChat;
        
        // Сохраняем обновленные чаты
        saveChats(chats);

        // Оповещаем всех клиентов о новом чате
        io.emit('chat-created', newChat);

        res.json({ 
            success: true, 
            chat: newChat
        });
    } catch (error) {
        console.error('Error creating chat:', error);
        res.status(500).json({ 
            success: false, 
            error: 'Failed to create chat' 
        });
    }
});

// Обработка входящих сообщений WhatsApp
client.on('message', async (message: Message) => {
    try {
        let mediaUrl: string | undefined;
        let fileName: string | undefined;
        let fileSize: number | undefined;
        let mediaType: string | undefined;

        // Если сообщение содержит медиафайл
        if (message.hasMedia) {
            const media = await message.downloadMedia();
            if (media) {
                const buffer = Buffer.from(media.data, 'base64');
                mediaUrl = await uploadMediaToSupabase(
                    buffer,
                    `${message.id._serialized}.${media.mimetype.split('/')[1]}`,
                    media.mimetype
                );
                fileName = media.filename || `${message.id._serialized}.${media.mimetype.split('/')[1]}`;
                fileSize = buffer.length;
                mediaType = media.mimetype;
            }
        }

        const whatsappMessage: ChatMessage = {
            id: message.id._serialized,
            from: message.from,
            to: message.to,
            body: message.body,
            timestamp: new Date().toISOString(),
            fromMe: message.fromMe,
            hasMedia: message.hasMedia,
            mediaUrl,
            fileName,
            fileSize,
            mediaType
        };

        const updatedChat = await addMessage(whatsappMessage);
        io.emit('whatsapp-message', whatsappMessage);
        io.emit('chat-updated', updatedChat);

    } catch (error) {
        console.error('Error processing message:', error);
    }
});

// Обработка событий Socket.IO
io.on('connection', (socket) => {
    console.log('Client connected');

    // Отправляем текущие чаты при подключении
    try {
        const chats = loadChats();
        socket.emit('chats', chats);
    } catch (error) {
        console.error('Error sending chats:', error);
    }

    socket.on('send_message', async (data: {
        phoneNumber: string;
        message: string;
        mediaUrl?: string;
        fileName?: string;
        fileSize?: number;
        mediaType?: string;
    }) => {
        try {
            const { phoneNumber, message, mediaUrl, fileName, fileSize, mediaType } = data;
            
            // Форматируем номер телефона
            const formattedNumber = phoneNumber.includes('@c.us') 
                ? phoneNumber 
                : `${phoneNumber.replace(/[^\d]/g, '')}@c.us`;
            
            let messageOptions: any = undefined;
            
            // Если есть медиафайл, скачиваем его и отправляем через WhatsApp
            if (mediaUrl) {
                console.log('Downloading media from:', mediaUrl);
                const response = await axios.get<Buffer>(mediaUrl, {
                    responseType: 'arraybuffer'
                });
                
                const buffer = Buffer.from(response.data);
                const mimeType = mediaType || 'application/octet-stream';
                
                messageOptions = {
                    media: {
                        data: buffer.toString('base64'),
                        mimetype: mimeType,
                        filename: fileName
                    }
                };

                if (message) {
                    messageOptions.caption = message;
                }
            } else {
                messageOptions = message;
            }

            console.log('Sending message to:', formattedNumber);
            // Отправляем сообщение через WhatsApp
            const whatsappMessage = await client.sendMessage(formattedNumber, messageOptions);
            console.log('Message sent successfully:', whatsappMessage.id._serialized);
            
            // Сохраняем сообщение
            const chat: ChatMessage = {
                id: whatsappMessage.id._serialized,
                body: message,
                from: whatsappMessage.from,
                to: formattedNumber,
                timestamp: new Date().toISOString(),
                fromMe: true,
                hasMedia: !!mediaUrl,
                mediaUrl,
                fileName,
                fileSize,
                mediaType
            };

            const updatedChat = await addMessage(chat);
            io.emit('whatsapp-message', chat);
            io.emit('chat-updated', updatedChat);

        } catch (error) {
            console.error('Error sending message:', error);
            socket.emit('error', { message: 'Failed to send message' });
        }
    });

    socket.on('disconnect', () => {
        console.log('Client disconnected');
    });
});

// Обработчики событий WhatsApp
client.on('qr', async (qr) => {
    try {
        const qrCode = await qrcode.toDataURL(qr);
        io.emit('whatsapp-qr', qrCode);
    } catch (error) {
        console.error('Error generating QR code:', error);
    }
});

client.on('ready', () => {
    console.log('WhatsApp client is ready');
    io.emit('whatsapp-ready');
});

client.on('authenticated', () => {
    console.log('WhatsApp client is authenticated');
    io.emit('whatsapp-authenticated');
});

client.on('auth_failure', (error) => {
    console.error('WhatsApp authentication failed:', error);
    io.emit('whatsapp-auth-failure', error);
});

client.on('disconnected', (reason) => {
    console.log('WhatsApp client was disconnected:', reason);
    io.emit('whatsapp-disconnected', reason);
});

// Инициализация WhatsApp клиента
client.initialize().catch((error) => {
    console.error('Failed to initialize WhatsApp client:', error);
});

const PORT = process.env.PORT || 3000;

// Инициализируем бакет при запуске сервера
(async () => {
    try {
        await initializeMediaBucket();
        console.log('Media storage initialized successfully');
    } catch (error) {
        console.error('Failed to initialize media storage:', error);
    }
})();

// Запуск сервера
httpServer.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});
