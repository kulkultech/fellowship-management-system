import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { useAuthStore } from '@/hooks/useAuthStore';
import { AuthModal } from '@/components/AuthModal';
import { LogOut, Building2 } from 'lucide-react';

interface NavbarProps {
  title?: string;
  subtitle?: string;
  showAdminNav?: boolean;
}

export const Navbar: React.FC<NavbarProps> = ({
  showAdminNav = false,
}) => {
  const { logout } = useAuth();
  const { user, isAuthenticated } = useAuthStore();
  const [authModalOpen, setAuthModalOpen] = useState(false);
  const navigate = useNavigate();

  const handleLogout = async () => {
    await logout();
    navigate('/');
  };

  const companyLogo = user?.organization?.logo_url;
  const companyName = user?.organization?.name;

  return (
    <>
      <header className="sticky top-0 z-40 bg-white/95 backdrop-blur-md border-b border-slate-100/90 shadow-2xs">
        <div className="max-w-7xl mx-auto px-4 sm:px-8 lg:px-12">
          <div className="flex items-center justify-between h-20 sm:h-24">
            {/* Logo & Platform / Company Details */}
            <div className="flex items-center gap-4">
              {showAdminNav ? (
                <Link to="/admin/dashboard" className="flex items-center gap-3.5 group">
                  {companyLogo ? (
                    <img
                      src={companyLogo}
                      alt={companyName || 'Company Logo'}
                      className="h-10 sm:h-12 w-auto max-w-[220px] object-contain transition group-hover:opacity-90"
                      onError={(e) => {
                        (e.target as HTMLElement).style.display = 'none';
                      }}
                    />
                  ) : (
                    <span className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight group-hover:text-kulkul-purple transition">
                      {companyName || 'Reviewer Dashboard'}
                    </span>
                  )}
                </Link>
              ) : (
                <Link to="/" className="flex items-center gap-3.5 group">
                  <img src="/kulkul-logo.svg" alt="Kulkul" className="h-10 sm:h-12 w-auto object-contain transition group-hover:opacity-90" />
                </Link>
              )}
            </div>

            {/* Navigation Links / Auth Actions */}
            <div className="flex items-center gap-4">
              {showAdminNav && isAuthenticated && user ? (
                <div className="flex items-center gap-4">
                  <button
                    onClick={handleLogout}
                    className="inline-flex items-center gap-2 px-4 py-2 text-xs sm:text-sm font-bold text-slate-700 hover:text-slate-900 bg-white hover:bg-slate-50 border border-slate-200 rounded-full shadow-2xs transition"
                    title="Sign out of portal"
                  >
                    <LogOut className="w-4 h-4 text-slate-500" />
                    <span>Sign Out</span>
                  </button>
                </div>
              ) : (
                <div className="flex items-center gap-3">
                  <Link
                    to="/register-company"
                    className="text-xs sm:text-sm font-bold text-kulkul-purple hover:text-kulkul-orange px-3 py-1.5 transition"
                  >
                    Register Company
                  </Link>
                  <button
                    onClick={() => setAuthModalOpen(true)}
                    className="stitch-pill stitch-pill-purple"
                  >
                    <Building2 className="w-4 h-4 text-kulkul-orange" />
                    <span>Sign In</span>
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      </header>

      <AuthModal
        isOpen={authModalOpen}
        onClose={() => setAuthModalOpen(false)}
        defaultRole="company"
      />
    </>
  );
};
