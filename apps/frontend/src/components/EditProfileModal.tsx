import React, { useState, useEffect } from 'react';
import {
  X,
  User as UserIcon,
  Building2,
  Lock,
  Eye,
  EyeOff,
  Loader2,
  Mail,
  Image as ImageIcon,
  Sparkles,
  CheckCircle2,
} from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { useAuthStore } from '@/hooks/useAuthStore';
import { authService } from '@/services/authService';
import { useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';

interface EditProfileModalProps {
  isOpen: boolean;
  onClose: () => void;
  portalType?: 'company_admin' | 'superadmin' | 'candidate';
  candidateEmail?: string;
}

// Sleek avatar presets using DiceBear for instant selection
const AVATAR_PRESETS = [
  'https://api.dicebear.com/7.x/bottts/svg?seed=Felix&backgroundColor=ffd5dc,d1d4f9,c0aede',
  'https://api.dicebear.com/7.x/bottts/svg?seed=Aria&backgroundColor=b6e3f4,c0aede,d1d4f9',
  'https://api.dicebear.com/7.x/avataaars/svg?seed=Alex&backgroundColor=b6e3f4',
  'https://api.dicebear.com/7.x/avataaars/svg?seed=Sam&backgroundColor=ffd5dc',
  'https://api.dicebear.com/7.x/identicon/svg?seed=Nexus&backgroundColor=c0aede',
  'https://api.dicebear.com/7.x/shapes/svg?seed=Zenith&backgroundColor=d1d4f9',
];

export const EditProfileModal: React.FC<EditProfileModalProps> = ({
  isOpen,
  onClose,
  portalType,
  candidateEmail,
}) => {
  const { user } = useAuth();
  const setUser = useAuthStore((state) => state.setUser);
  const queryClient = useQueryClient();

  const isCompanyUser =
    user?.role === 'org_admin' ||
    portalType === 'company_admin' ||
    Boolean(user?.organization);

  const [activeTab, setActiveTab] = useState<'personal' | 'company'>('personal');

  // Personal profile fields
  const [name, setName] = useState('');
  const [avatarUrl, setAvatarUrl] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  // Company profile fields
  const [companyName, setCompanyName] = useState('');
  const [companyLogoUrl, setCompanyLogoUrl] = useState('');
  const [companyContactEmail, setCompanyContactEmail] = useState('');

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Populate form on open or user change
  useEffect(() => {
    if (isOpen) {
      setName(user?.name || '');
      setAvatarUrl(user?.avatar_url || '');
      setNewPassword('');
      setConfirmPassword('');
      setErrorMsg(null);

      if (user?.organization) {
        setCompanyName(user.organization.name || '');
        setCompanyLogoUrl(user.organization.logo_url || '');
        setCompanyContactEmail(user.organization.contact_email || '');
      } else {
        setCompanyName('');
        setCompanyLogoUrl('');
        setCompanyContactEmail('');
      }

      // Default tab: personal profile
      setActiveTab('personal');
    }
  }, [isOpen, user]);

  if (!isOpen) return null;

  const effectiveEmail = user?.email || candidateEmail || 'No email associated';

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);

    // Password validation if provided
    if (newPassword || confirmPassword) {
      if (newPassword.length < 8) {
        setErrorMsg('New password must be at least 8 characters long');
        return;
      }
      if (newPassword !== confirmPassword) {
        setErrorMsg('Passwords do not match');
        return;
      }
    }

    setIsSubmitting(true);
    try {
      const payload: {
        name?: string;
        avatar_url?: string;
        password?: string;
        company_name?: string;
        company_logo_url?: string;
        company_contact_email?: string;
      } = {
        name: name.trim(),
        avatar_url: avatarUrl.trim(),
      };

      if (newPassword) {
        payload.password = newPassword;
      }

      if (isCompanyUser) {
        if (companyName.trim()) payload.company_name = companyName.trim();
        payload.company_logo_url = companyLogoUrl.trim();
        if (companyContactEmail.trim()) payload.company_contact_email = companyContactEmail.trim();
      }

      // Submit update to backend API
      const updatedUser = await authService.updateProfile(payload);

      // Update global auth store & React Query cache
      setUser(updatedUser);
      queryClient.setQueryData(['auth', 'me'], updatedUser);
      queryClient.invalidateQueries({ queryKey: ['organization'] });
      queryClient.invalidateQueries({ queryKey: ['programs'] });

      toast.success('Profile updated successfully!');
      onClose();
    } catch (err: any) {
      const msg =
        err?.response?.data?.error ||
        err?.message ||
        'Failed to update profile. Please try again.';
      setErrorMsg(msg);
      toast.error(msg);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="relative w-full max-w-xl bg-white rounded-3xl shadow-2xl border border-slate-100 overflow-hidden animate-in fade-in zoom-in-95 duration-150">
        {/* Header with gradient branding */}
        <div className="bg-gradient-to-r from-kulkul-purple via-[#42167d] to-kulkul-purple text-white p-6 relative">
          <button
            type="button"
            onClick={onClose}
            className="absolute top-5 right-5 p-2 rounded-full text-white/80 hover:text-white hover:bg-white/10 transition"
            title="Close"
          >
            <X className="w-5 h-5" />
          </button>

          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-2xl bg-white/10 border border-white/20 flex items-center justify-center shadow-inner overflow-hidden shrink-0">
              {avatarUrl ? (
                <img
                  src={avatarUrl}
                  alt="Avatar"
                  className="w-full h-full object-cover"
                  onError={(e) => {
                    (e.target as HTMLElement).style.display = 'none';
                  }}
                />
              ) : (
                <UserIcon className="w-6 h-6 text-kulkul-orange" />
              )}
            </div>
            <div>
              <h2 className="text-xl font-black text-white tracking-tight">
                Edit Profile & Account
              </h2>
              <p className="text-xs text-purple-200 mt-0.5">
                Manage your name, profile picture, security credentials, and company details
              </p>
            </div>
          </div>

          {/* Navigation Tabs (if company context available) */}
          {isCompanyUser && (
            <div className="flex items-center gap-2 mt-6 pt-2 border-t border-white/15">
              <button
                type="button"
                onClick={() => setActiveTab('personal')}
                className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition ${
                  activeTab === 'personal'
                    ? 'bg-white text-kulkul-purple shadow-sm'
                    : 'text-white/80 hover:text-white hover:bg-white/10'
                }`}
              >
                <UserIcon className="w-3.5 h-3.5" />
                <span>Personal Profile</span>
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('company')}
                className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition ${
                  activeTab === 'company'
                    ? 'bg-white text-kulkul-purple shadow-sm'
                    : 'text-white/80 hover:text-white hover:bg-white/10'
                }`}
              >
                <Building2 className="w-3.5 h-3.5" />
                <span>Company / Organization</span>
              </button>
            </div>
          )}
        </div>

        {/* Error notification banner */}
        {errorMsg && (
          <div className="mx-6 mt-4 p-3.5 rounded-2xl bg-rose-50 border border-rose-200 text-rose-700 text-xs font-semibold flex items-center gap-2">
            <X className="w-4 h-4 shrink-0 text-rose-500" />
            <span>{errorMsg}</span>
          </div>
        )}

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="p-6 sm:p-7 space-y-6 max-h-[72vh] overflow-y-auto">
          {/* TAB 1: PERSONAL PROFILE */}
          {activeTab === 'personal' && (
            <div className="space-y-6 animate-in fade-in duration-150">
              {/* Profile Picture Live Preview & Controls */}
              <div>
                <label className="block text-xs font-extrabold uppercase tracking-wider text-slate-700 mb-2">
                  Profile Picture / Avatar
                </label>
                <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4 p-4 rounded-2xl bg-slate-50 border border-slate-200">
                  <div className="w-16 h-16 rounded-2xl bg-white border-2 border-kulkul-purple/20 shadow-xs flex items-center justify-center overflow-hidden shrink-0">
                    {avatarUrl ? (
                      <img
                        src={avatarUrl}
                        alt="Profile preview"
                        className="w-full h-full object-cover"
                        onError={(e) => {
                          (e.target as HTMLElement).style.display = 'none';
                        }}
                      />
                    ) : (
                      <UserIcon className="w-8 h-8 text-slate-400" />
                    )}
                  </div>
                  <div className="flex-1 w-full space-y-2">
                    <div className="relative">
                      <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
                        <ImageIcon className="w-4 h-4" />
                      </div>
                      <input
                        type="url"
                        value={avatarUrl}
                        onChange={(e) => setAvatarUrl(e.target.value)}
                        placeholder="Paste image URL (e.g. https://.../photo.png)"
                        className="w-full pl-9 pr-8 py-2 rounded-xl text-xs bg-white border border-slate-200 focus:outline-none focus:ring-2 focus:ring-kulkul-purple font-medium"
                      />
                      {avatarUrl && (
                        <button
                          type="button"
                          onClick={() => setAvatarUrl('')}
                          className="absolute inset-y-0 right-0 pr-3 flex items-center text-slate-400 hover:text-slate-600 text-xs"
                          title="Clear avatar"
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>

                    {/* Quick Avatar Presets */}
                    <div>
                      <div className="text-2xs font-bold text-slate-500 mb-1 flex items-center gap-1">
                        <Sparkles className="w-3 h-3 text-kulkul-purple" />
                        <span>Or select a quick avatar:</span>
                      </div>
                      <div className="flex items-center gap-2 flex-wrap">
                        {AVATAR_PRESETS.map((preset, idx) => (
                          <button
                            key={idx}
                            type="button"
                            onClick={() => setAvatarUrl(preset)}
                            className={`w-8 h-8 rounded-full border-2 overflow-hidden transition hover:scale-105 ${
                              avatarUrl === preset
                                ? 'border-kulkul-purple ring-2 ring-kulkul-purple/30'
                                : 'border-slate-200 hover:border-slate-400'
                            }`}
                            title={`Select avatar preset ${idx + 1}`}
                          >
                            <img src={preset} alt={`Preset ${idx + 1}`} className="w-full h-full" />
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Full Name */}
              <div>
                <label className="block text-xs font-extrabold uppercase tracking-wider text-slate-700 mb-1">
                  Full Name <span className="text-rose-500">*</span>
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
                    <UserIcon className="w-4 h-4" />
                  </div>
                  <input
                    type="text"
                    required
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Enter your full name"
                    className="w-full pl-10 pr-4 py-2.5 rounded-xl text-sm bg-slate-50 border border-slate-200 focus:outline-none focus:ring-2 focus:ring-kulkul-purple font-medium text-slate-900"
                  />
                </div>
              </div>

              {/* Email (Read-only) */}
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="block text-xs font-extrabold uppercase tracking-wider text-slate-700">
                    Email Address
                  </label>
                  <span className="text-2xs font-bold text-slate-400 flex items-center gap-1">
                    <Lock className="w-3 h-3" /> Account ID (Immutable)
                  </span>
                </div>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
                    <Mail className="w-4 h-4" />
                  </div>
                  <input
                    type="email"
                    disabled
                    value={effectiveEmail}
                    className="w-full pl-10 pr-4 py-2.5 rounded-xl text-sm bg-slate-100 border border-slate-200 text-slate-500 font-medium cursor-not-allowed"
                  />
                </div>
              </div>

              {/* Optional Password Update */}
              <div className="pt-2 border-t border-slate-100">
                <div className="flex items-center justify-between mb-3">
                  <div>
                    <h3 className="text-xs font-extrabold uppercase tracking-wider text-slate-700">
                      Security & Password
                    </h3>
                    <p className="text-2xs text-slate-400">
                      Leave blank if you wish to keep your current password
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="text-xs text-kulkul-purple font-bold hover:underline flex items-center gap-1"
                  >
                    {showPassword ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                    <span>{showPassword ? 'Hide Passwords' : 'Show Passwords'}</span>
                  </button>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-2xs font-bold text-slate-600 mb-1">
                      New Password
                    </label>
                    <input
                      type={showPassword ? 'text' : 'password'}
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                      placeholder="Min. 8 characters"
                      className="w-full px-3.5 py-2 rounded-xl text-xs bg-slate-50 border border-slate-200 focus:outline-none focus:ring-2 focus:ring-kulkul-purple font-medium"
                    />
                  </div>
                  <div>
                    <label className="block text-2xs font-bold text-slate-600 mb-1">
                      Confirm New Password
                    </label>
                    <input
                      type={showPassword ? 'text' : 'password'}
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      placeholder="Re-enter password"
                      className="w-full px-3.5 py-2 rounded-xl text-xs bg-slate-50 border border-slate-200 focus:outline-none focus:ring-2 focus:ring-kulkul-purple font-medium"
                    />
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* TAB 2: COMPANY / ORGANIZATION PROFILE */}
          {activeTab === 'company' && isCompanyUser && (
            <div className="space-y-6 animate-in fade-in duration-150">
              {/* Company Logo Live Preview & URL */}
              <div>
                <label className="block text-xs font-extrabold uppercase tracking-wider text-slate-700 mb-2">
                  Company Brand Logo
                </label>
                <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4 p-4 rounded-2xl bg-slate-50 border border-slate-200">
                  <div className="w-16 h-16 rounded-2xl bg-white border border-slate-200 p-1 flex items-center justify-center overflow-hidden shadow-xs shrink-0">
                    {companyLogoUrl ? (
                      <img
                        src={companyLogoUrl}
                        alt="Company Logo Preview"
                        className="w-full h-full object-contain"
                        onError={(e) => {
                          (e.target as HTMLElement).style.display = 'none';
                        }}
                      />
                    ) : (
                      <Building2 className="w-8 h-8 text-slate-400" />
                    )}
                  </div>
                  <div className="flex-1 w-full space-y-2">
                    <div className="relative">
                      <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
                        <ImageIcon className="w-4 h-4" />
                      </div>
                      <input
                        type="url"
                        value={companyLogoUrl}
                        onChange={(e) => setCompanyLogoUrl(e.target.value)}
                        placeholder="https://example.com/company-logo.png"
                        className="w-full pl-9 pr-8 py-2 rounded-xl text-xs bg-white border border-slate-200 focus:outline-none focus:ring-2 focus:ring-kulkul-purple font-mono"
                      />
                      {companyLogoUrl && (
                        <button
                          type="button"
                          onClick={() => setCompanyLogoUrl('')}
                          className="absolute inset-y-0 right-0 pr-3 flex items-center text-slate-400 hover:text-slate-600 text-xs"
                          title="Clear logo"
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                    <p className="text-2xs text-slate-500">
                      Direct image link (PNG, SVG, JPG) to represent your company on workspace headers, sidebar, and applicant portals.
                    </p>
                  </div>
                </div>
              </div>

              {/* Organization / Company Name */}
              <div>
                <label className="block text-xs font-extrabold uppercase tracking-wider text-slate-700 mb-1">
                  Company / Organization Name
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
                    <Building2 className="w-4 h-4" />
                  </div>
                  <input
                    type="text"
                    value={companyName}
                    onChange={(e) => setCompanyName(e.target.value)}
                    placeholder="e.g. Remote Skills Academy (RSA)"
                    className="w-full pl-10 pr-4 py-2.5 rounded-xl text-sm bg-slate-50 border border-slate-200 focus:outline-none focus:ring-2 focus:ring-kulkul-purple font-medium text-slate-900"
                  />
                </div>
              </div>

              {/* Contact Email */}
              <div>
                <label className="block text-xs font-extrabold uppercase tracking-wider text-slate-700 mb-1">
                  Company Admissions / Contact Email
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
                    <Mail className="w-4 h-4" />
                  </div>
                  <input
                    type="email"
                    value={companyContactEmail}
                    onChange={(e) => setCompanyContactEmail(e.target.value)}
                    placeholder="e.g. admissions@company.org"
                    className="w-full pl-10 pr-4 py-2.5 rounded-xl text-sm bg-slate-50 border border-slate-200 focus:outline-none focus:ring-2 focus:ring-kulkul-purple font-medium text-slate-900"
                  />
                </div>
                <p className="text-2xs text-slate-400 mt-1">
                  Shown to applicants as the official point of contact for fellowship inquiries.
                </p>
              </div>
            </div>
          )}

          {/* Modal Footer Actions */}
          <div className="pt-4 border-t border-slate-100 flex items-center justify-end gap-3">
            <button
              type="button"
              onClick={onClose}
              disabled={isSubmitting}
              className="px-5 py-2.5 rounded-xl text-xs font-bold text-slate-600 hover:text-slate-800 hover:bg-slate-100 transition"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="flex items-center gap-2 px-6 py-2.5 rounded-xl bg-kulkul-purple hover:bg-kulkul-purple-hover text-white text-xs font-bold shadow-md hover:shadow-lg transition disabled:opacity-60"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin text-white" />
                  <span>Saving Changes...</span>
                </>
              ) : (
                <>
                  <CheckCircle2 className="w-4 h-4 text-kulkul-orange" />
                  <span>Save Profile</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
