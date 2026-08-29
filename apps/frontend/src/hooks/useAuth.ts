import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { authService } from '@/services/authService';
import { useAuthStore } from './useAuthStore';

export function useAuth() {
  const queryClient = useQueryClient();
  const { user, isAuthenticated, setUser, logout: clearAuth } = useAuthStore();

  const meQuery = useQuery({
    queryKey: ['auth', 'me'],
    queryFn: async () => {
      try {
        const userData = await authService.me();
        setUser(userData);
        return userData;
      } catch {
        setUser(null);
        return null;
      }
    },
    retry: false,
    staleTime: 5 * 60 * 1000,
  });

  const loginMutation = useMutation({
    mutationFn: ({ email, password }: { email: string; password: string }) =>
      authService.login(email, password),
    onSuccess: (data) => {
      setUser(data.user);
      queryClient.setQueryData(['auth', 'me'], data.user);
    },
  });

  const logoutMutation = useMutation({
    mutationFn: () => authService.logout(),
    onSuccess: () => {
      clearAuth();
      queryClient.clear();
    },
  });

  return {
    user,
    isAuthenticated,
    isLoading: meQuery.isLoading,
    login: loginMutation.mutateAsync,
    isLoggingIn: loginMutation.isPending,
    logout: logoutMutation.mutateAsync,
    isLoggingOut: logoutMutation.isPending,
  };
}
