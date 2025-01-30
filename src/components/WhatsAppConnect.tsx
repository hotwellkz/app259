import React, { useEffect, useState } from 'react';
import { io, Socket } from 'socket.io-client';
import { WhatsAppMessage } from '../types/WhatsAppTypes';
import { useChat } from '../context/ChatContext';
import ChatList from './ChatList';
import ChatWindow from './ChatWindow';
import { MdArrowBack } from 'react-icons/md';

interface WhatsAppConnectProps {
    serverUrl: string;
    isMobile: boolean;
}

interface Chat {
    phoneNumber: string;
    name: string;
    lastMessage?: WhatsAppMessage;
    messages: WhatsAppMessage[];
    unreadCount: number;
}

const WhatsAppConnect: React.FC<WhatsAppConnectProps> = ({ serverUrl, isMobile }) => {
    const { setQrCode } = useChat();
    const [socket, setSocket] = useState<Socket | null>(null);
    const [isQrScanned, setIsQrScanned] = useState<boolean>(false);
    const [status, setStatus] = useState<string>('Подключение...');
    const [message, setMessage] = useState<string>('');
    const [chats, setChats] = useState<{ [key: string]: Chat }>({});
    const [activeChat, setActiveChat] = useState<string | null>(null);
    const [searchQuery, setSearchQuery] = useState<string>('');
    const [showNewChatDialog, setShowNewChatDialog] = useState(false);
    const [newChatPhone, setNewChatPhone] = useState('');
    const [newChatName, setNewChatName] = useState('');

    // Функция для форматирования номера телефона
    const formatPhoneNumber = (phoneNumber: string) => {
        const cleaned = phoneNumber.replace(/\D/g, '');
        return cleaned.endsWith('@c.us') ? cleaned : `${cleaned}@c.us`;
    };

    // Функция создания нового контакта
    const handleCreateNewChat = () => {
        if (!newChatPhone) {
            alert('Пожалуйста, введите номер телефона');
            return;
        }

        const formattedPhone = formatPhoneNumber(newChatPhone);
        
        const newChat: Chat = {
            phoneNumber: formattedPhone,
            name: newChatName || formattedPhone.replace('@c.us', ''),
            messages: [],
            unreadCount: 0
        };

        setChats(prevChats => ({
            ...prevChats,
            [formattedPhone]: newChat
        }));

        setActiveChat(formattedPhone);
        setNewChatPhone('');
        setNewChatName('');
        setShowNewChatDialog(false);
        setSearchQuery('');
    };

    // Функция для добавления сообщения в чат
    const addMessageToChat = (message: WhatsAppMessage) => {
        const phoneNumber = message.fromMe ? message.to! : message.from;
        
        setChats(prevChats => {
            const updatedChats = { ...prevChats };
            if (!updatedChats[phoneNumber]) {
                updatedChats[phoneNumber] = {
                    phoneNumber,
                    name: message.sender || formatPhoneNumber(phoneNumber).replace('@c.us', ''),
                    messages: [],
                    unreadCount: 0
                };
            }

            const messageExists = updatedChats[phoneNumber].messages.some(
                existingMsg => 
                    existingMsg.body === message.body && 
                    existingMsg.fromMe === message.fromMe &&
                    Math.abs(new Date(existingMsg.timestamp).getTime() - new Date(message.timestamp).getTime()) < 1000
            );

            if (!messageExists) {
                updatedChats[phoneNumber].messages = [...updatedChats[phoneNumber].messages, message];
                updatedChats[phoneNumber].lastMessage = message;
                if (!message.fromMe && phoneNumber !== activeChat) {
                    updatedChats[phoneNumber].unreadCount += 1;
                }
            }

            return updatedChats;
        });
    };

    // Функция для сброса счетчика непрочитанных сообщений
    const resetUnreadCount = (phoneNumber: string) => {
        setChats(prevChats => ({
            ...prevChats,
            [phoneNumber]: {
                ...prevChats[phoneNumber],
                unreadCount: 0
            }
        }));
    };

    useEffect(() => {
        const newSocket = io(serverUrl, {
            withCredentials: true
        });

        newSocket.on('connect', () => {
            setStatus('Подключено к серверу');
        });

        newSocket.on('qr', (qrData: string) => {
            console.log('Получен QR-код, длина:', qrData.length);
            try {
                const parsedData = JSON.parse(qrData);
                console.log('QR данные в формате JSON:', parsedData);
                
                if (typeof parsedData === 'object') {
                    const qrString = parsedData.code || parsedData.qr || parsedData.data || qrData;
                    console.log('Извлеченная строка QR:', qrString);
                    setQrCode(qrString);
                } else {
                    setQrCode(qrData);
                }
            } catch (e) {
                console.log('QR данные в обычном формате:', qrData);
                setQrCode(qrData);
            }
            
            setIsQrScanned(false);
            setStatus('Ожидание сканирования QR-кода');
        });

        newSocket.on('ready', () => {
            console.log('WhatsApp готов');
            setStatus('WhatsApp подключен');
            setIsQrScanned(true);
            setQrCode('');
        });

        newSocket.on('whatsapp-message', (message: WhatsAppMessage) => {
            console.log('Получено новое сообщение:', message);
            addMessageToChat(message);
        });

        newSocket.on('chat-updated', (updatedChat: Chat) => {
            console.log('Получено обновление чата:', updatedChat);
            setChats(prevChats => ({
                ...prevChats,
                [updatedChat.phoneNumber]: updatedChat
            }));
        });

        newSocket.on('disconnected', () => {
            console.log('WhatsApp отключен');
            setStatus('WhatsApp отключен');
            setIsQrScanned(false);
            setQrCode('');
        });

        newSocket.on('auth_failure', (error: string) => {
            console.error('Ошибка аутентификации:', error);
            setStatus(`Ошибка: ${error}`);
        });

        setSocket(newSocket);

        fetch(`${serverUrl}/chats`, {
            credentials: 'include'
        })
            .then(response => response.json())
            .then(chatsData => {
                console.log('Загружены чаты:', chatsData);
                setChats(chatsData || {});
            })
            .catch(error => {
                console.error('Ошибка при загрузке чатов:', error);
                setChats({});
            });

        return () => {
            newSocket.close();
        };
    }, [serverUrl, setQrCode]);

    const handleSendMessage = async () => {
        if (!activeChat || !message) return;

        try {
            const response = await fetch(`${serverUrl}/send-message`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                credentials: 'include',
                body: JSON.stringify({
                    phoneNumber: activeChat,
                    message,
                }),
            });

            const data = await response.json();

            if (!response.ok) {
                throw new Error(data.error || 'Ошибка при отправке сообщения');
            }

            setMessage('');
        } catch (error) {
            console.error('Ошибка при отправке сообщения:', error);
            alert('Ошибка при отправке сообщения: ' + error);
        }
    };

    const handleNewChat = () => {
        setShowNewChatDialog(true);
    };

    return (
        <div className="flex h-full">
            {/* Модальное окно создания нового чата */}
            {showNewChatDialog && (
                <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
                    <div className="bg-white p-4 rounded-lg w-96 mx-4">
                        <h2 className="text-lg font-semibold mb-4">Новый чат</h2>
                        <input
                            type="text"
                            placeholder="Номер телефона"
                            value={newChatPhone}
                            onChange={(e) => setNewChatPhone(e.target.value)}
                            className="w-full p-2 mb-2 border rounded"
                        />
                        <input
                            type="text"
                            placeholder="Имя (необязательно)"
                            value={newChatName}
                            onChange={(e) => setNewChatName(e.target.value)}
                            className="w-full p-2 mb-4 border rounded"
                        />
                        <div className="flex justify-end gap-2">
                            <button
                                onClick={() => setShowNewChatDialog(false)}
                                className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded"
                            >
                                Отмена
                            </button>
                            <button
                                onClick={handleCreateNewChat}
                                className="px-4 py-2 bg-green-500 text-white rounded hover:bg-green-600"
                            >
                                Создать
                            </button>
                        </div>
                    </div>
                </div>
            )}
            
            {/* Список чатов (скрывается на мобильных при открытом чате) */}
            <div className={`${isMobile && activeChat ? 'hidden' : 'flex-1 md:flex-none md:w-[400px]'}`}>
                <ChatList
                    chats={chats}
                    activeChat={activeChat}
                    setActiveChat={(chatId) => {
                        setActiveChat(chatId);
                        resetUnreadCount(chatId);
                    }}
                    searchQuery={searchQuery}
                    setSearchQuery={setSearchQuery}
                    onNewChat={handleNewChat}
                    isMobile={isMobile}
                />
            </div>
            
            {/* Окно чата (на мобильных занимает весь экран) */}
            <div className={`${isMobile && !activeChat ? 'hidden' : 'flex-1'}`}>
                {activeChat && (
                    <div className="flex flex-col h-full">
                        {/* Шапка чата с кнопкой "Назад" для мобильной версии */}
                        {isMobile ? (
                            <div className="sticky top-0 z-10 bg-[#f0f2f5] flex items-center p-2 border-b border-gray-200">
                                <button
                                    onClick={() => setActiveChat(null)}
                                    className="p-2 hover:bg-gray-200 rounded-full mr-2 transition-colors"
                                >
                                    <MdArrowBack size={24} />
                                </button>
                                <div className="flex items-center">
                                    <div className="w-10 h-10 bg-gray-300 rounded-full flex items-center justify-center">
                                        <span className="text-xl text-white">
                                            {chats[activeChat].name[0].toUpperCase()}
                                        </span>
                                    </div>
                                    <div className="ml-3">
                                        <div className="font-semibold">{chats[activeChat].name}</div>
                                        <div className="text-sm text-gray-500">онлайн</div>
                                    </div>
                                </div>
                            </div>
                        ) : (
                            <div className="bg-[#f0f2f5] p-2 flex items-center border-b border-gray-200">
                                <div className="flex items-center">
                                    <div className="w-10 h-10 bg-gray-300 rounded-full flex items-center justify-center">
                                        <span className="text-xl text-white">
                                            {chats[activeChat].name[0].toUpperCase()}
                                        </span>
                                    </div>
                                    <div className="ml-3">
                                        <div className="font-semibold">{chats[activeChat].name}</div>
                                        <div className="text-sm text-gray-500">онлайн</div>
                                    </div>
                                </div>
                            </div>
                        )}
                        
                        <ChatWindow
                            chat={activeChat ? chats[activeChat] : null}
                            message={message}
                            setMessage={setMessage}
                            onSendMessage={handleSendMessage}
                            status={status}
                            isMobile={isMobile}
                        />
                    </div>
                )}
            </div>
        </div>
    );
};

export default WhatsAppConnect;
