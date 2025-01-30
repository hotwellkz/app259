import express from 'express';
import { Server } from 'socket.io';
import { createServer } from 'http';
import cors from 'cors';
import { Client, LocalAuth, Message, MessageMedia } from 'whatsapp-web.js';
import qrcode from 'qrcode';
import { loadChats, addMessage, saveChats, initializeChatsCache } from './utils/chatStorage';
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

// API endpoint для загрузки медиафайлов
app.post('/upload-media', async (req, res) => {
    try {
        if (!req.files || !req.files.file) {
            return res.status(400).json({ error: 'No file uploaded' });
        }

        const uploadedFile = req.files.file as fileUpload.UploadedFile;
        const buffer = Buffer.from(uploadedFile.data);
        const fileName = uploadedFile.name;
        const mediaType = uploadedFile.mimetype;

        console.log('Uploading file:', fileName, 'type:', mediaType);

        // Загружаем файл в Supabase Storage
        const publicUrl = await uploadMediaToSupabase(buffer, fileName, mediaType);
        console.log('File uploaded successfully:', publicUrl);

        res.json({ url: publicUrl });
    } catch (error) {
        console.error('Error uploading media:', error);
        res.status(500).json({ error: 'Failed to upload media' });
    }
});

// API endpoint для получения сохраненных чатов
app.get('/chats', async (req, res) => {
    try {
        console.log('Loading chats...');
        const chats = await loadChats();
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

// Обработчики событий Socket.IO
io.on('connection', (socket) => {
    console.log('Client connected');

    // Отправляем текущие чаты при подключении
    (async () => {
        try {
            const chats = await loadChats();
            socket.emit('chats', chats);
        } catch (error) {
            console.error('Error sending chats:', error);
        }
    })();

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
            
            let whatsappMessage;
            
            // Если есть медиафайл, скачиваем его и отправляем через WhatsApp
            if (mediaUrl) {
                console.log('Downloading media from:', mediaUrl);
                try {
                    const response = await axios.get(mediaUrl, {
                        responseType: 'arraybuffer'
                    });
                    
                    const buffer = Buffer.from(response.data as ArrayBuffer);
                    const mimeType = mediaType || 'application/octet-stream';
                    
                    // Создаем объект MessageMedia
                    const media = new MessageMedia(
                        mimeType,
                        buffer.toString('base64'),
                        fileName
                    );
                    
                    // Отправляем медиафайл через WhatsApp
                    whatsappMessage = await client.sendMessage(formattedNumber, media, {
                        caption: message // Добавляем текст сообщения как подпись к медиафайлу
                    });
                    
                    console.log('Media message sent successfully:', whatsappMessage.id._serialized);
                } catch (error) {
                    console.error('Error downloading or sending media:', error);
                    throw new Error('Failed to send media message');
                }
            } else {
                // Отправляем обычное текстовое сообщение
                whatsappMessage = await client.sendMessage(formattedNumber, message);
                console.log('Text message sent successfully:', whatsappMessage.id._serialized);
            }
            
            // Создаем объект сообщения для сохранения
            const chatMessage: ChatMessage = {
                id: whatsappMessage.id._serialized,
                body: message || '',
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

            // Сохраняем сообщение и получаем обновленный чат
            const updatedChat = await addMessage(chatMessage);
            
            // Оповещаем всех клиентов о новом сообщении и обновлении чата
            io.emit('whatsapp-message', chatMessage);
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

// Инициализируем сервер
(async () => {
    try {
        // Инициализируем бакет для медиафайлов
        await initializeMediaBucket();
        console.log('Media storage initialized successfully');

        // Инициализируем кэш чатов
        await initializeChatsCache();
        console.log('Chat cache initialized successfully');

        // Запускаем сервер
        httpServer.listen(PORT, () => {
            console.log(`Server is running on port ${PORT}`);
        });
    } catch (error) {
        console.error('Error initializing server:', error);
    }
})();
