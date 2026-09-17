import React, { useState, useRef, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { resolveMediaUrl } from '@/services/apiClient';
import { useAuthStore } from '@/hooks/useAuthStore';
import { LogOut, Building2, User, ChevronDown } from 'lucide-react';

interface NavbarProps {
  title?: string;
  subtitle?: string;
  showAdminNav?: boolean;
  showNavLinks?: boolean;
  hideAdminButton?: boolean;
}

export const Navbar: React.FC<NavbarProps> = ({
  showAdminNav = false,
  showNavLinks = false,
  hideAdminButton = false,
}) => {
  const { logout, isLoading: isAuthLoading } = useAuth();
  const { user, isAuthenticated } = useAuthStore();
  const [signInDropdownOpen, setSignInDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();

  // Close dropdown on outside click
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setSignInDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleLogout = async () => {
    await logout();
    navigate('/');
  };

  const companyLogo = user?.organization?.logo_url;
  const companyName = user?.organization?.name;

  return (
    <header className="sticky top-0 z-40 bg-white/95 backdrop-blur-md border-b border-slate-100/90 shadow-2xs">
      <div className="w-full px-4 sm:px-8 lg:px-12">
        <div className="flex items-center justify-between h-20 sm:h-24">
          {/* Brand Logo - Prominent FellowHire brand */}
          <div className="flex items-center shrink-0">
            <Link to={showAdminNav ? "/admin/dashboard" : "/"} className="flex items-center gap-3 group">
              <img src="/kulkul-logo.svg" alt="FellowHire" className="h-9 sm:h-11 w-auto object-contain transition group-hover:opacity-90" />
              <span className="text-xl sm:text-2xl font-black tracking-tight text-slate-900 group-hover:text-kulkul-purple transition leading-none">
                FellowHire
              </span>
            </Link>
          </div>

          {/* Center: Nav Links (Platform Features & Register Company) - Shown on Main Landing Page only */}
          {showNavLinks && !showAdminNav && (
            <nav className="hidden md:flex items-center gap-8 text-sm sm:text-base font-semibold text-slate-600">
              <a href="/#features" className="hover:text-kulkul-purple transition">
                Platform Features
              </a>
              <button
                onClick={() => navigate('/register-company')}
                className="hover:text-kulkul-purple transition font-semibold text-sm sm:text-base text-slate-600"
              >
                Register Company
              </button>
            </nav>
          )}

          {/* Right: Actions / Auth / Sign In Dropdown */}
          {showAdminNav && isAuthenticated && user ? (
            <div className="flex items-center gap-3 sm:gap-4 shrink-0">
              {/* Client Company Logo or Name on Right */}
              {companyLogo ? (
                <img
                  src={resolveMediaUrl(companyLogo)}
                  alt={companyName || 'Company Logo'}
                  className="h-8 sm:h-9 w-auto max-w-[160px] object-contain"
                />
              ) : (
                <div className="flex items-center gap-1.5 text-xs sm:text-sm font-bold text-slate-700 whitespace-nowrap">
                  <Building2 className="w-4 h-4 text-kulkul-purple" />
                  <span>{companyName || 'Organization'}</span>
                </div>
              )}

              <button
                onClick={handleLogout}
                className="btn btn-md btn-secondary"
                title="Sign out of portal"
              >
                <LogOut className="w-4 h-4 text-white" />
                <span>Sign Out</span>
              </button>
            </div>
          ) : isAuthenticated && user ? (
            /* Candidate or Authenticated User on Public / Interview / Test / Candidate Pages */
            <div className="flex items-center gap-2.5 sm:gap-3 shrink-0">
              {/* Role-Aware Dashboard Link */}
              {(!hideAdminButton || user.role === 'candidate') && (
                <Link
                  to={
                    user.role === 'superadmin'
                      ? '/superadmin/dashboard'
                      : user.role === 'org_admin'
                      ? '/admin/dashboard'
                      : '/candidate/dashboard'
                  }
                  className="btn btn-md bg-purple-50 hover:bg-purple-100 text-kulkul-purple border border-purple-200 shadow-2xs hover:shadow-xs"
                >
                  {user.role === 'candidate' ? (
                    <User className="w-4 h-4 text-kulkul-orange" />
                  ) : (
                    <Building2 className="w-4 h-4 text-kulkul-orange" />
                  )}
                  <span>
                    {user.role === 'superadmin'
                      ? 'Admin Workspace'
                      : user.role === 'org_admin'
                      ? 'Company Portal'
                      : 'My Dashboard'}
                  </span>
                </Link>
              )}

              {/* User Identity */}
              <div className="hidden sm:flex items-center gap-2 text-xs sm:text-sm font-bold text-slate-700 whitespace-nowrap">
                <span className="max-w-[130px] lg:max-w-[180px] truncate">
                  {user.name || user.email}
                </span>
              </div>

              {/* Sign Out Action */}
              <button
                onClick={handleLogout}
                className="btn btn-md btn-secondary"
                title="Sign out"
              >
                <LogOut className="w-4 h-4 text-white" />
                <span>Sign Out</span>
              </button>
            </div>
          ) : isAuthLoading ? (
            /* Subtle skeleton loading placeholder while session is checked */
            <div className="h-10 w-28 bg-slate-100 rounded-full animate-pulse shrink-0" />
          ) : (
            /* Sign In Dropdown Action (Only shown when NOT authenticated) */
            <div className="relative shrink-0" ref={dropdownRef}>
              <button
                onClick={() => setSignInDropdownOpen((prev) => !prev)}
                className="btn btn-md btn-primary"
                aria-expanded={signInDropdownOpen}
              >
                <span>Sign In</span>
                <ChevronDown className={`w-4 h-4 transition-transform duration-200 ${signInDropdownOpen ? 'rotate-180' : ''}`} />
              </button>

              {/* Dropdown Menu */}
              {signInDropdownOpen && (
                <div className="absolute right-0 mt-2 w-56 rounded-2xl bg-white border border-slate-100 shadow-xl p-1.5 z-50 animate-in fade-in slide-in-from-top-2 duration-150">
                  <button
                    onClick={() => {
                      setSignInDropdownOpen(false);
                      navigate('/candidate/dashboard');
                    }}
                    className="w-full h-11 px-3 py-2 text-left hover:bg-slate-50 flex items-center gap-3 transition group rounded-xl"
                  >
                    <div className="w-7 h-7 rounded-lg bg-kulkul-orange-light text-kulkul-orange flex items-center justify-center shrink-0">
                      <User className="w-4 h-4" />
                    </div>
                    <span className="text-sm font-bold text-slate-900 group-hover:text-kulkul-purple transition">
                      Candidate Entry
                    </span>
                  </button>

                  <div className="my-1 border-t border-slate-100" />

                  <button
                    onClick={() => {
                      setSignInDropdownOpen(false);
                      navigate('/admin/login');
                    }}
                    className="w-full h-11 px-3 py-2 text-left hover:bg-slate-50 flex items-center gap-3 transition group rounded-xl"
                  >
                    <div className="w-7 h-7 rounded-lg bg-kulkul-purple-light text-kulkul-purple flex items-center justify-center shrink-0">
                      <Building2 className="w-4 h-4" />
                    </div>
                    <span className="text-sm font-bold text-slate-900 group-hover:text-kulkul-purple transition">
                      Company Sign In
                    </span>
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </header>
  );
};
