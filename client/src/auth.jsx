import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, AUTH_EXPIRED_EVENT } from './api.js';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const navigate = useNavigate();
  const [user, setUser] = useState(() => {
    try { return JSON.parse(localStorage.getItem('eduglobal_user')); } catch { return null; }
  });
  const [loading, setLoading] = useState(false);

  const clearSession = () => {
    localStorage.removeItem('eduglobal_token');
    localStorage.removeItem('eduglobal_user');
    setUser(null);
  };

  const login = async (email, password) => {
    setLoading(true);
    try {
      const data = await api('/api/auth/login', { method: 'POST', body: JSON.stringify({ email, password }) });
      localStorage.setItem('eduglobal_token', data.token);
      localStorage.setItem('eduglobal_user', JSON.stringify(data.user));
      setUser(data.user);
      return data.user;
    } finally { setLoading(false); }
  };

  const logout = () => {
    clearSession();
    navigate('/login', { replace: true });
  };

  useEffect(() => {
    const handleSessionExpired = () => {
      clearSession();
      navigate('/login', { replace: true });
    };

    window.addEventListener(AUTH_EXPIRED_EVENT, handleSessionExpired);
    return () => window.removeEventListener(AUTH_EXPIRED_EVENT, handleSessionExpired);
  }, [navigate]);

  const value = useMemo(() => ({ user, loading, login, logout }), [user, loading]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export const useAuth = () => useContext(AuthContext);
