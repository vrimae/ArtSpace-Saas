import { createClient } from '@supabase/supabase-js';

// Karena Anon Key dan URL Supabase bersifat publik dan aman untuk diekspos (diamankan oleh RLS),
// kita menanamkannya langsung di sini agar tidak perlu repot mengatur Environment Variables di Vercel.
const supabaseUrl = 'https://qjiznlmnxdnuqxhuwjhf.supabase.co';
const supabaseAnonKey = 'sb_publishable_9vOIczdu7Vx4zYYrOxwr8Q_BNwRbB_6';

export const supabase = createClient(supabaseUrl, supabaseAnonKey);
