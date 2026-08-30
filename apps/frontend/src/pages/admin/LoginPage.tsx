import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { Navbar } from '@/components/Navbar';
import { Mail, Lock, ArrowRight } from 'lucide-react';
import toast from 'react-hot-toast';

export const LoginPage: React.FC = () => {
  const [email, setEmail] = useState('admin@rsa.org');
  const [password, setPassword] = useState('admin123');
  const [isLoading, setIsLoading] = useState(false);

  const { login } = useAuth();
  const navigate = useNavigate();

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) {
      toast.error('Please enter your email and password');
      return;
    }

    try {
      setIsLoading(true);
      await login({ email, password });
      toast.success('Authenticated successfully');
      navigate('/admin/dashboard');
    } catch (err: any) {
      const msg = err.response?.data?.error || err.message || 'Invalid email or password';
      toast.error(msg);
    } finally {
      setIsLoading(false);
    }
  };

  const handleGoogleSignIn = () => {
    window.location.href = 'http://localhost:8080/api/v1/auth/oauth/google';
  };

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">
      <Navbar title="FellowHire" subtitle="Remote Skills Academy Reviewer Portal" />

      <main className="flex-1 flex items-center justify-center p-4 sm:p-6 lg:p-8">
        <div className="max-w-md w-full">
          {/* Card Container */}
          <div className="stitch-card bg-white p-8">
            <div className="flex items-center gap-3.5 mb-6">
              <div className="h-11 px-2 py-1 rounded-xl bg-white border border-slate-200 shadow-2xs flex items-center justify-center">
                <img src="/kulkul-logo.svg" alt="Kulkul Tech" className="h-8 w-auto object-contain" />
              </div>
              <div>
                <h1 className="text-xl font-bold text-kulkul-purple">Reviewer Portal</h1>
                <p className="text-xs text-slate-500">Sign in to manage fellowship applicants</p>
              </div>
            </div>

            {/* Google OAuth Button */}
            <button
              type="button"
              onClick={handleGoogleSignIn}
              className="w-full flex items-center justify-center gap-3 py-3 px-4 bg-white hover:bg-slate-50 border border-slate-300 rounded-full text-sm font-bold text-slate-700 shadow-sm transition active:scale-[0.98] mb-5"
            >
              <svg className="w-5 h-5" viewBox="0 0 24 24">
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
              <span>Sign in with Google</span>
            </button>

            <div className="relative flex items-center justify-center mb-5">
              <div className="border-t border-slate-200 w-full" />
              <span className="bg-white px-3 text-2xs font-bold uppercase tracking-wider text-slate-400">
                Or password sign in
              </span>
            </div>

            <form onSubmit={handleLogin} className="space-y-4">
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-1.5">
                  Reviewer Email
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
                    <Mail className="w-4 h-4" />
                  </div>
                  <input
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="admin@rsa.org"
                    className="w-full pl-10 pr-4 py-2.5 text-sm border border-slate-300 rounded-xl shadow-sm focus:border-kulkul-purple focus:ring-2 focus:ring-kulkul-purple-light outline-none transition"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-1.5">
                  Password
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
                    <Lock className="w-4 h-4" />
                  </div>
                  <input
                    type="password"
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••"
                    className="w-full pl-10 pr-4 py-2.5 text-sm border border-slate-300 rounded-xl shadow-sm focus:border-kulkul-purple focus:ring-2 focus:ring-kulkul-purple-light outline-none transition"
                  />
                </div>
              </div>

              <div className="p-3.5 bg-kulkul-purple-light border border-kulkul-purple/20 rounded-xl text-xs text-kulkul-purple">
                <span className="font-bold">Pre-seeded Demo:</span>{' '}
                <span className="font-mono font-bold">admin@rsa.org</span> /{' '}
                <span className="font-mono font-bold">admin123</span>
              </div>

              <button
                type="submit"
                disabled={isLoading}
                className="w-full flex items-center justify-center gap-2 py-3.5 px-4 bg-kulkul-purple hover:bg-kulkul-purple-hover text-white text-sm font-bold rounded-full shadow-md transition disabled:opacity-50"
              >
                {isLoading ? (
                  <span>Signing In...</span>
                ) : (
                  <>
                    <span>Sign In with Email</span>
                    <ArrowRight className="w-4 h-4 text-kulkul-orange" />
                  </>
                )}
              </button>
            </form>
          </div>
        </div>
      </main>
    </div>
  );
};
