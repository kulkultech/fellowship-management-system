import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { adminService } from '@/services/adminService';
import { useAuthStore } from '@/hooks/useAuthStore';
import type { Invitation, TeamMember } from '@/services/types';
import {
  Users,
  UserPlus,
  ShieldCheck,
  Building2,
  Mail,
  Trash2,
  RefreshCw,
  Clock,
  X,
  Search,
  Loader2,
  Send,
  GraduationCap,
} from 'lucide-react';
import toast from 'react-hot-toast';

interface TeamManagementViewProps {
  organizationId?: string;
  organizationName?: string;
  isSuperadmin?: boolean;
  scope?: 'superadmin' | 'company';
}

export const TeamManagementView: React.FC<TeamManagementViewProps> = ({
  organizationId,
  isSuperadmin = false,
  scope,
}) => {
  const queryClient = useQueryClient();
  const { user: currentUser } = useAuthStore();

  const [searchQuery, setSearchQuery] = useState('');
  const [roleFilter, setRoleFilter] = useState<string>('all');
  const [activeTab, setActiveTab] = useState<'members' | 'invitations'>('members');

  // Modal State
  const [isInviteModalOpen, setIsInviteModalOpen] = useState(false);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState<'org_admin' | 'superadmin' | 'mentor'>(
    isSuperadmin && !organizationId ? 'superadmin' : 'org_admin'
  );
  const [selectedOrgId, setSelectedOrgId] = useState<string>(organizationId || '');
  const [selectedProgramId, setSelectedProgramId] = useState<string>('');

  // Confirm delete modal state
  const [memberToRemove, setMemberToRemove] = useState<TeamMember | null>(null);
  const [invitationToRevoke, setInvitationToRevoke] = useState<Invitation | null>(null);

  // Effective scope
  const effectiveScope = scope || (isSuperadmin && !organizationId ? 'superadmin' : undefined);

  // Query: Team Members & Invitations
  const {
    data: teamData,
    isLoading,
    isRefetching,
    refetch,
  } = useQuery({
    queryKey: ['admin-team', organizationId, isSuperadmin, effectiveScope],
    queryFn: () =>
      adminService.getTeam({
        org_id: organizationId,
        scope: effectiveScope,
      }),
  });

  const members: TeamMember[] = teamData?.members || [];
  const invitations: Invitation[] = teamData?.invitations || [];

  // Query: List Companies (only needed if superadmin is inviting a company admin or mentor)
  const { data: companiesList = [] } = useQuery({
    queryKey: ['superadmin-companies-for-invite'],
    queryFn: () => adminService.listCompanies('approved'),
    enabled: isSuperadmin,
    staleTime: 60 * 1000,
  });

  // Query: List Programs (for assigning mentor to a program)
  const { data: programsList = [] } = useQuery({
    queryKey: ['programs-for-mentor-invite', selectedOrgId || organizationId],
    queryFn: () => adminService.listPrograms(selectedOrgId || organizationId),
    enabled: inviteRole === 'mentor',
    staleTime: 60 * 1000,
  });

  // Mutation: Invite Admin
  const inviteMutation = useMutation({
    mutationFn: () =>
      adminService.inviteAdmin({
        email: inviteEmail.trim().toLowerCase(),
        role: inviteRole,
        organization_id:
          inviteRole !== 'superadmin' ? selectedOrgId || organizationId || undefined : undefined,
        program_id: inviteRole === 'mentor' && selectedProgramId ? selectedProgramId : undefined,
      }),
    onSuccess: (data) => {
      toast.success(`Invitation sent to ${data.invitation.email}!`);
      setIsInviteModalOpen(false);
      setInviteEmail('');
      setSelectedProgramId('');
      queryClient.invalidateQueries({ queryKey: ['admin-team'] });
    },
    onError: (err: any) => {
      toast.error(err?.response?.data?.error || 'Failed to send invitation');
    },
  });

  // Mutation: Revoke Invitation
  const revokeMutation = useMutation({
    mutationFn: (invId: string) => adminService.revokeInvitation(invId, organizationId),
    onSuccess: () => {
      toast.success('Invitation revoked successfully');
      setInvitationToRevoke(null);
      queryClient.invalidateQueries({ queryKey: ['admin-team'] });
    },
    onError: (err: any) => {
      toast.error(err?.response?.data?.error || 'Failed to revoke invitation');
    },
  });

  // Mutation: Resend Invitation
  const resendMutation = useMutation({
    mutationFn: (invId: string) => adminService.resendInvitation(invId, organizationId),
    onSuccess: (data) => {
      toast.success(`Invitation resent to ${data.invitation.email} (valid for 7 days)`);
      queryClient.invalidateQueries({ queryKey: ['admin-team'] });
    },
    onError: (err: any) => {
      toast.error(err?.response?.data?.error || 'Failed to resend invitation');
    },
  });

  // Mutation: Remove Member
  const removeMemberMutation = useMutation({
    mutationFn: (memId: string) => adminService.removeMember(memId, organizationId),
    onSuccess: () => {
      toast.success('Member removed from team');
      setMemberToRemove(null);
      queryClient.invalidateQueries({ queryKey: ['admin-team'] });
    },
    onError: (err: any) => {
      toast.error(err?.response?.data?.error || 'Failed to remove member');
    },
  });

  const handleOpenInviteModal = () => {
    setInviteEmail('');
    setInviteRole(isSuperadmin && !organizationId ? 'superadmin' : 'org_admin');
    setSelectedOrgId(organizationId || (companiesList.length > 0 ? companiesList[0].id : ''));
    setSelectedProgramId('');
    setIsInviteModalOpen(true);
  };

  const handleSendInvite = (e: React.FormEvent) => {
    e.preventDefault();
    if (!inviteEmail.trim()) {
      toast.error('Please enter an email address');
      return;
    }
    if (inviteRole !== 'superadmin' && isSuperadmin && !selectedOrgId && !organizationId) {
      toast.error('Please select an organization for this company administrator');
      return;
    }
    inviteMutation.mutate();
  };

  // Filtered lists
  const filteredMembers = members.filter((m) => {
    const matchesSearch =
      m.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      m.email.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesRole = roleFilter === 'all' || m.role === roleFilter;
    return matchesSearch && matchesRole;
  });

  const filteredInvitations = invitations.filter((inv) => {
    const matchesSearch = inv.email.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesRole = roleFilter === 'all' || inv.role === roleFilter;
    return matchesSearch && matchesRole;
  });

  const getRoleText = (role: string) => {
    switch (role) {
      case 'superadmin':
        return <span className="text-xs font-semibold text-slate-800 whitespace-nowrap">Superadmin</span>;
      case 'org_admin':
        return <span className="text-xs font-semibold text-slate-800 whitespace-nowrap">Company Admin</span>;
      case 'reviewer':
        return <span className="text-xs font-semibold text-slate-800 whitespace-nowrap">Reviewer</span>;
      case 'mentor':
        return (
          <span className="inline-flex items-center gap-1 text-xs font-bold text-purple-700 whitespace-nowrap">
            <GraduationCap className="w-3.5 h-3.5" />
            Mentor
          </span>
        );
      default:
        return <span className="text-xs font-semibold text-slate-800 whitespace-nowrap">{role}</span>;
    }
  };

  const formatExpiresIn = (expiresAt: string) => {
    const expDate = new Date(expiresAt);
    const now = new Date();
    const diffMs = expDate.getTime() - now.getTime();
    if (diffMs <= 0) return 'Expired';
    const diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24));
    if (diffDays === 1) return 'Expires today';
    return `Expires in ${diffDays} days`;
  };

  return (
    <div className="space-y-6">
      {/* Main Content Card with Navigation Tabs & Actions */}
      <div className="content-card space-y-5">
        {/* Header: tabs on the left, actions on the right */}
        <div className="section-header">
          <div className="flex items-center gap-2 flex-wrap">
            <button
              type="button"
              onClick={() => setActiveTab('members')}
              className={`tab-pill ${activeTab === 'members' ? 'tab-pill-active' : ''}`}
            >
              <Users className="w-3.5 h-3.5" />
              <span>Active Members ({members.length})</span>
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('invitations')}
              className={`tab-pill ${activeTab === 'invitations' ? 'tab-pill-active' : ''}`}
            >
              <Mail className="w-3.5 h-3.5" />
              <span>Pending Invitations ({invitations.length})</span>
            </button>
          </div>

          <div className="section-actions">
            <button
              type="button"
              onClick={() => refetch()}
              disabled={isRefetching}
              className="btn btn-sm btn-outline"
              title="Refresh team list"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isRefetching ? 'animate-spin text-kulkul-purple' : ''}`} />
              <span>Refresh</span>
            </button>
            <button type="button" onClick={handleOpenInviteModal} className="btn btn-sm btn-primary">
              <UserPlus className="w-3.5 h-3.5" />
              <span>Invite Admin</span>
            </button>
          </div>
        </div>

        {/* Toolbar: search on the left, filters on the right */}
        <div className="table-toolbar">
          <div className="search-field">
            <Search />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search name or email..."
              className="search-input"
            />
          </div>
          <select
            value={roleFilter}
            onChange={(e) => setRoleFilter(e.target.value)}
            className="filter-select"
            aria-label="Filter by role"
          >
            <option value="all">All Roles</option>
            {isSuperadmin && <option value="superadmin">Superadmin</option>}
            <option value="org_admin">Company Admin</option>
            <option value="mentor">Mentor</option>
          </select>
        </div>

        {/* Tab 1: Active Members Table */}
        {activeTab === 'members' && (
          <div className="data-table-wrap">
            {isLoading ? (
              <div className="py-16 text-center text-slate-400 space-y-3">
                <Loader2 className="w-8 h-8 animate-spin mx-auto text-kulkul-purple" />
                <p className="text-xs font-semibold">Loading team members...</p>
              </div>
            ) : filteredMembers.length === 0 ? (
              <div className="py-16 text-center text-slate-400 space-y-2">
                <Users className="w-10 h-10 mx-auto text-slate-300 stroke-[1.5]" />
                <p className="text-sm font-bold text-slate-600">No team members found</p>
                <p className="text-xs text-slate-400">
                  {searchQuery ? 'Try adjusting your search criteria.' : 'Invite your first administrator to collaborate.'}
                </p>
              </div>
            ) : (
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Name &amp; Email</th>
                    <th className="whitespace-nowrap">Role</th>
                    {isSuperadmin && <th className="whitespace-nowrap">Organization</th>}
                    <th className="whitespace-nowrap">Date Joined</th>
                    <th className="text-right whitespace-nowrap">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredMembers.map((member) => {
                    const isSelf = currentUser?.id === member.id;

                    return (
                      <tr key={member.id} className="transition">
                        <td>
                          <div className="cell-primary flex items-center gap-1.5">
                            <span>{member.name || 'Admin User'}</span>
                            {isSelf && (
                              <span className="text-xs text-slate-400 font-normal">
                                (You)
                              </span>
                            )}
                          </div>
                          <div className="cell-secondary mt-0.5">{member.email}</div>
                        </td>
                        <td className="whitespace-nowrap">{getRoleText(member.role)}</td>
                        {isSuperadmin && (
                          <td className="text-slate-600 font-medium whitespace-nowrap">
                            {member.organization_name || (
                              <span className="text-slate-400 italic">Platform Level</span>
                            )}
                          </td>
                        )}
                        <td className="text-slate-500 whitespace-nowrap">
                          {member.created_at
                            ? new Date(member.created_at).toLocaleDateString(undefined, {
                                year: 'numeric',
                                month: 'short',
                                day: 'numeric',
                              })
                            : '—'}
                        </td>
                        <td className="text-right whitespace-nowrap">
                          {!isSelf && (
                            <button
                              type="button"
                              onClick={() => setMemberToRemove(member)}
                              className="btn btn-icon-sm btn-ghost-danger"
                              title="Remove member"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
        )}

        {/* Tab 2: Pending Invitations Table */}
        {activeTab === 'invitations' && (
          <div className="data-table-wrap">
            {isLoading ? (
              <div className="py-16 text-center text-slate-400 space-y-3">
                <Loader2 className="w-8 h-8 animate-spin mx-auto text-kulkul-purple" />
                <p className="text-xs font-semibold">Loading pending invitations...</p>
              </div>
            ) : filteredInvitations.length === 0 ? (
              <div className="py-16 text-center text-slate-400 space-y-2">
                <Mail className="w-10 h-10 mx-auto text-slate-300 stroke-[1.5]" />
                <p className="text-sm font-bold text-slate-600">No pending invitations</p>
                <p className="text-xs text-slate-400">
                  All invited administrators have accepted their invitations.
                </p>
              </div>
            ) : (
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Invitee Email</th>
                    <th className="whitespace-nowrap">Role</th>
                    {isSuperadmin && <th className="whitespace-nowrap">Organization</th>}
                    <th className="whitespace-nowrap">Status &amp; Validity</th>
                    <th className="whitespace-nowrap">Sent Date</th>
                    <th className="text-right whitespace-nowrap">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredInvitations.map((inv) => {
                    const isExpired = new Date(inv.expires_at) < new Date();

                    return (
                      <tr key={inv.id} className="transition">
                        <td className="font-bold text-slate-900">
                          {inv.email}
                        </td>
                        <td className="whitespace-nowrap">
                          {getRoleText(inv.role)}
                          {inv.program_name && (
                            <div className="text-3xs text-purple-700 font-semibold mt-1 flex items-center gap-1">
                              <GraduationCap className="w-3 h-3 text-purple-600" />
                              <span>{inv.program_name}</span>
                            </div>
                          )}
                        </td>
                        {isSuperadmin && (
                          <td className="text-slate-600 font-medium whitespace-nowrap">
                            {inv.organization_name || (
                              <span className="text-slate-400 italic">Platform Superadmin</span>
                            )}
                          </td>
                        )}
                        <td className="whitespace-nowrap">
                          <span className={`text-xs font-semibold ${isExpired ? 'text-red-600' : 'text-amber-600'}`}>
                            {formatExpiresIn(inv.expires_at)}
                          </span>
                        </td>
                        <td className="text-slate-500 whitespace-nowrap">
                          {inv.created_at
                            ? new Date(inv.created_at).toLocaleDateString(undefined, {
                                year: 'numeric',
                                month: 'short',
                                day: 'numeric',
                              })
                            : '—'}
                        </td>
                        <td className="text-right whitespace-nowrap">
                          <div className="flex items-center justify-end gap-1.5">
                            <button
                              type="button"
                              onClick={() => resendMutation.mutate(inv.id)}
                              disabled={resendMutation.isPending}
                              className="btn btn-icon-sm btn-ghost"
                              title="Resend invitation email (renews 7 days)"
                            >
                              <Send className="w-4 h-4" />
                            </button>
                            <button
                              type="button"
                              onClick={() => setInvitationToRevoke(inv)}
                              className="btn btn-icon-sm btn-ghost"
                              title="Revoke invitation"
                            >
                              <X className="w-4 h-4" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
        )}
      </div>

      {/* Modal 1: Invite Admin Modal */}
      {isInviteModalOpen && (
        <div className="modal-backdrop animate-in fade-in duration-150">
          <div className="modal-panel max-w-md animate-in zoom-in-95 duration-150">
            <div className="section-header">
              <div className="flex items-center gap-2.5">
                <div className="w-10 h-10 rounded-2xl bg-purple-50 text-kulkul-purple flex items-center justify-center shrink-0">
                  <UserPlus className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="section-title">
                    Invite Administrator
                  </h3>
                  <p className="section-subtitle">Send an email invitation link</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsInviteModalOpen(false)}
                className="btn btn-icon-sm btn-ghost self-start sm:self-center shrink-0"
                aria-label="Close"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSendInvite} className="space-y-4">
              <div>
                <label className="field-label">
                  Email Address
                </label>
                <div className="relative">
                  <Mail className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                  <input
                    type="email"
                    value={inviteEmail}
                    onChange={(e) => setInviteEmail(e.target.value)}
                    placeholder="colleague@company.com"
                    className="form-input pl-10"
                    required
                  />
                </div>
              </div>

              {/* Role Selection */}
              <div>
                <label className="field-label">
                  Role &amp; Permissions
                </label>
                <div className="grid grid-cols-1 gap-2">
                  {isSuperadmin && (
                    <label
                      className={`p-3 rounded-xl border cursor-pointer flex items-start gap-3 transition ${
                        inviteRole === 'superadmin'
                          ? 'border-kulkul-purple bg-purple-50/50 ring-1 ring-kulkul-purple'
                          : 'border-slate-200 hover:bg-slate-50'
                      }`}
                    >
                      <input
                        type="radio"
                        name="inviteRole"
                        value="superadmin"
                        checked={inviteRole === 'superadmin'}
                        onChange={() => setInviteRole('superadmin')}
                        className="mt-1 text-kulkul-purple focus:ring-kulkul-purple"
                      />
                      <div>
                        <div className="font-bold text-xs text-slate-900 flex items-center gap-1.5">
                          <ShieldCheck className="w-3.5 h-3.5 text-kulkul-purple" />
                          Platform Superadmin
                        </div>
                        <div className="meta-text mt-0.5">
                          Full system-wide administrative control across all companies and programs.
                        </div>
                      </div>
                    </label>
                  )}

                  <label
                    className={`p-3 rounded-xl border cursor-pointer flex items-start gap-3 transition ${
                      inviteRole === 'org_admin'
                        ? 'border-kulkul-purple bg-purple-50/50 ring-1 ring-kulkul-purple'
                        : 'border-slate-200 hover:bg-slate-50'
                    }`}
                  >
                    <input
                      type="radio"
                      name="inviteRole"
                      value="org_admin"
                      checked={inviteRole === 'org_admin'}
                      onChange={() => setInviteRole('org_admin')}
                      className="mt-1 text-kulkul-purple focus:ring-kulkul-purple"
                    />
                    <div>
                      <div className="font-bold text-xs text-slate-900 flex items-center gap-1.5">
                        <Building2 className="w-3.5 h-3.5 text-indigo-600" />
                        Company Administrator
                      </div>
                      <div className="meta-text mt-0.5">
                        Can launch fellowship programs, edit question banks, and evaluate candidates.
                      </div>
                    </div>
                  </label>

                  <label
                    className={`p-3 rounded-xl border cursor-pointer flex items-start gap-3 transition ${
                      inviteRole === 'mentor'
                        ? 'border-kulkul-purple bg-purple-50/50 ring-1 ring-kulkul-purple'
                        : 'border-slate-200 hover:bg-slate-50'
                    }`}
                  >
                    <input
                      type="radio"
                      name="inviteRole"
                      value="mentor"
                      checked={inviteRole === 'mentor'}
                      onChange={() => setInviteRole('mentor')}
                      className="mt-1 text-kulkul-purple focus:ring-kulkul-purple"
                    />
                    <div>
                      <div className="font-bold text-xs text-slate-900 flex items-center gap-1.5">
                        <GraduationCap className="w-3.5 h-3.5 text-purple-600" />
                        Program Mentor
                      </div>
                      <div className="meta-text mt-0.5">
                        Guides cohort fellows, conducts mentor sessions, and monitors candidate progress.
                      </div>
                    </div>
                  </label>
                </div>
              </div>

              {/* Program Selection (when inviting a mentor) */}
              {inviteRole === 'mentor' && (
                <div>
                  <label className="field-label">
                    Assign to Program (Optional)
                  </label>
                  <select
                    value={selectedProgramId}
                    onChange={(e) => setSelectedProgramId(e.target.value)}
                    className="form-input"
                  >
                    <option value="">Select a fellowship program (or assign later)...</option>
                    {programsList.map((prog) => (
                      <option key={prog.id} value={prog.id}>
                        {prog.name}
                      </option>
                    ))}
                  </select>
                  <p className="meta-text mt-1">
                    The mentor will be automatically granted access to this program upon registration.
                  </p>
                </div>
              )}

              {/* Company Selection (only if superadmin inviting for a company) */}
              {isSuperadmin && inviteRole !== 'superadmin' && !organizationId && (
                <div>
                  <label className="field-label">
                    Assign to Company
                  </label>
                  <select
                    value={selectedOrgId}
                    onChange={(e) => setSelectedOrgId(e.target.value)}
                    className="form-input"
                    required
                  >
                    <option value="" disabled>
                      Select an organization...
                    </option>
                    {companiesList.map((comp) => (
                      <option key={comp.id} value={comp.id}>
                        {comp.name} ({comp.slug})
                      </option>
                    ))}
                  </select>
                </div>
              )}

              <div className="p-3 bg-purple-50/60 rounded-xl border border-purple-100 text-2xs text-slate-600 flex items-start gap-2">
                <Clock className="w-4 h-4 text-kulkul-purple shrink-0 mt-0.5" />
                <span>
                  The invitee will receive an email with a secure link valid for <strong>7 days</strong>.
                  They can activate their seat via email/password or Google Single Sign-On.
                </span>
              </div>

              <div className="modal-footer">
                <button
                  type="button"
                  onClick={() => setIsInviteModalOpen(false)}
                  className="btn btn-sm btn-outline"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={inviteMutation.isPending}
                  className="btn btn-sm btn-primary"
                >
                  {inviteMutation.isPending ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      <span>Sending...</span>
                    </>
                  ) : (
                    <>
                      <Send className="w-3.5 h-3.5" />
                      <span>Send Invitation</span>
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal 2: Confirm Remove Member */}
      {memberToRemove && (
        <div className="modal-backdrop animate-in fade-in duration-150">
          <div className="modal-panel max-w-md animate-in zoom-in-95 duration-150">
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 bg-red-100 text-red-600 rounded-2xl flex items-center justify-center shrink-0">
                <Trash2 className="w-5 h-5" />
              </div>
              <div className="space-y-1">
                <h3 className="section-title">Remove Team Member?</h3>
                <p className="text-sm text-slate-600 leading-relaxed">
                  Are you sure you want to remove <strong>{memberToRemove.name || memberToRemove.email}</strong>? They will immediately lose administrative access.
                </p>
              </div>
            </div>

            <div className="modal-footer">
              <button
                type="button"
                onClick={() => setMemberToRemove(null)}
                className="btn btn-sm btn-outline"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => removeMemberMutation.mutate(memberToRemove.id)}
                disabled={removeMemberMutation.isPending}
                className="btn btn-sm btn-danger"
              >
                {removeMemberMutation.isPending ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <span>Remove</span>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal 3: Confirm Revoke Invitation */}
      {invitationToRevoke && (
        <div className="modal-backdrop animate-in fade-in duration-150">
          <div className="modal-panel max-w-md animate-in zoom-in-95 duration-150">
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 bg-amber-100 text-amber-600 rounded-2xl flex items-center justify-center shrink-0">
                <X className="w-5 h-5" />
              </div>
              <div className="space-y-1">
                <h3 className="section-title">Revoke Invitation?</h3>
                <p className="text-sm text-slate-600 leading-relaxed">
                  Revoke the pending invitation for <strong>{invitationToRevoke.email}</strong>? Their invitation link will be rendered invalid.
                </p>
              </div>
            </div>

            <div className="modal-footer">
              <button
                type="button"
                onClick={() => setInvitationToRevoke(null)}
                className="btn btn-sm btn-outline"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => revokeMutation.mutate(invitationToRevoke.id)}
                disabled={revokeMutation.isPending}
                className="btn btn-sm btn-danger"
              >
                {revokeMutation.isPending ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <span>Revoke</span>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
