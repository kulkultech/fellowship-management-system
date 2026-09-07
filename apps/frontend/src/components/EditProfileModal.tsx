import React, { useState, useEffect, useRef } from 'react';
import {
  X,
  User as UserIcon,
  Building2,
  Lock,
  Eye,
  EyeOff,
  Loader2,
  Mail,
  Sparkles,
  CheckCircle2,
  Upload,
  Camera,
  Trash2,
  Link as LinkIcon,
} from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { useAuthStore } from '@/hooks/useAuthStore';
import { authService } from '@/services/authService';
import { uploadService } from '@/services/uploadService';
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

  // Uploading states
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const [avatarFileName, setAvatarFileName] = useState('');
  const [logoFileName, setLogoFileName] = useState('');
  const [showAvatarUrlInput, setShowAvatarUrlInput] = useState(false);
  const [showLogoUrlInput, setShowLogoUrlInput] = useState(false);

  const avatarInputRef = useRef<HTMLInputElement>(null);
  const logoInputRef = useRef<HTMLInputElement>(null);

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
      setUploadingAvatar(false);
      setUploadingLogo(false);
      setAvatarFileName('');
      setLogoFileName('');
      setShowAvatarUrlInput(false);
      setShowLogoUrlInput(false);

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

  const handleAvatarFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 5 * 1024 * 1024) {
      toast.error('Avatar file size must be under 5MB');
      return;
    }

    setUploadingAvatar(true);
    setAvatarFileName(file.name);
    try {
      const res = await uploadService.uploadFile(file, 'avatars');
      setAvatarUrl(res.url);
      toast.success('Profile picture uploaded to Cloudflare R2!');
    } catch (err: any) {
      toast.error(err?.response?.data?.error || 'Failed to upload photo to storage');
      setAvatarFileName('');
    } finally {
      setUploadingAvatar(false);
      if (avatarInputRef.current) avatarInputRef.current.value = '';
    }
  };

  const handleLogoFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 5 * 1024 * 1024) {
      toast.error('Logo file size must be under 5MB');
      return;
    }

    setUploadingLogo(true);
    setLogoFileName(file.name);
    try {
      const res = await uploadService.uploadFile(file, 'logos');
      setCompanyLogoUrl(res.url);
      toast.success('Company logo uploaded to Cloudflare R2!');
    } catch (err: any) {
      toast.error(err?.response?.data?.error || 'Failed to upload logo to storage');
      setLogoFileName('');
    } finally {
      setUploadingLogo(false);
      if (logoInputRef.current) logoInputRef.current.value = '';
    }
  };

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
              {/* Profile Picture Live Preview & Upload Controls */}
              <div>
                <label className="block text-xs font-extrabold uppercase tracking-wider text-slate-700 mb-2">
                  Profile Picture / Avatar
                </label>
                <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200 space-y-3">
                  <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4">
                    {/* Avatar Preview with click-to-upload overlay */}
                    <div className="relative group shrink-0">
                      <div className="w-18 h-18 sm:w-20 sm:h-20 rounded-2xl bg-white border-2 border-kulkul-purple/20 shadow-xs flex items-center justify-center overflow-hidden">
                        {uploadingAvatar ? (
                          <div className="w-full h-full flex flex-col items-center justify-center bg-purple-50">
                            <Loader2 className="w-6 h-6 animate-spin text-kulkul-purple" />
                          </div>
                        ) : avatarUrl ? (
                          <img
                            src={avatarUrl}
                            alt="Profile preview"
                            className="w-full h-full object-cover"
                            onError={(e) => {
                              (e.target as HTMLElement).style.display = 'none';
                            }}
                          />
                        ) : (
                          <UserIcon className="w-8 h-8 sm:w-9 sm:h-9 text-slate-400" />
                        )}
                      </div>
                      <button
                        type="button"
                        onClick={() => avatarInputRef.current?.click()}
                        disabled={uploadingAvatar}
                        className="absolute inset-0 rounded-2xl bg-slate-900/40 text-white opacity-0 group-hover:opacity-100 transition flex flex-col items-center justify-center gap-1 cursor-pointer"
                        title="Upload new photo"
                      >
                        <Camera className="w-4 h-4" />
                        <span className="text-3xs font-bold">Change</span>
                      </button>
                    </div>

                    <div className="flex-1 w-full space-y-2">
                      <input
                        ref={avatarInputRef}
                        type="file"
                        accept="image/png,image/jpeg,image/webp,image/gif"
                        className="hidden"
                        onChange={handleAvatarFileChange}
                      />

                      <div className="flex items-center gap-2 flex-wrap">
                        <button
                          type="button"
                          onClick={() => avatarInputRef.current?.click()}
                          disabled={uploadingAvatar}
                          className="inline-flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-bold bg-white hover:bg-slate-100 text-slate-800 border border-slate-300 shadow-2xs transition disabled:opacity-50"
                        >
                          {uploadingAvatar ? (
                            <>
                              <Loader2 className="w-3.5 h-3.5 animate-spin text-kulkul-purple" />
                              <span>Uploading to R2...</span>
                            </>
                          ) : (
                            <>
                              <Upload className="w-3.5 h-3.5 text-kulkul-purple" />
                              <span>Upload Image</span>
                            </>
                          )}
                        </button>

                        {avatarUrl && (
                          <button
                            type="button"
                            onClick={() => {
                              setAvatarUrl('');
                              setAvatarFileName('');
                            }}
                            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold text-rose-600 hover:bg-rose-50 border border-rose-200 transition"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                            <span>Remove</span>
                          </button>
                        )}

                        <button
                          type="button"
                          onClick={() => setShowAvatarUrlInput(!showAvatarUrlInput)}
                          className="text-2xs font-semibold text-slate-500 hover:text-kulkul-purple hover:underline ml-auto"
                        >
                          {showAvatarUrlInput ? 'Hide link' : 'Or paste link'}
                        </button>
                      </div>

                      {avatarFileName && (
                        <p className="text-2xs text-emerald-600 font-semibold flex items-center gap-1">
                          <CheckCircle2 className="w-3 h-3" />
                          <span>Uploaded: {avatarFileName}</span>
                        </p>
                      )}

                      {showAvatarUrlInput && (
                        <div className="relative pt-1 animate-in fade-in duration-150">
                          <div className="absolute inset-y-0 left-0 pl-3 pt-1 flex items-center pointer-events-none text-slate-400">
                            <LinkIcon className="w-3.5 h-3.5" />
                          </div>
                          <input
                            type="url"
                            value={avatarUrl}
                            onChange={(e) => setAvatarUrl(e.target.value)}
                            placeholder="Paste image URL (https://...)"
                            className="w-full pl-8 pr-3 py-1.5 rounded-lg text-xs bg-white border border-slate-200 focus:outline-none focus:ring-2 focus:ring-kulkul-purple font-mono"
                          />
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Quick Avatar Presets */}
                  <div className="pt-2 border-t border-slate-200/60">
                    <div className="text-2xs font-bold text-slate-500 mb-1.5 flex items-center gap-1">
                      <Sparkles className="w-3 h-3 text-kulkul-purple" />
                      <span>Or pick an avatar preset:</span>
                    </div>
                    <div className="flex items-center gap-2 flex-wrap">
                      {AVATAR_PRESETS.map((preset, idx) => (
                        <button
                          key={idx}
                          type="button"
                          onClick={() => {
                            setAvatarUrl(preset);
                            setAvatarFileName('');
                          }}
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
              {/* Company Logo Upload & Live Preview */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="block text-xs font-extrabold uppercase tracking-wider text-slate-700">
                    Company Brand Logo
                  </label>
                  <span className="text-2xs text-slate-400">PNG, SVG, JPG, or WebP (max 5MB)</span>
                </div>

                <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200 space-y-3">
                  <input
                    ref={logoInputRef}
                    type="file"
                    accept="image/png,image/jpeg,image/svg+xml,image/webp"
                    className="hidden"
                    onChange={handleLogoFileChange}
                  />

                  {uploadingLogo ? (
                    <div className="p-6 rounded-xl bg-purple-50/60 border border-purple-200 flex flex-col items-center justify-center gap-2 animate-pulse">
                      <Loader2 className="w-7 h-7 animate-spin text-kulkul-purple" />
                      <span className="text-xs font-bold text-kulkul-purple">Uploading logo to Cloudflare R2...</span>
                    </div>
                  ) : companyLogoUrl ? (
                    <div className="flex items-center justify-between gap-4 p-3.5 bg-white rounded-xl border border-slate-200 shadow-2xs">
                      <div className="flex items-center gap-3">
                        <div className="w-14 h-14 rounded-xl bg-slate-50 border border-slate-200 p-1 flex items-center justify-center overflow-hidden shrink-0">
                          <img
                            src={companyLogoUrl}
                            alt="Company Logo"
                            className="w-full h-full object-contain"
                            onError={(e) => {
                              (e.target as HTMLElement).style.display = 'none';
                            }}
                          />
                        </div>
                        <div>
                          <div className="text-xs font-bold text-slate-900">
                            {logoFileName || 'Company Brand Logo'}
                          </div>
                          <span className="text-2xs font-semibold text-emerald-600 flex items-center gap-1 mt-0.5">
                            <CheckCircle2 className="w-3 h-3" /> Stored in Cloudflare R2
                          </span>
                        </div>
                      </div>

                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => logoInputRef.current?.click()}
                          className="px-3 py-1.5 rounded-lg text-xs font-bold text-slate-700 hover:bg-slate-100 border border-slate-200 transition"
                        >
                          Change
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setCompanyLogoUrl('');
                            setLogoFileName('');
                          }}
                          className="p-1.5 rounded-lg text-rose-600 hover:bg-rose-50 border border-rose-200 transition"
                          title="Remove logo"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div
                      onClick={() => logoInputRef.current?.click()}
                      className="flex flex-col items-center justify-center border-2 border-dashed border-slate-200 hover:border-kulkul-purple rounded-xl p-6 cursor-pointer bg-white hover:bg-purple-50/20 transition group"
                    >
                      <div className="w-12 h-12 rounded-xl bg-purple-50 border border-purple-100 text-kulkul-purple flex items-center justify-center shadow-2xs mb-2 group-hover:scale-105 transition">
                        <Upload className="w-6 h-6" />
                      </div>
                      <span className="text-xs font-bold text-slate-900 group-hover:text-kulkul-purple transition">
                        Click to upload company logo
                      </span>
                      <span className="text-2xs text-slate-400 mt-0.5">
                        PNG, SVG, WebP or JPG up to 5MB
                      </span>
                    </div>
                  )}

                  {/* Fallback to URL input if user desires */}
                  <div className="pt-1 flex items-center justify-between">
                    <p className="text-2xs text-slate-400">
                      Displayed on workspace headers, reports, and applicant portals.
                    </p>
                    <button
                      type="button"
                      onClick={() => setShowLogoUrlInput(!showLogoUrlInput)}
                      className="text-2xs font-semibold text-slate-500 hover:text-kulkul-purple hover:underline"
                    >
                      {showLogoUrlInput ? 'Hide link' : 'Or paste link'}
                    </button>
                  </div>

                  {showLogoUrlInput && (
                    <div className="relative pt-1 animate-in fade-in duration-150">
                      <div className="absolute inset-y-0 left-0 pl-3 pt-1 flex items-center pointer-events-none text-slate-400">
                        <LinkIcon className="w-3.5 h-3.5" />
                      </div>
                      <input
                        type="url"
                        value={companyLogoUrl}
                        onChange={(e) => setCompanyLogoUrl(e.target.value)}
                        placeholder="https://example.com/company-logo.png"
                        className="w-full pl-8 pr-3 py-1.5 rounded-lg text-xs bg-white border border-slate-200 focus:outline-none focus:ring-2 focus:ring-kulkul-purple font-mono"
                      />
                    </div>
                  )}
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
