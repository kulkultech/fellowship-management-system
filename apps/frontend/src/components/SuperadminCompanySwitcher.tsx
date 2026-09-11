import React, { useState, useRef, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { adminService } from '@/services/adminService';
import { useAuthStore } from '@/hooks/useAuthStore';
import { resolveMediaUrl } from '@/services/apiClient';
import type { Organization } from '@/services/types';
import {
  Building2,
  ChevronDown,
  Check,
  Search,
  ShieldCheck,
  ArrowRight,
  X,
  Menu,
} from 'lucide-react';
import toast from 'react-hot-toast';

interface SuperadminCompanySwitcherProps {
  variant?: 'header' | 'banner' | 'compact';
  activeOrgId?: string;
  activeOrgName?: string;
  activeOrgSlug?: string;
  className?: string;
}

export const SuperadminCompanySwitcher: React.FC<SuperadminCompanySwitcherProps> = ({
  variant = 'header',
  activeOrgId,
  activeOrgName,
  activeOrgSlug,
  className = '',
}) => {
  const { user } = useAuthStore();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [searchParams] = useSearchParams();

  const [isOpen, setIsOpen] = useState(false);
  const [searchFilter, setSearchFilter] = useState('');
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Guard: Only superadmins can switch companies
  if (user?.role !== 'superadmin') {
    return null;
  }

  // Determine current active organization ID
  const currentOrgId = activeOrgId || searchParams.get('org_id') || undefined;

  // Load all companies in system
  const { data: companies = [], isLoading } = useQuery({
    queryKey: ['superadmin-companies'],
    queryFn: () => adminService.listCompanies(),
    staleTime: 30 * 1000,
  });

  // Close dropdown on outside click or ESC key
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setIsOpen(false);
      }
    };

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      document.addEventListener('keydown', handleKeyDown);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen]);

  // Find active company object
  const activeCompany = currentOrgId
    ? companies.find((c) => c.id === currentOrgId)
    : (activeOrgSlug ? companies.find((c) => c.slug === activeOrgSlug) : null) ||
      companies.find((c) => c.id === user?.organization_id || c.id === user?.organization?.id) ||
      (companies.length > 0 ? companies[0] : null);

  const displayCompanyName =
    activeOrgName ||
    activeCompany?.name ||
    user?.organization?.name ||
    (currentOrgId ? 'Company Workspace' : 'All Companies');

  const displayCompanySlug = activeOrgSlug || activeCompany?.slug || '';

  // Filter companies
  const filteredCompanies = companies.filter((c) => {
    const query = searchFilter.toLowerCase().trim();
    if (!query) return true;
    return (
      c.name.toLowerCase().includes(query) ||
      c.slug.toLowerCase().includes(query) ||
      (c.contact_email && c.contact_email.toLowerCase().includes(query))
    );
  });

  const invalidateAllOrgData = () => {
    queryClient.invalidateQueries({ queryKey: ['admin-organization-profile'] });
    queryClient.invalidateQueries({ queryKey: ['admin-all-programs'] });
    queryClient.invalidateQueries({ queryKey: ['program'] });
    queryClient.invalidateQueries({ queryKey: ['admin-stats'] });
    queryClient.invalidateQueries({ queryKey: ['admin-candidates'] });
    queryClient.invalidateQueries({ queryKey: ['question-sets'] });
    queryClient.invalidateQueries({ queryKey: ['all-question-sets'] });
  };

  const handleSelectCompany = (company: Organization) => {
    setIsOpen(false);
    setSearchFilter('');
    invalidateAllOrgData();
    toast.success(`Switched to "${company.name}" workspace`);
    navigate(`/admin/dashboard?org_id=${company.id}`);
  };

  const handleSelectDefaultCompany = () => {
    setIsOpen(false);
    setSearchFilter('');
    invalidateAllOrgData();
    toast.success('Switched to primary organization workspace');
    navigate('/admin/dashboard');
  };

  return (
    <div ref={dropdownRef} className={`relative inline-block text-left ${className}`}>
      {/* Trigger Button */}
      {variant === 'banner' ? (
        <button
          type="button"
          onClick={() => setIsOpen(!isOpen)}
          className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-white text-slate-800 hover:text-kulkul-purple border border-amber-300 hover:border-kulkul-purple shadow-2xs hover:bg-purple-50/50 text-xs font-bold transition active:scale-[0.98] cursor-pointer"
          title="Click to switch to another company workspace"
        >
          <Menu className="w-3.5 h-3.5 text-amber-600" />
          <span className="font-extrabold max-w-[150px] truncate">{displayCompanyName}</span>
          {displayCompanySlug && (
            <span className="text-[10px] font-mono text-slate-400">/{displayCompanySlug}</span>
          )}
          <ChevronDown className={`w-3.5 h-3.5 text-slate-400 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
        </button>
      ) : variant === 'compact' ? (
        <button
          type="button"
          onClick={() => setIsOpen(!isOpen)}
          className="p-2 rounded-xl bg-white border border-slate-200 text-slate-700 hover:bg-purple-50 hover:text-kulkul-purple shadow-2xs transition cursor-pointer"
          title={`Active company: ${displayCompanyName}. Click to switch company.`}
        >
          <Menu className="w-4 h-4 text-kulkul-purple" />
        </button>
      ) : (
        /* Header Variant */
        <button
          type="button"
          onClick={() => setIsOpen(!isOpen)}
          className={`inline-flex items-center gap-2.5 px-3.5 py-2 sm:px-4 sm:py-2 rounded-full text-xs sm:text-sm font-bold border transition active:scale-[0.98] shadow-2xs whitespace-nowrap cursor-pointer ${
            isOpen
              ? 'bg-purple-50 text-kulkul-purple border-kulkul-purple ring-2 ring-kulkul-purple/20'
              : currentOrgId
              ? 'bg-amber-50 text-amber-950 border-amber-300 hover:bg-amber-100 hover:border-amber-400'
              : 'bg-white text-slate-700 border-slate-200 hover:border-purple-300 hover:bg-slate-50'
          }`}
          title="Switch Company Workspace (Superadmin)"
          aria-expanded={isOpen}
          aria-haspopup="true"
        >
          {/* Hamburger / Menu Icon */}
          <div className="w-4 h-4 flex items-center justify-center text-slate-400 hover:text-slate-600 shrink-0">
            <Menu className="w-3.5 h-3.5" />
          </div>

          <div className="w-6 h-6 rounded-lg bg-white text-kulkul-purple border border-slate-200 flex items-center justify-center font-bold shrink-0 overflow-hidden shadow-2xs">
            {activeCompany?.logo_url ? (
              <img
                src={resolveMediaUrl(activeCompany.logo_url)}
                alt={activeCompany.name}
                className="w-full h-full object-contain"
                onError={(e) => {
                  (e.target as HTMLElement).style.display = 'none';
                }}
              />
            ) : (
              <Building2 className="w-3.5 h-3.5 text-kulkul-purple" />
            )}
          </div>

          <div className="flex flex-col text-left min-w-0 leading-tight">
            <div className="flex items-center gap-1">
              <span className="text-[9px] uppercase font-black tracking-wider text-slate-500">
                Switch Company
              </span>
              {currentOrgId && (
                <span className="px-1 py-0.2 rounded text-[8px] font-black bg-amber-200/80 text-amber-900 shrink-0">
                  Active
                </span>
              )}
            </div>
            <span className="font-extrabold truncate max-w-[110px] sm:max-w-[160px] text-slate-900">
              {displayCompanyName}
            </span>
          </div>

          <ChevronDown
            className={`w-3.5 h-3.5 text-slate-400 shrink-0 transition-transform duration-150 ${
              isOpen ? 'rotate-180 text-kulkul-purple' : ''
            }`}
          />
        </button>
      )}

      {/* Dropdown Menu Popover */}
      {isOpen && (
        <div className="absolute right-0 mt-2 w-[calc(100vw-2rem)] sm:w-96 max-w-sm rounded-3xl bg-white border border-slate-200/90 shadow-2xl z-50 animate-in fade-in zoom-in-95 duration-150 overflow-hidden">
          {/* Header */}
          <div className="p-4 border-b border-slate-100 bg-slate-50/80 flex items-center justify-between gap-2">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-xl bg-purple-100 text-kulkul-purple flex items-center justify-center font-bold">
                <Building2 className="w-4 h-4 text-kulkul-purple" />
              </div>
              <div>
                <h4 className="text-xs font-bold text-slate-900 flex items-center gap-2">
                  <span>Switch Company</span>
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-extrabold bg-purple-100 text-kulkul-purple">
                    Superadmin
                  </span>
                </h4>
                <p className="text-[11px] text-slate-500">
                  Select an organization to manage its programs
                </p>
              </div>
            </div>
            <button
              onClick={() => setIsOpen(false)}
              className="p-1 rounded-full text-slate-400 hover:text-slate-600 hover:bg-slate-200/60 transition"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Search Filter */}
          <div className="p-3 border-b border-slate-100 bg-white">
            <div className="relative">
              <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                autoFocus
                value={searchFilter}
                onChange={(e) => setSearchFilter(e.target.value)}
                placeholder="Search company or slug..."
                className="w-full pl-8 pr-8 py-2 rounded-xl text-xs bg-slate-50 border border-slate-200 focus:bg-white focus:border-kulkul-purple focus:ring-2 focus:ring-kulkul-purple/20 outline-none transition font-medium text-slate-900"
              />
              {searchFilter && (
                <button
                  onClick={() => setSearchFilter('')}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 p-0.5"
                >
                  <X className="w-3 h-3" />
                </button>
              )}
            </div>
          </div>

          {/* Companies List */}
          <div className="max-h-64 sm:max-h-72 overflow-y-auto divide-y divide-slate-100 p-1.5">
            {isLoading ? (
              <div className="p-6 text-center text-xs text-slate-400 animate-pulse">
                Loading companies...
              </div>
            ) : filteredCompanies.length === 0 ? (
              <div className="p-6 text-center">
                <p className="text-xs text-slate-500 font-semibold">No companies match "{searchFilter}"</p>
                <p className="text-2xs text-slate-400 mt-1">Try a different name or slug</p>
              </div>
            ) : (
              filteredCompanies.map((company) => {
                const isSelected =
                  currentOrgId === company.id || (!currentOrgId && company.slug === displayCompanySlug);

                return (
                  <button
                    key={company.id}
                    type="button"
                    onClick={() => handleSelectCompany(company)}
                    className={`w-full flex items-center justify-between gap-3 p-3 rounded-2xl text-left transition group cursor-pointer ${
                      isSelected
                        ? 'bg-purple-50/70 text-kulkul-purple font-bold'
                        : 'hover:bg-slate-50 text-slate-700'
                    }`}
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      {/* Logo or initials */}
                      <div className="w-9 h-9 rounded-xl bg-white border border-slate-200 flex items-center justify-center font-extrabold text-xs text-kulkul-purple shrink-0 overflow-hidden shadow-2xs">
                        {company.logo_url ? (
                          <img
                            src={resolveMediaUrl(company.logo_url)}
                            alt={company.name}
                            className="w-full h-full object-contain"
                            onError={(e) => {
                              (e.target as HTMLElement).style.display = 'none';
                            }}
                          />
                        ) : (
                          <span>{company.name.charAt(0).toUpperCase()}</span>
                        )}
                      </div>

                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5">
                          <span className="text-xs font-bold text-slate-900 group-hover:text-kulkul-purple transition truncate">
                            {company.name}
                          </span>
                          {company.status === 'pending_approval' && (
                            <span className="px-1.5 py-0.5 rounded text-3xs font-extrabold bg-amber-100 text-amber-800">
                              Pending
                            </span>
                          )}
                        </div>
                        <div className="text-[11px] font-mono text-slate-400 mt-0.5 truncate">
                          /programs/{company.slug}
                        </div>
                      </div>
                    </div>

                    <div className="shrink-0 flex items-center gap-1">
                      {isSelected ? (
                        <span className="w-6 h-6 rounded-full bg-purple-100 text-kulkul-purple flex items-center justify-center">
                          <Check className="w-3.5 h-3.5" />
                        </span>
                      ) : (
                        <span className="text-2xs text-slate-400 opacity-0 group-hover:opacity-100 transition flex items-center gap-1">
                          <span>Switch</span>
                          <ArrowRight className="w-3 h-3" />
                        </span>
                      )}
                    </div>
                  </button>
                );
              })
            )}
          </div>

          {/* Footer Quick Links */}
          <div className="p-3 border-t border-slate-100 bg-slate-50/90 flex items-center justify-between gap-2 text-xs">
            <button
              type="button"
              onClick={handleSelectDefaultCompany}
              className="px-3 py-1.5 rounded-xl text-slate-600 hover:text-slate-900 hover:bg-white transition text-2xs font-bold border border-transparent hover:border-slate-200"
              title="Switch back to primary organization default"
            >
              Primary Workspace
            </button>

            <button
              type="button"
              onClick={() => {
                setIsOpen(false);
                navigate('/superadmin/dashboard');
              }}
              className="px-3 py-1.5 rounded-xl text-kulkul-purple hover:bg-purple-50 transition text-2xs font-bold flex items-center gap-1.5 border border-purple-200 bg-white"
            >
              <ShieldCheck className="w-3.5 h-3.5 text-kulkul-orange" />
              <span>Superadmin Console</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
