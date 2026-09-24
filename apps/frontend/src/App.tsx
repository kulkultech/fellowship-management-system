import { useEffect } from 'react';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Toaster } from 'react-hot-toast';
import { ProtectedRoute } from '@/components/ProtectedRoute';
import { LandingPage } from '@/pages/LandingPage';
import { ProgramJobPostPage } from '@/pages/ProgramJobPostPage';
import { ApplyPage } from '@/pages/assessment/ApplyPage';
import { TestPage } from '@/pages/assessment/TestPage';
import { ResultPage } from '@/pages/assessment/ResultPage';
import { InterviewPage } from '@/pages/assessment/InterviewPage';
import { CompanyRegisterPage } from '@/pages/CompanyRegisterPage';
import { AccountActivationPage } from '@/pages/AccountActivationPage';
import { AcceptInvitationPage } from '@/pages/AcceptInvitationPage';
import { CandidateDashboardPage } from '@/pages/candidate/CandidateDashboardPage';
import { ProgramRoomPage } from '@/pages/candidate/ProgramRoomPage';
import { LoginPage } from '@/pages/admin/LoginPage';
import { ForgotPasswordPage } from '@/pages/ForgotPasswordPage';
import { ResetPasswordPage } from '@/pages/ResetPasswordPage';
import { DashboardPage } from '@/pages/admin/DashboardPage';
import { SuperadminDashboardPage } from '@/pages/admin/SuperadminDashboardPage';
import { MentorDashboardPage } from '@/pages/mentor/MentorDashboardPage';
import { PrivacyPolicyPage } from '@/pages/legal/PrivacyPolicyPage';
import { TermsOfServicePage } from '@/pages/legal/TermsOfServicePage';
import { useUiStore } from '@/hooks/useUiStore';
import { initFirebaseAnalytics } from '@/lib/firebase';
import { useFirebasePageTracking } from '@/hooks/useFirebasePageTracking';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      retry: 1,
    },
  },
});

function FirebasePageTracker() {
  useFirebasePageTracking();
  return null;
}

export function App() {
  const theme = useUiStore((s) => s.theme);

  useEffect(() => {
    document.documentElement.classList.toggle('dark', theme === 'dark');
  }, [theme]);

  useEffect(() => {
    initFirebaseAnalytics();
  }, []);

  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <FirebasePageTracker />
        <Toaster
          position="top-right"
          toastOptions={{
            duration: 3500,
            style: {
              background: '#ffffff',
              color: '#0f172a',
              border: '1px solid #e2e8f0',
              borderRadius: '1rem',
              fontSize: '0.875rem',
              boxShadow: '0 10px 25px -5px rgba(51, 18, 93, 0.1)',
            },
          }}
        />
        <Routes>
          {/* Landing Page */}
          <Route path="/" element={<LandingPage />} />

          {/* Legal Pages for Google OAuth & Compliance */}
          <Route path="/privacy" element={<PrivacyPolicyPage />} />
          <Route path="/privacy-policy" element={<PrivacyPolicyPage />} />
          <Route path="/terms" element={<TermsOfServicePage />} />
          <Route path="/terms-of-service" element={<TermsOfServicePage />} />

          {/* Company Self-Registration & Account Activation */}
          <Route path="/register-company" element={<CompanyRegisterPage />} />
          <Route path="/activate" element={<AccountActivationPage />} />
          <Route path="/forgot-password" element={<ForgotPasswordPage />} />
          <Route path="/reset-password" element={<ResetPasswordPage />} />
          <Route path="/invite/accept" element={<AcceptInvitationPage />} />
          <Route path="/invitations/:token" element={<AcceptInvitationPage />} />

          {/* Public Program Job Post / Fellowship Listing */}
          <Route path="/programs/:orgSlug/:programSlug" element={<ProgramJobPostPage />} />
          <Route path="/programs/:orgSlug/:programSlug/apply" element={<ApplyPage />} />
          <Route path="/programs/:orgSlug/:programSlug/tracks/:trackSlug/apply" element={<ApplyPage />} />
          <Route path="/programs/:orgSlug/:programSlug/:trackSlug/apply" element={<ApplyPage />} />
          <Route path="/programs/:orgSlug/:programSlug/room" element={<ProgramRoomPage />} />

          {/* Candidate Dashboard & Portal */}
          <Route path="/candidate/dashboard" element={<CandidateDashboardPage />} />
          <Route path="/candidate/portal" element={<CandidateDashboardPage />} />

          {/* Candidate Funnel: LIT 2026 & Generic AI Interview */}
          <Route path="/lit2026/apply" element={<ApplyPage />} />
          <Route path="/lit2026/test/:testToken" element={<TestPage />} />
          <Route path="/test/:testToken" element={<TestPage />} />
          <Route path="/tests/:testToken" element={<TestPage />} />
          <Route path="/lit2026/result/:testToken" element={<ResultPage />} />
          <Route path="/result/:testToken" element={<ResultPage />} />
          <Route path="/lit2026/interview/:inviteToken" element={<InterviewPage />} />
          <Route path="/interview/:inviteToken" element={<InterviewPage />} />
          <Route path="/interviews/:inviteToken" element={<InterviewPage />} />
          <Route path="/programs/:orgSlug/:programSlug/interview/:inviteToken" element={<InterviewPage />} />

          {/* Admin & Reviewer Portal */}
          <Route path="/login" element={<LoginPage />} />
          <Route path="/admin/login" element={<LoginPage />} />
          <Route element={<ProtectedRoute allowedRoles={['org_admin', 'reviewer', 'superadmin']} />}>
            <Route path="/admin/dashboard" element={<DashboardPage />} />
            <Route path="/admin/programs/new" element={<DashboardPage defaultView="create_program" />} />
            <Route path="/admin/rubric" element={<DashboardPage defaultView="ai_rubric" />} />
            <Route path="/admin/programs/:programSlug/rubric" element={<DashboardPage defaultView="ai_rubric" />} />
          </Route>

          {/* Mentor Portal */}
          <Route element={<ProtectedRoute allowedRoles={['mentor', 'org_admin', 'superadmin']} />}>
            <Route path="/mentor/dashboard" element={<MentorDashboardPage />} />
          </Route>

          {/* Superadmin Portal */}
          <Route element={<ProtectedRoute allowedRoles={['superadmin']} redirectTo="/admin/dashboard" />}>
            <Route path="/superadmin/dashboard" element={<SuperadminDashboardPage />} />
          </Route>

          {/* Fallback Root */}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </QueryClientProvider>
  );
}
