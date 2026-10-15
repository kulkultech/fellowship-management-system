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
          className="btn btn-sm btn-outline"
          title="Click to switch to another company workspace"
        >
          <Menu className="w-3.5 h-3.5 text-amber-600" />
          <span className="font-extrabold max-w-[150px] truncate">{displayCompanyName}</span>
          {displayCompanySlug && (
            <span className="text-3xs font-mono text-slate-400">/{displayCompanySlug}</span>
          )}
          <ChevronDown className={`w-3.5 h-3.5 text-slate-400 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
        </button>
      ) : variant === 'compact' ? (
        <button
          type="button"
          onClick={() => setIsOpen(!isOpen)}
          className="btn btn-icon-sm btn-outline"
          title={`Active company: ${displayCompanyName}. Click to switch company.`}
        >
          <Menu className="w-4 h-4 text-kulkul-purple" />
        </button>
      ) : (
        /* Header Variant */
        <button
          type="button"
          onClick={() => setIsOpen(!isOpen)}
          className={`btn btn-md btn-outline whitespace-nowrap ${
            isOpen ? 'bg-slate-100 text-slate-900 border-slate-300' : ''
          }`}
          title="Switch Company Workspace (Superadmin)"
          aria-expanded={isOpen}
          aria-haspopup="true"
        >
          {/* Hamburger / Menu Icon */}
          <div className="w-4 h-4 flex items-center justify-center text-slate-400 hover:text-slate-600 shrink-0">
            <Menu className="w-3.5 h-3.5" />
          </div>

          <div className="w-6 h-6 rounded-lg bg-slate-100 text-slate-600 border border-slate-200 flex items-center justify-center font-bold shrink-0 overflow-hidden shadow-2xs">
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
              <Building2 className="w-3.5 h-3.5 text-slate-600" />
            )}
          </div>

          <span className="truncate max-w-[130px] sm:max-w-[200px] text-slate-800">
            {displayCompanyName}
          </span>

          <ChevronDown
            className={`w-3.5 h-3.5 text-slate-400 shrink-0 transition-transform duration-150 ${
              isOpen ? 'rotate-180 text-slate-700' : ''
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
                <h4 className="card-title flex items-center gap-1.5">
                  <span>Switch Company</span>
                  <span className="text-2xs font-extrabold text-kulkul-purple">
                    (Superadmin)
                  </span>
                </h4>
                <p className="meta-text">
                  Select an organization to manage its programs
                </p>
              </div>
            </div>
            <button
              onClick={() => setIsOpen(false)}
              className="btn btn-icon-sm btn-ghost shrink-0"
              aria-label="Close"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Search Filter */}
          <div className="p-3 border-b border-slate-100 bg-white">
            <div className="search-field sm:w-full">
              <Search />
              <input
                type="text"
                autoFocus
                value={searchFilter}
                onChange={(e) => setSearchFilter(e.target.value)}
                placeholder="Search company or slug..."
                className="search-input pr-9"
              />
              {searchFilter && (
                <button
                  onClick={() => setSearchFilter('')}
                  className="btn btn-icon-xs btn-ghost absolute right-1.5 top-1/2 -translate-y-1/2"
                  aria-label="Clear search"
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
                <p className="meta-text mt-1">Try a different name or slug</p>
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
                            <span className="text-3xs font-extrabold text-amber-700">
                              Pending
                            </span>
                          )}
                        </div>
                        <div className="text-2xs font-mono text-slate-400 mt-0.5 truncate">
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
              className="btn btn-sm btn-ghost"
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
              className="btn btn-sm btn-outline"
            >
              <ShieldCheck className="w-3.5 h-3.5 text-slate-600" />
              <span>Superadmin Console</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
