import { createClient } from '@supabase/supabase-js';

// Karena Anon Key dan URL Supabase bersifat publik dan aman untuk diekspos (diamankan oleh RLS),
// kita menanamkannya langsung di sini agar tidak perlu repot mengatur Environment Variables di Vercel.
const supabaseUrl = 'https://yulcdxvlrbdtqztxyhel.supabase.co';
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inl1bGNkeHZscmJkdHF6dHh5aGVsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODA0ODA4NjIsImV4cCI6MjA5NjA1Njg2Mn0.K7Qg-rODZfq_i8-pjG5rnoW4vu-vR35TdayVb0Klvn8';

export const supabase = createClient(supabaseUrl, supabaseAnonKey);
