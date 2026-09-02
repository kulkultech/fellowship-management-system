import React, { useState, useRef, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { useAuthStore } from '@/hooks/useAuthStore';
import { LogOut, Building2, User, ChevronDown } from 'lucide-react';

interface NavbarProps {
  title?: string;
  subtitle?: string;
  showAdminNav?: boolean;
  showNavLinks?: boolean;
}

export const Navbar: React.FC<NavbarProps> = ({
  showAdminNav = false,
  showNavLinks = false,
}) => {
  const { logout } = useAuth();
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
      <div className="max-w-7xl mx-auto px-4 sm:px-8 lg:px-12 w-full">
        <div className="flex items-center justify-between h-20 sm:h-24">
          {/* Brand Logo - Prominent Kulkul logo */}
          <div className="flex items-center shrink-0">
            <Link to={showAdminNav ? "/admin/dashboard" : "/"} className="flex items-center group">
              <img src="/kulkul-logo.svg" alt="KulKul" className="h-10 sm:h-12 w-auto object-contain transition group-hover:opacity-90" />
            </Link>
          </div>

          {/* Center: Nav Links (Platform Features & Register Company) - Shown on Main Landing Page only */}
          {showNavLinks && !showAdminNav && (
            <nav className="hidden md:flex items-center gap-10 text-base font-semibold text-slate-600">
              <a href="/#features" className="hover:text-kulkul-purple transition">
                Platform Features
              </a>
              <button
                onClick={() => navigate('/register-company')}
                className="hover:text-kulkul-purple transition font-semibold text-slate-600"
              >
                Register Company
              </button>
            </nav>
          )}

          {/* Right: Actions / Auth / Sign In Dropdown */}
          {showAdminNav && isAuthenticated && user ? (
            <div className="flex items-center gap-3.5 sm:gap-4 shrink-0">
              {/* Client Company Logo or Name on Right */}
              {companyLogo ? (
                <img
                  src={companyLogo}
                  alt={companyName || 'Company Logo'}
                  className="h-8 sm:h-9 w-auto max-w-[160px] object-contain"
                  onError={(e) => {
                    (e.target as HTMLElement).style.display = 'none';
                  }}
                />
              ) : (
                <div className="flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-slate-100 border border-slate-200 text-xs sm:text-sm font-bold text-slate-700">
                  <Building2 className="w-4 h-4 text-kulkul-purple" />
                  <span>{companyName || 'Remote Skills Academy'}</span>
                </div>
              )}

              <button
                onClick={handleLogout}
                className="px-6 py-3 rounded-full text-sm sm:text-base font-bold text-white bg-kulkul-orange hover:bg-kulkul-orange-hover shadow-sm hover:shadow-md transition active:scale-[0.98] inline-flex items-center gap-2"
                title="Sign out of portal"
              >
                <LogOut className="w-4 h-4 text-white" />
                <span>Sign Out</span>
              </button>
            </div>
          ) : (
            /* Sign In Dropdown Action */
            <div className="relative shrink-0" ref={dropdownRef}>
              <button
                onClick={() => setSignInDropdownOpen((prev) => !prev)}
                className="px-6 py-3 rounded-full text-sm sm:text-base font-bold text-white bg-kulkul-purple hover:bg-kulkul-purple-hover shadow-sm hover:shadow-md transition active:scale-[0.98] flex items-center gap-2"
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
                    className="w-full px-3.5 py-2.5 text-left hover:bg-slate-50 flex items-center gap-3 transition group rounded-xl"
                  >
                    <div className="w-8 h-8 rounded-lg bg-kulkul-orange-light text-kulkul-orange flex items-center justify-center shrink-0">
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
                    className="w-full px-3.5 py-2.5 text-left hover:bg-slate-50 flex items-center gap-3 transition group rounded-xl"
                  >
                    <div className="w-8 h-8 rounded-lg bg-kulkul-purple-light text-kulkul-purple flex items-center justify-center shrink-0">
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
