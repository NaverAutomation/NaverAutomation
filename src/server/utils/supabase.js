import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://ekvimlxmavywjpvvywdj.supabase.co';
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVrdmltbHhtYXZ5d2pwdnZ5d2RqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzYwMDk2NTIsImV4cCI6MjA5MTU4NTY1Mn0.NGqtLLaTJyd219U8JviMfxN1ucaWaInWcMc_rVFTHKU';

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

/**
 * Get a user secret from Supabase.
 * @param {string} userId - User UUID
 * @param {string} key - Secret key
 * @returns {Promise<string|null>}
 */
export async function getUserSecret(userId, key) {
  const { data, error } = await supabase
    .from('user_secrets')
    .select('value')
    .eq('user_id', userId)
    .eq('key', key)
    .single();

  if (error) {
    if (error.code !== 'PGRST116') { // PGRST116 is 'no rows found'
      console.error('Error fetching secret from Supabase:', error);
    }
    return null;
  }
  return data ? data.value : null;
}

/**
 * Set a user secret in Supabase.
 * @param {string} userId - User UUID
 * @param {string} key - Secret key
 * @param {string} value - Secret value
 */
export async function setUserSecret(userId, key, value) {
  const { error } = await supabase
    .from('user_secrets')
    .upsert({ user_id: userId, key, value, updated_at: new Date().toISOString() });

  if (error) {
    console.error('Error setting secret in Supabase:', error);
    throw error;
  }
}
