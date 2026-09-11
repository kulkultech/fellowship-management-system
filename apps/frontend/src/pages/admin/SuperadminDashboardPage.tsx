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
  Activity,
  ShieldCheck,
  Calendar,
  Sparkles,
  Server,
  Database,
  Cpu,
  Trash2,
  Pencil,
  X,
  Check,
} from 'lucide-react';
import type { Organization } from '@/services/types';
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

  const [activeTab, setActiveTab] = useState<'companies' | 'programs' | 'telemetry'>('companies');
  const [companyStatusFilter, setCompanyStatusFilter] = useState<string>('');
  const [searchQuery, setSearchQuery] = useState<string>('');

  // 1. Load All Companies
  const { data: companiesList = [], isLoading: isCompaniesLoading } = useQuery({
    queryKey: ['superadmin-companies', companyStatusFilter],
    queryFn: () => adminService.listCompanies(companyStatusFilter),
    refetchOnMount: 'always',
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
    },
    onError: (err: any) => {
      toast.error(err.response?.data?.message || err.response?.data?.error || 'Failed to delete company');
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

  const pendingCount = companiesList.filter((c) => c.status === 'pending_approval').length;
  const approvedCount = companiesList.filter((c) => c.status === 'approved').length;

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
      badge: allPrograms.length,
    },
    {
      id: 'telemetry',
      label: 'Platform Telemetry',
      icon: Activity,
    },
  ];

  return (
    <DashboardLayout
      portalType="superadmin"
      title="KulKul Superadmin Portal"
      navItems={navItems}
      activeNavId={activeTab}
      onNavChange={(id) => setActiveTab(id as any)}
    >
      <div className="space-y-6">
        {/* ========================================================================= */}
        {/* TOP METRIC CARDS */}
        {/* ========================================================================= */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-2xs flex items-center justify-between">
            <div>
              <div className="text-2xs font-extrabold uppercase tracking-wider text-slate-400">
                Pending Approvals
              </div>
              <div className="text-2xl font-black text-slate-900 mt-1">
                {pendingCount}
              </div>
            </div>
            <div className="w-10 h-10 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center font-bold">
              <Clock className="w-5 h-5" />
            </div>
          </div>

          <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-2xs flex items-center justify-between">
            <div>
              <div className="text-2xs font-extrabold uppercase tracking-wider text-slate-400">
                Active Companies
              </div>
              <div className="text-2xl font-black text-slate-900 mt-1">
                {approvedCount}
              </div>
            </div>
            <div className="w-10 h-10 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center font-bold">
              <Building2 className="w-5 h-5" />
            </div>
          </div>

          <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-2xs flex items-center justify-between">
            <div>
              <div className="text-2xs font-extrabold uppercase tracking-wider text-slate-400">
                Global Programs
              </div>
              <div className="text-2xl font-black text-slate-900 mt-1">
                {allPrograms.length}
              </div>
            </div>
            <div className="w-10 h-10 rounded-xl bg-purple-50 text-kulkul-purple flex items-center justify-center font-bold">
              <Layers className="w-5 h-5" />
            </div>
          </div>

          <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-2xs flex items-center justify-between">
            <div>
              <div className="text-2xs font-extrabold uppercase tracking-wider text-slate-400">
                Platform Status
              </div>
              <div className="text-sm font-black text-emerald-600 mt-1 flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
                <span>Operational</span>
              </div>
            </div>
            <div className="w-10 h-10 rounded-xl bg-slate-50 text-slate-600 flex items-center justify-center font-bold">
              <Activity className="w-5 h-5" />
            </div>
          </div>
        </div>

        {/* ========================================================================= */}
        {/* TAB 1: COMPANY APPROVALS & WORKSPACES */}
        {/* ========================================================================= */}
        {activeTab === 'companies' && (
          <div className="space-y-6">
            {/* Filter and Search Bar */}
            <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-sm flex flex-col sm:flex-row items-center justify-between gap-4">
              <div className="relative w-full sm:w-80">
                <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  placeholder="Search companies by name, slug, email..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full pl-10 pr-4 py-2 rounded-xl text-xs sm:text-sm bg-slate-50 border border-slate-200 focus:outline-none focus:ring-2 focus:ring-kulkul-purple"
                />
              </div>

              <div className="flex items-center gap-2 overflow-x-auto w-full sm:w-auto">
                {[
                  { label: 'All Companies', value: '' },
                  { label: 'Pending Review', value: 'pending_approval' },
                  { label: 'Approved', value: 'approved' },
                  { label: 'Rejected', value: 'rejected' },
                ].map((st) => (
                  <button
                    key={st.value}
                    onClick={() => setCompanyStatusFilter(st.value)}
                    className={`px-3 py-1.5 rounded-full text-xs font-bold transition whitespace-nowrap ${
                      companyStatusFilter === st.value
                        ? 'bg-kulkul-purple text-white shadow-sm'
                        : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                    }`}
                  >
                    {st.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Companies Table */}
            {isCompaniesLoading ? (
              <div className="bg-white border border-slate-200/80 rounded-2xl p-12 text-center text-slate-400">
                Loading companies directory...
              </div>
            ) : filteredCompanies.length === 0 ? (
              <div className="bg-white border border-slate-200/80 rounded-2xl p-12 text-center text-slate-400">
                <Building2 className="w-12 h-12 text-slate-300 mx-auto mb-3" />
                <div className="text-base font-bold text-slate-700">No companies found</div>
                <div className="text-xs text-slate-400 mt-1">
                  Adjust your search or filter query to see registered organizations.
                </div>
              </div>
            ) : (
              <div className="bg-white border border-slate-200/80 rounded-2xl overflow-hidden shadow-2xs">
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse min-w-[900px]">
                    <thead className="bg-slate-50/90 border-b border-slate-200/80 text-2xs uppercase tracking-wider text-slate-500 font-bold">
                      <tr>
                        <th className="py-3.5 px-6 font-bold">Company</th>
                        <th className="py-3.5 px-6 font-bold whitespace-nowrap">Contact Email</th>
                        <th className="py-3.5 px-6 font-bold whitespace-nowrap">Registered</th>
                        <th className="py-3.5 px-6 font-bold whitespace-nowrap">Status</th>
                        <th className="py-3.5 px-6 font-bold text-right whitespace-nowrap">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 bg-white">
                      {filteredCompanies.map((company) => (
                        <tr key={company.id} className="hover:bg-slate-50/90 transition">
                          <td className="py-4 px-6 align-middle">
                            <div className="flex items-center gap-3.5">
                              <div className="w-10 h-10 rounded-xl bg-kulkul-purple-light text-kulkul-purple flex items-center justify-center font-bold text-base shrink-0 border border-kulkul-purple/20 overflow-hidden shadow-2xs">
                                {company.logo_url || company.slug === 'ladies-in-tech' ? (
                                  <img
                                    src={resolveMediaUrl(company.logo_url) || 'https://ladiesintech.network/wp-content/uploads/2026/07/litlogo.jpeg'}
                                    alt={company.name}
                                    className="w-full h-full object-contain p-0.5 bg-white"
                                    onError={(e) => {
                                      const img = e.currentTarget;
                                      if (!img.src.includes('litlogo')) {
                                        img.src = '/litlogo.jpeg';
                                      }
                                    }}
                                  />
                                ) : (
                                  <Building2 className="w-5 h-5 text-kulkul-orange" />
                                )}
                              </div>
                              <div className="min-w-0">
                                <div className="font-extrabold text-slate-900 text-sm truncate">
                                  {company.name}
                                </div>
                                <div className="text-2xs font-mono text-kulkul-purple font-semibold mt-0.5">
                                  /{company.slug}
                                </div>
                              </div>
                            </div>
                          </td>

                          <td className="py-4 px-6 align-middle text-xs text-slate-700 truncate">
                            {company.contact_email || (
                              <span className="text-slate-400 italic">Not specified</span>
                            )}
                          </td>

                          <td className="py-4 px-6 align-middle text-xs text-slate-600 whitespace-nowrap">
                            {company.created_at
                              ? new Date(company.created_at).toLocaleDateString('en-GB', {
                                  day: '2-digit',
                                  month: 'short',
                                  year: 'numeric',
                                })
                              : 'System Seed'}
                          </td>

                          <td className="py-4 px-6 align-middle whitespace-nowrap">
                            {company.status === 'approved' && (
                              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-2xs font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                                <span>Approved</span>
                              </span>
                            )}
                            {company.status === 'pending_approval' && (
                              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-2xs font-bold bg-amber-50 text-amber-700 border border-amber-200 animate-pulse">
                                <Clock className="w-3.5 h-3.5 text-amber-600" />
                                <span>Pending</span>
                              </span>
                            )}
                            {company.status === 'rejected' && (
                              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-2xs font-bold bg-rose-50 text-rose-700 border border-rose-200">
                                <XCircle className="w-3.5 h-3.5 text-rose-600" />
                                <span>Rejected</span>
                              </span>
                            )}
                          </td>

                          <td className="py-4 px-6 align-middle text-right whitespace-nowrap">
                            <div className="flex items-center justify-end gap-2">
                              {company.status === 'pending_approval' && (
                                <>
                                  <button
                                    onClick={() => rejectMutation.mutate(company.id)}
                                    disabled={rejectMutation.isPending}
                                    className="px-3 py-1.5 rounded-full bg-rose-50 hover:bg-rose-100 text-rose-700 text-xs font-bold transition flex items-center gap-1 disabled:opacity-50"
                                  >
                                    <XCircle className="w-3.5 h-3.5" />
                                    <span>Reject</span>
                                  </button>
                                  <button
                                    onClick={() => approveMutation.mutate(company.id)}
                                    disabled={approveMutation.isPending}
                                    className="px-3.5 py-1.5 rounded-full bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold shadow-xs transition flex items-center gap-1 disabled:opacity-50"
                                  >
                                    <CheckCircle2 className="w-3.5 h-3.5" />
                                    <span>Approve</span>
                                  </button>
                                </>
                              )}

                              {company.status === 'approved' && (
                                <button
                                  onClick={() => navigate(`/admin/dashboard?org_id=${company.id}`)}
                                  className="px-3.5 py-1.5 rounded-full bg-slate-900 hover:bg-kulkul-purple text-white text-xs font-bold shadow-xs transition flex items-center gap-1.5"
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
                                className="px-3 py-1.5 rounded-full bg-white hover:bg-slate-50 border border-slate-200 text-slate-700 text-xs font-bold transition flex items-center gap-1 shadow-2xs"
                                title="Edit company name, URL slug, email, and logo"
                              >
                                <Pencil className="w-3.5 h-3.5 text-kulkul-purple" />
                                <span>Edit</span>
                              </button>

                              {company.status === 'rejected' && (
                                <button
                                  onClick={() => approveMutation.mutate(company.id)}
                                  className="px-3.5 py-1.5 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold transition"
                                >
                                  Re-Approve
                                </button>
                              )}

                              {company.id !== '00000000-0000-0000-0000-000000000001' && (
                                <button
                                  type="button"
                                  onClick={() => {
                                    if (window.confirm(`Are you sure you want to delete "${company.name}"? This will permanently remove the company and its associated programs.`)) {
                                      deleteCompanyMutation.mutate(company.id);
                                    }
                                  }}
                                  disabled={deleteCompanyMutation.isPending}
                                  className="p-1.5 rounded-full hover:bg-red-50 text-slate-400 hover:text-red-600 border border-slate-200 transition"
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
          <div className="space-y-6">
            <div className="bg-white border border-slate-200/80 rounded-2xl overflow-hidden shadow-2xs">
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse min-w-[960px]">
                  <thead className="bg-slate-50/90 border-b border-slate-200/80 text-2xs uppercase tracking-wider text-slate-500 font-bold">
                    <tr>
                      <th className="py-3.5 px-6 font-bold">Program Details</th>
                      <th className="py-3.5 px-6 font-bold whitespace-nowrap">Cohort Window</th>
                      <th className="py-3.5 px-6 font-bold whitespace-nowrap">Tracks</th>
                      <th className="py-3.5 px-6 font-bold whitespace-nowrap">Status</th>
                      <th className="py-3.5 px-6 font-bold text-right whitespace-nowrap">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 bg-white">
                    {isProgramsLoading ? (
                      <tr>
                        <td colSpan={5} className="py-12 text-center text-slate-400">
                          Loading all system programs...
                        </td>
                      </tr>
                    ) : filteredPrograms.length === 0 ? (
                      <tr>
                        <td colSpan={5} className="py-12 text-center text-slate-400">
                          No programs found.
                        </td>
                      </tr>
                    ) : (
                      filteredPrograms.map((prog) => (
                        <tr key={prog.id} className="hover:bg-slate-50/90 transition">
                          <td className="py-4 px-6 align-middle">
                            <div className="flex items-center gap-3.5">
                              <div className="w-10 h-10 rounded-xl bg-kulkul-purple-light text-kulkul-purple flex items-center justify-center font-bold text-base shrink-0 border border-kulkul-purple/20 overflow-hidden shadow-2xs">
                                {prog.image_url || prog.slug === 'lit2026' ? (
                                  <img
                                    src={resolveMediaUrl(prog.image_url) || 'https://ladiesintech.network/wp-content/uploads/2026/07/lithero-1024x576.webp'}
                                    alt={prog.name}
                                    className="w-full h-full object-cover"
                                    onError={(e) => {
                                      const img = e.currentTarget;
                                      if (!img.src.includes('lithero')) {
                                        img.src = '/lithero.webp';
                                      }
                                    }}
                                  />
                                ) : (
                                  <Layers className="w-5 h-5 text-kulkul-orange" />
                                )}
                              </div>
                              <div className="min-w-0">
                                <div className="font-extrabold text-slate-900 text-sm truncate">
                                  {prog.name}
                                </div>
                                <div className="text-2xs font-mono text-slate-400 mt-0.5">
                                  slug: {prog.slug}
                                </div>
                              </div>
                            </div>
                          </td>

                          <td className="py-4 px-6 align-middle whitespace-nowrap text-xs text-slate-600">
                            <div className="font-semibold text-slate-800 flex items-center gap-2">
                              <Calendar className="w-4 h-4 text-slate-400 shrink-0" />
                              <span>
                                {new Date(prog.open_date).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })} &ndash; {new Date(prog.end_date).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}
                              </span>
                            </div>
                          </td>

                          <td className="py-4 px-6 align-middle whitespace-nowrap text-left">
                            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-purple-50 text-kulkul-purple border border-purple-200">
                              <Layers className="w-3.5 h-3.5 text-kulkul-purple" />
                              <span>{prog.tracks ? prog.tracks.length : '2'} Tracks</span>
                            </span>
                          </td>

                          <td className="py-4 px-6 align-middle whitespace-nowrap text-left">
                            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-2xs font-bold bg-emerald-50 text-emerald-700 border border-emerald-200 shrink-0">
                              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
                              <span>Admissions Open</span>
                            </span>
                          </td>

                          <td className="py-4 px-6 align-middle text-right whitespace-nowrap">
                            <div className="flex items-center justify-end gap-2 shrink-0">
                              <Link
                                to="/admin/dashboard"
                                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-kulkul-purple hover:bg-kulkul-purple-hover text-white transition text-xs font-bold shadow-2xs shrink-0"
                              >
                                <Building2 className="w-3 h-3" />
                                <span>Review Workspace</span>
                              </Link>
                              <a
                                href={`/programs/rsa/${prog.slug}`}
                                target="_blank"
                                rel="noreferrer"
                                className="inline-flex items-center gap-1 px-3 py-1.5 rounded-full hover:bg-slate-100 text-slate-600 hover:text-slate-900 border border-slate-200 transition text-xs font-bold shrink-0"
                              >
                                <span>Public Link</span>
                                <ExternalLink className="w-3 h-3" />
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
                                className="p-1.5 rounded-full hover:bg-red-50 text-slate-400 hover:text-red-600 border border-slate-200 transition shrink-0"
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

        {/* ========================================================================= */}
        {/* TAB 3: PLATFORM TELEMETRY & SYSTEM HEALTH */}
        {/* ========================================================================= */}
        {activeTab === 'telemetry' && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="bg-white border border-slate-200/90 rounded-3xl p-6 shadow-2xs space-y-4">
              <h3 className="font-extrabold text-slate-900 text-base flex items-center gap-2">
                <Server className="w-5 h-5 text-kulkul-purple" />
                <span>Backend Services & Infrastructure</span>
              </h3>

              <div className="divide-y divide-slate-100 text-xs">
                <div className="py-3 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Database className="w-4 h-4 text-slate-400" />
                    <span className="font-semibold text-slate-700">PostgreSQL Database</span>
                  </div>
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-2xs font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
                    Connected
                  </span>
                </div>

                <div className="py-3 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Cpu className="w-4 h-4 text-slate-400" />
                    <span className="font-semibold text-slate-700">AI Scoring Engine</span>
                  </div>
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-2xs font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
                    Operational
                  </span>
                </div>

                <div className="py-3 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <ShieldCheck className="w-4 h-4 text-slate-400" />
                    <span className="font-semibold text-slate-700">Auth & Token Middleware</span>
                  </div>
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-2xs font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
                    Active
                  </span>
                </div>
              </div>
            </div>

            <div className="bg-white border border-slate-200/90 rounded-3xl p-6 shadow-2xs space-y-4">
              <h3 className="font-extrabold text-slate-900 text-base flex items-center gap-2">
                <Sparkles className="w-5 h-5 text-kulkul-orange" />
                <span>Superadmin Quick Actions</span>
              </h3>

              <div className="space-y-3">
                <a
                  href="/register-company"
                  target="_blank"
                  rel="noreferrer"
                  className="w-full flex items-center justify-between p-3.5 rounded-2xl bg-slate-50 hover:bg-slate-100 border border-slate-200/80 transition group"
                >
                  <div className="flex items-center gap-3">
                    <Building2 className="w-4 h-4 text-kulkul-purple" />
                    <span className="text-xs font-bold text-slate-800">Test Public Company Registration Flow</span>
                  </div>
                  <ExternalLink className="w-3.5 h-3.5 text-slate-400 group-hover:text-slate-700" />
                </a>

                <a
                  href="/admin/dashboard"
                  className="w-full flex items-center justify-between p-3.5 rounded-2xl bg-slate-50 hover:bg-slate-100 border border-slate-200/80 transition group"
                >
                  <div className="flex items-center gap-3">
                    <Layers className="w-4 h-4 text-kulkul-purple" />
                    <span className="text-xs font-bold text-slate-800">Switch to RSA Company Workspace</span>
                  </div>
                  <ExternalLink className="w-3.5 h-3.5 text-slate-400 group-hover:text-slate-700" />
                </a>
              </div>
            </div>
          </div>
        )}

        {/* Edit Company Modal */}
        {editingCompany && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-200">
            <div className="bg-white rounded-3xl max-w-lg w-full p-6 sm:p-8 shadow-2xl border border-slate-100 space-y-6 animate-in zoom-in-95 duration-200">
              <div className="flex items-center justify-between pb-4 border-b border-slate-100">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-kulkul-purple-light text-kulkul-purple flex items-center justify-center font-bold">
                    <Building2 className="w-5 h-5 text-kulkul-purple" />
                  </div>
                  <div>
                    <h3 className="text-lg font-black text-slate-900">Edit Company Details</h3>
                    <p className="text-xs text-slate-500 font-medium">Update organization profile, URL slug, and branding.</p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setEditingCompany(null)}
                  className="p-2 rounded-full hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition"
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
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-slate-700">Company Name</label>
                  <input
                    type="text"
                    required
                    value={editCompanyName}
                    onChange={(e) => setEditCompanyName(e.target.value)}
                    className="w-full px-3.5 py-2 rounded-xl text-sm border border-slate-200 focus:outline-none focus:ring-2 focus:ring-kulkul-purple"
                    placeholder="e.g. Acme Corp"
                  />
                </div>

                {/* Company Slug */}
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-bold text-slate-700">Company URL Slug</label>
                    <button
                      type="button"
                      onClick={() => {
                        const autoSlug = editCompanyName
                          .toLowerCase()
                          .replace(/[^a-z0-9]+/g, '-')
                          .replace(/^-+|-+$/g, '');
                        if (autoSlug) setEditCompanySlug(autoSlug);
                      }}
                      className="text-2xs font-bold text-kulkul-purple hover:underline"
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
                      className="w-full pl-24 pr-3.5 py-2 rounded-xl text-sm font-mono border border-slate-200 focus:outline-none focus:ring-2 focus:ring-kulkul-purple"
                      placeholder="acme-corp"
                    />
                  </div>
                  <p className="text-2xs text-slate-400">
                    Determines applicant portals: <code className="font-mono text-kulkul-purple font-semibold">/programs/{editCompanySlug || 'slug'}/...</code>
                  </p>
                </div>

                {/* Contact Email */}
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-slate-700">Contact Email</label>
                  <input
                    type="email"
                    value={editCompanyEmail}
                    onChange={(e) => setEditCompanyEmail(e.target.value)}
                    className="w-full px-3.5 py-2 rounded-xl text-sm border border-slate-200 focus:outline-none focus:ring-2 focus:ring-kulkul-purple"
                    placeholder="admin@company.com"
                  />
                </div>

                {/* Logo URL */}
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-slate-700">Logo Image URL</label>
                  <input
                    type="url"
                    value={editCompanyLogo}
                    onChange={(e) => setEditCompanyLogo(e.target.value)}
                    className="w-full px-3.5 py-2 rounded-xl text-sm border border-slate-200 focus:outline-none focus:ring-2 focus:ring-kulkul-purple"
                    placeholder="https://..."
                  />
                </div>

                {/* Actions */}
                <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-100">
                  <button
                    type="button"
                    onClick={() => setEditingCompany(null)}
                    className="px-4 py-2 rounded-full border border-slate-200 text-slate-600 hover:bg-slate-50 text-xs font-bold transition"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={updateCompanyMutation.isPending || !editCompanyName.trim() || !editCompanySlug.trim()}
                    className="px-5 py-2 rounded-full bg-kulkul-purple hover:bg-kulkul-purple-hover text-white text-xs font-bold transition shadow-xs disabled:opacity-50 flex items-center gap-1.5"
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
      </div>
    </DashboardLayout>
  );
};
