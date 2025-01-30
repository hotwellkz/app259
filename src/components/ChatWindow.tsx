import React, { useRef, useEffect } from 'react';
import { MdSend } from 'react-icons/md';
import { Chat, WhatsAppMessage } from '../types/WhatsAppTypes';

interface ChatWindowProps {
    chat: Chat | undefined;
    message: string;
    setMessage: (message: string) => void;
    onSendMessage: () => void;
    status: string;
    isMobile: boolean;
}

const ChatWindow: React.FC<ChatWindowProps> = ({
    chat,
    message,
    setMessage,
    onSendMessage,
    status,
    isMobile
}) => {
    const messagesEndRef = useRef<HTMLDivElement>(null);

    const scrollToBottom = () => {
        messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    };

    useEffect(() => {
        scrollToBottom();
    }, [chat?.messages]);

    const formatTime = (timestamp: string) => {
        const date = new Date(timestamp);
        return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    };

    if (!chat) {
        return (
            <div className="hidden md:flex flex-1 items-center justify-center bg-[#f0f2f5]">
                <div className="text-center text-gray-500">
                    <h2 className="text-xl font-medium mb-2">WhatsApp Web</h2>
                    <p>Выберите чат для начала общения</p>
                </div>
            </div>
        );
    }

    return (
        <div className="flex flex-col h-full relative">
            {/* Область сообщений */}
            <div className="flex-1 overflow-y-auto pb-16">
                <div className="space-y-2 p-4">
                    {chat.messages.map((msg, index) => (
                        <div
                            key={index}
                            className={`flex ${msg.fromMe ? 'justify-end' : 'justify-start'}`}
                        >
                            <div
                                className={`max-w-[70%] p-2 rounded-lg ${
                                    msg.fromMe ? 'bg-[#d9fdd3]' : 'bg-white'
                                }`}
                            >
                                <div className="text-sm break-words">{msg.body}</div>
                                <div className="text-right">
                                    <span className="text-xs text-gray-500">
                                        {formatTime(msg.timestamp)}
                                    </span>
                                </div>
                            </div>
                        </div>
                    ))}
                    <div ref={messagesEndRef} />
                </div>
            </div>

            {/* Панель ввода сообщения */}
            <div className="absolute bottom-0 left-0 right-0 bg-[#f0f2f5] p-3">
                <div className="flex items-center gap-2">
                    <input
                        type="text"
                        value={message}
                        onChange={(e) => setMessage(e.target.value)}
                        onKeyPress={(e) => e.key === 'Enter' && onSendMessage()}
                        placeholder="Введите сообщение"
                        className="flex-1 px-4 py-2 rounded-lg focus:outline-none"
                    />
                    <button
                        onClick={onSendMessage}
                        disabled={!message.trim()}
                        className={`p-2 rounded-full ${
                            message.trim() ? 'text-[#00a884] hover:bg-gray-200' : 'text-gray-400'
                        }`}
                    >
                        <MdSend size={24} />
                    </button>
                </div>
            </div>
        </div>
    );
};

export default ChatWindow;
