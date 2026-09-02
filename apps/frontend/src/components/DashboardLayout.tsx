import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  Menu,
  X,
  LogOut,
  User as UserIcon,
  Building2,
  ShieldCheck,
  ChevronDown,
  ChevronRight,
  Edit3,
} from 'lucide-react';
import { useAuthStore } from '@/hooks/useAuthStore';

export interface SubChildNavItem {
  id: string;
  label: string;
  icon?: React.ComponentType<{ className?: string }>;
  badge?: string | number;
  badgeColor?: string;
  onClick?: () => void;
}

export interface ChildNavItem {
  id: string;
  label: string;
  icon?: React.ComponentType<{ className?: string }>;
  badge?: string | number;
  badgeColor?: string;
  onClick?: () => void;
  isExpanded?: boolean;
  children?: SubChildNavItem[];
}

export interface NavItem {
  id: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  badge?: string | number;
  badgeColor?: string;
  onClick?: () => void;
  isExpanded?: boolean;
  onToggleExpand?: () => void;
  children?: ChildNavItem[];
}

interface DashboardLayoutProps {
  portalType: 'company_admin' | 'superadmin' | 'candidate';
  title?: string;
  subtitle?: string;
  companyName?: string;
  companyLogoUrl?: string;
  navItems: NavItem[];
  activeNavId: string;
  onNavChange: (id: string) => void;
  headerActions?: React.ReactNode;
  children: React.ReactNode;
  candidateEmail?: string;
  onCandidateSignOut?: () => void;
  onEditProfile?: () => void;
}

export const DashboardLayout: React.FC<DashboardLayoutProps> = ({
  portalType,
  title,
  subtitle,
  companyName,
  companyLogoUrl,
  navItems,
  activeNavId,
  onNavChange,
  headerActions,
  children,
  candidateEmail,
  onCandidateSignOut,
  onEditProfile,
}) => {
  const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState(false);
  const [expandedMap, setExpandedMap] = useState<Record<string, boolean>>({});
  const { user, logout } = useAuthStore();
  const navigate = useNavigate();

  const toggleExpand = (id: string, defaultExpanded: boolean) => {
    setExpandedMap((prev) => {
      const current = prev[id] !== undefined ? prev[id] : defaultExpanded;
      return {
        ...prev,
        [id]: !current,
      };
    });
  };

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

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col text-slate-900 selection:bg-kulkul-orange/20 selection:text-kulkul-purple">
      {/* ========================================================================= */}
      {/* 1. TOP BAR (T-LAYOUT TOP HEADER) */}
      {/* ========================================================================= */}
      <header className="sticky top-0 z-40 bg-white/95 backdrop-blur-md border-b border-slate-100/90 shadow-2xs">
        <div className="w-full px-4 sm:px-8 lg:px-12 flex items-center justify-between gap-4 h-20 sm:h-24">
          {/* Left: Hamburger (Mobile) + Logo */}
          <div className="flex items-center gap-3 sm:gap-4 shrink-0">
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
                className="h-10 sm:h-12 w-auto object-contain transition group-hover:opacity-90"
              />
            </Link>
          </div>

          {/* Right: User Pill + Sign Out */}
          <div className="flex items-center gap-3 sm:gap-4 shrink-0">
            {/* Superadmin Quick Switcher for KulKul Team */}
            {user?.role === 'superadmin' && portalType === 'company_admin' && (
              <Link
                to="/superadmin/dashboard"
                className="hidden sm:inline-flex items-center gap-1.5 px-4 py-2 rounded-full text-xs font-bold bg-purple-50 text-kulkul-purple border border-purple-200 hover:bg-purple-100 transition"
              >
                <ShieldCheck className="w-4 h-4 text-kulkul-orange" />
                <span>Superadmin Workspace</span>
              </Link>
            )}

            {user?.role === 'superadmin' && portalType === 'superadmin' && (
              <Link
                to="/admin/dashboard"
                className="hidden sm:inline-flex items-center gap-1.5 px-4 py-2 rounded-full text-xs font-bold bg-slate-100 text-slate-700 border border-slate-200 hover:bg-slate-200 transition"
              >
                <Building2 className="w-4 h-4 text-kulkul-purple" />
                <span>Company Workspace</span>
              </Link>
            )}

            {/* Candidate User Pill */}
            {portalType === 'candidate' && candidateEmail && (
              <div className="hidden sm:flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-slate-100 border border-slate-200 text-xs sm:text-sm font-bold text-slate-700">
                <UserIcon className="w-4 h-4 text-kulkul-purple" />
                <span>{candidateEmail}</span>
              </div>
            )}

            {/* Admin User Pill */}
            {user && portalType !== 'candidate' && (
              <div className="hidden md:flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-slate-100 border border-slate-200 text-xs sm:text-sm font-bold text-slate-700">
                <UserIcon className="w-4 h-4 text-kulkul-purple" />
                <span>{user.email}</span>
              </div>
            )}

            {/* Sign Out Button (Only shown when logged in) */}
            {((portalType === 'candidate' && Boolean(candidateEmail)) || (portalType !== 'candidate' && Boolean(user))) && (
              <button
                onClick={handleSignOut}
                className="px-6 py-3 rounded-full text-sm sm:text-base font-bold text-white bg-kulkul-orange hover:bg-kulkul-orange-hover shadow-sm hover:shadow-md transition active:scale-[0.98] inline-flex items-center gap-2"
                title="Sign Out"
              >
                <LogOut className="w-4 h-4 text-white" />
                <span>Sign Out</span>
              </button>
            )}
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
          className={`fixed lg:sticky top-20 sm:top-24 z-30 w-72 h-[calc(100vh-5rem)] sm:h-[calc(100vh-6rem)] bg-white border-r border-slate-200 flex flex-col justify-between transition-transform duration-200 ease-in-out shrink-0 ${
            isMobileSidebarOpen
              ? 'translate-x-0 shadow-2xl'
              : '-translate-x-full lg:translate-x-0'
          }`}
        >
          {/* Top Section: Navigation Items */}
          <div className="p-4 sm:p-5 overflow-y-auto space-y-1">
            {/* Nav Items List with Hierarchical Tree Support */}
            <nav className="space-y-1.5">
              {navItems.map((item) => {
                const IconComponent = item.icon;
                const isActive = activeNavId === item.id;
                const hasChildren = Boolean(item.children && item.children.length > 0);
                const isItemExpanded = expandedMap[item.id] !== undefined ? expandedMap[item.id] : (item.isExpanded !== false);

                return (
                  <div key={item.id} className="space-y-1">
                    <button
                      onClick={() => {
                        if (item.onClick) {
                          item.onClick();
                        } else {
                          onNavChange(item.id);
                        }
                        if (!hasChildren) {
                          setIsMobileSidebarOpen(false);
                        }
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

                      <div className="flex items-center gap-1.5 shrink-0">
                        {item.badge !== undefined && (
                          <span
                            className={`px-2 py-0.5 rounded-full text-2xs font-extrabold ${
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

                        {hasChildren && (
                          <span
                            role="button"
                            tabIndex={0}
                            onClick={(e) => {
                              e.stopPropagation();
                              toggleExpand(item.id, item.isExpanded !== false);
                            }}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter' || e.key === ' ') {
                                e.stopPropagation();
                                toggleExpand(item.id, item.isExpanded !== false);
                              }
                            }}
                            className={`p-1 rounded-lg transition cursor-pointer ${
                              isActive
                                ? 'hover:bg-white/20 text-white/80 hover:text-white'
                                : 'hover:bg-slate-200 text-slate-400 hover:text-slate-700'
                            }`}
                            title={isItemExpanded ? 'Minimize / Collapse' : 'Expand'}
                          >
                            {isItemExpanded ? (
                              <ChevronDown className="w-3.5 h-3.5" />
                            ) : (
                              <ChevronRight className="w-3.5 h-3.5" />
                            )}
                          </span>
                        )}
                      </div>
                    </button>

                    {/* Level 1 Children (Programs under Programs Directory) */}
                    {hasChildren && isItemExpanded && (
                      <div className="pl-3 ml-3 border-l-2 border-slate-100 space-y-1 py-1">
                        {item.children!.map((child) => {
                          const isChildActive = activeNavId === child.id;
                          const hasSubChildren = Boolean(child.children && child.children.length > 0);
                          const isChildExpanded = expandedMap[child.id] !== undefined ? expandedMap[child.id] : (child.isExpanded !== false);
                          const ChildIcon = child.icon;

                          return (
                            <div key={child.id} className="space-y-1">
                              <button
                                onClick={() => {
                                  if (child.onClick) {
                                    child.onClick();
                                  } else {
                                    onNavChange(child.id);
                                  }
                                  // When selecting a program row, ensure its sub-tree is expanded
                                  setExpandedMap((prev) => ({ ...prev, [child.id]: true }));
                                  if (!hasSubChildren) {
                                    setIsMobileSidebarOpen(false);
                                  }
                                }}
                                className={`w-full flex items-center justify-between px-3 py-2 rounded-xl text-xs font-bold transition group ${
                                  isChildActive
                                    ? 'bg-purple-50 text-kulkul-purple font-extrabold'
                                    : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
                                }`}
                              >
                                <div className="flex items-center gap-2 truncate">
                                  {ChildIcon && (
                                    <ChildIcon
                                      className={`w-3.5 h-3.5 shrink-0 ${
                                        isChildActive ? 'text-kulkul-purple' : 'text-slate-400'
                                      }`}
                                    />
                                  )}
                                  <span className="truncate">{child.label}</span>
                                </div>

                                <div className="flex items-center gap-1 shrink-0">
                                  {child.badge !== undefined && (
                                    <span className="px-1.5 py-0.5 rounded-md text-2xs font-bold bg-slate-100 text-slate-500">
                                      {child.badge}
                                    </span>
                                  )}
                                  {hasSubChildren && (
                                    <span
                                      role="button"
                                      tabIndex={0}
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        toggleExpand(child.id, child.isExpanded !== false);
                                      }}
                                      onKeyDown={(e) => {
                                        if (e.key === 'Enter' || e.key === ' ') {
                                          e.stopPropagation();
                                          toggleExpand(child.id, child.isExpanded !== false);
                                        }
                                      }}
                                      className="p-1 rounded-lg hover:bg-purple-100/80 text-slate-400 hover:text-kulkul-purple transition cursor-pointer"
                                      title={isChildExpanded ? 'Minimize / Collapse' : 'Expand'}
                                    >
                                      {isChildExpanded ? (
                                        <ChevronDown className="w-3 h-3" />
                                      ) : (
                                        <ChevronRight className="w-3 h-3" />
                                      )}
                                    </span>
                                  )}
                                </div>
                              </button>

                              {/* Level 2 Sub-Children (Tracks under a Program) */}
                              {hasSubChildren && isChildExpanded && (
                                <div className="pl-3 ml-3 border-l-2 border-slate-100 space-y-0.5 py-0.5">
                                  {child.children!.map((sub) => {
                                    const isSubActive = activeNavId === sub.id;
                                    const SubIcon = sub.icon;

                                    return (
                                      <button
                                        key={sub.id}
                                        onClick={() => {
                                          if (sub.onClick) {
                                            sub.onClick();
                                          } else {
                                            onNavChange(sub.id);
                                          }
                                          setIsMobileSidebarOpen(false);
                                        }}
                                        className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg text-2xs font-semibold transition group ${
                                          isSubActive
                                            ? 'bg-purple-100 text-kulkul-purple font-bold'
                                            : 'text-slate-500 hover:bg-slate-50 hover:text-slate-800'
                                        }`}
                                      >
                                        <div className="flex items-center gap-2 truncate">
                                          {SubIcon && (
                                            <SubIcon
                                              className={`w-3 h-3 shrink-0 ${
                                                isSubActive ? 'text-kulkul-purple' : 'text-slate-400'
                                              }`}
                                            />
                                          )}
                                          <span className="truncate">{sub.label}</span>
                                        </div>

                                        {sub.badge !== undefined && (
                                          <span className="px-1 py-0.2 rounded text-2xs font-bold bg-slate-100 text-slate-500">
                                            {sub.badge}
                                          </span>
                                        )}
                                      </button>
                                    );
                                  })}
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })}
            </nav>
          </div>

          {/* Bottom Section: Footer / Organization Context (Clickable to Edit Profile) */}
          <div className="p-4 border-t border-slate-100 bg-slate-50/70">
            {portalType === 'company_admin' && (
              <button
                type="button"
                onClick={onEditProfile}
                className="w-full flex items-center justify-between p-2.5 rounded-2xl hover:bg-white hover:shadow-xs border border-transparent hover:border-slate-200 transition text-left group"
                title="Click to edit organization profile & logo"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-9 h-9 rounded-xl bg-kulkul-purple text-white flex items-center justify-center font-bold text-xs shrink-0 shadow-2xs overflow-hidden border border-kulkul-purple/20">
                    {companyLogoUrl ? (
                      <img
                        src={companyLogoUrl}
                        alt={companyName || 'Company'}
                        className="w-full h-full object-contain bg-white p-0.5"
                        onError={(e) => {
                          (e.target as HTMLElement).style.display = 'none';
                        }}
                      />
                    ) : (
                      <Building2 className="w-4 h-4 text-kulkul-orange" />
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="text-xs font-bold text-slate-900 group-hover:text-kulkul-purple transition truncate">
                      {companyName || 'Host Organization'}
                    </div>
                    <div className="text-2xs text-slate-400 font-mono truncate">
                      Edit Profile & Logo
                    </div>
                  </div>
                </div>
                <Edit3 className="w-3.5 h-3.5 text-slate-400 group-hover:text-kulkul-purple transition shrink-0 ml-1" />
              </button>
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
