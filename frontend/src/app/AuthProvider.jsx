import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { createAuthApi } from '../features/auth/authApi';
import { createApiClient } from '../lib/apiClient';
import { tokenStorage } from '../lib/tokenStorage';

const AuthContext = createContext(null);
const defaultFetchImpl = (...args) => window.fetch(...args);

const normalizeUser = (user) => {
  if (!user) return null;
  return {
    ...user,
    role: typeof user.role === 'string' ? user.role : user.role?.name,
  };
};

export function AuthProvider({ children, fetchImpl = defaultFetchImpl }) {
  const [user, setUser] = useState(null);
  const [status, setStatus] = useState('loading');
  const accessTokenRef = useRef(null);
  const refreshActionRef = useRef(null);
  const clearSessionRef = useRef(null);
  const baseUrl = import.meta.env.VITE_API_BASE_URL || '/api/v1';

  const clearSession = useCallback(() => {
    accessTokenRef.current = null;
    tokenStorage.clearRefreshToken();
    setUser(null);
    setStatus('anonymous');
  }, []);
  clearSessionRef.current = clearSession;

  const client = useMemo(() => createApiClient({
    baseUrl,
    getAccessToken: () => accessTokenRef.current,
    refreshAccessToken: () => refreshActionRef.current(),
    onUnauthorized: () => clearSessionRef.current(),
    fetchImpl,
  }), [baseUrl, fetchImpl]);

  const authApi = useMemo(() => createAuthApi(client.request), [client]);

  const performRefresh = useCallback(async () => {
    const refreshToken = tokenStorage.getRefreshToken();
    if (!refreshToken) throw new Error('No refresh token is available');
    const result = await authApi.refreshToken(refreshToken);
    if (!result?.accessToken) throw new Error('Refresh did not return an access token');
    accessTokenRef.current = result.accessToken;
    return result.accessToken;
  }, [authApi]);
  refreshActionRef.current = performRefresh;

  const refreshSession = useCallback(async () => {
    if (!tokenStorage.getRefreshToken()) {
      clearSession();
      return null;
    }
    setStatus('loading');
    try {
      await performRefresh();
      const profile = normalizeUser(await authApi.getMe());
      setUser(profile);
      setStatus('authenticated');
      return profile;
    } catch (_error) {
      clearSession();
      return null;
    }
  }, [authApi, clearSession, performRefresh]);

  useEffect(() => {
    void refreshSession();
  }, [refreshSession]);

  const acceptSession = useCallback((result, remember) => {
    accessTokenRef.current = result.accessToken;
    tokenStorage.setRefreshToken(result.refreshToken, remember);
    const normalized = normalizeUser(result.user);
    setUser(normalized);
    setStatus('authenticated');
    return normalized;
  }, []);

  const login = useCallback(async (credentials, remember = false) => {
    const result = await authApi.login(credentials);
    return acceptSession(result, remember);
  }, [acceptSession, authApi]);

  const register = useCallback(async (payload) => {
    const result = await authApi.register(payload);
    return acceptSession(result, false);
  }, [acceptSession, authApi]);

  const logout = useCallback(async () => {
    try {
      if (accessTokenRef.current) await authApi.logout();
    } catch (_error) {
      // A local logout must still complete when the network is unavailable.
    } finally {
      clearSession();
    }
  }, [authApi, clearSession]);

  const updateCurrentUser = useCallback((patch) => {
    setUser((current) => normalizeUser({ ...current, ...patch }));
  }, []);

  const value = useMemo(() => ({
    user,
    accessToken: accessTokenRef.current,
    status,
    login,
    register,
    logout,
    refreshSession,
    updateCurrentUser,
    request: client.request,
  }), [client.request, login, logout, refreshSession, register, status, updateCurrentUser, user]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used inside AuthProvider');
  return context;
}
