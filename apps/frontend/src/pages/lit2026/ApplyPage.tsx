import React, { useState, useEffect } from 'react';
import { useNavigate, useLocation, useParams, Link } from 'react-router-dom';
import { useQuery, useMutation } from '@tanstack/react-query';
import { programService } from '@/services/programService';
import { uploadService } from '@/services/uploadService';
import { Navbar } from '@/components/Navbar';
import { Footer } from '@/components/Footer';
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

      if (res.stage === 'registered') {
        toast.success(res.message || 'Application submitted successfully!');
        navigate(`/programs/${orgSlug}/${programSlug}`);
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
