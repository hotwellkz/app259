export interface WhatsAppMessage {
    id: string;
    body: string;
    from?: string;
    to?: string;
    timestamp: string;
    fromMe: boolean;
    sender?: string;
    hasMedia?: boolean;
    mediaUrl?: string;
    mediaType?: 'image' | 'video' | 'document';
    fileName?: string;
    fileSize?: number;
}

export interface Chat {
    phoneNumber: string;
    name: string;
    lastMessage?: WhatsAppMessage;
    messages: WhatsAppMessage[];
    unreadCount: number;
}

export interface ChatStore {
    [key: string]: Chat;
}
