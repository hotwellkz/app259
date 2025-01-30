import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';

// Загружаем переменные окружения
const envPath = path.resolve(__dirname, '../../.env');
dotenv.config({ path: envPath });

// Создаем клиент Supabase
const supabaseUrl = process.env.SUPABASE_URL || 'https://bhlzwqteygmxpxznezyg.supabase.co';
const supabaseKey = process.env.SUPABASE_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJobHp3cXRleWdteHB4em5lenlnIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTczNjg4MzY1NywiZXhwIjoyMDUyNDU5NjU3fQ.wWy9___70HpLhE-hKnURC0bDSCSgX_CIq44l57G710c';

const supabase = createClient(supabaseUrl, supabaseKey);

interface ChatStore {
    [key: string]: {
        phoneNumber: string;
        name: string;
        messages: Array<{
            from: string;
            to?: string;
            body: string;
            timestamp: string;
            isGroup: boolean;
            sender?: string;
            fromMe: boolean;
        }>;
        lastMessage?: {
            from: string;
            to?: string;
            body: string;
            timestamp: string;
            isGroup: boolean;
            sender?: string;
            fromMe: boolean;
        };
    };
}

// Получение последних чатов из Supabase
export async function getLatestChatsFromSupabase(): Promise<ChatStore | null> {
    try {
        const { data, error } = await supabase
            .from('whatsapp_chats')
            .select('chats')
            .single();

        if (error) {
            console.error('Error fetching chats from Supabase:', error);
            return null;
        }

        return data?.chats || null;
    } catch (error) {
        console.error('Error in getLatestChatsFromSupabase:', error);
        return null;
    }
}

// Сохранение чатов в Supabase
export async function saveChatsToSupabase(chats: ChatStore): Promise<void> {
    try {
        // Проверяем существующую запись
        const { data: existingData, error: fetchError } = await supabase
            .from('whatsapp_chats')
            .select('id')
            .single();

        if (fetchError && fetchError.code !== 'PGRST116') {
            console.error('Error checking existing record:', fetchError);
            return;
        }

        if (existingData?.id) {
            // Обновляем существующую запись
            const { error: updateError } = await supabase
                .from('whatsapp_chats')
                .update({ chats })
                .eq('id', existingData.id);

            if (updateError) {
                console.error('Error updating chats in Supabase:', updateError);
            }
        } else {
            // Создаем новую запись
            const { error: insertError } = await supabase
                .from('whatsapp_chats')
                .insert([{ chats }]);

            if (insertError) {
                console.error('Error inserting chats to Supabase:', insertError);
            }
        }
    } catch (error) {
        console.error('Error in saveChatsToSupabase:', error);
    }
}
