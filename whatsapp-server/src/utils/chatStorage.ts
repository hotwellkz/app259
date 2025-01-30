import { saveChatsToSupabase, getLatestChatsFromSupabase } from '../config/supabase';

interface Message {
    from: string;
    to?: string;
    body: string;
    timestamp: string;
    isGroup: boolean;
    sender?: string;
    fromMe: boolean;
}

interface Chat {
    phoneNumber: string;
    name: string;
    messages: Message[];
    lastMessage?: Message;
}

type ChatStore = { [key: string]: Chat };

// Кэш для чатов
let chatsCache: ChatStore = {};

// Загрузка чатов
export async function loadChats(): Promise<ChatStore> {
    try {
        // Если есть кэш, возвращаем его
        if (Object.keys(chatsCache).length > 0) {
            return chatsCache;
        }

        // Загружаем из Supabase
        const supabaseChats = await getLatestChatsFromSupabase();
        chatsCache = supabaseChats || {};
        return chatsCache;
    } catch (error) {
        console.error('Error loading chats:', error);
        return {};
    }
}

// Сохранение чатов
export async function saveChats(chats: ChatStore) {
    try {
        // Обновляем кэш
        chatsCache = chats;
        // Сохраняем в Supabase
        await saveChatsToSupabase(chats);
    } catch (error) {
        console.error('Error saving chats:', error);
        throw error;
    }
}

// Добавление нового сообщения
export async function addMessage(message: Message): Promise<Chat> {
    const chats = await loadChats();
    const phoneNumber = message.fromMe ? message.to! : message.from;
    
    if (!chats[phoneNumber]) {
        chats[phoneNumber] = {
            phoneNumber,
            name: phoneNumber,
            messages: [],
            lastMessage: message
        };
    }
    
    chats[phoneNumber].messages.push(message);
    chats[phoneNumber].lastMessage = message;
    
    await saveChats(chats);
    return chats[phoneNumber];
}
