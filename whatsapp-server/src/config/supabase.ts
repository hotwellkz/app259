import { createClient } from '@supabase/supabase-js';
import { ChatStore } from '../types/chat';
import dotenv from 'dotenv';
import path from 'path';

// Загружаем переменные окружения
const envPath = path.resolve(__dirname, '../../.env');
dotenv.config({ path: envPath });

// Создаем клиент Supabase
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
    throw new Error('Missing Supabase credentials');
}

export const supabase = createClient(supabaseUrl, supabaseKey);

// Инициализация бакета для медиафайлов
export async function initializeMediaBucket() {
    try {
        // Проверяем существование бакета
        const { data: buckets, error: listError } = await supabase
            .storage
            .listBuckets();

        if (listError) {
            throw listError;
        }

        const whatsappBucket = buckets?.find(b => b.name === 'whatsapp-media');

        if (!whatsappBucket) {
            // Создаем бакет, если он не существует
            const { error: createError } = await supabase
                .storage
                .createBucket('whatsapp-media', {
                    public: true,
                    fileSizeLimit: 50000000 // 50MB лимит
                });

            if (createError) {
                throw createError;
            }
            console.log('Created whatsapp-media bucket');
        } else {
            console.log('whatsapp-media bucket already exists');
        }
    } catch (error) {
        console.error('Error initializing media bucket:', error);
        throw error;
    }
}

// Получение последних чатов из Supabase
export async function getLatestChatsFromSupabase(): Promise<ChatStore> {
    try {
        const { data, error } = await supabase
            .from('whatsapp_chats')
            .select('chats')
            .order('created_at', { ascending: false })
            .limit(1);

        if (error) {
            console.error('Error fetching chats from Supabase:', error);
            throw error;
        }

        return (data && data.length > 0) ? data[0].chats : {};
    } catch (error) {
        console.error('Error in getLatestChatsFromSupabase:', error);
        throw error;
    }
}

// Загрузка медиафайла в Supabase Storage
export async function uploadMediaToSupabase(
    file: Buffer,
    fileName: string,
    mediaType: string
): Promise<string> {
    try {
        const bucket = mediaType.startsWith('image/') ? 'images' : 
                      mediaType.startsWith('video/') ? 'videos' : 'documents';
        
        const fileExt = fileName.split('.').pop() || '';
        const uniqueFileName = `${Date.now()}-${Math.random().toString(36).substring(7)}.${fileExt}`;
        const filePath = `${bucket}/${uniqueFileName}`;

        const { error: uploadError } = await supabase.storage
            .from('whatsapp-media')
            .upload(filePath, file, {
                contentType: mediaType,
                cacheControl: '3600',
                upsert: false
            });

        if (uploadError) {
            console.error('Error uploading file to Supabase:', uploadError);
            throw uploadError;
        }

        // Получаем публичный URL файла
        const { data: { publicUrl } } = supabase.storage
            .from('whatsapp-media')
            .getPublicUrl(filePath);

        return publicUrl;
    } catch (error) {
        console.error('Error in uploadMediaToSupabase:', error);
        throw error;
    }
}
