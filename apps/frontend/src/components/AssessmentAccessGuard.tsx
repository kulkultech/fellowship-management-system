import React, { useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { Navbar } from '@/components/Navbar';
import { Footer } from '@/components/Footer';
import {
  ShieldAlert,
  Lock,
  Mail,
  UserX,
  ArrowRight,
  LogOut,
  GraduationCap,
  Sparkles,
} from 'lucide-react';

interface AssessmentAccessGuardProps {
  requiredEmail?: string;
  candidateName?: string;
  assessmentType: 'logic_test' | 'ai_interview';
  programName?: string;
  trackName?: string;
  children: React.ReactNode;
}

export const AssessmentAccessGuard: React.FC<AssessmentAccessGuardProps> = ({
  requiredEmail,
  candidateName,
  assessmentType,
  programName,
  trackName,
  children,
}) => {
  const { user, isLoading: isAuthLoading, logout } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [isSwitching, setIsSwitching] = useState(false);

  // If no email restriction is present (e.g. demo interview session or unassigned token)
  if (!requiredEmail) {
    return <>{children}</>;
  }

  // Loading state while checking authentication credentials
  if (isAuthLoading) {
    return (
      <div className="min-h-screen bg-slate-50 flex flex-col justify-between">
        <Navbar hideAdminButton={true} />
        <main className="flex-1 flex items-center justify-center p-4">
          <div className="text-center">
            <div className="w-10 h-10 border-4 border-kulkul-purple/30 border-t-kulkul-purple rounded-full animate-spin mx-auto mb-4" />
            <p className="text-sm font-bold text-kulkul-purple">Verifying candidate access credentials...</p>
          </div>
        </main>
        <Footer />
      </div>
    );
  }

  const apiBase = import.meta.env.VITE_API_BASE_URL || '/api/v1';
  const returnTo = location.pathname + location.search;

  const handleGoogleSignIn = () => {
    window.location.href = `${apiBase}/auth/oauth/google?return_to=${encodeURIComponent(returnTo)}`;
  };

  const handleSwitchAccount = async () => {
    setIsSwitching(true);
    try {
      await logout();
    } catch {
      // ignore
    }
    window.location.href = `${apiBase}/auth/oauth/google?return_to=${encodeURIComponent(returnTo)}`;
  };

  const assessmentLabel = assessmentType === 'logic_test' ? 'Timed Logic Assessment' : 'AI Technical Screening';

  // Case 1: Unauthenticated Candidate
  if (!user?.email) {
    return (
      <div className="min-h-screen bg-slate-50 flex flex-col justify-between">
        <Navbar hideAdminButton={true} />

        <main className="flex-1 flex items-center justify-center p-4 sm:p-6 lg:p-8">
          <div className="max-w-md w-full">
            <div className="stitch-card bg-white p-8 sm:p-10 border border-slate-200 shadow-xl rounded-3xl text-center space-y-6">
              {/* Header Badge & Title */}
              <div className="space-y-2">
                <div className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full bg-amber-50 text-amber-900 border border-amber-200 text-xs font-extrabold uppercase tracking-wide">
                  <Lock className="w-4 h-4 text-kulkul-orange" />
                  <span>Candidate Sign-In Required</span>
                </div>
                <h1 className="text-2xl sm:text-3xl font-black text-slate-900 tracking-tight">
                  Sign In to Continue
                </h1>
                <p className="text-xs sm:text-sm text-slate-500 max-w-sm mx-auto">
                  This {assessmentLabel.toLowerCase()} is private and reserved for invited applicants. Please sign in with your verified Google account to verify your identity.
                </p>
              </div>

              {/* Context Pill */}
              {(programName || trackName) && (
                <div className="p-3 bg-purple-50/70 border border-purple-100 rounded-2xl text-left space-y-1">
                  <div className="flex items-center gap-2 text-2xs font-bold uppercase tracking-wider text-kulkul-purple">
                    <GraduationCap className="w-3.5 h-3.5 text-kulkul-orange" />
                    <span>Assessment Program</span>
                  </div>
                  <p className="text-xs font-extrabold text-slate-800 truncate">
                    {programName} {trackName ? `• ${trackName}` : ''}
                  </p>
                  {candidateName && (
                    <p className="text-2xs text-slate-500">
                      Invited Candidate: <span className="font-bold text-slate-700">{candidateName}</span>
                    </p>
                  )}
                </div>
              )}

              {/* Primary Sign In Button */}
              <div>
                <button
                  type="button"
                  onClick={handleGoogleSignIn}
                  className="w-full flex items-center justify-center gap-3 py-3.5 px-6 bg-white hover:bg-slate-50 active:scale-[0.98] border-2 border-slate-200 hover:border-kulkul-purple/50 rounded-2xl text-sm sm:text-base font-extrabold text-slate-800 shadow-md hover:shadow-lg transition duration-150"
                >
                  <svg className="w-5 h-5 shrink-0" viewBox="0 0 24 24">
                    <path
                      fill="#4285F4"
                      d="M23.745 12.27c0-.7-.06-1.4-.19-2.07H12v4.51h6.6c-.29 1.52-1.14 2.82-2.4 3.68v3.05h3.88c2.27-2.09 3.665-5.17 3.665-9.17z"
                    />
                    <path
                      fill="#34A853"
                      d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.88-3.05c-1.08.72-2.45 1.16-4.05 1.16-3.12 0-5.77-2.1-6.72-4.93H1.25v3.15C3.26 21.36 7.33 24 12 24z"
                    />
                    <path
                      fill="#FBBC05"
                      d="M5.28 14.27c-.25-.72-.38-1.49-.38-2.27s.13-1.55.38-2.27V6.58H1.25C.45 8.18 0 9.99 0 12s.45 3.82 1.25 5.42l4.03-3.15z"
                    />
                    <path
                      fill="#EA4335"
                      d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.33 0 3.26 2.64 1.25 6.58l4.03 3.15c.95-2.83 3.6-4.98 6.72-4.98z"
                    />
                  </svg>
                  <span>Continue with Google</span>
                </button>
              </div>

              {/* Requirement Notice */}
              <div className="p-3 bg-slate-50 border border-slate-200/80 rounded-xl text-2xs text-slate-500 text-left">
                <span className="font-bold text-slate-700">Notice:</span> Please make sure to sign in with the Google account matching the invitation sent to your email.
              </div>
            </div>
          </div>
        </main>

        <Footer />
      </div>
    );
  }

  // Case 2: Candidate is Signed In - Check Match
  const userEmailNorm = (user.email || '').trim().toLowerCase();
  const reqEmailNorm = (requiredEmail || '').trim().toLowerCase();
  const isMatch = userEmailNorm === reqEmailNorm;
  const isStaffOverride = user.role === 'superadmin' || user.role === 'reviewer';

  // If email matches or user is staff previewing, render assessment immediately
  if (isMatch || isStaffOverride) {
    return (
      <>
        {isStaffOverride && !isMatch && (
          <div className="bg-purple-900 text-white text-xs px-4 py-2 text-center font-bold sticky top-0 z-50 flex items-center justify-center gap-2">
            <Sparkles className="w-4 h-4 text-kulkul-orange" />
            <span>Staff Preview Mode: Viewing assessment assigned to {requiredEmail}</span>
          </div>
        )}
        {children}
      </>
    );
  }

  // Case 3: Candidate is Signed In BUT with WRONG Email -> Access Denied Page
  return (
    <div className="min-h-screen bg-slate-50 flex flex-col justify-between">
      <Navbar hideAdminButton={true} />

      <main className="flex-1 flex items-center justify-center p-4 sm:p-6 lg:p-8">
        <div className="max-w-lg w-full">
          <div className="stitch-card bg-white p-8 sm:p-10 border border-rose-200 shadow-2xl rounded-3xl text-center space-y-6 animate-in fade-in zoom-in-95 duration-200">
            {/* Shield Alert Icon */}
            <div className="w-16 h-16 rounded-3xl bg-rose-50 text-rose-600 mx-auto flex items-center justify-center border border-rose-100 shadow-xs">
              <ShieldAlert className="w-9 h-9 text-rose-600" />
            </div>

            {/* Error Headers */}
            <div className="space-y-2">
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-black uppercase tracking-wider bg-rose-100 text-rose-800 border border-rose-200">
                Access Restricted
              </span>
              <h1 className="text-2xl sm:text-3xl font-black text-slate-900 tracking-tight">
                You're Not Allowed to Access This {assessmentLabel}
              </h1>
              <p className="text-xs sm:text-sm text-slate-500 max-w-md mx-auto">
                This assessment invitation link was issued exclusively to another candidate. To maintain academic integrity, you cannot proceed under your current account.
              </p>
            </div>

            {/* Account Comparison Details */}
            <div className="p-4 bg-slate-50 border border-slate-200/80 rounded-2xl text-left space-y-3">
              <div>
                <div className="text-2xs font-bold uppercase tracking-wider text-slate-500 mb-1 flex items-center gap-1.5">
                  <Mail className="w-3.5 h-3.5 text-emerald-600" />
                  <span>Invited Candidate Email</span>
                </div>
                <div className="font-extrabold text-xs sm:text-sm text-slate-900 bg-white px-3.5 py-2 rounded-xl border border-slate-200 truncate">
                  {requiredEmail}
                </div>
              </div>

              <div>
                <div className="text-2xs font-bold uppercase tracking-wider text-rose-600 mb-1 flex items-center gap-1.5">
                  <UserX className="w-3.5 h-3.5 text-rose-500" />
                  <span>Currently Signed In As</span>
                </div>
                <div className="font-extrabold text-xs sm:text-sm text-rose-700 bg-rose-50/80 px-3.5 py-2 rounded-xl border border-rose-200 truncate flex items-center justify-between">
                  <span>{user.email}</span>
                  <span className="text-2xs bg-rose-200 text-rose-800 px-2 py-0.5 rounded-md font-bold uppercase">
                    Unauthorized
                  </span>
                </div>
              </div>
            </div>

            {/* Action Buttons */}
            <div className="space-y-3 pt-2">
              <button
                type="button"
                disabled={isSwitching}
                onClick={handleSwitchAccount}
                className="w-full flex items-center justify-center gap-2 py-3.5 px-6 rounded-full text-sm font-extrabold text-white bg-kulkul-orange hover:bg-kulkul-orange-hover shadow-md hover:shadow-lg transition active:scale-[0.98] disabled:opacity-50"
              >
                <LogOut className="w-4 h-4" />
                <span>{isSwitching ? 'Signing out...' : `Sign Out & Switch to ${requiredEmail}`}</span>
              </button>

              <button
                type="button"
                onClick={() => navigate('/candidate/dashboard')}
                className="w-full flex items-center justify-center gap-2 py-3 px-6 rounded-full text-xs sm:text-sm font-bold text-slate-700 bg-slate-100 hover:bg-slate-200 transition active:scale-[0.98]"
              >
                <span>Go to My Dashboard</span>
                <ArrowRight className="w-4 h-4" />
              </button>
            </div>

            {/* Help text */}
            <div className="pt-2 text-2xs text-slate-400">
              Need assistance? Contact our team at <a href="mailto:support@fellowhire.kul.to" className="text-kulkul-purple font-bold hover:underline">support@fellowhire.kul.to</a>
            </div>
          </div>
        </div>
      </main>

      <Footer />
    </div>
  );
};
