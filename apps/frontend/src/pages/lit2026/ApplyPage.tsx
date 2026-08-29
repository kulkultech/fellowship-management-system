import React, { useState, useEffect } from 'react';
import { useNavigate, useLocation, useParams } from 'react-router-dom';
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
  Sparkles,
} from 'lucide-react';
import toast from 'react-hot-toast';

export const ApplyPage: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const params = useParams<{ orgSlug?: string; programSlug?: string }>();
  const orgSlug = params.orgSlug || 'rsa';
  const programSlug = params.programSlug || 'lit2026';

  const [formData, setFormData] = useState({
    fullName: '',
    email: '',
    phone: '',
    githubUrl: '',
    linkedinUrl: '',
    resumeUrl: '',
    notes: '',
  });

  // Pre-fill from query params if passed from AuthModal
  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const emailParam = params.get('email');
    const nameParam = params.get('name');
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

  const applyMutation = useMutation({
    mutationFn: () =>
      programService.apply(orgSlug, programSlug, {
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
        navigate(`/lit2026/result/${res.test_token}`);
        return;
      }
      toast.success('Registration successful! Launching your assessment...');
      navigate(`/lit2026/test/${res.test_token}`);
    },
    onError: (err: any) => {
      const msg = err.response?.data?.error || err.message || 'Failed to submit application';
      toast.error(msg);
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.fullName.trim()) {
      toast.error('Please enter your full name');
      return;
    }
    if (!formData.email.trim()) {
      toast.error('Please enter a valid email address');
      return;
    }
    applyMutation.mutate();
  };

  const program = programData?.program;

  return (
    <div className="min-h-screen bg-slate-50/60 flex flex-col">
      <Navbar title="LIT 2026 Fellowship" subtitle="Remote Skills Academy Selection Funnel" />

      <main className="flex-1 max-w-4xl w-full mx-auto px-4 py-10 sm:px-6 lg:px-8">
        {/* Header Title Section */}
        <div className="mb-8">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-kulkul-purple-light text-kulkul-purple border border-kulkul-purple/20 text-xs font-bold uppercase tracking-wider mb-3">
            <Sparkles className="w-3.5 h-3.5 text-kulkul-orange" />
            <span>Fast-Track Talent Intake</span>
          </div>
          <h1 className="text-3xl sm:text-4xl font-extrabold text-kulkul-purple tracking-tight">
            LIT 2026 Fellowship Application
          </h1>
          <p className="mt-2 text-base text-slate-600">
            Submit your profile details below to immediately begin your timed logic & architecture assessment.
          </p>
        </div>

        {/* Assessment Overview Card */}
        {program && (
          <div className="mb-8 stitch-card p-6 sm:p-7 bg-white">
            <h2 className="text-base font-bold text-slate-900 mb-3">Candidate Assessment Rules</h2>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-sm">
              <div className="flex items-start gap-3 p-4 bg-slate-50 border border-slate-100 rounded-2xl">
                <Clock className="w-5 h-5 text-kulkul-orange shrink-0 mt-0.5" />
                <div>
                  <div className="font-bold text-slate-900">{program.logic_test_duration_minutes} Minutes</div>
                  <div className="text-slate-500 text-xs mt-0.5">Strict single-session timer</div>
                </div>
              </div>
              <div className="flex items-start gap-3 p-4 bg-slate-50 border border-slate-100 rounded-2xl">
                <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" />
                <div>
                  <div className="font-bold text-slate-900">{program.logic_test_passing_score}% Pass Mark</div>
                  <div className="text-slate-500 text-xs mt-0.5">Automated instant grading</div>
                </div>
              </div>
              <div className="flex items-start gap-3 p-4 bg-slate-50 border border-slate-100 rounded-2xl">
                <FileText className="w-5 h-5 text-kulkul-purple shrink-0 mt-0.5" />
                <div>
                  <div className="font-bold text-slate-900">
                    {program.allow_retake ? 'Retakes Allowed' : '1 Attempt Only'}
                  </div>
                  <div className="text-slate-500 text-xs mt-0.5">Single official submission</div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Application Form Card */}
        <div className="stitch-card bg-white overflow-hidden">
          <div className="px-6 py-5 border-b border-slate-100 bg-slate-50/50">
            <h2 className="text-lg font-bold text-kulkul-purple">Candidate Information</h2>
            <p className="text-sm text-slate-500 mt-0.5">
              Please provide accurate information for reviewer evaluation and interview scheduling.
            </p>
          </div>

          <form onSubmit={handleSubmit} className="p-6 sm:p-8 space-y-6">
            {/* Full Name & Email */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                  Full Name <span className="text-red-500">*</span>
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
                    <UserIcon className="w-4 h-4" />
                  </div>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Jane Doe"
                    value={formData.fullName}
                    onChange={(e) => setFormData({ ...formData, fullName: e.target.value })}
                    className="w-full pl-10 pr-4 py-2.5 text-sm border border-slate-300 rounded-xl focus:border-kulkul-purple focus:ring-2 focus:ring-kulkul-purple-light outline-none transition"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                  Email Address <span className="text-red-500">*</span>
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
                    <Mail className="w-4 h-4" />
                  </div>
                  <input
                    type="email"
                    required
                    placeholder="e.g. jane.doe@example.com"
                    value={formData.email}
                    onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                    className="w-full pl-10 pr-4 py-2.5 text-sm border border-slate-300 rounded-xl focus:border-kulkul-purple focus:ring-2 focus:ring-kulkul-purple-light outline-none transition"
                  />
                </div>
              </div>
            </div>

            {/* Phone & GitHub */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                  Phone Number
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
                    <Phone className="w-4 h-4" />
                  </div>
                  <input
                    type="tel"
                    placeholder="e.g. +62 812-3456-7890"
                    value={formData.phone}
                    onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                    className="w-full pl-10 pr-4 py-2.5 text-sm border border-slate-300 rounded-xl focus:border-kulkul-purple focus:ring-2 focus:ring-kulkul-purple-light outline-none transition"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                  GitHub Profile URL
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
                    <Github className="w-4 h-4" />
                  </div>
                  <input
                    type="url"
                    placeholder="https://github.com/yourhandle"
                    value={formData.githubUrl}
                    onChange={(e) => setFormData({ ...formData, githubUrl: e.target.value })}
                    className="w-full pl-10 pr-4 py-2.5 text-sm border border-slate-300 rounded-xl focus:border-kulkul-purple focus:ring-2 focus:ring-kulkul-purple-light outline-none transition"
                  />
                </div>
              </div>
            </div>

            {/* LinkedIn & Resume */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                  LinkedIn Profile URL
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
                    <Linkedin className="w-4 h-4" />
                  </div>
                  <input
                    type="url"
                    placeholder="https://linkedin.com/in/yourprofile"
                    value={formData.linkedinUrl}
                    onChange={(e) => setFormData({ ...formData, linkedinUrl: e.target.value })}
                    className="w-full pl-10 pr-4 py-2.5 text-sm border border-slate-300 rounded-xl focus:border-kulkul-purple focus:ring-2 focus:ring-kulkul-purple-light outline-none transition"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                  Resume / CV Link
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
                    <FileText className="w-4 h-4" />
                  </div>
                  <input
                    type="url"
                    placeholder="https://drive.google.com/... or portfolio"
                    value={formData.resumeUrl}
                    onChange={(e) => setFormData({ ...formData, resumeUrl: e.target.value })}
                    className="w-full pl-10 pr-4 py-2.5 text-sm border border-slate-300 rounded-xl focus:border-kulkul-purple focus:ring-2 focus:ring-kulkul-purple-light outline-none transition"
                  />
                </div>
              </div>
            </div>

            {/* Additional Notes */}
            <div>
              <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                Notes for Reviewers (Optional)
              </label>
              <textarea
                rows={3}
                placeholder="Highlight your primary stack, years of experience, or key project accomplishments..."
                value={formData.notes}
                onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                className="w-full px-4 py-2.5 text-sm border border-slate-300 rounded-xl focus:border-kulkul-purple focus:ring-2 focus:ring-kulkul-purple-light outline-none transition"
              />
            </div>

            {/* Notice */}
            <div className="p-4 bg-kulkul-orange-light border border-kulkul-orange/20 rounded-2xl flex items-start gap-3 text-slate-800 text-sm">
              <AlertCircle className="w-5 h-5 text-kulkul-orange shrink-0 mt-0.5" />
              <div>
                <span className="font-bold text-kulkul-purple">Strict 1-Attempt Policy:</span> Once you click start, your timed session will begin. You will not be able to retake the test.
              </div>
            </div>

            {/* Submit Action */}
            <div className="pt-2">
              <button
                type="submit"
                disabled={applyMutation.isPending}
                className="w-full flex items-center justify-center gap-2 py-4 px-6 rounded-full text-base font-bold text-white bg-kulkul-orange hover:bg-kulkul-orange-hover shadow-lg transition active:scale-[0.98] disabled:opacity-50"
              >
                {applyMutation.isPending ? (
                  <span>Initializing Assessment Session...</span>
                ) : (
                  <>
                    <span>Submit & Start Assessment ({program?.logic_test_duration_minutes ?? 30} Mins)</span>
                    <ArrowRight className="w-5 h-5" />
                  </>
                )}
              </button>
            </div>
          </form>
        </div>
      </main>
    </div>
  );
};
