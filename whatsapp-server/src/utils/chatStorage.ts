import { ChatMessage, ChatStore, Chat } from '../types/chat';

// Кэш для чатов
let chatsCache: ChatStore = {};

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

    return chat;
}

// Загрузка чатов
export function loadChats(): ChatStore {
    return chatsCache;
}

// Сохранение чатов
export function saveChats(chats: ChatStore): void {
    chatsCache = chats;
}

// Получение чата по номеру телефона
export function getChat(phoneNumber: string): Chat | undefined {
    return chatsCache[phoneNumber];
}

// Очистка непрочитанных сообщений
export function clearUnread(phoneNumber: string): void {
    if (chatsCache[phoneNumber]) {
        chatsCache[phoneNumber].unreadCount = 0;
    }
}
