import { ChatMessage, ChatStore, Chat } from '../types/chat';
import { getChatsFromSupabase, saveChatToSupabase } from '../config/supabase';

// Кэш для чатов
let chatsCache: ChatStore = {};

// Инициализация кэша из Supabase
export async function initializeChatsCache(): Promise<void> {
    try {
        chatsCache = await getChatsFromSupabase();
        console.log('Chats loaded from Supabase:', Object.keys(chatsCache).length);
    } catch (error) {
        console.error('Error initializing chats cache:', error);
        chatsCache = {};
    }
}

// Добавление сообщения в чат
export async function addMessage(message: ChatMessage): Promise<Chat> {
    const phoneNumber = message.fromMe ? message.to! : message.from!;
    
    if (!chatsCache[phoneNumber]) {
        chatsCache[phoneNumber] = {
            phoneNumber,
            name: phoneNumber,
            messages: [],
            unreadCount: 0
        };
    }

    const chat = chatsCache[phoneNumber];
    chat.messages.push(message);
    chat.lastMessage = message;
    
    if (!message.fromMe) {
        chat.unreadCount++;
    }

    // Сохраняем обновленный чат в Supabase
    try {
        await saveChatToSupabase(chat);
    } catch (error) {
        console.error('Error saving chat to Supabase:', error);
    }

    return chat;
}

// Загрузка чатов
export async function loadChats(): Promise<ChatStore> {
    try {
        // Обновляем кэш из Supabase
        const supabaseChats = await getChatsFromSupabase();
        chatsCache = supabaseChats;
        return chatsCache;
    } catch (error) {
        console.error('Error loading chats:', error);
        return chatsCache;
    }
}

// Сохранение чатов
export async function saveChats(chats: ChatStore): Promise<void> {
    chatsCache = chats;
    
    // Сохраняем каждый чат в Supabase
    try {
        await Promise.all(
            Object.values(chats).map(chat => saveChatToSupabase(chat))
        );
    } catch (error) {
        console.error('Error saving chats to Supabase:', error);
    }
}

// Получение чата по номеру телефона
export function getChat(phoneNumber: string): Chat | undefined {
    return chatsCache[phoneNumber];
}

// Очистка непрочитанных сообщений
export async function clearUnread(phoneNumber: string): Promise<void> {
    if (chatsCache[phoneNumber]) {
        chatsCache[phoneNumber].unreadCount = 0;
        
        // Сохраняем обновленный чат в Supabase
        try {
            await saveChatToSupabase(chatsCache[phoneNumber]);
        } catch (error) {
            console.error('Error saving chat to Supabase:', error);
        }
    }
}
