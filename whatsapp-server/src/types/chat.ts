export interface ChatMessage {
    id: string;
    body: string;
    from?: string;
    to?: string;
    timestamp: string;
    fromMe: boolean;
    sender?: string;
    hasMedia?: boolean;
    mediaUrl?: string;
    mediaType?: string;
    fileName?: string;
    fileSize?: number;
}

export interface Chat {
    phoneNumber: string;
    name: string;
    lastMessage?: ChatMessage;
    messages: ChatMessage[];
    unreadCount: number;
}

export interface ChatStore {
    [key: string]: Chat;
}
