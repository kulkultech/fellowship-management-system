import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  Menu,
  X,
  LogOut,
  User as UserIcon,
  Building2,
  ShieldCheck,
} from 'lucide-react';
import { useAuthStore } from '@/hooks/useAuthStore';

export interface NavItem {
  id: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  badge?: string | number;
  badgeColor?: string;
  onClick?: () => void;
}

interface DashboardLayoutProps {
  portalType: 'company_admin' | 'superadmin' | 'candidate';
  title?: string;
  subtitle?: string;
  companyName?: string;
  companyLogoUrl?: string;
  breadcrumbs?: { label: string; onClick?: () => void }[];
  navItems: NavItem[];
  activeNavId: string;
  onNavChange: (id: string) => void;
  headerActions?: React.ReactNode;
  children: React.ReactNode;
  candidateEmail?: string;
  onCandidateSignOut?: () => void;
}

export const DashboardLayout: React.FC<DashboardLayoutProps> = ({
  portalType,
  title,
  subtitle,
  companyName,
  companyLogoUrl,
  breadcrumbs = [],
  navItems,
  activeNavId,
  onNavChange,
  headerActions,
  children,
  candidateEmail,
  onCandidateSignOut,
}) => {
  const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState(false);
  const { user, logout } = useAuthStore();
  const navigate = useNavigate();

  const handleSignOut = () => {
    if (portalType === 'candidate') {
      if (onCandidateSignOut) {
        onCandidateSignOut();
      } else {
        localStorage.removeItem('candidate_email');
        navigate('/');
      }
    } else {
      logout();
      navigate('/admin/login');
    }
  };

  const getPortalBadge = () => {
    switch (portalType) {
      case 'superadmin':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-2xs font-extrabold bg-purple-100 text-kulkul-purple border border-purple-200">
            <ShieldCheck className="w-3 h-3 text-kulkul-orange" />
            <span>KulKul Superadmin</span>
          </span>
        );
      case 'company_admin':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-2xs font-bold bg-slate-100 text-slate-700 border border-slate-200">
            <Building2 className="w-3 h-3 text-kulkul-purple" />
            <span>Company Portal</span>
          </span>
        );
      case 'candidate':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-2xs font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
            <UserIcon className="w-3 h-3 text-emerald-600" />
            <span>Candidate Portal</span>
          </span>
        );
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col text-slate-900 selection:bg-kulkul-orange/20 selection:text-kulkul-purple">
      {/* ========================================================================= */}
      {/* 1. TOP BAR (T-LAYOUT TOP HEADER) */}
      {/* ========================================================================= */}
      <header className="sticky top-0 z-40 bg-white/95 backdrop-blur-md border-b border-slate-200/90 shadow-2xs h-16 sm:h-20 flex items-center shrink-0">
        <div className="w-full px-4 sm:px-6 lg:px-8 flex items-center justify-between gap-4">
          {/* Left: Hamburger (Mobile) + Logo + Portal Badge */}
          <div className="flex items-center gap-3 sm:gap-4">
            <button
              onClick={() => setIsMobileSidebarOpen(!isMobileSidebarOpen)}
              className="lg:hidden p-2 rounded-xl text-slate-600 hover:bg-slate-100 transition focus:outline-none"
              aria-label="Toggle navigation menu"
            >
              {isMobileSidebarOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
            </button>

            <Link to="/" className="flex items-center gap-3 group shrink-0">
              <img
                src="/kulkul-logo.svg"
                alt="KulKul"
                className="h-8 sm:h-9 w-auto object-contain transition group-hover:opacity-90"
              />
            </Link>

            <div className="hidden sm:flex items-center gap-2">
              {getPortalBadge()}
            </div>
          </div>

          {/* Center: Breadcrumbs (if provided) */}
          {breadcrumbs.length > 0 && (
            <nav className="hidden md:flex items-center gap-1.5 text-xs font-semibold text-slate-500">
              {breadcrumbs.map((crumb, idx) => (
                <React.Fragment key={idx}>
                  {idx > 0 && <span className="text-slate-300">/</span>}
                  {crumb.onClick ? (
                    <button
                      onClick={crumb.onClick}
                      className="hover:text-kulkul-purple transition text-slate-600 font-bold"
                    >
                      {crumb.label}
                    </button>
                  ) : (
                    <span className="text-slate-900 font-extrabold">{crumb.label}</span>
                  )}
                </React.Fragment>
              ))}
            </nav>
          )}

          {/* Right: Company Logo / Name + User Pill + Sign Out */}
          <div className="flex items-center gap-3 shrink-0">
            {/* Superadmin Quick Switcher for KulKul Team */}
            {user?.role === 'superadmin' && portalType === 'company_admin' && (
              <Link
                to="/superadmin/dashboard"
                className="hidden sm:inline-flex items-center gap-1 px-3 py-1.5 rounded-full text-xs font-bold bg-purple-50 text-kulkul-purple border border-purple-200 hover:bg-purple-100 transition"
              >
                <ShieldCheck className="w-3.5 h-3.5 text-kulkul-orange" />
                <span>Superadmin Workspace</span>
              </Link>
            )}

            {user?.role === 'superadmin' && portalType === 'superadmin' && (
              <Link
                to="/admin/dashboard"
                className="hidden sm:inline-flex items-center gap-1 px-3 py-1.5 rounded-full text-xs font-bold bg-slate-100 text-slate-700 border border-slate-200 hover:bg-slate-200 transition"
              >
                <Building2 className="w-3.5 h-3.5 text-kulkul-purple" />
                <span>Company Workspace</span>
              </Link>
            )}

            {/* Company Badge / Logo (Right of Navbar) */}
            {portalType === 'company_admin' && (
              <div className="hidden sm:flex items-center gap-2">
                {companyLogoUrl ? (
                  <img
                    src={companyLogoUrl}
                    alt={companyName || 'Company'}
                    className="h-8 max-w-[120px] object-contain rounded-lg border border-slate-200 p-0.5 bg-white shadow-2xs"
                  />
                ) : companyName ? (
                  <div className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-slate-100 border border-slate-200 text-xs font-bold text-slate-800 shadow-2xs">
                    <Building2 className="w-3.5 h-3.5 text-kulkul-purple" />
                    <span>{companyName}</span>
                  </div>
                ) : null}
              </div>
            )}

            {/* Candidate User Pill */}
            {portalType === 'candidate' && candidateEmail && (
              <div className="hidden sm:flex items-center gap-1.5 px-3 py-1 rounded-full bg-slate-100 border border-slate-200 text-xs font-bold text-slate-700">
                <UserIcon className="w-3.5 h-3.5 text-kulkul-purple" />
                <span>{candidateEmail}</span>
              </div>
            )}

            {/* Admin User Pill */}
            {user && portalType !== 'candidate' && (
              <div className="hidden md:flex items-center gap-1.5 px-3 py-1 rounded-full bg-slate-100 border border-slate-200 text-xs font-bold text-slate-700">
                <UserIcon className="w-3.5 h-3.5 text-kulkul-purple" />
                <span>{user.email}</span>
              </div>
            )}

            {/* Sign Out Button */}
            <button
              onClick={handleSignOut}
              className="inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-bold text-slate-700 hover:text-slate-900 bg-white hover:bg-slate-100 border border-slate-200 rounded-full transition shadow-2xs"
              title="Sign Out"
            >
              <LogOut className="w-3.5 h-3.5 text-slate-500" />
              <span className="hidden sm:inline">Sign Out</span>
            </button>
          </div>
        </div>
      </header>

      {/* ========================================================================= */}
      {/* 2. BODY WORKSPACE: LEFT SIDEBAR + MAIN CONTENT */}
      {/* ========================================================================= */}
      <div className="flex-1 flex w-full relative">
        {/* Mobile Backdrop */}
        {isMobileSidebarOpen && (
          <div
            onClick={() => setIsMobileSidebarOpen(false)}
            className="fixed inset-0 bg-slate-900/40 backdrop-blur-xs z-30 lg:hidden"
          />
        )}

        {/* LEFT VERTICAL SIDEBAR */}
        <aside
          className={`fixed lg:sticky top-16 sm:top-20 z-30 w-72 h-[calc(100vh-4rem)] sm:h-[calc(100vh-5rem)] bg-white border-r border-slate-200 flex flex-col justify-between transition-transform duration-200 ease-in-out shrink-0 ${
            isMobileSidebarOpen
              ? 'translate-x-0 shadow-2xl'
              : '-translate-x-full lg:translate-x-0'
          }`}
        >
          {/* Top Section: Navigation Items */}
          <div className="p-4 sm:p-5 overflow-y-auto space-y-6">
            {/* Sidebar Section Title / Context */}
            <div className="px-2">
              <div className="text-2xs font-extrabold uppercase tracking-wider text-slate-400">
                Navigation
              </div>
            </div>

            {/* Nav Items List */}
            <nav className="space-y-1.5">
              {navItems.map((item) => {
                const IconComponent = item.icon;
                const isActive = activeNavId === item.id;
                return (
                  <button
                    key={item.id}
                    onClick={() => {
                      if (item.onClick) {
                        item.onClick();
                      } else {
                        onNavChange(item.id);
                      }
                      setIsMobileSidebarOpen(false);
                    }}
                    className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-2xl text-xs font-extrabold transition-all group ${
                      isActive
                        ? 'bg-kulkul-purple text-white shadow-sm'
                        : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
                    }`}
                  >
                    <div className="flex items-center gap-3 truncate">
                      <IconComponent
                        className={`w-4 h-4 shrink-0 transition ${
                          isActive
                            ? 'text-kulkul-orange'
                            : 'text-slate-400 group-hover:text-kulkul-purple'
                        }`}
                      />
                      <span className="truncate">{item.label}</span>
                    </div>

                    {item.badge !== undefined && (
                      <span
                        className={`px-2 py-0.5 rounded-full text-2xs font-extrabold shrink-0 ${
                          item.badgeColor
                            ? item.badgeColor
                            : isActive
                            ? 'bg-white/20 text-white'
                            : 'bg-slate-100 text-slate-600 group-hover:bg-slate-200'
                        }`}
                      >
                        {item.badge}
                      </span>
                    )}
                  </button>
                );
              })}
            </nav>
          </div>

          {/* Bottom Section: Footer / Organization Context */}
          <div className="p-4 border-t border-slate-100 bg-slate-50/70">
            {portalType === 'company_admin' && (
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-xl bg-kulkul-purple text-white flex items-center justify-center font-bold text-xs shrink-0 shadow-2xs">
                  <Building2 className="w-4 h-4 text-kulkul-orange" />
                </div>
                <div className="min-w-0">
                  <div className="text-xs font-bold text-slate-800 truncate">
                    {companyName || 'Host Organization'}
                  </div>
                  <div className="text-2xs text-slate-400 font-mono truncate">
                    Organization Workspace
                  </div>
                </div>
              </div>
            )}

            {portalType === 'superadmin' && (
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-xl bg-kulkul-purple text-white flex items-center justify-center font-bold text-xs shrink-0 shadow-2xs">
                  <ShieldCheck className="w-4 h-4 text-kulkul-orange" />
                </div>
                <div className="min-w-0">
                  <div className="text-xs font-bold text-slate-800 truncate">
                    KulKul Platform Admin
                  </div>
                  <div className="text-2xs text-emerald-600 font-bold flex items-center gap-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
                    <span>System Online</span>
                  </div>
                </div>
              </div>
            )}

            {portalType === 'candidate' && (
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-xl bg-emerald-600 text-white flex items-center justify-center font-bold text-xs shrink-0 shadow-2xs">
                  <UserIcon className="w-4 h-4" />
                </div>
                <div className="min-w-0">
                  <div className="text-xs font-bold text-slate-800 truncate">
                    {candidateEmail || 'Candidate Account'}
                  </div>
                  <div className="text-2xs text-slate-400 truncate">
                    Active Intake Session
                  </div>
                </div>
              </div>
            )}
          </div>
        </aside>

        {/* MAIN CONTENT AREA */}
        <main className="flex-1 w-full p-4 sm:p-6 lg:p-8 min-w-0 overflow-y-auto">
          {/* Header Title Section (if provided) */}
          {(title || headerActions) && (
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 pb-6 border-b border-slate-200/80 mb-6">
              <div>
                {title && (
                  <h1 className="text-2xl sm:text-3xl font-black text-slate-900 tracking-tight">
                    {title}
                  </h1>
                )}
                {subtitle && (
                  <p className="text-xs sm:text-sm text-slate-500 mt-1">
                    {subtitle}
                  </p>
                )}
              </div>

              {headerActions && (
                <div className="flex items-center gap-3 shrink-0">
                  {headerActions}
                </div>
              )}
            </div>
          )}

          {/* Active View Content */}
          <div className="w-full">{children}</div>
        </main>
      </div>
    </div>
  );
};
