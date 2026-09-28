import { useEffect, useRef } from 'react';
import { Navigate, Outlet } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { Clock, XCircle } from 'lucide-react';
import toast from 'react-hot-toast';

interface ProtectedRouteProps {
  allowedRoles?: ('superadmin' | 'org_admin' | 'reviewer' | 'candidate' | 'mentor')[];
  redirectTo?: string;
}

export function ProtectedRoute({ allowedRoles, redirectTo }: ProtectedRouteProps = {}) {
  const { user, isAuthenticated, isLoading, logout } = useAuth();
  const toastShownRef = useRef(false);

  useEffect(() => {
    if (!isLoading && isAuthenticated && user && allowedRoles && allowedRoles.length > 0) {
      const isSuperadmin = user.role === 'superadmin';
      const isAllowed = isSuperadmin || allowedRoles.includes(user.role);
      if (!isAllowed && !toastShownRef.current) {
        toastShownRef.current = true;
        if (user.role === 'candidate') {
          toast.error('Access restricted: Candidate accounts cannot access the admin portal.');
        } else if (user.role === 'mentor') {
          toast.error('Access restricted: Mentor accounts cannot access this administrative area.');
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

  // Guard company admins whose company is awaiting superadmin approval
  if (user.role !== 'superadmin' && user.organization?.status === 'pending_approval') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-zinc-950 p-4">
        <div className="max-w-md w-full bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 rounded-3xl p-8 text-center shadow-xl space-y-5 animate-in fade-in zoom-in-95 duration-200">
          <div className="w-16 h-16 bg-amber-50 border border-amber-200 text-amber-600 rounded-2xl flex items-center justify-center mx-auto shadow-2xs">
            <Clock className="w-8 h-8" />
          </div>
          <div>
            <span className="text-xs font-bold text-amber-700 dark:text-amber-400 uppercase tracking-wider">
              Pending Superadmin Approval
            </span>
            <h2 className="text-2xl font-black text-slate-900 dark:text-white mt-2">
              Application Under Review
            </h2>
            <p className="text-sm text-slate-600 dark:text-zinc-400 mt-2 leading-relaxed">
              Your company registration for <strong>{user.organization.name}</strong> is currently pending review by the platform administrator.
            </p>
            <p className="text-xs text-slate-500 dark:text-zinc-500 mt-3">
              You will receive an email once your workspace has been approved. Please check back later.
            </p>
          </div>
          <div className="pt-2">
            <button
              onClick={() => logout()}
              className="btn btn-md btn-outline w-full"
            >
              Sign Out
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Guard company admins whose company was rejected
  if (user.role !== 'superadmin' && user.organization?.status === 'rejected') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-zinc-950 p-4">
        <div className="max-w-md w-full bg-white dark:bg-zinc-900 border border-rose-200 dark:border-rose-900/40 rounded-3xl p-8 text-center shadow-xl space-y-5 animate-in fade-in zoom-in-95 duration-200">
          <div className="w-16 h-16 bg-rose-50 border border-rose-200 text-rose-600 rounded-2xl flex items-center justify-center mx-auto shadow-2xs">
            <XCircle className="w-8 h-8" />
          </div>
          <div>
            <span className="text-xs font-bold text-rose-700 uppercase tracking-wider">
              Registration Declined
            </span>
            <h2 className="text-2xl font-black text-slate-900 dark:text-white mt-2">
              Company Registration Declined
            </h2>
            <p className="text-sm text-slate-600 dark:text-zinc-400 mt-2 leading-relaxed">
              Your company registration for <strong>{user.organization.name}</strong> was declined. Please contact support if you believe this is a mistake.
            </p>
          </div>
          <div className="pt-2">
            <button
              onClick={() => logout()}
              className="btn btn-md btn-outline w-full"
            >
              Sign Out
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (allowedRoles && allowedRoles.length > 0) {
    const isSuperadmin = user.role === 'superadmin';
    const isAllowed = isSuperadmin || allowedRoles.includes(user.role);
    if (!isAllowed) {
      if (user.role === 'candidate') {
        return <Navigate to="/candidate/dashboard" replace />;
      }
      if (user.role === 'mentor') {
        return <Navigate to="/mentor/dashboard" replace />;
      }
      return <Navigate to={redirectTo || '/admin/dashboard'} replace />;
    }
  }

  return <Outlet />;
}
