import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://ekvimlxmavywjpvvywdj.supabase.co';
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVrdmltbHhtYXZ5d2pwdnZ5d2RqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzYwMDk2NTIsImV4cCI6MjA5MTU4NTY1Mn0.NGqtLLaTJyd219U8JviMfxN1ucaWaInWcMc_rVFTHKU';

export const supabase = createClient(supabaseUrl, supabaseAnonKey);
