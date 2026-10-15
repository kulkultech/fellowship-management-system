import React, { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { adminService } from '@/services/adminService';
import { resolveMediaUrl } from '@/services/apiClient';
import { DashboardLayout, type NavItem } from '@/components/DashboardLayout';
import { useAuthStore } from '@/hooks/useAuthStore';
import {
  Building2,
  CheckCircle2,
  XCircle,
  Clock,
  Search,
  ExternalLink,
  Layers,
  Calendar,
  Trash2,
  Pencil,
  X,
  Check,
  Users,
} from 'lucide-react';
import type { Organization, Program } from '@/services/types';
import { TeamManagementView } from '@/components/admin/TeamManagementView';
import toast from 'react-hot-toast';

export const SuperadminDashboardPage: React.FC = () => {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const { user } = useAuthStore();

  // Guard: Restrict superadmin workspace to superadmin role only
  useEffect(() => {
    if (user && user.role !== 'superadmin') {
      toast.error('Access restricted to platform administrators.');
      navigate(user.role === 'candidate' ? '/candidate/dashboard' : '/admin/dashboard', { replace: true });
    }
  }, [user, navigate]);

  const [activeTab, setActiveTab] = useState<'companies' | 'programs' | 'team'>('companies');
  const [companyStatusFilter, setCompanyStatusFilter] = useState<string>('');
  const [searchQuery, setSearchQuery] = useState<string>('');

  // 1. Load All Companies
  const { data: companiesList = [], isLoading: isCompaniesLoading } = useQuery({
    queryKey: ['superadmin-companies', companyStatusFilter],
    queryFn: () => adminService.listCompanies(companyStatusFilter),
    refetchOnMount: 'always',
  });

  // Unfiltered list for the metric tiles, so counts don't change with the status filter
  const { data: allCompanies = [] } = useQuery({
    queryKey: ['superadmin-companies', ''],
    queryFn: () => adminService.listCompanies(''),
  });

  // 2. Load All Programs Across System
  const { data: allPrograms = [], isLoading: isProgramsLoading } = useQuery({
    queryKey: ['superadmin-all-programs'],
    queryFn: () => adminService.listPrograms(),
    refetchOnMount: 'always',
  });

  // 3. Company Approval / Rejection Mutations
  const approveMutation = useMutation({
    mutationFn: (companyId: string) => adminService.approveCompany(companyId),
    onSuccess: (org) => {
      toast.success(`Approved company: ${org.name}`);
      queryClient.invalidateQueries({ queryKey: ['superadmin-companies'] });
      queryClient.invalidateQueries({ queryKey: ['admin-companies'] });
    },
    onError: (err: any) => {
      toast.error(err.response?.data?.message || 'Failed to approve company');
    },
  });

  const rejectMutation = useMutation({
    mutationFn: (companyId: string) => adminService.rejectCompany(companyId),
    onSuccess: (org) => {
      toast.success(`Rejected company: ${org.name}`);
      queryClient.invalidateQueries({ queryKey: ['superadmin-companies'] });
      queryClient.invalidateQueries({ queryKey: ['admin-companies'] });
    },
    onError: (err: any) => {
      toast.error(err.response?.data?.message || 'Failed to reject company');
    },
  });

  const deleteCompanyMutation = useMutation({
    mutationFn: (companyId: string) => adminService.deleteCompany(companyId),
    onSuccess: () => {
      toast.success('Company deleted successfully');
      queryClient.invalidateQueries({ queryKey: ['superadmin-companies'] });
      queryClient.invalidateQueries({ queryKey: ['admin-companies'] });
      queryClient.invalidateQueries({ queryKey: ['superadmin-all-programs'] });
      queryClient.invalidateQueries({ queryKey: ['admin-all-programs'] });
      queryClient.invalidateQueries({ queryKey: ['admin-organization-profile'] });
    },
    onError: (err: any) => {
      toast.error(err.response?.data?.message || err.response?.data?.error || err.message || 'Failed to delete company');
    },
  });

  const deleteProgramMutation = useMutation({
    mutationFn: (programId: string) => adminService.deleteProgram(programId),
    onSuccess: () => {
      toast.success('Program deleted successfully');
      queryClient.invalidateQueries({ queryKey: ['superadmin-all-programs'] });
      queryClient.invalidateQueries({ queryKey: ['admin-all-programs'] });
    },
    onError: (err: any) => {
      toast.error(err.response?.data?.message || err.response?.data?.error || 'Failed to delete program');
    },
  });

  // Edit Company State & Mutation
  const [editingCompany, setEditingCompany] = useState<Organization | null>(null);
  const [editCompanyName, setEditCompanyName] = useState('');
  const [editCompanySlug, setEditCompanySlug] = useState('');
  const [editCompanyEmail, setEditCompanyEmail] = useState('');
  const [editCompanyLogo, setEditCompanyLogo] = useState('');

  const handleOpenEditCompany = (company: Organization) => {
    setEditingCompany(company);
    setEditCompanyName(company.name || '');
    setEditCompanySlug(company.slug || '');
    setEditCompanyEmail(company.contact_email || '');
    setEditCompanyLogo(company.logo_url || '');
  };

  const updateCompanyMutation = useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: { name: string; slug: string; contact_email: string; logo_url: string } }) =>
      adminService.updateCompany(id, payload),
    onSuccess: (updated) => {
      toast.success(`Updated company: ${updated.name}`);
      queryClient.invalidateQueries({ queryKey: ['superadmin-companies'] });
      queryClient.invalidateQueries({ queryKey: ['admin-companies'] });
      queryClient.invalidateQueries({ queryKey: ['admin-organization-profile'] });
      setEditingCompany(null);
    },
    onError: (err: any) => {
      toast.error(err.response?.data?.message || err.response?.data?.error || 'Failed to update company');
    },
  });

  // Filtered Companies
  const filteredCompanies = companiesList.filter((comp) => {
    const matchesSearch =
      comp.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      comp.slug.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (comp.contact_email && comp.contact_email.toLowerCase().includes(searchQuery.toLowerCase()));
    return matchesSearch;
  });

  // Filtered Programs
  const filteredPrograms = allPrograms.filter((prog) => {
    return (
      prog.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      prog.slug.toLowerCase().includes(searchQuery.toLowerCase())
    );
  });

  const pendingCount = allCompanies.filter((c) => c.status === 'pending_approval').length;
  const approvedCount = allCompanies.filter((c) => c.status === 'approved').length;

  const getProgramStatus = (prog: Program): { label: string; dot: string; text: string } => {
    if (prog.status === 'draft') return { label: 'Draft', dot: 'bg-slate-400', text: 'text-slate-600' };
    if (prog.status === 'archived') return { label: 'Archived', dot: 'bg-slate-400', text: 'text-slate-600' };
    const now = Date.now();
    if (now < new Date(prog.open_date).getTime()) {
      return { label: 'Opening Soon', dot: 'bg-amber-500', text: 'text-amber-700' };
    }
    if (now > new Date(prog.end_date).getTime()) {
      return { label: 'Closed', dot: 'bg-rose-500', text: 'text-rose-700' };
    }
    return { label: 'Admissions Open', dot: 'bg-emerald-500', text: 'text-emerald-700' };
  };

  const tabTitles: Record<typeof activeTab, string> = {
    companies: 'Companies',
    programs: 'Programs',
    team: 'Superadmin Team',
  };

  const navItems: NavItem[] = [
    {
      id: 'companies',
      label: 'Company Approvals',
      icon: Building2,
      badge: pendingCount > 0 ? pendingCount : undefined,
      badgeColor: pendingCount > 0 ? 'bg-amber-500 text-white' : undefined,
    },
    {
      id: 'programs',
      label: 'All System Programs',
      icon: Layers,
    },
    {
      id: 'team',
      label: 'Superadmin Team',
      icon: Users,
    },
  ];

  return (
    <DashboardLayout
      portalType="superadmin"
      title={tabTitles[activeTab]}
      navItems={navItems}
      activeNavId={activeTab}
      onNavChange={(id) => setActiveTab(id as any)}
    >
      <div className="space-y-6">
        {/* ========================================================================= */}
        {/* TOP METRIC CARDS */}
        {/* ========================================================================= */}
        {activeTab === 'companies' && (
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="content-card flex items-center justify-between">
              <div>
                <div className="stat-label">
                  Pending Approvals
                </div>
                <div className="stat-value mt-1">
                  {pendingCount}
                </div>
              </div>
              <div className="w-10 h-10 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center font-bold">
                <Clock className="w-5 h-5" />
              </div>
            </div>

            <div className="content-card flex items-center justify-between">
              <div>
                <div className="stat-label">
                  Active Companies
                </div>
                <div className="stat-value mt-1">
                  {approvedCount}
                </div>
              </div>
              <div className="w-10 h-10 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center font-bold">
                <Building2 className="w-5 h-5" />
              </div>
            </div>

            <div className="content-card flex items-center justify-between">
              <div>
                <div className="stat-label">
                  Global Programs
                </div>
                <div className="stat-value mt-1">
                  {allPrograms.length}
                </div>
              </div>
              <div className="w-10 h-10 rounded-xl bg-purple-50 text-kulkul-purple flex items-center justify-center font-bold">
                <Layers className="w-5 h-5" />
              </div>
            </div>
          </div>
        )}

        {/* ========================================================================= */}
        {/* TAB 1: COMPANY APPROVALS & WORKSPACES */}
        {/* ========================================================================= */}
        {activeTab === 'companies' && (
          <div className="content-card space-y-5">
            {/* Toolbar: search on the left, filters on the right */}
            <div className="table-toolbar">
              <div className="search-field">
                <Search />
                <input
                  type="text"
                  placeholder="Search companies by name, slug, email..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="search-input"
                />
              </div>

              <div className="flex items-center gap-2 flex-wrap sm:justify-end">
                {[
                  { label: 'All Companies', value: '' },
                  { label: 'Pending Review', value: 'pending_approval' },
                  { label: 'Approved', value: 'approved' },
                  { label: 'Rejected', value: 'rejected' },
                ].map((st) => (
                  <button
                    key={st.value}
                    onClick={() => setCompanyStatusFilter(st.value)}
                    className={`tab-pill ${companyStatusFilter === st.value ? 'tab-pill-active' : ''}`}
                  >
                    {st.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Companies Table */}
            {isCompaniesLoading ? (
              <div className="data-table-wrap p-12 text-center text-slate-400">
                Loading companies directory...
              </div>
            ) : filteredCompanies.length === 0 ? (
              <div className="data-table-wrap p-12 text-center text-slate-400">
                <Building2 className="w-12 h-12 text-slate-300 mx-auto mb-3" />
                <div className="card-title">No companies found</div>
                <div className="meta-text mt-1">
                  Adjust your search or filter query to see registered organizations.
                </div>
              </div>
            ) : (
              <div className="data-table-wrap">
                <div className="overflow-x-auto">
                  <table className="data-table min-w-[900px]">
                    <thead>
                      <tr>
                        <th>Company</th>
                        <th className="whitespace-nowrap">Contact Email</th>
                        <th className="whitespace-nowrap">Registered</th>
                        <th className="whitespace-nowrap">Status</th>
                        <th className="text-right whitespace-nowrap">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="bg-white">
                      {filteredCompanies.map((company) => (
                        <tr key={company.id} className="transition">
                          <td className="align-middle">
                            <div className="flex items-center gap-3.5">
                              <div className="w-10 h-10 rounded-xl bg-kulkul-purple-light text-kulkul-purple flex items-center justify-center font-bold text-base shrink-0 border border-kulkul-purple/20 overflow-hidden shadow-2xs">
                                {company.logo_url ? (
                                  <img
                                    src={resolveMediaUrl(company.logo_url)}
                                    alt={company.name}
                                    className="w-full h-full object-contain p-0.5 bg-white"
                                  />
                                ) : (
                                  <Building2 className="w-5 h-5 text-kulkul-orange" />
                                )}
                              </div>
                              <div className="min-w-0">
                                <div className="cell-primary truncate">
                                  {company.name}
                                </div>
                                <div className="cell-secondary font-mono mt-0.5">
                                  /{company.slug}
                                </div>
                              </div>
                            </div>
                          </td>

                          <td className="align-middle text-slate-700 truncate">
                            {company.contact_email || (
                              <span className="text-slate-400 italic">Not specified</span>
                            )}
                          </td>

                          <td className="align-middle text-slate-600 whitespace-nowrap">
                            {company.created_at
                              ? new Date(company.created_at).toLocaleDateString('en-GB', {
                                  day: '2-digit',
                                  month: 'short',
                                  year: 'numeric',
                                })
                              : 'System Seed'}
                          </td>

                          <td className="align-middle whitespace-nowrap">
                            {company.status === 'approved' && (
                              <span className="inline-flex items-center gap-1.5 text-2xs font-bold text-emerald-700">
                                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                                <span>Approved</span>
                              </span>
                            )}
                            {company.status === 'pending_approval' && (
                              <span className="inline-flex items-center gap-1.5 text-2xs font-bold text-amber-700 animate-pulse">
                                <Clock className="w-3.5 h-3.5 text-amber-600" />
                                <span>Pending</span>
                              </span>
                            )}
                            {company.status === 'rejected' && (
                              <span className="inline-flex items-center gap-1.5 text-2xs font-bold text-rose-700">
                                <XCircle className="w-3.5 h-3.5 text-rose-600" />
                                <span>Rejected</span>
                              </span>
                            )}
                          </td>

                          <td className="align-middle text-right whitespace-nowrap">
                            <div className="flex items-center justify-end gap-2">
                              {company.status === 'pending_approval' && (
                                <>
                                  <button
                                    onClick={() => rejectMutation.mutate(company.id)}
                                    disabled={rejectMutation.isPending}
                                    className="btn btn-sm btn-danger-ghost"
                                  >
                                    <XCircle className="w-3.5 h-3.5" />
                                    <span>Reject</span>
                                  </button>
                                  <button
                                    onClick={() => approveMutation.mutate(company.id)}
                                    disabled={approveMutation.isPending}
                                    className="btn btn-sm btn-success"
                                  >
                                    <CheckCircle2 className="w-3.5 h-3.5" />
                                    <span>Approve</span>
                                  </button>
                                </>
                              )}

                              {company.status === 'approved' && (
                                <button
                                  onClick={() => navigate(`/admin/dashboard?org_id=${company.id}`)}
                                  className="btn btn-sm btn-primary"
                                  title="Access and manage this company's workspace as an admin"
                                >
                                  <ExternalLink className="w-3.5 h-3.5 text-amber-400" />
                                  <span>Access as Admin</span>
                                </button>
                              )}

                              {/* Edit Company Details & Slug */}
                              <button
                                type="button"
                                onClick={() => handleOpenEditCompany(company)}
                                className="btn btn-sm btn-outline"
                                title="Edit company name, URL slug, email, and logo"
                              >
                                <Pencil className="w-3.5 h-3.5 text-kulkul-purple" />
                                <span>Edit</span>
                              </button>

                              {company.status === 'rejected' && (
                                <button
                                  onClick={() => approveMutation.mutate(company.id)}
                                  className="btn btn-sm btn-outline"
                                >
                                  Re-Approve
                                </button>
                              )}

                              {company.id === '00000000-0000-0000-0000-000000000001' ? (
                                // The system company can't be deleted; keep the slot so actions line up across rows
                                <span className="btn btn-icon-sm invisible" aria-hidden="true" />
                              ) : (
                                <button
                                  type="button"
                                  onClick={() => {
                                    if (window.confirm(`Are you sure you want to delete "${company.name}"? This will permanently remove the company and its associated programs.`)) {
                                      deleteCompanyMutation.mutate(company.id);
                                    }
                                  }}
                                  disabled={deleteCompanyMutation.isPending}
                                  className="btn btn-icon-sm btn-ghost-danger"
                                  title="Delete company"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ========================================================================= */}
        {/* TAB 2: ALL SYSTEM PROGRAMS */}
        {/* ========================================================================= */}
        {activeTab === 'programs' && (
          <div className="content-card space-y-5">
            <div className="data-table-wrap">
              <div className="overflow-x-auto">
                <table className="data-table min-w-[820px]">
                  <thead>
                    <tr>
                      <th>Program Details</th>
                      <th className="whitespace-nowrap">Cohort Window</th>
                      <th className="whitespace-nowrap">Tracks</th>
                      <th className="whitespace-nowrap">Status</th>
                      <th className="text-right whitespace-nowrap">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="bg-white">
                    {isProgramsLoading ? (
                      <tr>
                        <td colSpan={5} className="text-center text-slate-400">
                          Loading all system programs...
                        </td>
                      </tr>
                    ) : filteredPrograms.length === 0 ? (
                      <tr>
                        <td colSpan={5} className="text-center text-slate-400">
                          No programs found.
                        </td>
                      </tr>
                    ) : (
                      filteredPrograms.map((prog) => (
                        <tr key={prog.id} className="transition">
                          <td className="align-middle max-w-[200px]">
                            <div className="flex items-center gap-3.5 h-10">
                              <div className="w-10 h-10 rounded-xl bg-kulkul-purple-light text-kulkul-purple flex items-center justify-center font-bold text-base shrink-0 border border-kulkul-purple/20 overflow-hidden shadow-2xs">
                                {prog.image_url ? (
                                   <img
                                     src={resolveMediaUrl(prog.image_url)}
                                     alt={prog.name}
                                     className="w-full h-full object-cover"
                                   />
                                 ) : (
                                   <Layers className="w-5 h-5 text-kulkul-orange" />
                                 )}
                              </div>
                              <div className="min-w-0 flex flex-col justify-center">
                                <div className="cell-primary truncate leading-tight" title={prog.name}>
                                  {prog.name}
                                </div>
                                <div className="cell-secondary mt-0.5 leading-tight truncate" title={`${prog.org_name ? `${prog.org_name} • ` : ''}/${prog.slug}`}>
                                  {prog.org_name ? `${prog.org_name} · ` : ''}
                                  <span className="font-mono">/{prog.slug}</span>
                                </div>
                              </div>
                            </div>
                          </td>

                          <td className="align-middle whitespace-nowrap text-left">
                            <div className="flex items-center gap-2 h-10 text-xs font-semibold text-slate-700">
                              <Calendar className="w-4 h-4 text-slate-400 shrink-0" />
                              <span>
                                {new Date(prog.open_date).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })} &ndash; {new Date(prog.end_date).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}
                              </span>
                            </div>
                          </td>

                          <td className="align-middle whitespace-nowrap text-left">
                            <div className="flex items-center gap-1.5 h-10">
                              <Layers className="w-3.5 h-3.5 text-kulkul-purple shrink-0" />
                              <span className="text-xs font-semibold text-kulkul-purple">
                                {prog.tracks ? `${prog.tracks.length} Tracks` : '—'}
                              </span>
                            </div>
                          </td>

                          <td className="align-middle whitespace-nowrap text-left">
                            {(() => {
                              const st = getProgramStatus(prog);
                              return (
                                <div className="flex items-center gap-2 h-10">
                                  <span className={`w-2 h-2 rounded-full shrink-0 ${st.dot}`}></span>
                                  <span className={`text-xs font-semibold ${st.text}`}>{st.label}</span>
                                </div>
                              );
                            })()}
                          </td>

                          <td className="align-middle text-right whitespace-nowrap">
                            <div className="flex items-center justify-end gap-2 h-10 shrink-0">
                              <Link
                                to={prog.organization_id ? `/admin/dashboard?org_id=${prog.organization_id}` : '/admin/dashboard'}
                                className="btn btn-sm btn-primary shrink-0"
                              >
                                <Building2 className="w-3.5 h-3.5" />
                                <span>Workspace</span>
                              </Link>
                              <a
                                href={`/programs/${prog.org_slug || 'kulkul'}/${prog.slug}`}
                                target="_blank"
                                rel="noreferrer"
                                className="btn btn-sm btn-outline shrink-0"
                              >
                                <span>Public Page</span>
                                <ExternalLink className="w-3.5 h-3.5" />
                              </a>
                              <button
                                onClick={() => {
                                  if (
                                    window.confirm(
                                      `Are you sure you want to delete program "${prog.name}"?\nAll associated tracks, stages, and candidate submissions will be permanently removed.`
                                    )
                                  ) {
                                    deleteProgramMutation.mutate(prog.id);
                                  }
                                }}
                                disabled={deleteProgramMutation.isPending}
                                className="btn btn-icon-sm shrink-0 btn-ghost-danger"
                                title="Delete program"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* Edit Company Modal */}
        {editingCompany && (
          <div className="modal-backdrop animate-in fade-in duration-200">
            <div className="modal-panel max-w-lg animate-in zoom-in-95 duration-200">
              <div className="section-header">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-kulkul-purple-light text-kulkul-purple flex items-center justify-center shrink-0">
                    <Building2 className="w-5 h-5 text-kulkul-purple" />
                  </div>
                  <div>
                    <h3 className="section-title">Edit Company Details</h3>
                    <p className="section-subtitle">Update organization profile, URL slug, and branding.</p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setEditingCompany(null)}
                  className="btn btn-icon-sm btn-ghost self-start sm:self-center shrink-0"
                  aria-label="Close"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  if (!editCompanyName.trim()) {
                    toast.error('Company name is required');
                    return;
                  }
                  if (!editCompanySlug.trim()) {
                    toast.error('Company slug is required');
                    return;
                  }
                  updateCompanyMutation.mutate({
                    id: editingCompany.id,
                    payload: {
                      name: editCompanyName.trim(),
                      slug: editCompanySlug.trim().toLowerCase(),
                      contact_email: editCompanyEmail.trim(),
                      logo_url: editCompanyLogo.trim(),
                    },
                  });
                }}
                className="space-y-4"
              >
                {/* Company Name */}
                <div>
                  <label className="field-label">Company Name</label>
                  <input
                    type="text"
                    required
                    value={editCompanyName}
                    onChange={(e) => setEditCompanyName(e.target.value)}
                    className="form-input"
                    placeholder="e.g. Acme Corp"
                  />
                </div>

                {/* Company Slug */}
                <div>
                  <div className="flex items-center justify-between gap-2 mb-1.5">
                    <label className="field-label mb-0">Company URL Slug</label>
                    <button
                      type="button"
                      onClick={() => {
                        const autoSlug = editCompanyName
                          .toLowerCase()
                          .replace(/[^a-z0-9]+/g, '-')
                          .replace(/^-+|-+$/g, '');
                        if (autoSlug) setEditCompanySlug(autoSlug);
                      }}
                      className="btn btn-sm btn-ghost"
                    >
                      Generate from name
                    </button>
                  </div>
                  <div className="relative">
                    <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-xs font-mono text-slate-400">
                      /programs/
                    </span>
                    <input
                      type="text"
                      required
                      value={editCompanySlug}
                      onChange={(e) => {
                        const sanitized = e.target.value
                          .toLowerCase()
                          .replace(/[^a-z0-9-]/g, '-');
                        setEditCompanySlug(sanitized);
                      }}
                      className="form-input pl-24 font-mono"
                      placeholder="acme-corp"
                    />
                  </div>
                  <p className="meta-text mt-1">
                    Determines applicant portals: <code className="font-mono text-kulkul-purple font-semibold">/programs/{editCompanySlug || 'slug'}/...</code>
                  </p>
                </div>

                {/* Contact Email */}
                <div>
                  <label className="field-label">Contact Email</label>
                  <input
                    type="email"
                    value={editCompanyEmail}
                    onChange={(e) => setEditCompanyEmail(e.target.value)}
                    className="form-input"
                    placeholder="admin@company.com"
                  />
                </div>

                {/* Logo URL */}
                <div>
                  <label className="field-label">Logo Image URL</label>
                  <input
                    type="url"
                    value={editCompanyLogo}
                    onChange={(e) => setEditCompanyLogo(e.target.value)}
                    className="form-input"
                    placeholder="https://..."
                  />
                </div>

                {/* Actions */}
                <div className="modal-footer">
                  <button
                    type="button"
                    onClick={() => setEditingCompany(null)}
                    className="btn btn-sm btn-outline"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={updateCompanyMutation.isPending || !editCompanyName.trim() || !editCompanySlug.trim()}
                    className="btn btn-sm btn-primary"
                  >
                    {updateCompanyMutation.isPending ? (
                      <span>Saving...</span>
                    ) : (
                      <>
                        <Check className="w-3.5 h-3.5 text-kulkul-orange" />
                        <span>Save Changes</span>
                      </>
                    )}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* ========================================================================= */}
        {/* TAB 4: SUPERADMIN TEAM MANAGEMENT */}
        {/* ========================================================================= */}
        {activeTab === 'team' && (
          <TeamManagementView isSuperadmin={true} scope="superadmin" />
        )}
      </div>
    </DashboardLayout>
  );
};
