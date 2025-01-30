export interface WhatsAppMessage {
    from: string;
    to?: string;
    body: string;
    timestamp: string;
    isGroup: boolean;
    sender?: string;
    fromMe: boolean;
}

export interface Chat {
    phoneNumber: string;
    name: string;
    messages: WhatsAppMessage[];
    lastMessage?: WhatsAppMessage;
    unreadCount?: number;
}
