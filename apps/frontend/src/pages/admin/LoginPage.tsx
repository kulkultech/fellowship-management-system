import React from 'react';
import { Link } from 'react-router-dom';
import { Navbar } from '@/components/Navbar';
import { Footer } from '@/components/Footer';
import { ShieldCheck, Building2 } from 'lucide-react';

export const LoginPage: React.FC = () => {
  const handleGoogleSignIn = () => {
    const apiBase = import.meta.env.VITE_API_BASE_URL || '/api/v1';
    window.location.href = `${apiBase}/auth/oauth/google`;
  };

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">
      <Navbar />

      <main className="flex-1 flex items-center justify-center p-4 sm:p-6 lg:p-8">
        <div className="max-w-md w-full">
          {/* Main SSO Card */}
          <div className="stitch-card bg-white p-8 sm:p-10 border border-slate-200 shadow-xl rounded-3xl text-center space-y-6">
            <div className="w-16 h-16 rounded-2xl bg-kulkul-purple-light text-kulkul-purple mx-auto flex items-center justify-center shadow-2xs">
              <Building2 className="w-8 h-8" />
            </div>

            <div>
              <h1 className="text-2xl sm:text-3xl font-black text-slate-900 tracking-tight">
                Company Portal
              </h1>
              <p className="text-xs sm:text-sm text-slate-500 mt-1.5">
                Single Sign-On (SSO) for authorized organization reviewers and program administrators.
              </p>
            </div>

            {/* Google OAuth Direct Action */}
            <div className="pt-2">
              <button
                type="button"
                onClick={handleGoogleSignIn}
                className="w-full flex items-center justify-center gap-3 py-3.5 px-6 bg-white hover:bg-slate-50 active:scale-[0.98] border border-slate-300 rounded-full text-sm font-bold text-slate-800 shadow-sm hover:shadow-md transition duration-150"
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
                <span>Continue with Google Workspace</span>
              </button>
            </div>

            {/* Security Badge / Information Banner */}
            <div className="p-4 rounded-2xl bg-slate-50 border border-slate-100 text-left space-y-2">
              <div className="flex items-center gap-2 text-xs font-bold text-slate-800">
                <ShieldCheck className="w-4 h-4 text-emerald-600 shrink-0" />
                <span>Secure OAuth 2.0 Single Sign-On</span>
              </div>
              <ul className="text-2xs text-slate-600 space-y-1 pl-6 list-disc">
                <li>Automatic organization workspace routing</li>
                <li>Zero password retention on platform</li>
                <li>Direct access for whitelisted company reviewers</li>
              </ul>
            </div>

            {/* Footer Links inside Card */}
            <div className="pt-2 border-t border-slate-100 flex flex-col gap-2 text-center">
              <div>
                <span className="text-xs text-slate-500">Need an organization workspace? </span>
                <Link to="/register-company" className="text-xs font-bold text-kulkul-purple hover:underline">
                  Register Company
                </Link>
              </div>

              <div>
                <Link to="/candidate/dashboard" className="text-2xs text-slate-400 hover:text-slate-600">
                  Are you an applicant? Access Candidate Portal &rarr;
                </Link>
              </div>
            </div>
          </div>
        </div>
      </main>
      <Footer />
    </div>
  );
};
