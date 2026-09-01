import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { adminService } from '@/services/adminService';
import { DashboardLayout, type NavItem } from '@/components/DashboardLayout';
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
} from 'lucide-react';
import toast from 'react-hot-toast';

export const SuperadminDashboardPage: React.FC = () => {
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState<'companies' | 'programs' | 'telemetry'>('companies');
  const [companyStatusFilter, setCompanyStatusFilter] = useState<string>('');
  const [searchQuery, setSearchQuery] = useState<string>('');

  // 1. Load All Companies
  const { data: companiesList = [], isLoading: isCompaniesLoading } = useQuery({
    queryKey: ['superadmin-companies', companyStatusFilter],
    queryFn: () => adminService.listCompanies(companyStatusFilter),
  });

  // 2. Load All Programs Across System
  const { data: allPrograms = [], isLoading: isProgramsLoading } = useQuery({
    queryKey: ['superadmin-all-programs'],
    queryFn: () => adminService.listPrograms(),
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
      subtitle="Centralized management console for company workspace verifications, global programs, and platform operations."
      navItems={navItems}
      activeNavId={activeTab}
      onNavChange={(id) => setActiveTab(id as any)}
      headerActions={
        <div className="flex items-center gap-2">
          <span className="px-3 py-1 rounded-full text-xs font-bold bg-purple-50 text-kulkul-purple border border-purple-200 flex items-center gap-1.5 shadow-2xs">
            <ShieldCheck className="w-3.5 h-3.5 text-kulkul-orange" />
            <span>Root Superadmin Access</span>
          </span>
        </div>
      }
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

            {/* Companies Grid */}
            {isCompaniesLoading ? (
              <div className="bg-white border border-slate-200 rounded-3xl p-12 text-center text-slate-400">
                Loading companies directory...
              </div>
            ) : filteredCompanies.length === 0 ? (
              <div className="bg-white border border-slate-200 rounded-3xl p-12 text-center text-slate-400">
                <Building2 className="w-12 h-12 text-slate-300 mx-auto mb-3" />
                <div className="text-base font-bold text-slate-700">No companies found</div>
                <div className="text-xs text-slate-400 mt-1">
                  Adjust your search or filter query to see registered organizations.
                </div>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {filteredCompanies.map((company) => (
                  <div
                    key={company.id}
                    className="bg-white border border-slate-200/90 rounded-3xl p-6 shadow-2xs flex flex-col justify-between space-y-5 hover:border-kulkul-purple/40 hover:shadow-md transition"
                  >
                    <div className="space-y-4">
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex items-center gap-3.5">
                          {company.logo_url ? (
                            <img
                              src={company.logo_url}
                              alt={company.name}
                              className="w-12 h-12 rounded-2xl object-cover border border-slate-200 shadow-2xs p-1 bg-white"
                              onError={(e) => {
                                (e.target as HTMLElement).style.display = 'none';
                              }}
                            />
                          ) : (
                            <div className="w-12 h-12 rounded-2xl bg-kulkul-purple-light text-kulkul-purple flex items-center justify-center font-black text-base border border-kulkul-purple/20 shadow-2xs">
                              <Building2 className="w-6 h-6 text-kulkul-orange" />
                            </div>
                          )}

                          <div>
                            <h3 className="text-base font-extrabold text-slate-900 leading-tight">
                              {company.name}
                            </h3>
                            <span className="text-xs font-mono text-kulkul-purple font-semibold">
                              /{company.slug}
                            </span>
                          </div>
                        </div>

                        {/* Status Badge */}
                        <div>
                          {company.status === 'approved' && (
                            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-2xs font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                              <CheckCircle2 className="w-3 h-3" />
                              Approved
                            </span>
                          )}
                          {company.status === 'pending_approval' && (
                            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-2xs font-bold bg-amber-50 text-amber-700 border border-amber-200 animate-pulse">
                              <Clock className="w-3 h-3" />
                              Pending
                            </span>
                          )}
                          {company.status === 'rejected' && (
                            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-2xs font-bold bg-rose-50 text-rose-700 border border-rose-200">
                              <XCircle className="w-3 h-3" />
                              Rejected
                            </span>
                          )}
                        </div>
                      </div>

                      <div className="p-3.5 rounded-2xl bg-slate-50 border border-slate-100 text-xs space-y-2 text-slate-700">
                        <div className="flex items-center justify-between">
                          <span className="text-slate-500">Contact Email:</span>
                          <span className="font-semibold text-slate-900 truncate max-w-[180px]">
                            {company.contact_email || 'Not specified'}
                          </span>
                        </div>
                        <div className="flex items-center justify-between">
                          <span className="text-slate-500">Registered:</span>
                          <span className="font-semibold text-slate-900">
                            {company.created_at
                              ? new Date(company.created_at).toLocaleDateString()
                              : 'System Seed'}
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* Action Controls */}
                    <div className="pt-3 border-t border-slate-100 flex items-center justify-end gap-2">
                      {company.status === 'pending_approval' && (
                        <>
                          <button
                            onClick={() => rejectMutation.mutate(company.id)}
                            disabled={rejectMutation.isPending}
                            className="px-3.5 py-1.5 rounded-full bg-rose-50 hover:bg-rose-100 text-rose-700 text-xs font-bold transition flex items-center gap-1.5 disabled:opacity-50"
                          >
                            <XCircle className="w-3.5 h-3.5" />
                            <span>Reject</span>
                          </button>
                          <button
                            onClick={() => approveMutation.mutate(company.id)}
                            disabled={approveMutation.isPending}
                            className="px-4 py-1.5 rounded-full bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold shadow-xs transition flex items-center gap-1.5 disabled:opacity-50"
                          >
                            <CheckCircle2 className="w-3.5 h-3.5" />
                            <span>Approve</span>
                          </button>
                        </>
                      )}

                      {company.status === 'approved' && (
                        <span className="text-2xs font-bold text-slate-400">
                          Workspace Active & Verified
                        </span>
                      )}

                      {company.status === 'rejected' && (
                        <button
                          onClick={() => approveMutation.mutate(company.id)}
                          className="px-3.5 py-1.5 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold transition"
                        >
                          Re-Approve
                        </button>
                      )}
                    </div>
                  </div>
                ))}
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
                <table className="w-full text-left border-collapse table-fixed min-w-[780px]">
                  <colgroup>
                    <col className="w-[35%]" />
                    <col className="w-[25%]" />
                    <col className="w-[15%]" />
                    <col className="w-[12%]" />
                    <col className="w-[13%]" />
                  </colgroup>
                  <thead className="bg-slate-50/90 border-b border-slate-200/80 text-2xs uppercase tracking-wider text-slate-500 font-bold">
                    <tr>
                      <th className="py-3.5 px-6 font-bold">Program Details</th>
                      <th className="py-3.5 px-6 font-bold">Cohort Window</th>
                      <th className="py-3.5 px-6 font-bold">Tracks</th>
                      <th className="py-3.5 px-6 font-bold">Status</th>
                      <th className="py-3.5 px-6 font-bold text-right">Actions</th>
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
                                {prog.image_url ? (
                                  <img src={prog.image_url} alt={prog.name} className="w-full h-full object-cover" />
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
                            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-2xs font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
                              <span>Admissions Open</span>
                            </span>
                          </td>

                          <td className="py-4 px-6 align-middle text-right whitespace-nowrap">
                            <a
                              href={`/programs/rsa/${prog.slug}`}
                              target="_blank"
                              rel="noreferrer"
                              className="inline-flex items-center gap-1 px-3 py-1.5 rounded-full hover:bg-slate-100 text-slate-600 hover:text-slate-900 border border-slate-200 transition text-xs font-bold"
                            >
                              <span>Public Link</span>
                              <ExternalLink className="w-3 h-3" />
                            </a>
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
      </div>
    </DashboardLayout>
  );
};
