import React, { useState, useRef, useEffect } from 'react';
import { WhatsAppMessage } from '../types/WhatsAppTypes';
import { MdSend, MdAttachFile, MdArrowBack } from 'react-icons/md';

interface ChatWindowProps {
    chat: {
        phoneNumber: string;
        name: string;
        messages: WhatsAppMessage[];
    };
    onSendMessage: (message: string, file?: File) => Promise<void>;
    isMobile: boolean;
    onBack: () => void;
}

const ChatWindow: React.FC<ChatWindowProps> = ({ chat, onSendMessage, isMobile, onBack }) => {
    const [message, setMessage] = useState('');
    const [selectedFile, setSelectedFile] = useState<File | null>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const messagesEndRef = useRef<HTMLDivElement>(null);

    const handleSend = async () => {
        if (message.trim() || selectedFile) {
            await onSendMessage(message, selectedFile || undefined);
            setMessage('');
            setSelectedFile(null);
        }
    };

    const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        if (file) {
            setSelectedFile(file);
        }
    };

    const formatTime = (timestamp: string) => {
        const date = new Date(timestamp);
        return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    };

    const renderMedia = (message: WhatsAppMessage) => {
        if (!message.hasMedia || !message.mediaUrl) return null;

        // Определяем тип медиа по MIME-типу
        const mediaType = message.mediaType?.toLowerCase() || '';
        console.log('Media type:', mediaType, 'URL:', message.mediaUrl);

        if (mediaType.startsWith('image/') || mediaType === 'image') {
            return (
                <img
                    src={message.mediaUrl}
                    alt="Изображение"
                    className="max-w-[200px] max-h-[200px] rounded-lg cursor-pointer"
                    onClick={() => window.open(message.mediaUrl, '_blank')}
                />
            );
        } else if (mediaType.startsWith('video/') || mediaType === 'video') {
            return (
                <video
                    src={message.mediaUrl}
                    controls
                    className="max-w-[200px] max-h-[200px] rounded-lg"
                />
            );
        } else {
            return (
                <a
                    href={message.mediaUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-2 text-blue-500 hover:text-blue-700"
                >
                    <MdAttachFile />
                    <span>{message.fileName || 'Скачать файл'}</span>
                    {message.fileSize && (
                        <span className="text-sm text-gray-500">
                            ({(message.fileSize / 1024 / 1024).toFixed(2)} MB)
                        </span>
                    )}
                </a>
            );
        }
    };

    const scrollToBottom = () => {
        messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    };

    useEffect(() => {
        scrollToBottom();
    }, [chat.messages]);

    return (
        <div className="flex flex-col h-full">
            {/* Заголовок чата */}
            <div className="bg-[#f0f2f5] p-4 flex items-center gap-4">
                {isMobile && (
                    <button onClick={onBack} className="text-gray-600">
                        <MdArrowBack size={24} />
                    </button>
                )}
                <div>
                    <h2 className="font-semibold">{chat.name}</h2>
                    <p className="text-sm text-gray-500">{chat.phoneNumber}</p>
                </div>
            </div>

            {/* Область сообщений */}
            <div className="flex-1 overflow-y-auto p-4 space-y-4">
                {chat.messages.map((msg, index) => (
                    <div
                        key={index}
                        className={`flex ${msg.fromMe ? 'justify-end' : 'justify-start'}`}
                    >
                        <div
                            className={`max-w-[70%] rounded-lg p-3 ${
                                msg.fromMe ? 'bg-[#d9fdd3]' : 'bg-white'
                            }`}
                        >
                            {renderMedia(msg)}
                            {msg.body && <p className="break-words">{msg.body}</p>}
                            <span className="text-xs text-gray-500 mt-1 block">
                                {formatTime(msg.timestamp)}
                            </span>
                        </div>
                    </div>
                ))}
                <div ref={messagesEndRef} />
            </div>

            {/* Панель ввода */}
            <div className="bg-[#f0f2f5] p-4">
                <div className="flex items-center gap-2">
                    <button
                        onClick={() => fileInputRef.current?.click()}
                        className="text-gray-600 hover:text-gray-800"
                    >
                        <MdAttachFile size={24} />
                    </button>
                    <input
                        type="file"
                        ref={fileInputRef}
                        onChange={handleFileSelect}
                        className="hidden"
                    />
                    <input
                        type="text"
                        value={message}
                        onChange={(e) => setMessage(e.target.value)}
                        onKeyPress={(e) => e.key === 'Enter' && handleSend()}
                        placeholder="Введите сообщение"
                        className="flex-1 rounded-lg px-4 py-2 focus:outline-none"
                    />
                    <button
                        onClick={handleSend}
                        className="text-[#00a884] hover:text-[#017561]"
                    >
                        <MdSend size={24} />
                    </button>
                </div>
                {selectedFile && (
                    <div className="mt-2 text-sm text-gray-600 flex items-center gap-2">
                        <MdAttachFile />
                        <span>{selectedFile.name}</span>
                        <button
                            onClick={() => setSelectedFile(null)}
                            className="text-red-500 hover:text-red-700"
                        >
                            ✕
                        </button>
                    </div>
                )}
            </div>
        </div>
    );
};

export default ChatWindow;
