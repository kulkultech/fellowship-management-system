import React, { useState, useEffect } from 'react';
import { useNavigate, useLocation, useParams, Link } from 'react-router-dom';
import { useQuery, useMutation } from '@tanstack/react-query';
import { programService } from '@/services/programService';
import { Navbar } from '@/components/Navbar';
import { Footer } from '@/components/Footer';
import {
  ArrowRight,
  Clock,
  AlertCircle,
  FileText,
  Linkedin,
  Mail,
  User as UserIcon,
  Phone,
  CheckCircle2,
  Upload,
  X,
  Layers,
  Award,
  Calendar,
  GraduationCap,
  BookOpen,
  Share2,
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
  'Other IT / Computing Major',
];

const FINAL_YEAR_SEMESTERS = [
  'Semester 7 (Final Year)',
  'Semester 8 (Final Year)',
  'Final Year / Thesis Project (Tugas Akhir / Skripsi)',
  'Recent IT Graduate (Within 1 Year)',
];

const SCHOLARSHIP_COURSES = [
  { label: 'Full Stack Developer', value: 'Full Stack Developer', trackSlug: 'fullstack' },
  { label: 'QA Automation', value: 'QA Automation', trackSlug: 'qa-automation' },
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
  const initialTrackSlug = params.trackSlug || trackSlugFromQuery || 'fullstack';

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
    chosenCourse: initialTrackSlug === 'qa-automation' ? 'QA Automation' : 'Full Stack Developer',
    referralSource: '',
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
  }, [location.search]);

  // Sync course selection with track
  const handleCourseChange = (course: string) => {
    const matched = SCHOLARSHIP_COURSES.find((c) => c.value === course);
    setFormData((prev) => ({ ...prev, chosenCourse: course }));
    if (matched) {
      setSelectedTrackSlug(matched.trackSlug);
    }
  };

  const { data: programData } = useQuery({
    queryKey: ['program', orgSlug, programSlug],
    queryFn: () => programService.getProgram(orgSlug, programSlug),
  });

  const program = programData?.program;
  const org = programData?.organization;
  const tracks = program?.tracks || [];

  const currentTrack = tracks.find((t) => t.slug === selectedTrackSlug) || tracks[0];

  const durationMinutes = currentTrack?.logic_test_duration_minutes || program?.logic_test_duration_minutes || 35;
  const passingScore = currentTrack?.logic_test_passing_score || program?.logic_test_passing_score || 70;

  const applyMutation = useMutation({
    mutationFn: () => {
      const fullName = `${formData.firstName} ${formData.lastName}`.trim();
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
        major: formData.major,
        semester: formData.semester,
        referral_source: formData.referralSource,
        resume_url: formData.resumeUrl,
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
    if (!formData.semester) {
      toast.error('Current Semester is mandatory (Final year)');
      return;
    }
    if (!formData.chosenCourse) {
      toast.error('Chosen course for the scholarship is mandatory');
      return;
    }
    if (!formData.referralSource) {
      toast.error('Please select how you heard about us');
      return;
    }

    applyMutation.mutate();
  };

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">
      <Navbar
        title="FellowHire"
        subtitle={`${org?.name || 'Remote Skills Academy'} &middot; Scholarship Application`}
      />

      <main className="flex-1 flex items-center justify-center p-4 sm:p-6 lg:p-8">
        <div className="max-w-2xl w-full">
          {/* Header Card */}
          <div className="stitch-card p-6 sm:p-8 mb-6 bg-white shadow-sm border border-slate-100">
            <div className="flex items-center justify-between gap-4 mb-3">
              <span className="px-3 py-1 bg-kulkul-purple-light text-kulkul-purple text-xs font-extrabold rounded-full flex items-center gap-1.5">
                <Layers className="w-3.5 h-3.5" />
                {program?.name || 'LIT 2026 Fellowship'}
              </span>

              <Link
                to={`/programs/${orgSlug}/${programSlug}`}
                className="text-xs font-bold text-kulkul-purple hover:underline"
              >
                &larr; Program Overview
              </Link>
            </div>

            <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight">
              Candidate Intake Form
            </h1>
            <p className="text-slate-600 text-sm mt-1">
              Please complete all mandatory questions below to initiate your scholarship assessment.
            </p>

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
                  <div className="relative">
                    <Calendar className="w-4 h-4 text-slate-400 absolute left-4 top-1/2 -translate-y-1/2 pointer-events-none" />
                    <input
                      type="date"
                      required
                      value={formData.dateOfBirth}
                      onChange={(e) => setFormData({ ...formData, dateOfBirth: e.target.value })}
                      className="w-full pl-11 pr-4 py-3 rounded-xl border border-slate-200 text-sm focus:outline-none focus:border-kulkul-purple focus:ring-2 focus:ring-kulkul-purple/20 transition bg-white"
                    />
                  </div>
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
                    placeholder="e.g. jane.doe@university.ac.id"
                    className="w-full pl-11 pr-4 py-3 rounded-xl border border-slate-200 text-sm focus:outline-none focus:border-kulkul-purple focus:ring-2 focus:ring-kulkul-purple/20 transition"
                  />
                </div>
                <p className="text-2xs text-slate-400 mt-1 pl-1">
                  Test link and evaluation updates will be dispatched to this email.
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
                  <div className="relative">
                    <BookOpen className="w-4 h-4 text-slate-400 absolute left-4 top-1/2 -translate-y-1/2 pointer-events-none" />
                    <select
                      required
                      value={formData.major}
                      onChange={(e) => setFormData({ ...formData, major: e.target.value })}
                      className="w-full pl-11 pr-8 py-3 rounded-xl border border-slate-200 text-xs sm:text-sm focus:outline-none focus:border-kulkul-purple focus:ring-2 focus:ring-kulkul-purple/20 transition bg-white"
                    >
                      <option value="" disabled>Select your IT major</option>
                      {IT_MAJORS.map((m) => (
                        <option key={m} value={m}>{m}</option>
                      ))}
                    </select>
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-1.5">
                    Current Semester <span className="text-red-500">*</span> <span className="text-2xs font-normal text-kulkul-purple lowercase">(final year only)</span>
                  </label>
                  <div className="relative">
                    <GraduationCap className="w-4 h-4 text-slate-400 absolute left-4 top-1/2 -translate-y-1/2 pointer-events-none" />
                    <select
                      required
                      value={formData.semester}
                      onChange={(e) => setFormData({ ...formData, semester: e.target.value })}
                      className="w-full pl-11 pr-8 py-3 rounded-xl border border-slate-200 text-xs sm:text-sm focus:outline-none focus:border-kulkul-purple focus:ring-2 focus:ring-kulkul-purple/20 transition bg-white"
                    >
                      <option value="" disabled>Select your semester status</option>
                      {FINAL_YEAR_SEMESTERS.map((s) => (
                        <option key={s} value={s}>{s}</option>
                      ))}
                    </select>
                  </div>
                </div>
              </div>

              {/* Section: Scholarship & Program Preferences */}
              <div className="border-b border-slate-100 pb-2 pt-3">
                <h2 className="text-xs font-bold uppercase tracking-wider text-kulkul-purple">Scholarship & Program Details</h2>
              </div>

              {/* Chosen course for the scholarship */}
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-1.5">
                  Chosen Course for the Scholarship <span className="text-red-500">*</span>
                </label>
                <div className="relative">
                  <Award className="w-4 h-4 text-slate-400 absolute left-4 top-1/2 -translate-y-1/2 pointer-events-none" />
                  <select
                    required
                    value={formData.chosenCourse}
                    onChange={(e) => handleCourseChange(e.target.value)}
                    className="w-full pl-11 pr-8 py-3 rounded-xl border border-slate-200 text-sm focus:outline-none focus:border-kulkul-purple focus:ring-2 focus:ring-kulkul-purple/20 transition bg-white font-semibold text-slate-900"
                  >
                    <option value="" disabled>Select scholarship course</option>
                    {SCHOLARSHIP_COURSES.map((c) => (
                      <option key={c.value} value={c.value}>{c.label}</option>
                    ))}
                  </select>
                </div>
                <p className="text-2xs text-slate-400 mt-1 pl-1">
                  Your logic and technical questions will be calibrated for the chosen track.
                </p>
              </div>

              {/* How do you hear about us? */}
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-1.5">
                  How did you hear about us? <span className="text-red-500">*</span>
                </label>
                <div className="relative">
                  <Share2 className="w-4 h-4 text-slate-400 absolute left-4 top-1/2 -translate-y-1/2 pointer-events-none" />
                  <select
                    required
                    value={formData.referralSource}
                    onChange={(e) => setFormData({ ...formData, referralSource: e.target.value })}
                    className="w-full pl-11 pr-8 py-3 rounded-xl border border-slate-200 text-sm focus:outline-none focus:border-kulkul-purple focus:ring-2 focus:ring-kulkul-purple/20 transition bg-white"
                  >
                    <option value="" disabled>Choose one option</option>
                    {REFERRAL_SOURCES.map((r) => (
                      <option key={r} value={r}>{r}</option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Resume File Upload (Optional) */}
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-1.5">
                  Resume / CV <span className="text-xs font-normal text-slate-400 lowercase">(file upload)</span>
                </label>
                {formData.resumeUrl ? (
                  <div className="flex items-center justify-between p-3.5 px-4 rounded-xl bg-kulkul-purple/5 border border-kulkul-purple/20">
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
                  <label className="border-2 border-dashed border-slate-200 hover:border-kulkul-purple/50 rounded-xl p-5 flex flex-col items-center justify-center cursor-pointer transition bg-slate-50/50 hover:bg-slate-50 group">
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
            </div>

            {/* Terms / Notice */}
            <div className="p-4 rounded-xl bg-slate-50 border border-slate-100 flex items-start gap-3">
              <AlertCircle className="w-4 h-4 text-kulkul-orange shrink-0 mt-0.5" />
              <p className="text-2xs text-slate-600 leading-relaxed">
                By submitting this application, you will be redirected immediately into the timed {durationMinutes}-minute {formData.chosenCourse || 'logic'} test. Ensure a stable internet connection.
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
                  <span>Begin {formData.chosenCourse || 'Fellowship'} Assessment</span>
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
