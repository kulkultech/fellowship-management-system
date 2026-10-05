import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  Menu,
  LogOut,
  User as UserIcon,
  ShieldCheck,
  ChevronDown,
  ChevronRight,
  Pencil,
} from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { resolveMediaUrl } from '@/services/apiClient';
import { EditProfileModal } from '@/components/EditProfileModal';
import { SuperadminCompanySwitcher } from '@/components/SuperadminCompanySwitcher';

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
  portalType: 'company_admin' | 'superadmin' | 'candidate' | 'mentor';
  title?: string;
  subtitle?: string;
  companyName?: string;
  companyLogoUrl?: string;
  navItems: NavItem[];
  activeNavId: string;
  onNavChange: (id: string) => void;
  headerActions?: React.ReactNode;
  children: React.ReactNode;
  candidateName?: string;
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
  candidateName,
  candidateEmail,
  onCandidateSignOut,
  onEditProfile,
}) => {
  const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState(false);
  const [isEditProfileModalOpen, setIsEditProfileModalOpen] = useState(false);
  const [expandedMap, setExpandedMap] = useState<Record<string, boolean>>({});
  const [isMinimized, setIsMinimized] = useState<boolean>(() => {
    try {
      return localStorage.getItem('dashboard_sidebar_minimized') === 'true';
    } catch {
      return false;
    }
  });

  const toggleMinimize = () => {
    setIsMinimized((prev) => {
      const next = !prev;
      try {
        localStorage.setItem('dashboard_sidebar_minimized', String(next));
      } catch {}
      return next;
    });
  };

  const { user, logout: authLogout } = useAuth();
  const navigate = useNavigate();

  const displayName =
    user?.name ||
    candidateName ||
    (portalType === 'candidate' && candidateEmail ? candidateEmail.split('@')[0] : user?.email || 'My Profile');

  const handleOpenEditProfile = () => {
    if (onEditProfile) {
      onEditProfile();
    } else {
      setIsEditProfileModalOpen(true);
    }
  };

  const toggleExpand = (id: string, defaultExpanded: boolean) => {
    setExpandedMap((prev) => {
      const current = prev[id] !== undefined ? prev[id] : defaultExpanded;
      return {
        ...prev,
        [id]: !current,
      };
    });
  };

  const handleSignOut = async () => {
    if (portalType === 'candidate') {
      if (onCandidateSignOut) {
        await onCandidateSignOut();
      } else {
        localStorage.removeItem('candidate_email');
        try {
          await authLogout();
        } catch {
          // ignore
        }
        navigate('/');
      }
    } else {
      try {
        await authLogout();
      } catch (err) {
        console.error('Sign out error:', err);
      }
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
          {/* Left: Sidebar Toggle (≡) + Logo */}
          <div className="flex items-center gap-3 sm:gap-4 shrink-0">
            <button
              type="button"
              onClick={() => {
                if (window.innerWidth < 1024) {
                  setIsMobileSidebarOpen(!isMobileSidebarOpen);
                } else {
                  toggleMinimize();
                }
              }}
              className="p-2 rounded-xl text-slate-600 hover:text-kulkul-purple hover:bg-slate-100 transition focus:outline-none"
              title={isMinimized ? 'Expand sidebar' : 'Minimize sidebar'}
              aria-label="Toggle navigation sidebar"
            >
              <Menu className="w-5 h-5" />
            </button>

            <Link to="/" className="flex items-center gap-3 group shrink-0">
              <img
                src="/kulkul-logo.svg"
                alt="KulKul"
                className="h-10 sm:h-12 w-auto object-contain transition group-hover:opacity-90"
              />
            </Link>
          </div>

          {/* Right: Actions / Workspace Switcher + Sign Out */}
          <div className="flex items-center justify-end flex-wrap gap-3 sm:gap-4 shrink-0">
            {/* Superadmin Company Switcher Dropdown */}
            {user?.role === 'superadmin' && (portalType === 'company_admin' || portalType === 'superadmin') && (
              <SuperadminCompanySwitcher
                variant="header"
                activeOrgName={companyName}
              />
            )}

            {/* Superadmin Quick Switcher for KulKul Team */}
            {user?.role === 'superadmin' && portalType === 'company_admin' && (
              <Link
                to="/superadmin/dashboard"
                className="btn btn-md bg-purple-50 text-kulkul-purple border border-purple-200 hover:bg-purple-100 shadow-2xs whitespace-nowrap"
              >
                <ShieldCheck className="w-4 h-4 text-kulkul-orange" />
                <span>Superadmin Console</span>
              </Link>
            )}


            {/* Sign Out Button (Only shown when logged in) */}
            {((portalType === 'candidate' && Boolean(candidateEmail)) || (portalType !== 'candidate' && Boolean(user))) && (
              <button
                onClick={handleSignOut}
                className="btn btn-md btn-secondary"
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
          className={`fixed lg:sticky top-20 sm:top-24 z-30 h-[calc(100vh-5rem)] sm:h-[calc(100vh-6rem)] bg-white border-r border-slate-200 flex flex-col justify-between transition-all duration-300 ease-in-out shrink-0 ${
            isMinimized ? 'w-72 lg:w-20' : 'w-72'
          } ${
            isMobileSidebarOpen
              ? 'translate-x-0 shadow-2xl'
              : '-translate-x-full lg:translate-x-0'
          }`}
        >
          {/* Navigation Items */}
          <div
            className={`space-y-1 flex-1 overflow-y-auto ${
              isMinimized
                ? 'p-2 lg:px-2 lg:py-4 lg:overflow-visible'
                : 'p-4 sm:p-5'
            }`}
          >
            <nav className="space-y-1.5">
                {navItems.map((item) => {
                  const IconComponent = item.icon;
                  const isActive = activeNavId === item.id;
                  const hasChildren = Boolean(item.children && item.children.length > 0);
                  const isItemExpanded =
                    expandedMap[item.id] !== undefined
                      ? expandedMap[item.id]
                      : item.isExpanded !== false;

                  return (
                    <div key={item.id} className="space-y-1 relative group">
                      <div
                        className={`nav-item-root ${
                          isMinimized ? 'lg:justify-center lg:px-0' : ''
                        } ${
                          isActive
                            ? 'bg-kulkul-purple text-white shadow-xs'
                            : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
                        }`}
                      >
                        <button
                          type="button"
                          onClick={() => {
                            if (isMinimized && hasChildren) {
                              setIsMinimized(false);
                              try {
                                localStorage.setItem('dashboard_sidebar_minimized', 'false');
                              } catch {}
                              toggleExpand(item.id, true);
                            } else {
                              if (item.onClick) {
                                item.onClick();
                              } else {
                                onNavChange(item.id);
                              }
                              if (!hasChildren) {
                                setIsMobileSidebarOpen(false);
                              }
                            }
                          }}
                          className={`flex items-center ${
                            isMinimized ? 'lg:justify-center lg:w-full' : 'gap-3 flex-1 text-left'
                          } truncate py-1`}
                          title={isMinimized ? item.label : undefined}
                        >
                          <div className="relative flex items-center justify-center">
                            <IconComponent
                              className={`w-4 h-4 shrink-0 transition ${
                                isActive
                                  ? 'text-kulkul-orange'
                                  : 'text-slate-400 group-hover:text-kulkul-purple'
                              }`}
                            />
                            {/* Minimized compact badge indicator */}
                            {isMinimized && item.badge !== undefined && (
                              <span className="hidden lg:flex absolute -top-2 -right-2.5 min-w-4 h-4 px-1 rounded-full bg-kulkul-orange text-white text-3xs font-extrabold items-center justify-center shadow-xs">
                                {typeof item.badge === 'number' && item.badge > 99
                                  ? '99+'
                                  : item.badge}
                              </span>
                            )}
                          </div>
                          <span className={`truncate ${isMinimized ? 'lg:hidden' : ''}`}>
                            {item.label}
                          </span>
                        </button>

                        <div
                          className={`flex items-center gap-1 shrink-0 ml-1 ${
                            isMinimized ? 'lg:hidden' : ''
                          }`}
                        >
                          {item.badge !== undefined && (
                            <span
                              className={`text-2xs font-bold ${
                                isActive
                                  ? 'text-white/80'
                                  : 'text-slate-400 group-hover:text-slate-600'
                              }`}
                            >
                              {item.badge}
                            </span>
                          )}

                          {hasChildren && (
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                toggleExpand(item.id, item.isExpanded !== false);
                              }}
                              className={`p-1.5 rounded-lg transition ${
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
                            </button>
                          )}
                        </div>
                      </div>

                      {/* Minimized Tooltip on Hover (When NO Children) */}
                      {isMinimized && !hasChildren && (
                        <div className="hidden lg:group-hover:flex absolute left-full top-1/2 -translate-y-1/2 ml-3 z-50 items-center gap-2 px-3 py-1.5 bg-slate-900 text-white text-xs font-bold rounded-xl whitespace-nowrap shadow-xl pointer-events-none animate-in fade-in duration-150">
                          <span>{item.label}</span>
                          {item.badge !== undefined && (
                            <span className="text-3xs font-extrabold px-1.5 py-0.5 rounded-full bg-white/20 text-white">
                              {item.badge}
                            </span>
                          )}
                        </div>
                      )}

                      {/* Minimized Flyout Submenu on Hover (When HAS Children) */}
                      {isMinimized && hasChildren && (
                        <div className="hidden lg:group-hover:block absolute left-full top-0 ml-3 z-50 w-64 bg-white rounded-2xl shadow-2xl border border-slate-200 p-3 space-y-2 animate-in fade-in zoom-in-95 duration-150">
                          <div className="flex items-center justify-between pb-2 border-b border-slate-100">
                            <span className="text-xs font-black text-slate-900">{item.label}</span>
                            {item.badge !== undefined && (
                              <span className="text-3xs font-bold px-1.5 py-0.5 rounded-md bg-purple-50 text-kulkul-purple">
                                {item.badge}
                              </span>
                            )}
                          </div>
                          <div className="max-h-72 overflow-y-auto space-y-1 pr-1">
                            {item.children!.map((child) => {
                              const isChildActive = activeNavId === child.id;
                              const ChildIcon = child.icon;
                              const hasSubChildren = Boolean(
                                child.children && child.children.length > 0
                              );

                              return (
                                <div key={child.id} className="space-y-0.5">
                                  <button
                                    type="button"
                                    onClick={() => {
                                      if (child.onClick) child.onClick();
                                      else onNavChange(child.id);
                                    }}
                                    className={`w-full flex items-center justify-between p-2 rounded-xl text-xs font-bold transition text-left ${
                                      isChildActive
                                        ? 'bg-kulkul-purple text-white shadow-2xs'
                                        : 'text-slate-700 hover:bg-slate-100'
                                    }`}
                                  >
                                    <div className="flex items-center gap-2 truncate">
                                      {ChildIcon && <ChildIcon className="w-3.5 h-3.5 shrink-0" />}
                                      <span className="truncate">{child.label}</span>
                                    </div>
                                    {child.badge !== undefined && (
                                      <span
                                        className={`text-2xs font-bold ${
                                          isChildActive ? 'text-white/80' : 'text-slate-400'
                                        }`}
                                      >
                                        {child.badge}
                                      </span>
                                    )}
                                  </button>

                                  {hasSubChildren && (
                                    <div className="pl-3 ml-2 border-l border-slate-200 space-y-0.5 py-0.5">
                                      {child.children!.map((sub) => {
                                        const isSubActive = activeNavId === sub.id;
                                        const SubIcon = sub.icon;
                                        return (
                                          <button
                                            key={sub.id}
                                            type="button"
                                            onClick={() => {
                                              if (sub.onClick) sub.onClick();
                                              else onNavChange(sub.id);
                                            }}
                                            className={`w-full flex items-center justify-between px-2 py-1 rounded-lg text-2xs font-medium transition text-left ${
                                              isSubActive
                                                ? 'bg-purple-100 text-kulkul-purple font-bold'
                                                : 'text-slate-500 hover:bg-slate-50 hover:text-slate-800'
                                            }`}
                                          >
                                            <div className="flex items-center gap-1.5 truncate">
                                              {SubIcon && <SubIcon className="w-3 h-3 shrink-0" />}
                                              <span className="truncate">{sub.label}</span>
                                            </div>
                                            {sub.badge !== undefined && (
                                              <span className="text-3xs font-bold text-slate-400">
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
                        </div>
                      )}

                      {/* Level 1 Children (Programs under Programs Directory) */}
                      {hasChildren && isItemExpanded && (
                        <div
                          className={`pl-3 ml-3 border-l-2 border-slate-100 space-y-1 py-1 ${
                            isMinimized ? 'lg:hidden' : ''
                          }`}
                        >
                          {item.children!.map((child) => {
                            const isChildActive = activeNavId === child.id;
                            const hasSubChildren = Boolean(child.children && child.children.length > 0);
                            const isChildExpanded = expandedMap[child.id] !== undefined ? expandedMap[child.id] : (child.isExpanded !== false);
                            const ChildIcon = child.icon;

                            return (
                              <div key={child.id} className="space-y-1">
                                <div
                                  className={`nav-item-child ${
                                    isChildActive
                                      ? 'bg-purple-50 text-kulkul-purple font-bold'
                                      : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
                                  }`}
                                >
                                  <button
                                    type="button"
                                    onClick={() => {
                                      if (child.onClick) {
                                        child.onClick();
                                      } else {
                                        onNavChange(child.id);
                                      }
                                      if (!hasSubChildren) {
                                        setIsMobileSidebarOpen(false);
                                      }
                                    }}
                                    className="flex items-center gap-2 truncate flex-1 text-left py-1"
                                  >
                                    {ChildIcon && (
                                      <ChildIcon
                                        className={`w-3.5 h-3.5 shrink-0 ${
                                          isChildActive ? 'text-kulkul-purple' : 'text-slate-400'
                                        }`}
                                      />
                                    )}
                                    <span className="truncate">{child.label}</span>
                                  </button>

                                  <div className="flex items-center gap-1 shrink-0 ml-1">
                                    {child.badge !== undefined && (
                                      <span className="text-2xs font-bold text-slate-400">
                                        {child.badge}
                                      </span>
                                    )}
                                    {hasSubChildren && (
                                      <button
                                        type="button"
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          toggleExpand(child.id, child.isExpanded !== false);
                                        }}
                                        className="p-1 rounded-lg hover:bg-purple-100 text-slate-400 hover:text-kulkul-purple transition"
                                        title={isChildExpanded ? 'Minimize / Collapse' : 'Expand'}
                                      >
                                        {isChildExpanded ? (
                                          <ChevronDown className="w-3.5 h-3.5 text-kulkul-purple" />
                                        ) : (
                                          <ChevronRight className="w-3.5 h-3.5 text-slate-400" />
                                        )}
                                      </button>
                                    )}
                                  </div>
                                </div>

                                {/* Level 2 Sub-Children (Tracks under a Program) */}
                                {hasSubChildren && isChildExpanded && (
                                  <div className="pl-3 ml-3 border-l-2 border-slate-100 space-y-0.5 py-0.5">
                                    {child.children!.map((sub) => {
                                      const isSubActive = activeNavId === sub.id;
                                      const SubIcon = sub.icon;

                                      return (
                                        <button
                                          key={sub.id}
                                          type="button"
                                          onClick={() => {
                                            if (sub.onClick) {
                                              sub.onClick();
                                            } else {
                                              onNavChange(sub.id);
                                            }
                                            setIsMobileSidebarOpen(false);
                                          }}
                                          className={`nav-item-subchild ${
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
                                            <span className="text-2xs font-bold text-slate-400">
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

          {/* Bottom Section: Footer / User Identity & Profile (Clickable to Edit Profile) */}
          <div
            className={`border-t border-slate-100 bg-slate-50/70 transition-all ${
              isMinimized ? 'p-2 lg:p-2' : 'p-3 sm:p-4'
            }`}
          >
            <div className="relative group">
              <button
                type="button"
                onClick={handleOpenEditProfile}
                className={`w-full flex items-center ${
                  isMinimized ? 'lg:justify-center p-1' : 'gap-3 p-2'
                } rounded-2xl hover:bg-white border border-transparent hover:border-slate-200/80 shadow-2xs hover:shadow-sm transition-all group text-left relative cursor-pointer`}
                title={
                  isMinimized
                    ? `${displayName} - Click to edit profile`
                    : 'Click to edit your profile and settings'
                }
              >
                {/* Avatar / Logo with hover edit badge */}
                <div className="relative shrink-0">
                  <div className="w-10 h-10 rounded-xl bg-kulkul-purple text-white flex items-center justify-center font-bold text-xs shadow-2xs overflow-hidden border border-kulkul-purple/20">
                    {user?.avatar_url ? (
                      <img
                        src={resolveMediaUrl(user.avatar_url)}
                        alt={displayName}
                        className="w-full h-full object-cover"
                        onError={(e) => {
                          (e.target as HTMLElement).style.display = 'none';
                        }}
                      />
                    ) : portalType === 'company_admin' && companyLogoUrl ? (
                      <img
                        src={resolveMediaUrl(companyLogoUrl)}
                        alt={companyName || 'Company'}
                        className="w-full h-full object-contain bg-white p-0.5"
                      />
                    ) : portalType === 'superadmin' ? (
                      <ShieldCheck className="w-5 h-5 text-kulkul-orange" />
                    ) : displayName && displayName !== 'My Profile' ? (
                      <span className="text-sm font-black text-white">
                        {displayName.charAt(0).toUpperCase()}
                      </span>
                    ) : (
                      <UserIcon className="w-5 h-5 text-kulkul-orange" />
                    )}
                  </div>
                  {/* Sleek Edit Pencil Badge */}
                  <span className="absolute -bottom-1 -right-1 w-4 h-4 bg-kulkul-purple text-white rounded-full flex items-center justify-center border border-white shadow-xs group-hover:scale-110 group-hover:bg-kulkul-orange transition">
                    <Pencil className="w-2.5 h-2.5" />
                  </span>
                </div>

                {/* Name & Subtitle / Context (hidden on desktop when minimized) */}
                <div className={`min-w-0 flex-1 ${isMinimized ? 'lg:hidden' : ''}`}>
                  <div className="flex items-center justify-between gap-1">
                    <span className="text-sm font-bold text-slate-900 truncate group-hover:text-kulkul-purple transition">
                      {displayName}
                    </span>
                  </div>
                  <div className="text-xs text-slate-500 font-normal truncate flex items-center gap-1 mt-0.5">
                    {portalType === 'company_admin' && (
                      <span className="truncate">{companyName || user?.organization?.name || 'Company Admin'}</span>
                    )}
                    {portalType === 'superadmin' && (
                      <span className="text-kulkul-purple font-bold">Platform Superadmin</span>
                    )}
                    {portalType === 'mentor' && (
                      <span className="text-kulkul-purple font-bold">Program Mentor</span>
                    )}
                    {portalType === 'candidate' && (
                      <span className="truncate">{candidateEmail || user?.email || 'Candidate'}</span>
                    )}
                    {portalType !== 'company_admin' && portalType !== 'superadmin' && portalType !== 'mentor' && portalType !== 'candidate' && (
                      <span className="truncate">{user?.role || 'Active Session'}</span>
                    )}
                  </div>
                </div>
              </button>

              {/* Tooltip on hover when minimized */}
              {isMinimized && (
                <div className="hidden lg:group-hover:flex absolute left-full bottom-2 ml-3 z-50 flex-col gap-0.5 px-3 py-2 bg-slate-900 text-white text-xs rounded-xl whitespace-nowrap shadow-2xl pointer-events-none animate-in fade-in duration-150">
                  <span className="font-bold">{displayName}</span>
                  <span className="text-3xs text-slate-400">Click to edit profile</span>
                </div>
              )}
            </div>
          </div>
        </aside>

        {/* MAIN CONTENT AREA */}
        <main className="flex-1 w-full p-4 sm:p-6 lg:p-8 min-w-0 overflow-y-auto">
          {/* Header Title Section (if provided) */}
          {(title || headerActions) && (
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 pb-6 border-b border-slate-200/80 mb-6">
              <div>
                {title && (
                  <h1 className="heading-page">
                    {title}
                  </h1>
                )}
                {subtitle && (
                  <p className="text-body-sm mt-1">
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

      {/* Universal Edit Profile & Account Modal */}
      <EditProfileModal
        isOpen={isEditProfileModalOpen}
        onClose={() => setIsEditProfileModalOpen(false)}
        portalType={portalType}
        candidateEmail={candidateEmail}
      />
    </div>
  );
};
