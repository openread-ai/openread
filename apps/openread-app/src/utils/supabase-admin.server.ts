import { createClient } from '@supabase/supabase-js';
import { supabaseUrl } from '@/utils/supabase';

const NON_PERSISTENT_AUTH = {
  persistSession: false,
  autoRefreshToken: false,
  detectSessionInUrl: false,
} as const;

export const createSupabaseAdminClient = () => {
  const supabaseAdminKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseAdminKey) {
    throw new Error(
      'SUPABASE_SERVICE_ROLE_KEY is not set. This function can only be called on the server.',
    );
  }
  return createClient(supabaseUrl, supabaseAdminKey, {
    auth: NON_PERSISTENT_AUTH,
  });
};
