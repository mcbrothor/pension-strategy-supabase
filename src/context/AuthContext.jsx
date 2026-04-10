import React, { createContext, useContext, useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';

const AuthContext = createContext();
const LAST_AUTH_USER_KEY = 'last_auth_user_id';

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [lastUserId, setLastUserId] = useState(() => {
    if (typeof window === 'undefined') return null;
    return window.localStorage.getItem(LAST_AUTH_USER_KEY);
  });

  const rememberUser = (nextUser) => {
    const nextUserId = nextUser?.id || null;
    setUser(nextUser || null);
    setLastUserId(nextUserId);

    if (typeof window !== 'undefined') {
      if (nextUserId) window.localStorage.setItem(LAST_AUTH_USER_KEY, nextUserId);
      else window.localStorage.removeItem(LAST_AUTH_USER_KEY);
    }
  };

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      rememberUser(session?.user || null);
      setLoading(false);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      rememberUser(session?.user || null);
      setLoading(false);
    });

    return () => subscription.unsubscribe();
  }, []);

  const login = async (email, password) => {
    setError(null);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) setError(error.message);
    return { error };
  };

  const signUp = async (email, password) => {
    setError(null);
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: { emailRedirectTo: window.location.origin }
    });
    return { error };
  };

  const logout = async () => {
    await supabase.auth.signOut();
    rememberUser(null);
  };

  return (
    <AuthContext.Provider value={{ user, loading, error, login, signUp, logout, lastUserId }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
