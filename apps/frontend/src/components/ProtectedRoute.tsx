import { useEffect, useRef } from 'react';
import { Navigate, Outlet } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import toast from 'react-hot-toast';

interface ProtectedRouteProps {
  allowedRoles?: ('superadmin' | 'org_admin' | 'reviewer' | 'candidate')[];
  redirectTo?: string;
}

export function ProtectedRoute({ allowedRoles, redirectTo }: ProtectedRouteProps = {}) {
  const { user, isAuthenticated, isLoading } = useAuth();
  const toastShownRef = useRef(false);

  useEffect(() => {
    if (!isLoading && isAuthenticated && user && allowedRoles && allowedRoles.length > 0) {
      const isSuperadmin = user.role === 'superadmin';
      const isAllowed = isSuperadmin || allowedRoles.includes(user.role);
      if (!isAllowed && !toastShownRef.current) {
        toastShownRef.current = true;
        if (user.role === 'candidate') {
          toast.error('Access restricted: Candidate accounts cannot access the admin portal.');
        } else {
          toast.error('Access restricted: Insufficient administrative permissions.');
        }
      }
    }
  }, [isLoading, isAuthenticated, user, allowedRoles]);

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-zinc-950">
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin"></div>
          <span className="text-sm font-medium text-slate-600 dark:text-zinc-400">Authenticating session...</span>
        </div>
      </div>
    );
  }

  if (!isAuthenticated || !user) {
    return <Navigate to={redirectTo || '/admin/login'} replace />;
  }

  if (allowedRoles && allowedRoles.length > 0) {
    const isSuperadmin = user.role === 'superadmin';
    const isAllowed = isSuperadmin || allowedRoles.includes(user.role);
    if (!isAllowed) {
      if (user.role === 'candidate') {
        return <Navigate to="/candidate/dashboard" replace />;
      }
      return <Navigate to={redirectTo || '/admin/dashboard'} replace />;
    }
  }

  return <Outlet />;
}
