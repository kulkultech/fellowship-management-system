import React, { useState, useEffect } from 'react';
import { useNavigate, useLocation, useParams, Link } from 'react-router-dom';
import { useQuery, useMutation } from '@tanstack/react-query';
import { programService } from '@/services/programService';
import { Navbar } from '@/components/Navbar';
import {
  ArrowRight,
  Clock,
  AlertCircle,
  FileText,
  Github,
  Linkedin,
  Mail,
  User as UserIcon,
  Phone,
  CheckCircle2,
  Upload,
  X,
  Layers,
  Award,
} from 'lucide-react';
import toast from 'react-hot-toast';

export const ApplyPage: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const params = useParams<{ orgSlug?: string; programSlug?: string; trackSlug?: string }>();
  const orgSlug = params.orgSlug || 'rsa';
  const programSlug = params.programSlug || 'lit2026';

  const queryParams = new URLSearchParams(location.search);
  const trackSlugFromQuery = queryParams.get('track') || '';
  const initialTrackSlug = params.trackSlug || trackSlugFromQuery || 'fullstack';

  const [selectedTrackSlug, setSelectedTrackSlug] = useState<string>(initialTrackSlug);

  const [formData, setFormData] = useState({
    fullName: '',
    email: '',
    phone: '',
    githubUrl: '',
    linkedinUrl: '',
    resumeUrl: '',
    notes: '',
  });
  const [resumeFileName, setResumeFileName] = useState('');
  const [resumeFileSize, setResumeFileSize] = useState('');

  const handleResumeUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 5 * 1024 * 1024) {
      toast.error('Resume file size must be under 5MB');
      return;
    }

    setResumeFileName(file.name);
    setResumeFileSize((file.size / 1024).toFixed(1) + ' KB');
    const reader = new FileReader();
    reader.onload = (event) => {
      const base64 = event.target?.result as string;
      setFormData((prev) => ({ ...prev, resumeUrl: base64 }));
    };
    reader.readAsDataURL(file);
  };

  const handleRemoveResume = () => {
    setResumeFileName('');
    setResumeFileSize('');
    setFormData((prev) => ({ ...prev, resumeUrl: '' }));
  };

  // Pre-fill from query params if passed from AuthModal
  useEffect(() => {
    const emailParam = queryParams.get('email');
    const nameParam = queryParams.get('name');
    if (emailParam || nameParam) {
      setFormData((prev) => ({
        ...prev,
        email: emailParam || prev.email,
        fullName: nameParam || prev.fullName,
      }));
    }
  }, [location.search]);

  const { data: programData } = useQuery({
    queryKey: ['program', orgSlug, programSlug],
    queryFn: () => programService.getProgram(orgSlug, programSlug),
  });

  const program = programData?.program;
  const org = programData?.organization;
  const tracks = program?.tracks || [];

  // Update selectedTrackSlug if not set and tracks exist
  useEffect(() => {
    if (tracks.length > 0) {
      const exists = tracks.some((t) => t.slug === selectedTrackSlug);
      if (!exists) {
        setSelectedTrackSlug(tracks[0].slug);
      }
    }
  }, [tracks, selectedTrackSlug]);

  const currentTrack = tracks.find((t) => t.slug === selectedTrackSlug) || tracks[0];

  const durationMinutes = currentTrack?.logic_test_duration_minutes || program?.logic_test_duration_minutes || 35;
  const passingScore = currentTrack?.logic_test_passing_score || program?.logic_test_passing_score || 70;

  const applyMutation = useMutation({
    mutationFn: () =>
      programService.apply(orgSlug, programSlug, {
        track_slug: selectedTrackSlug,
        full_name: formData.fullName,
        email: formData.email,
        phone: formData.phone,
        github_url: formData.githubUrl,
        linkedin_url: formData.linkedinUrl,
        resume_url: formData.resumeUrl,
        notes: formData.notes,
      }),
    onSuccess: (res) => {
      if (res.message && res.message.includes('already completed')) {
        toast('You have already completed the assessment test for this program. Showing your result scorecard.', {
          icon: 'ℹ️',
        });
        if (res.test_token) {
          navigate(`/lit2026/result/${res.test_token}`);
          return;
        }
      }

      if (res.stage === 'ai_interview_invited' && res.ai_interview_invite_token) {
        toast.success(res.message || 'Proceeding to AI Technical Screening!');
        navigate(`/lit2026/interview/${res.ai_interview_invite_token}`);
        return;
      }

      toast.success(res.message || 'Application received! Starting your logic test.');
      if (res.test_token) {
        navigate(`/lit2026/test/${res.test_token}`);
      }
    },
    onError: (err: any) => {
      const msg = err.response?.data?.message || err.message || 'Failed to submit application';
      toast.error(msg);
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.fullName.trim() || !formData.email.trim()) {
      toast.error('Please enter your full name and email address');
      return;
    }
    applyMutation.mutate();
  };

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">
      <Navbar
        title="FellowHire"
        subtitle={`${org?.name || 'Remote Skills Academy'} &middot; Opportunity`}
      />

      <main className="flex-1 flex items-center justify-center p-4 sm:p-6 lg:p-8">
        <div className="max-w-2xl w-full">
          {/* Header Card */}
          <div className="stitch-card p-6 sm:p-8 mb-6 bg-white">
            <div className="flex items-center justify-between gap-4 mb-3">
              <span className="px-3 py-1 bg-kulkul-purple-light text-kulkul-purple text-xs font-extrabold rounded-full flex items-center gap-1.5">
                <Layers className="w-3.5 h-3.5" />
                {program?.name || 'Fellowship Program'}
              </span>

              <Link
                to={`/programs/${orgSlug}/${programSlug}`}
                className="text-xs font-bold text-kulkul-purple hover:underline"
              >
                &larr; Program Details
              </Link>
            </div>

            <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight">
              Candidate Application
            </h1>
            <p className="text-slate-600 text-sm mt-1">
              Submit your candidate details to immediately begin the timed logic assessment.
            </p>

            {/* Track Selector if multiple tracks exist */}
            {tracks.length > 1 && (
              <div className="mt-5 pt-4 border-t border-slate-100 space-y-2">
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider">
                  Select Specialization Track:
                </label>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                  {tracks.map((t) => (
                    <button
                      key={t.slug}
                      type="button"
                      onClick={() => setSelectedTrackSlug(t.slug)}
                      className={`p-3 rounded-2xl border text-left transition ${
                        selectedTrackSlug === t.slug
                          ? 'border-kulkul-purple bg-kulkul-purple/5 ring-2 ring-kulkul-purple/20'
                          : 'border-slate-200 bg-white hover:border-slate-300'
                      }`}
                    >
                      <div className={`text-xs font-bold ${selectedTrackSlug === t.slug ? 'text-kulkul-purple' : 'text-slate-800'}`}>
                        {t.name}
                      </div>
                      <div className="text-2xs text-slate-400 mt-0.5">
                        {t.logic_test_duration_minutes}m &middot; {t.logic_test_passing_score}% pass
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Quick Benchmark Box */}
            <div className="mt-5 p-4 rounded-2xl bg-gradient-to-r from-kulkul-purple/5 to-kulkul-orange/5 border border-kulkul-purple/10 flex flex-wrap items-center justify-between gap-3 text-xs text-slate-700">
              <div className="flex items-center gap-2">
                <Clock className="w-4 h-4 text-kulkul-orange" />
                <span>
                  <strong className="text-slate-900">{durationMinutes} Minutes</strong> timed logic test
                </span>
              </div>
              <div className="flex items-center gap-2">
                <Award className="w-4 h-4 text-emerald-600" />
                <span>
                  <strong className="text-slate-900">{passingScore}% Passing Score</strong> required
                </span>
              </div>
              <div className="flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-kulkul-purple" />
                <span>Instant scorecard</span>
              </div>
            </div>
          </div>

          {/* Form Card */}
          <form onSubmit={handleSubmit} className="stitch-card p-6 sm:p-8 bg-white space-y-6">
            <div className="space-y-4">
              {/* Full Name */}
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-1.5">
                  Full Name <span className="text-red-500">*</span>
                </label>
                <div className="relative">
                  <UserIcon className="w-4 h-4 text-slate-400 absolute left-4 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    required
                    value={formData.fullName}
                    onChange={(e) => setFormData({ ...formData, fullName: e.target.value })}
                    placeholder="e.g. Jane Doe"
                    className="w-full pl-11 pr-4 py-3 rounded-full border border-slate-200 text-sm focus:outline-none focus:border-kulkul-purple focus:ring-2 focus:ring-kulkul-purple/20 transition"
                  />
                </div>
              </div>

              {/* Email Address */}
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-1.5">
                  Email Address <span className="text-red-500">*</span>
                </label>
                <div className="relative">
                  <Mail className="w-4 h-4 text-slate-400 absolute left-4 top-1/2 -translate-y-1/2" />
                  <input
                    type="email"
                    required
                    value={formData.email}
                    onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                    placeholder="e.g. jane.doe@example.com"
                    className="w-full pl-11 pr-4 py-3 rounded-full border border-slate-200 text-sm focus:outline-none focus:border-kulkul-purple focus:ring-2 focus:ring-kulkul-purple/20 transition"
                  />
                </div>
                <p className="text-2xs text-slate-400 mt-1 pl-4">
                  Assessment results and stage updates will be linked to this email address.
                </p>
              </div>

              {/* Phone / WhatsApp */}
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-1.5">
                  Phone / WhatsApp
                </label>
                <div className="relative">
                  <Phone className="w-4 h-4 text-slate-400 absolute left-4 top-1/2 -translate-y-1/2" />
                  <input
                    type="tel"
                    value={formData.phone}
                    onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                    placeholder="e.g. +62 812-3456-7890"
                    className="w-full pl-11 pr-4 py-3 rounded-full border border-slate-200 text-sm focus:outline-none focus:border-kulkul-purple focus:ring-2 focus:ring-kulkul-purple/20 transition"
                  />
                </div>
              </div>

              {/* Professional Links */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-1.5">
                    GitHub Profile
                  </label>
                  <div className="relative">
                    <Github className="w-4 h-4 text-slate-400 absolute left-4 top-1/2 -translate-y-1/2" />
                    <input
                      type="url"
                      value={formData.githubUrl}
                      onChange={(e) => setFormData({ ...formData, githubUrl: e.target.value })}
                      placeholder="https://github.com/janedoe"
                      className="w-full pl-11 pr-4 py-3 rounded-full border border-slate-200 text-xs focus:outline-none focus:border-kulkul-purple focus:ring-2 focus:ring-kulkul-purple/20 transition"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-1.5">
                    LinkedIn Profile
                  </label>
                  <div className="relative">
                    <Linkedin className="w-4 h-4 text-slate-400 absolute left-4 top-1/2 -translate-y-1/2" />
                    <input
                      type="url"
                      value={formData.linkedinUrl}
                      onChange={(e) => setFormData({ ...formData, linkedinUrl: e.target.value })}
                      placeholder="https://linkedin.com/in/janedoe"
                      className="w-full pl-11 pr-4 py-3 rounded-full border border-slate-200 text-xs focus:outline-none focus:border-kulkul-purple focus:ring-2 focus:ring-kulkul-purple/20 transition"
                    />
                  </div>
                </div>
              </div>

              {/* Resume File Upload */}
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-1.5">
                  Resume / CV (File Upload)
                </label>
                {formData.resumeUrl ? (
                  <div className="flex items-center justify-between p-3.5 px-4 rounded-2xl bg-kulkul-purple/5 border border-kulkul-purple/20">
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 rounded-xl bg-kulkul-purple/10 flex items-center justify-center text-kulkul-purple font-bold">
                        <FileText className="w-5 h-5" />
                      </div>
                      <div>
                        <div className="text-xs font-bold text-slate-900 line-clamp-1">{resumeFileName || 'Resume.pdf'}</div>
                        <div className="text-2xs text-slate-500">{resumeFileSize || 'Uploaded'}</div>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={handleRemoveResume}
                      className="p-1.5 rounded-full hover:bg-slate-200 text-slate-400 hover:text-slate-600 transition"
                      title="Remove file"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                ) : (
                  <label className="border-2 border-dashed border-slate-200 hover:border-kulkul-purple/50 rounded-2xl p-5 flex flex-col items-center justify-center cursor-pointer transition bg-slate-50/50 hover:bg-slate-50 group">
                    <Upload className="w-6 h-6 text-slate-400 group-hover:text-kulkul-purple transition mb-1.5" />
                    <span className="text-xs font-bold text-slate-700 group-hover:text-kulkul-purple transition">
                      Click to upload Resume / CV
                    </span>
                    <span className="text-2xs text-slate-400 mt-0.5">PDF, DOC, DOCX up to 5MB</span>
                    <input
                      type="file"
                      accept=".pdf,.doc,.docx,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                      onChange={handleResumeUpload}
                      className="hidden"
                    />
                  </label>
                )}
              </div>

              {/* Notes / Background */}
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-1.5">
                  Brief Background / Notes (Optional)
                </label>
                <textarea
                  rows={3}
                  value={formData.notes}
                  onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                  placeholder="Share any highlights about your experience or motivation for joining this track..."
                  className="w-full p-4 rounded-2xl border border-slate-200 text-sm focus:outline-none focus:border-kulkul-purple focus:ring-2 focus:ring-kulkul-purple/20 transition resize-none"
                />
              </div>
            </div>

            {/* Terms / Notice */}
            <div className="p-4 rounded-2xl bg-slate-50 border border-slate-100 flex items-start gap-3">
              <AlertCircle className="w-4 h-4 text-kulkul-orange shrink-0 mt-0.5" />
              <p className="text-2xs text-slate-600 leading-relaxed">
                By submitting this form, you acknowledge that you will be redirected immediately into a timed {durationMinutes}-minute logic assessment. Make sure you are in a quiet environment.
              </p>
            </div>

            {/* Submit Button */}
            <button
              type="submit"
              disabled={applyMutation.isPending}
              className="w-full stitch-pill stitch-pill-orange text-base py-3.5 justify-center shadow-lg hover:shadow-xl disabled:opacity-50 disabled:cursor-not-allowed transition"
            >
              {applyMutation.isPending ? (
                <div className="flex items-center gap-2">
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  <span>Preparing Assessment...</span>
                </div>
              ) : (
                <>
                  <span>Begin {currentTrack?.name || 'Fellowship'} Assessment</span>
                  <ArrowRight className="w-5 h-5" />
                </>
              )}
            </button>
          </form>
        </div>
      </main>
    </div>
  );
};
