import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://ekvimlxmavywjpvvywdj.supabase.co';
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVrdmltbHhtYXZ5d2pwdnZ5d2RqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzYwMDk2NTIsImV4cCI6MjA5MTU4NTY1Mn0.NGqtLLaTJyd219U8JviMfxN1ucaWaInWcMc_rVFTHKU';

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

export function getAuthenticatedClient(token) {
  return createClient(supabaseUrl, supabaseAnonKey, {
    global: {
      headers: {
        Authorization: `Bearer ${token}`
      }
    }
  });
}

/**
 * Get a user secret from Supabase.
 * @param {string} userId - User UUID
 * @param {string} key - Secret key
 * @param {string} [token] - Optional user token to access RLS protected data
 * @returns {Promise<string|null>}
 */
export async function getUserSecret(userId, key, token) {
  const client = token ? getAuthenticatedClient(token) : supabase;
  const { data, error } = await client
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
 * Get a global setting from Supabase.
 * @param {string} key - Global setting key
 * @param {string} [token] - Optional user token to access RLS protected data
 * @returns {Promise<string|null>}
 */
export async function getGlobalSetting(key, token) {
  const client = token ? getAuthenticatedClient(token) : supabase;
  const { data, error } = await client
    .from('global_settings')
    .select('value')
    .eq('key', key)
    .single();

  if (error) {
    if (error.code !== 'PGRST116') {
      console.error('Error fetching global setting from Supabase:', error);
    }
    return null;
  }
  return data ? data.value : null;
}
