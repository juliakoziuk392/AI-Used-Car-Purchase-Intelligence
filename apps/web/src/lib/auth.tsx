import type { AuthResponse, UserDto } from '@carintel/shared';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { api, ApiError, tokenStorage } from './api';

interface AuthContextValue {
  user: UserDto | null;
  isLoading: boolean;
  signIn: (auth: AuthResponse) => void;
  signOut: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const [hasToken, setHasToken] = useState(() => Boolean(tokenStorage.get()));

  const meQuery = useQuery({
    queryKey: ['me'],
    queryFn: api.me,
    enabled: hasToken,
    // Сервер тимчасово недоступний (перезапуск, мережа) — пробуємо ще, а не викидаємо з акаунта.
    retry: (failureCount, error) => !isUnauthorized(error) && failureCount < 10,
    retryDelay: 1500,
  });
  const unauthorized = isUnauthorized(meQuery.error);

  useEffect(() => {
    if (unauthorized) tokenStorage.clear();
  }, [unauthorized]);

  const signIn = useCallback(
    (auth: AuthResponse) => {
      tokenStorage.set(auth.accessToken);
      queryClient.setQueryData(['me'], auth.user);
      setHasToken(true);
    },
    [queryClient],
  );

  const signOut = useCallback(() => {
    tokenStorage.clear();
    setHasToken(false);
    queryClient.clear();
  }, [queryClient]);

  const value = useMemo<AuthContextValue>(
    () => ({
      user: hasToken && !unauthorized ? (meQuery.data ?? null) : null,
      isLoading: hasToken && !unauthorized && !meQuery.data,
      signIn,
      signOut,
    }),
    [hasToken, meQuery.data, unauthorized, signIn, signOut],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

function isUnauthorized(error: unknown) {
  return error instanceof ApiError && error.status === 401;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used inside AuthProvider');
  return context;
}
