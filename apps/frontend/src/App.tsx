import { useEffect } from 'react';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Toaster } from 'react-hot-toast';
import { ProtectedRoute } from '@/components/ProtectedRoute';
import { LandingPage } from '@/pages/LandingPage';
import { ProgramJobPostPage } from '@/pages/ProgramJobPostPage';
import { ApplyPage } from '@/pages/lit2026/ApplyPage';
import { TestPage } from '@/pages/lit2026/TestPage';
import { ResultPage } from '@/pages/lit2026/ResultPage';
import { InterviewPage } from '@/pages/lit2026/InterviewPage';
import { CompanyRegisterPage } from '@/pages/CompanyRegisterPage';
import { CandidateDashboardPage } from '@/pages/candidate/CandidateDashboardPage';
import { LoginPage } from '@/pages/admin/LoginPage';
import { DashboardPage } from '@/pages/admin/DashboardPage';
import { SuperadminDashboardPage } from '@/pages/admin/SuperadminDashboardPage';
import { useUiStore } from '@/hooks/useUiStore';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      retry: 1,
    },
  },
});

export function App() {
  const theme = useUiStore((s) => s.theme);

  useEffect(() => {
    document.documentElement.classList.toggle('dark', theme === 'dark');
  }, [theme]);

  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
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

          {/* Company Self-Registration */}
          <Route path="/register-company" element={<CompanyRegisterPage />} />

          {/* Public Program Job Post / Fellowship Listing */}
          <Route path="/programs/:orgSlug/:programSlug" element={<ProgramJobPostPage />} />
          <Route path="/programs/:orgSlug/:programSlug/apply" element={<ApplyPage />} />
          <Route path="/programs/:orgSlug/:programSlug/tracks/:trackSlug/apply" element={<ApplyPage />} />
          <Route path="/programs/:orgSlug/:programSlug/:trackSlug/apply" element={<ApplyPage />} />

          {/* Candidate Dashboard & Portal */}
          <Route path="/candidate/dashboard" element={<CandidateDashboardPage />} />
          <Route path="/candidate/portal" element={<CandidateDashboardPage />} />

          {/* Candidate Funnel: RSA - LIT 2026 & Generic AI Interview */}
          <Route path="/lit2026/apply" element={<ApplyPage />} />
          <Route path="/lit2026/test/:testToken" element={<TestPage />} />
          <Route path="/lit2026/result/:testToken" element={<ResultPage />} />
          <Route path="/lit2026/interview/:inviteToken" element={<InterviewPage />} />
          <Route path="/interview/:inviteToken" element={<InterviewPage />} />
          <Route path="/programs/:orgSlug/:programSlug/interview/:inviteToken" element={<InterviewPage />} />

          {/* Admin & Reviewer Portal */}
          <Route path="/admin/login" element={<LoginPage />} />
          <Route element={<ProtectedRoute />}>
            <Route path="/admin/dashboard" element={<DashboardPage />} />
            <Route path="/superadmin/dashboard" element={<SuperadminDashboardPage />} />
          </Route>

          {/* Fallback Root */}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </QueryClientProvider>
  );
}
