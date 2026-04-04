import React, { createContext, useContext, useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';

const AuthContext = createContext();

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    // 세션 초기화 및 상태 구독
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user || null);
      setLoading(false);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user || null);
    });

    return () => subscription.unsubscribe();
  }, []);

  const login = async (email, password) => {
    setError(null);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) setError(it.message);
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
    setUser(null);
  };

  return (
    <AuthContext.Provider value={{ user, loading, error, login, signUp, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
