import React, { useState, useEffect } from 'react';
import { useNavigate, useLocation, useParams, Link } from 'react-router-dom';
import { useQuery, useMutation } from '@tanstack/react-query';
import { programService } from '@/services/programService';
import { uploadService } from '@/services/uploadService';
import { Navbar } from '@/components/Navbar';
import { Footer } from '@/components/Footer';
import { useAuth } from '@/hooks/useAuth';
import {
  ArrowRight,
  AlertCircle,
  FileText,
  Linkedin,
  Mail,
  User as UserIcon,
  Phone,
  Upload,
  X,
  GraduationCap,
  Camera,
  CheckCircle2,
} from 'lucide-react';
import toast from 'react-hot-toast';

const IT_MAJORS = [
  'Computer Science / Informatics (Ilmu Komputer / Teknik Informatika)',
  'Information Systems (Sistem Informasi)',
  'Software Engineering (Rekayasa Perangkat Lunak)',
  'Computer Engineering (Teknik Komputer / Sistem Komputer)',
  'Information Technology (Teknologi Informasi)',
  'Data Science / Artificial Intelligence (Sains Data / Kecerdasan Buatan)',
  'Cyber Security (Keamanan Siber)',
  'Other IT Major',
];

const FINAL_YEAR_SEMESTERS = [
  'Semester 7 (Final Year)',
  'Semester 8 (Final Year)',
  'Final Year / Thesis Project (Tugas Akhir / Skripsi)',
  'Recent IT Graduate (Within 1 Year)',
];

const REFERRAL_SOURCES = [
  'Referral',
  'LIT Network Social Media',
  'LIT Network Community',
  'Other Community',
];

export const ApplyPage: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const params = useParams<{ orgSlug?: string; programSlug?: string; trackSlug?: string }>();
  const orgSlug = params.orgSlug || 'rsa';
  const programSlug = params.programSlug || 'lit2026';

  const queryParams = new URLSearchParams(location.search);
  const trackSlugFromQuery = queryParams.get('track') || '';
  const initialTrackSlug = params.trackSlug || trackSlugFromQuery || '';

  const [selectedTrackSlug, setSelectedTrackSlug] = useState<string>(initialTrackSlug);

  const [formData, setFormData] = useState({
    firstName: '',
    lastName: '',
    dateOfBirth: '',
    phone: '',
    email: '',
    linkedinUrl: '',
    university: '',
    major: '',
    semester: '',
    chosenCourse: '',
    referralSource: '',
    resumeUrl: '',
    profilePictureUrl: '',
    notes: '',
  });

  const [customMajor, setCustomMajor] = useState('');
  const [resumeFileName, setResumeFileName] = useState('');
  const [resumeFileSize, setResumeFileSize] = useState('');
  const [uploadingResume, setUploadingResume] = useState(false);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [isSubmitted, setIsSubmitted] = useState(false);
  const [submittedData, setSubmittedData] = useState<{
    candidateName: string;
    email: string;
    trackName: string;
    programName: string;
    testToken?: string;
    durationMinutes: number;
  } | null>(null);

  const handleResumeUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 10 * 1024 * 1024) {
      toast.error('Resume file size must be under 10MB');
      return;
    }

    setResumeFileName(file.name);
    setResumeFileSize((file.size / 1024).toFixed(1) + ' KB');
    setUploadingResume(true);

    try {
      const res = await uploadService.uploadFile(file, 'resumes');
      setFormData((prev) => ({ ...prev, resumeUrl: res.url }));
      toast.success('Resume uploaded to Cloudflare R2');
    } catch (err: any) {
      toast.error(err?.response?.data?.error || 'Failed to upload resume to Cloudflare R2');
      setResumeFileName('');
      setResumeFileSize('');
    } finally {
      setUploadingResume(false);
    }
  };

  const handleProfilePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      toast.error('Please select an image file (PNG, JPG, WebP)');
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      toast.error('Profile photo must be under 5MB');
      return;
    }

    setUploadingPhoto(true);
    try {
      const res = await uploadService.uploadFile(file, 'profiles');
      setFormData((prev) => ({ ...prev, profilePictureUrl: res.url }));
      toast.success('Profile photo uploaded to Cloudflare R2');
    } catch (err: any) {
      toast.error(err?.response?.data?.error || 'Failed to upload profile photo to Cloudflare R2');
    } finally {
      setUploadingPhoto(false);
    }
  };

  const handleRemoveResume = () => {
    setResumeFileName('');
    setResumeFileSize('');
    setFormData((prev) => ({ ...prev, resumeUrl: '' }));
  };

  const handleRemoveProfilePhoto = () => {
    setFormData((prev) => ({ ...prev, profilePictureUrl: '' }));
  };

  const { user, isLoading: isAuthLoading } = useAuth();

  const handleGoogleSignIn = () => {
    const apiBase = import.meta.env.VITE_API_BASE_URL || '/api/v1';
    const returnTo = location.pathname + location.search;
    window.location.href = `${apiBase}/auth/oauth/google?return_to=${encodeURIComponent(returnTo)}`;
  };

  // Pre-fill from authenticated user or query params
  useEffect(() => {
    if (user?.email) {
      const nameParts = (user.name || '').trim().split(' ');
      const fName = nameParts[0] || '';
      const lName = nameParts.slice(1).join(' ') || '';
      setFormData((prev) => ({
        ...prev,
        email: user.email,
        firstName: prev.firstName || fName,
        lastName: prev.lastName || lName,
      }));
    } else {
      const emailParam = queryParams.get('email');
      const nameParam = queryParams.get('name');
      if (emailParam || nameParam) {
        const nameParts = (nameParam || '').trim().split(' ');
        const fName = nameParts[0] || '';
        const lName = nameParts.slice(1).join(' ') || '';
        setFormData((prev) => ({
          ...prev,
          email: emailParam || prev.email,
          firstName: fName || prev.firstName,
          lastName: lName || prev.lastName,
        }));
      }
    }
  }, [user, location.search]);

  const { data: programData } = useQuery({
    queryKey: ['program', orgSlug, programSlug],
    queryFn: () => programService.getProgram(orgSlug, programSlug),
  });

  const program = programData?.program;
  const tracks = program?.tracks || [];

  // Sync track selection with available tracks or fallback to general program
  useEffect(() => {
    if (tracks.length > 0) {
      const matched = tracks.find((t) => t.slug === selectedTrackSlug) || tracks[0];
      if (matched) {
        setSelectedTrackSlug(matched.slug);
        setFormData((prev) => ({
          ...prev,
          chosenCourse: prev.chosenCourse && tracks.some((t) => t.name === prev.chosenCourse) ? prev.chosenCourse : matched.name,
        }));
      }
    } else if (program) {
      setSelectedTrackSlug('');
      setFormData((prev) => ({
        ...prev,
        chosenCourse: program.name || 'General Program Track',
      }));
    }
  }, [tracks, program]);

  // Sync course selection with track
  const handleCourseChange = (course: string) => {
    const matched = tracks.find((c) => c.name === course);
    setFormData((prev) => ({ ...prev, chosenCourse: course }));
    if (matched) {
      setSelectedTrackSlug(matched.slug);
    }
  };

  const currentTrack = tracks.find((t) => t.slug === selectedTrackSlug) || (tracks.length > 0 ? tracks[0] : null);
  const enableMCQ = currentTrack ? (currentTrack.enable_mcq ?? true) : (program?.enable_mcq ?? true);
  const enableAI = currentTrack ? (currentTrack.enable_ai_interview ?? true) : (program?.enable_ai_interview ?? true);
  const durationMinutes = currentTrack?.logic_test_duration_minutes || program?.logic_test_duration_minutes || 30;

  const applyMutation = useMutation({
    mutationFn: () => {
      const fullName = `${formData.firstName} ${formData.lastName}`.trim();
      const finalMajor = formData.major.includes('Other') && customMajor.trim()
        ? `Other: ${customMajor.trim()}`
        : formData.major;

      return programService.apply(orgSlug, programSlug, {
        track_slug: selectedTrackSlug,
        chosen_course: formData.chosenCourse,
        first_name: formData.firstName.trim(),
        last_name: formData.lastName.trim(),
        full_name: fullName,
        date_of_birth: formData.dateOfBirth,
        phone: formData.phone.trim(),
        email: formData.email.trim(),
        linkedin_url: formData.linkedinUrl.trim(),
        university: formData.university.trim(),
        major: finalMajor,
        semester: formData.semester,
        referral_source: formData.referralSource,
        resume_url: formData.resumeUrl,
        profile_picture_url: formData.profilePictureUrl,
        notes: formData.notes,
      });
    },
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

      const fullName = `${formData.firstName} ${formData.lastName}`.trim();
      const trackName = formData.chosenCourse || currentTrack?.name || 'Selected Track';
      const programName = program?.name || 'Fellowship Program';

      setSubmittedData({
        candidateName: fullName,
        email: formData.email.trim(),
        trackName,
        programName,
        testToken: res.test_token,
        durationMinutes,
      });
      setIsSubmitted(true);
      toast.success('Application submitted! Test link sent to your email.');
      window.scrollTo({ top: 0, behavior: 'smooth' });
    },
    onError: (err: any) => {
      const msg = err.response?.data?.message || err.message || 'Failed to submit application';
      toast.error(msg);
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    if (!formData.firstName.trim()) {
      toast.error('First Name is mandatory');
      return;
    }
    if (!formData.lastName.trim()) {
      toast.error('Last Name is mandatory');
      return;
    }
    if (!formData.dateOfBirth) {
      toast.error('Date of Birth is mandatory');
      return;
    }
    if (!formData.phone.trim()) {
      toast.error('Phone Number is mandatory');
      return;
    }
    if (!formData.email.trim()) {
      toast.error('Email Address is mandatory');
      return;
    }
    if (!formData.university.trim()) {
      toast.error('University Name is mandatory');
      return;
    }
    if (!formData.major) {
      toast.error('Current Major is mandatory (IT majors only)');
      return;
    }
    if (formData.major.includes('Other') && !customMajor.trim()) {
      toast.error('Please specify your IT major');
      return;
    }
    if (!formData.semester) {
      toast.error('Current Semester is mandatory (Final year)');
      return;
    }
    if (tracks.length > 0 && !formData.chosenCourse) {
      toast.error('Chosen specialization track is mandatory');
      return;
    }
    if (!formData.referralSource) {
      toast.error('Please select how you heard about us');
      return;
    }

    applyMutation.mutate();
  };

  // Loading state while checking authentication
  if (isAuthLoading) {
    return (
      <div className="min-h-screen bg-slate-50 flex flex-col justify-between">
        <Navbar />
        <main className="flex-1 flex items-center justify-center p-4">
          <div className="text-center">
            <div className="w-10 h-10 border-4 border-kulkul-purple/30 border-t-kulkul-purple rounded-full animate-spin mx-auto mb-4" />
            <p className="text-sm font-bold text-kulkul-purple">Verifying candidate session...</p>
          </div>
        </main>
        <Footer />
      </div>
    );
  }

  // Google Sign-In Gate: Candidate must sign in with Google first before accessing the application form
  if (!user?.email) {
    return (
      <div className="min-h-screen bg-slate-50 flex flex-col justify-between">
        <Navbar />

        <main className="flex-1 flex items-center justify-center p-4 sm:p-6 lg:p-8">
          <div className="max-w-xl w-full">
            {/* Main Gate Card */}
            <div className="stitch-card bg-white p-8 sm:p-10 border border-slate-200 shadow-xl rounded-3xl space-y-6 text-center">
              {/* Program & Track Context Badge */}
              <div className="flex flex-col items-center gap-2">
                <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-kulkul-purple-light text-kulkul-purple text-xs font-extrabold uppercase tracking-wide">
                  <GraduationCap className="w-4 h-4 text-kulkul-orange" />
                  <span>Candidate Registration</span>
                </div>
                <h1 className="text-2xl sm:text-3xl font-black text-slate-900 tracking-tight">
                  Apply to {program?.name || 'Fellowship Program'}
                </h1>
                {currentTrack && (
                  <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-amber-50 text-amber-900 border border-amber-200">
                    <span>Selected Track:</span>
                    <span className="font-extrabold text-kulkul-purple">{currentTrack.name}</span>
                  </div>
                )}
                <p className="text-xs sm:text-sm text-slate-500 mt-2 max-w-md mx-auto">
                  Please sign in with your Google account to begin. Your verified Google account connects your application directly to your personal Candidate Dashboard for tracking assessments and AI interviews.
                </p>
              </div>

              {/* Three Simple Steps */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-left pt-2">
                <div className="p-3.5 rounded-2xl bg-purple-50/60 border border-purple-100 flex flex-col justify-between">
                  <div className="w-6 h-6 rounded-full bg-kulkul-purple text-white text-xs font-extrabold flex items-center justify-center mb-2">
                    1
                  </div>
                  <div className="text-xs font-bold text-slate-900">Google Sign-In</div>
                  <div className="text-2xs text-slate-500 mt-0.5">Instant identity & email verification</div>
                </div>

                <div className="p-3.5 rounded-2xl bg-slate-50 border border-slate-100 flex flex-col justify-between">
                  <div className="w-6 h-6 rounded-full bg-slate-200 text-slate-600 text-xs font-extrabold flex items-center justify-center mb-2">
                    2
                  </div>
                  <div className="text-xs font-bold text-slate-900">Fill Application</div>
                  <div className="text-2xs text-slate-500 mt-0.5">Academic info & resume upload</div>
                </div>

                <div className="p-3.5 rounded-2xl bg-slate-50 border border-slate-100 flex flex-col justify-between">
                  <div className="w-6 h-6 rounded-full bg-slate-200 text-slate-600 text-xs font-extrabold flex items-center justify-center mb-2">
                    3
                  </div>
                  <div className="text-xs font-bold text-slate-900">Screening & Tests</div>
                  <div className="text-2xs text-slate-500 mt-0.5">Timed logic test & AI conversation</div>
                </div>
              </div>

              {/* Google OAuth Action Button */}
              <div className="pt-3">
                <button
                  type="button"
                  onClick={handleGoogleSignIn}
                  className="w-full flex items-center justify-center gap-3.5 py-4 px-6 bg-white hover:bg-slate-50 active:scale-[0.98] border-2 border-slate-200 hover:border-kulkul-purple/50 rounded-2xl text-sm sm:text-base font-extrabold text-slate-800 shadow-md hover:shadow-lg transition duration-150"
                >
                  <svg className="w-5 h-5 shrink-0" viewBox="0 0 24 24">
                    <path
                      fill="#4285F4"
                      d="M23.745 12.27c0-.7-.06-1.4-.19-2.07H12v4.51h6.6c-.29 1.52-1.14 2.82-2.4 3.68v3.05h3.88c2.27-2.09 3.665-5.17 3.665-9.17z"
                    />
                    <path
                      fill="#34A853"
                      d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.88-3.05c-1.08.72-2.45 1.16-4.05 1.16-3.12 0-5.77-2.1-6.72-4.93H1.25v3.15C3.26 21.36 7.33 24 12 24z"
                    />
                    <path
                      fill="#FBBC05"
                      d="M5.28 14.27c-.25-.72-.38-1.49-.38-2.27s.13-1.55.38-2.27V6.58H1.25C.45 8.18 0 9.99 0 12s.45 3.82 1.25 5.42l4.03-3.15z"
                    />
                    <path
                      fill="#EA4335"
                      d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.33 0 3.26 2.64 1.25 6.58l4.03 3.15c.95-2.83 3.6-4.98 6.72-4.98z"
                    />
                  </svg>
                  <span>Continue with Google to Begin Application</span>
                </button>
              </div>

              {/* Footer navigation */}
              <div className="pt-2 border-t border-slate-100 flex flex-col sm:flex-row items-center justify-between text-xs text-slate-500 gap-2">
                <Link
                  to={`/programs/${orgSlug}/${programSlug}`}
                  className="font-bold text-kulkul-purple hover:underline"
                >
                  &larr; Back to Program Overview
                </Link>
                <span>No password required &middot; Fast 1-click sign-in</span>
              </div>
            </div>
          </div>
        </main>

        <Footer />
      </div>
    );
  }

  if (isSubmitted && submittedData) {
    return (
      <div className="min-h-screen bg-slate-50 flex flex-col justify-between selection:bg-kulkul-orange/20 selection:text-kulkul-purple">
        <Navbar />

        <main className="flex-1 flex items-center justify-center p-4 sm:p-6 lg:p-8">
          <div className="max-w-2xl w-full">
            <div className="stitch-card bg-white p-8 sm:p-12 text-center border border-slate-200 shadow-xl rounded-3xl space-y-6 animate-in fade-in zoom-in duration-300">
              <div className="w-16 h-16 rounded-full bg-emerald-50 border border-emerald-200 text-emerald-600 flex items-center justify-center mx-auto shadow-2xs">
                <CheckCircle2 className="w-8 h-8" />
              </div>

              <div>
                <span className="px-3.5 py-1 rounded-full bg-emerald-100 text-emerald-800 text-xs font-bold uppercase tracking-wider">
                  Registration Received
                </span>
                <h1 className="text-2xl sm:text-3xl font-black text-slate-900 mt-4 tracking-tight">
                  Thank You for Applying, {submittedData.candidateName}!
                </h1>
                <p className="text-slate-600 text-sm sm:text-base mt-2 max-w-lg mx-auto leading-relaxed">
                  Your application for <span className="font-bold text-slate-900">{submittedData.programName} &mdash; {submittedData.trackName}</span> has been successfully recorded.
                </p>
              </div>

              {/* Email Notification Highlight Box */}
              <div className="p-6 rounded-2xl bg-purple-50/70 border border-purple-200/80 text-left space-y-3">
                <div className="flex items-center gap-2.5 text-kulkul-purple font-bold text-sm sm:text-base">
                  <Mail className="w-5 h-5 text-kulkul-purple shrink-0" />
                  <span>Unique Logic Assessment Link Sent via Email</span>
                </div>
                <p className="text-xs sm:text-sm text-slate-600 leading-relaxed">
                  We have dispatched your unique assessment invitation and instructions to{' '}
                  <span className="font-bold text-slate-900">{submittedData.email}</span>.
                </p>
                <div className="pt-2 border-t border-purple-100 flex flex-wrap items-center gap-4 text-xs text-slate-500 font-medium">
                  <div className="flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-kulkul-purple" />
                    <span>Duration: {submittedData.durationMinutes} Minutes</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-emerald-500" />
                    <span>Passing Score: {currentTrack?.logic_test_passing_score || program?.logic_test_passing_score || 70}%</span>
                  </div>
                </div>
              </div>

              <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200 text-xs text-slate-500 text-left">
                <p className="font-medium text-slate-700 mb-1">Important details:</p>
                <ul className="list-disc list-inside space-y-1 text-slate-600">
                  <li>Find a quiet, distraction-free environment with a reliable internet connection.</li>
                  <li>Check your Spam or Promotions tab if the email doesn't appear in your inbox within a few minutes.</li>
                  <li>You can track your application status anytime on your Candidate Dashboard.</li>
                </ul>
              </div>

              {/* Action Buttons */}
              <div className="pt-4 flex flex-col sm:flex-row items-center justify-center gap-3">
                <button
                  onClick={() => navigate('/candidate/dashboard')}
                  className="w-full sm:w-auto px-8 py-3.5 rounded-full bg-kulkul-purple hover:bg-kulkul-purple-hover text-white text-sm font-bold shadow-sm hover:shadow transition active:scale-[0.98] flex items-center justify-center gap-2"
                >
                  <span>Go to Candidate Dashboard</span>
                  <ArrowRight className="w-4 h-4" />
                </button>
                {submittedData.testToken && (
                  <button
                    onClick={() => navigate(`/lit2026/test/${submittedData.testToken}`)}
                    className="w-full sm:w-auto px-8 py-3.5 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-700 text-sm font-bold transition text-center"
                  >
                    Start Assessment Now
                  </button>
                )}
              </div>
            </div>
          </div>
        </main>

        <Footer />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">
      <Navbar />

      <main className="flex-1 flex items-center justify-center p-4 sm:p-6 lg:p-8">
        <div className="max-w-2xl w-full">
          {/* Header Card */}
          <div className="stitch-card p-6 sm:p-8 mb-6 bg-white shadow-sm border border-slate-100">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 sm:gap-4">
              <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight">
                Candidate Intake Form
              </h1>

              <Link
                to={`/programs/${orgSlug}/${programSlug}`}
                className="text-xs font-bold text-kulkul-purple hover:underline shrink-0"
              >
                &larr; Program Overview
              </Link>
            </div>
          </div>

          {/* Form Card */}
          <form onSubmit={handleSubmit} className="stitch-card p-6 sm:p-8 bg-white space-y-6 shadow-sm border border-slate-100">
            <div className="space-y-5">
              {/* Section: Personal Info */}
              <div className="border-b border-slate-100 pb-2">
                <h2 className="text-xs font-bold uppercase tracking-wider text-kulkul-purple">Personal Details</h2>
              </div>

              {/* First Name & Last Name */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-1.5">
                    First Name <span className="text-red-500">*</span>
                  </label>
                  <div className="relative">
                    <UserIcon className="w-4 h-4 text-slate-400 absolute left-4 top-1/2 -translate-y-1/2" />
                    <input
                      type="text"
                      required
                      value={formData.firstName}
                      onChange={(e) => setFormData({ ...formData, firstName: e.target.value })}
                      placeholder="e.g. Jane"
                      className="w-full pl-11 pr-4 py-3 rounded-xl border border-slate-200 text-sm focus:outline-none focus:border-kulkul-purple focus:ring-2 focus:ring-kulkul-purple/20 transition"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-1.5">
                    Last Name <span className="text-red-500">*</span>
                  </label>
                  <div className="relative">
                    <UserIcon className="w-4 h-4 text-slate-400 absolute left-4 top-1/2 -translate-y-1/2" />
                    <input
                      type="text"
                      required
                      value={formData.lastName}
                      onChange={(e) => setFormData({ ...formData, lastName: e.target.value })}
                      placeholder="e.g. Doe"
                      className="w-full pl-11 pr-4 py-3 rounded-xl border border-slate-200 text-sm focus:outline-none focus:border-kulkul-purple focus:ring-2 focus:ring-kulkul-purple/20 transition"
                    />
                  </div>
                </div>
              </div>

              {/* Date of Birth & Phone Number */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-1.5">
                    Date of Birth <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="date"
                    required
                    value={formData.dateOfBirth}
                    onChange={(e) => setFormData({ ...formData, dateOfBirth: e.target.value })}
                    className="w-full px-4 py-3 rounded-xl border border-slate-200 text-sm focus:outline-none focus:border-kulkul-purple focus:ring-2 focus:ring-kulkul-purple/20 transition bg-white"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-1.5">
                    Phone Number <span className="text-red-500">*</span>
                  </label>
                  <div className="relative">
                    <Phone className="w-4 h-4 text-slate-400 absolute left-4 top-1/2 -translate-y-1/2" />
                    <input
                      type="tel"
                      required
                      value={formData.phone}
                      onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                      placeholder="e.g. +62 812-3456-7890"
                      className="w-full pl-11 pr-4 py-3 rounded-xl border border-slate-200 text-sm focus:outline-none focus:border-kulkul-purple focus:ring-2 focus:ring-kulkul-purple/20 transition"
                    />
                  </div>
                </div>
              </div>

              {/* Email Address (Locked & Verified via Google) */}
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-1.5">
                  Email Address <span className="text-red-500">*</span>
                </label>
                <div className="relative">
                  <Mail className="w-4 h-4 text-slate-400 absolute left-4 top-1/2 -translate-y-1/2" />
                  <input
                    type="email"
                    required
                    readOnly
                    value={formData.email}
                    className="w-full pl-11 pr-36 py-3 rounded-xl border border-slate-200 bg-slate-50/90 text-sm font-semibold text-slate-800 cursor-not-allowed select-none focus:outline-none"
                    placeholder="candidate@example.com"
                  />
                  <div className="absolute right-3 top-1/2 -translate-y-1/2 inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-100 text-emerald-800 text-xs font-bold border border-emerald-200">
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                    <span>Verified Google</span>
                  </div>
                </div>
                <p className="text-2xs text-slate-500 mt-1 pl-1 font-medium">
                  Verified with your Google account. All assessments, invitations, and scorecards are synced with your Candidate Dashboard.
                </p>
              </div>

              {/* LinkedIn Profile URL (Optional) */}
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-1.5">
                  LinkedIn Profile URL <span className="text-xs font-normal text-slate-400 lowercase">(not mandatory)</span>
                </label>
                <div className="relative">
                  <Linkedin className="w-4 h-4 text-slate-400 absolute left-4 top-1/2 -translate-y-1/2" />
                  <input
                    type="url"
                    value={formData.linkedinUrl}
                    onChange={(e) => setFormData({ ...formData, linkedinUrl: e.target.value })}
                    placeholder="https://linkedin.com/in/yourname"
                    className="w-full pl-11 pr-4 py-3 rounded-xl border border-slate-200 text-sm focus:outline-none focus:border-kulkul-purple focus:ring-2 focus:ring-kulkul-purple/20 transition"
                  />
                </div>
              </div>

              {/* Section: Academic Background */}
              <div className="border-b border-slate-100 pb-2 pt-3">
                <h2 className="text-xs font-bold uppercase tracking-wider text-kulkul-purple">Academic Background</h2>
              </div>

              {/* University Name */}
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-1.5">
                  University Name <span className="text-red-500">*</span>
                </label>
                <div className="relative">
                  <GraduationCap className="w-4 h-4 text-slate-400 absolute left-4 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    required
                    value={formData.university}
                    onChange={(e) => setFormData({ ...formData, university: e.target.value })}
                    placeholder="e.g. Universitas Indonesia / ITB / Telkom University"
                    className="w-full pl-11 pr-4 py-3 rounded-xl border border-slate-200 text-sm focus:outline-none focus:border-kulkul-purple focus:ring-2 focus:ring-kulkul-purple/20 transition"
                  />
                </div>
              </div>

              {/* Current Major (Only IT majors) & Current Semester (Only final year) */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-1.5">
                    Current Major <span className="text-red-500">*</span> <span className="text-2xs font-normal text-kulkul-purple lowercase">(IT majors only)</span>
                  </label>
                  <select
                    required
                    value={formData.major}
                    onChange={(e) => setFormData({ ...formData, major: e.target.value })}
                    className="w-full px-4 py-3 rounded-xl border border-slate-200 text-xs sm:text-sm focus:outline-none focus:border-kulkul-purple focus:ring-2 focus:ring-kulkul-purple/20 transition bg-white text-slate-900"
                  >
                    <option value="" disabled>Select your IT major</option>
                    {IT_MAJORS.map((m) => (
                      <option key={m} value={m}>{m}</option>
                    ))}
                  </select>

                  {/* Specific Major Input if Other is selected */}
                  {formData.major.includes('Other') && (
                    <div className="mt-3">
                      <label className="block text-2xs font-bold uppercase tracking-wider text-slate-600 mb-1">
                        Specific IT Major Name <span className="text-red-500">*</span>
                      </label>
                      <input
                        type="text"
                        required
                        value={customMajor}
                        onChange={(e) => setCustomMajor(e.target.value)}
                        placeholder="e.g. Game Development / Bio-informatics / Network Security"
                        className="w-full px-4 py-2.5 rounded-xl border border-slate-200 text-xs sm:text-sm focus:outline-none focus:border-kulkul-purple focus:ring-2 focus:ring-kulkul-purple/20 transition bg-slate-50/70"
                      />
                    </div>
                  )}
                </div>

                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-1.5">
                    Current Semester <span className="text-red-500">*</span> <span className="text-2xs font-normal text-kulkul-purple lowercase">(final year only)</span>
                  </label>
                  <select
                    required
                    value={formData.semester}
                    onChange={(e) => setFormData({ ...formData, semester: e.target.value })}
                    className="w-full px-4 py-3 rounded-xl border border-slate-200 text-xs sm:text-sm focus:outline-none focus:border-kulkul-purple focus:ring-2 focus:ring-kulkul-purple/20 transition bg-white text-slate-900"
                  >
                    <option value="" disabled>Select your semester status</option>
                    {FINAL_YEAR_SEMESTERS.map((s) => (
                      <option key={s} value={s}>{s}</option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Section: Specialization Track (Optional / Only if tracks configured) */}
              {tracks.length > 0 && (
                <>
                  <div className="border-b border-slate-100 pb-2 pt-3">
                    <h2 className="text-xs font-bold uppercase tracking-wider text-kulkul-purple">Specialization Track</h2>
                  </div>

                  <div>
                    <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-1.5">
                      Chosen Specialization Track <span className="text-red-500">*</span>
                    </label>
                    <select
                      required
                      value={formData.chosenCourse}
                      onChange={(e) => handleCourseChange(e.target.value)}
                      className="w-full px-4 py-3 rounded-xl border border-slate-200 text-sm focus:outline-none focus:border-kulkul-purple focus:ring-2 focus:ring-kulkul-purple/20 transition bg-white font-semibold text-slate-900"
                    >
                      <option value="" disabled>Select specialization track</option>
                      {tracks.map((t) => (
                        <option key={t.slug || t.id} value={t.name}>{t.name}</option>
                      ))}
                    </select>
                    <p className="text-2xs text-slate-400 mt-1 pl-1">
                      Your logic and technical questions will be calibrated for the chosen track.
                    </p>
                  </div>
                </>
              )}

              {/* How do you hear about us? */}
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-1.5">
                  How did you hear about us? <span className="text-red-500">*</span>
                </label>
                <select
                  required
                  value={formData.referralSource}
                  onChange={(e) => setFormData({ ...formData, referralSource: e.target.value })}
                  className="w-full px-4 py-3 rounded-xl border border-slate-200 text-sm focus:outline-none focus:border-kulkul-purple focus:ring-2 focus:ring-kulkul-purple/20 transition bg-white text-slate-900"
                >
                  <option value="" disabled>Choose one option</option>
                  {REFERRAL_SOURCES.map((r) => (
                    <option key={r} value={r}>{r}</option>
                  ))}
                </select>
              </div>

              {/* Profile Photo Upload */}
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-1.5">
                  Candidate Profile Photo <span className="text-xs font-normal text-slate-400 lowercase">(optional)</span>
                </label>
                {uploadingPhoto ? (
                  <div className="p-4 rounded-xl bg-purple-50/50 border border-purple-200 flex items-center justify-center gap-2 animate-pulse">
                    <div className="w-5 h-5 rounded-full border-2 border-kulkul-purple border-t-transparent animate-spin" />
                    <span className="text-xs font-bold text-kulkul-purple">Uploading photo to Cloudflare R2...</span>
                  </div>
                ) : formData.profilePictureUrl ? (
                  <div className="flex items-center justify-between p-3 px-4 rounded-xl bg-slate-50 border border-slate-200">
                    <div className="flex items-center gap-3">
                      <img
                        src={formData.profilePictureUrl}
                        alt="Profile avatar"
                        className="w-10 h-10 rounded-full object-cover border border-slate-200"
                      />
                      <div>
                        <div className="text-xs font-bold text-slate-900">Profile Photo</div>
                        <div className="text-2xs text-emerald-600 font-semibold">Stored on Cloudflare R2</div>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={handleRemoveProfilePhoto}
                      className="p-1.5 rounded-full hover:bg-slate-200 text-slate-400 hover:text-slate-600 transition"
                      title="Remove photo"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                ) : (
                  <label className="border-2 border-dashed border-slate-200 hover:border-kulkul-purple/50 rounded-xl p-4 flex items-center justify-center gap-3 cursor-pointer transition bg-slate-50/50 hover:bg-slate-50 group">
                    <Camera className="w-5 h-5 text-slate-400 group-hover:text-kulkul-purple transition" />
                    <div className="text-left">
                      <div className="text-xs font-bold text-slate-700 group-hover:text-kulkul-purple transition">
                        Click to upload profile photo
                      </div>
                      <div className="text-2xs text-slate-400">JPG, PNG, WebP up to 5MB (Cloudflare R2)</div>
                    </div>
                    <input
                      type="file"
                      accept="image/png, image/jpeg, image/webp"
                      onChange={handleProfilePhotoUpload}
                      className="hidden"
                    />
                  </label>
                )}
              </div>

              {/* Resume File Upload (Optional) */}
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-1.5">
                  Resume / CV <span className="text-xs font-normal text-slate-400 lowercase">(file upload)</span>
                </label>
                {uploadingResume ? (
                  <div className="p-5 rounded-xl bg-purple-50/50 border border-purple-200 flex flex-col items-center justify-center gap-2 animate-pulse">
                    <div className="w-6 h-6 rounded-full border-2 border-kulkul-purple border-t-transparent animate-spin" />
                    <span className="text-xs font-bold text-kulkul-purple">Uploading resume to Cloudflare R2...</span>
                  </div>
                ) : formData.resumeUrl ? (
                  <div className="flex items-center justify-between p-3.5 px-4 rounded-xl bg-kulkul-purple/5 border border-kulkul-purple/20">
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 rounded-xl bg-kulkul-purple/10 flex items-center justify-center text-kulkul-purple font-bold">
                        <FileText className="w-5 h-5" />
                      </div>
                      <div>
                        <div className="text-xs font-bold text-slate-900 line-clamp-1">{resumeFileName || 'Resume.pdf'}</div>
                        <div className="text-2xs text-emerald-600 font-semibold">{resumeFileSize ? `${resumeFileSize} • Stored on Cloudflare R2` : 'Stored on Cloudflare R2'}</div>
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
                  <label className="border-2 border-dashed border-slate-200 hover:border-kulkul-purple/50 rounded-xl p-5 flex flex-col items-center justify-center cursor-pointer transition bg-slate-50/50 hover:bg-slate-50 group">
                    <Upload className="w-6 h-6 text-slate-400 group-hover:text-kulkul-purple transition mb-1.5" />
                    <span className="text-xs font-bold text-slate-700 group-hover:text-kulkul-purple transition">
                      Click to upload Resume / CV
                    </span>
                    <span className="text-2xs text-slate-400 mt-0.5">PDF up to 10MB (Cloudflare R2)</span>
                    <input
                      type="file"
                      accept=".pdf,application/pdf"
                      onChange={handleResumeUpload}
                      className="hidden"
                    />
                  </label>
                )}
              </div>
            </div>

            {/* Terms / Notice */}
            <div className="p-4 rounded-xl bg-slate-50 border border-slate-100 flex items-start gap-3">
              <AlertCircle className="w-4 h-4 text-kulkul-orange shrink-0 mt-0.5" />
              <p className="text-2xs text-slate-600 leading-relaxed">
                {enableMCQ ? (
                  `By submitting this application, you will be redirected immediately into the timed ${durationMinutes}-minute logic test. Ensure a stable internet connection.`
                ) : enableAI ? (
                  'By submitting this application, you will proceed directly to the conversational AI Technical Screening. Please ensure a quiet environment with a working microphone and camera.'
                ) : (
                  'By submitting this application, your profile will be sent directly to the admissions committee for review.'
                )}
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
                  <span>Submitting Application...</span>
                </div>
              ) : (
                <>
                  <span>
                    {enableMCQ
                      ? `Begin ${formData.chosenCourse && tracks.length > 0 ? `${formData.chosenCourse} Assessment` : 'Logic & Technical Assessment'}`
                      : enableAI
                      ? 'Submit & Begin AI Technical Screen'
                      : 'Submit Application'}
                  </span>
                  <ArrowRight className="w-5 h-5" />
                </>
              )}
            </button>
          </form>
        </div>
      </main>
      <Footer />
    </div>
  );
};
