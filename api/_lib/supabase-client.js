import { createClient } from '@supabase/supabase-js';

// Vercel 환경 변수 우선순위 고려
const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
const supabaseAnonKey = process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY;

function createMissingConfigBuilder() {
  const error = new Error('Supabase configuration missing in serverless environment.');
  const result = { data: null, error };
  const builder = {
    select: () => builder,
    insert: () => builder,
    upsert: () => builder,
    update: () => builder,
    delete: () => builder,
    eq: () => builder,
    in: () => builder,
    order: () => builder,
    single: () => builder,
    maybeSingle: () => builder,
    limit: () => builder,
    then: (resolve) => Promise.resolve(resolve(result)),
    catch: () => Promise.resolve(result),
  };
  return builder;
}

function createNoopSupabaseClient() {
  return {
    from: () => createMissingConfigBuilder(),
    auth: {
      getSession: async () => ({ data: { session: null }, error: null }),
      onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }),
      signInWithPassword: async () => ({ data: null, error: new Error('Supabase unavailable') }),
      signUp: async () => ({ data: null, error: new Error('Supabase unavailable') }),
      signOut: async () => ({ error: null }),
    },
  };
}

if (!supabaseUrl || !supabaseAnonKey) {
  console.warn('Supabase configuration missing in serverless environment. Falling back to noop client.');
}

export const supabase =
  supabaseUrl && supabaseAnonKey
    ? createClient(supabaseUrl, supabaseAnonKey)
    : createNoopSupabaseClient();
