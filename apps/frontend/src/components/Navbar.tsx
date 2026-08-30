import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { useAuthStore } from '@/hooks/useAuthStore';
import { AuthModal } from '@/components/AuthModal';
import { LogOut, User as UserIcon, Building2, ShieldCheck } from 'lucide-react';

interface NavbarProps {
  title?: string;
  subtitle?: string;
  showAdminNav?: boolean;
}

export const Navbar: React.FC<NavbarProps> = ({
  title = 'FellowHire',
  subtitle = 'Assessment & Talent Platform',
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
      <header className="sticky top-0 z-40 bg-white/90 backdrop-blur-md border-b border-slate-100 shadow-sm">
        <div className="max-w-[96rem] mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            {/* Logo & Platform / Company Details */}
            <div className="flex items-center gap-3">
              <Link to="/" className="flex items-center gap-3.5 group">
                <div className="h-10 px-2 py-1 rounded-xl bg-white border border-slate-200/80 shadow-xs flex items-center justify-center transition group-hover:border-kulkul-orange/40">
                  <img src="/kulkul-logo.svg" alt="Logo" className="h-7 w-auto object-contain" />
                </div>
                <div className="flex flex-col">
                  <div className="flex items-center gap-2">
                    <span className="font-extrabold text-kulkul-purple text-base tracking-tight">{title}</span>
                    {companyName ? (
                      <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-2xs font-bold bg-kulkul-purple-light text-kulkul-purple border border-kulkul-purple/20">
                        {companyLogo && (
                          <img
                            src={companyLogo}
                            alt={companyName}
                            className="w-3.5 h-3.5 rounded-full object-cover"
                            onError={(e) => {
                              (e.target as HTMLElement).style.display = 'none';
                            }}
                          />
                        )}
                        <span>{companyName}</span>
                      </span>
                    ) : (
                      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-2xs font-bold bg-kulkul-orange-light text-kulkul-orange border border-kulkul-orange/20">
                        Multi-Tenant
                      </span>
                    )}
                  </div>
                  <span className="text-2xs text-slate-500 font-medium">{subtitle}</span>
                </div>
              </Link>
            </div>

            {/* Navigation Links / Auth Actions */}
            <div className="flex items-center gap-4">
              {showAdminNav && isAuthenticated && user ? (
                <div className="flex items-center gap-4">
                  <div className="hidden sm:flex items-center gap-2.5 text-sm text-slate-700 bg-kulkul-purple-light/50 border border-kulkul-purple-subtle px-3.5 py-1.5 rounded-full">
                    {companyLogo ? (
                      <img
                        src={companyLogo}
                        alt="Company Logo"
                        className="w-5 h-5 rounded-md object-cover border border-slate-200"
                        onError={(e) => {
                          (e.target as HTMLElement).style.display = 'none';
                        }}
                      />
                    ) : user.role === 'superadmin' ? (
                      <ShieldCheck className="w-4 h-4 text-kulkul-purple" />
                    ) : (
                      <UserIcon className="w-4 h-4 text-kulkul-purple" />
                    )}
                    <span className="font-bold text-kulkul-purple">{user.name}</span>
                    <span className="text-2xs font-bold text-white bg-kulkul-purple px-2 py-0.5 rounded-full">
                      {user.role === 'superadmin' ? 'Superadmin' : user.organization?.name || 'Company Admin'}
                    </span>
                  </div>
                  <button
                    onClick={handleLogout}
                    className="inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-bold text-slate-700 hover:text-slate-900 bg-white hover:bg-slate-50 border border-slate-200 rounded-full shadow-sm transition"
                    title="Sign out of portal"
                  >
                    <LogOut className="w-3.5 h-3.5 text-slate-500" />
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
