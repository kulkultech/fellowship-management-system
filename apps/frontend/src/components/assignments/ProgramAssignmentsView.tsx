import React, { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { assignmentService } from '@/services/assignmentService';
import { uploadService } from '@/services/uploadService';
import { mentorService } from '@/services/mentorService';
import type {
  ProgramAssignment,
  AssignmentSubmission,
  CreateAssignmentPayload,
  AssignmentStatus,
} from '@/services/types';
import {
  FileText,
  UploadCloud,
  CheckCircle2,
  Clock,
  AlertCircle,
  ExternalLink,
  Award,
  Trash2,
  Edit3,
  Loader2,
  Download,
  Github,
  MessageSquare,
  Users,
  User,
  UserCheck,
  Search,
  Check,
  X,
  Plus,
  FileCheck,
} from 'lucide-react';
import toast from 'react-hot-toast';

interface ProgramAssignmentsViewProps {
  programId: string;
  isMentorOrAdmin: boolean;
  tracks?: Array<{ id: string; name: string }>;
  candidateTrackId?: string;
  userRole?: string;
}

export const ProgramAssignmentsView: React.FC<ProgramAssignmentsViewProps> = ({
  programId,
  isMentorOrAdmin,
  tracks = [],
}) => {
  const queryClient = useQueryClient();
  const [selectedTrackFilter, setSelectedTrackFilter] = useState<string>('all');

  // Modal States
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [editingAssignment, setEditingAssignment] = useState<ProgramAssignment | null>(null);

  // Submissions review drawer / modal for Mentors
  const [reviewAssignment, setReviewAssignment] = useState<ProgramAssignment | null>(null);

  // Candidate Submission Modal
  const [submitModalAssignment, setSubmitModalAssignment] = useState<ProgramAssignment | null>(null);

  // 1. Fetch Assignments
  const {
    data: assignments = [],
    isLoading,
  } = useQuery({
    queryKey: ['program-assignments', programId, selectedTrackFilter],
    queryFn: () =>
      assignmentService.listAssignments(
        programId,
        selectedTrackFilter !== 'all' ? selectedTrackFilter : undefined
      ),
    enabled: Boolean(programId),
  });

  // Calculate fellow personal stats
  const fellowStats = useMemo(() => {
    if (isMentorOrAdmin || assignments.length === 0) return null;
    const total = assignments.length;
    let submitted = 0;
    let graded = 0;
    let totalScore = 0;
    let maxPossible = 0;

    assignments.forEach((a) => {
      if (a.my_submission) {
        submitted++;
        if (a.my_submission.score != null) {
          graded++;
          totalScore += a.my_submission.score;
          maxPossible += a.max_score || 100;
        }
      }
    });

    const completionRate = Math.round((submitted / total) * 100);
    const avgScore = graded > 0 && maxPossible > 0 ? Math.round((totalScore / maxPossible) * 100) : null;
    return { total, submitted, graded, completionRate, avgScore };
  }, [assignments, isMentorOrAdmin]);

  // Delete Mutation
  const deleteMutation = useMutation({
    mutationFn: (assignmentId: string) =>
      assignmentService.deleteAssignment(programId, assignmentId),
    onSuccess: () => {
      toast.success('Assignment deleted successfully');
      queryClient.invalidateQueries({ queryKey: ['program-assignments', programId] });
    },
    onError: (err: any) => {
      toast.error(err?.response?.data?.error || err.message || 'Failed to delete assignment');
    },
  });

  const handleDelete = (assignment: ProgramAssignment) => {
    if (window.confirm(`Are you sure you want to delete assignment "${assignment.title}"?`)) {
      deleteMutation.mutate(assignment.id);
    }
  };

  return (
    <div className="space-y-6">
      {/* Fellow Progress Summary Card */}
      {fellowStats && (
        <div className="bg-white rounded-3xl p-6 border border-slate-200 shadow-2xs flex flex-col sm:flex-row sm:items-center justify-between gap-6">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <span className="text-2xs font-extrabold uppercase text-slate-500 tracking-wider">
                Assignment Completion Status
              </span>
              <span
                className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-3xs font-extrabold uppercase tracking-wider ${
                  fellowStats.completionRate >= 100
                    ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                    : fellowStats.completionRate >= 50
                    ? 'bg-purple-50 text-kulkul-purple border border-purple-200'
                    : 'bg-amber-50 text-amber-700 border border-amber-200'
                }`}
              >
                <FileCheck className="w-3 h-3" />
                <span>
                  {fellowStats.submitted} of {fellowStats.total} Completed
                </span>
              </span>
            </div>
            <h4 className="text-xl font-black text-slate-900">
              {fellowStats.completionRate}% Submitted
              {fellowStats.avgScore != null && (
                <span className="text-sm font-bold text-emerald-600 ml-2">
                  &bull; Avg Grade: {fellowStats.avgScore}%
                </span>
              )}
            </h4>
            <p className="text-xs text-slate-500">
              Complete and submit all cohort tasks before the deadline to earn your fellowship certification.
            </p>
          </div>

          <div className="sm:w-56 space-y-2">
            <div className="flex items-center justify-between text-2xs font-bold text-slate-600">
              <span>Cohort Progress</span>
              <span>{fellowStats.completionRate}%</span>
            </div>
            <div className="w-full bg-slate-100 rounded-full h-2 overflow-hidden">
              <div
                className="h-full rounded-full bg-kulkul-purple transition-all duration-500"
                style={{ width: `${Math.min(100, Math.max(0, fellowStats.completionRate))}%` }}
              />
            </div>
          </div>
        </div>
      )}

      {/* Action Bar & Controls */}
      <div className="bg-white rounded-3xl p-6 sm:p-8 border border-slate-200 shadow-sm space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-100">
          <div>
            <h3 className="text-lg font-extrabold text-slate-900">Fellowship Assignments &amp; Projects</h3>
            <p className="text-xs text-slate-500 mt-0.5">
              Hands-on engineering tasks, codebase challenges, and capstone milestones.
            </p>
          </div>

          <div className="flex items-center gap-3 flex-wrap">
            {/* Track Filter if tracks exist */}
            {tracks.length > 0 && (
              <select
                aria-label="Filter assignments by track"
                value={selectedTrackFilter}
                onChange={(e) => setSelectedTrackFilter(e.target.value)}
                className="select select-sm select-bordered rounded-xl text-xs font-semibold text-slate-700 bg-white"
              >
                <option value="all">All Tracks</option>
                {tracks.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </select>
            )}

            {/* Mentor Create Assignment Button */}
            {isMentorOrAdmin && (
              <button
                type="button"
                onClick={() => {
                  setEditingAssignment(null);
                  setIsCreateModalOpen(true);
                }}
                className="btn btn-sm bg-kulkul-purple hover:bg-[#431970] text-white font-bold flex items-center gap-1.5 shadow-sm rounded-xl"
              >
                <Plus className="w-4 h-4" />
                <span>Create Assignment</span>
              </button>
            )}
          </div>
        </div>

        {/* Content / Assignments List */}
        {isLoading ? (
          <div className="py-16 flex flex-col items-center justify-center gap-3 text-slate-400">
            <Loader2 className="w-8 h-8 animate-spin text-kulkul-purple" />
            <span className="text-xs font-bold">Loading cohort assignments...</span>
          </div>
        ) : assignments.length === 0 ? (
          <div className="py-12 text-center space-y-4">
            <div className="w-14 h-14 bg-purple-50 text-kulkul-purple rounded-2xl flex items-center justify-center mx-auto">
              <FileText className="w-7 h-7" />
            </div>
            <div className="space-y-1">
              <h4 className="text-base font-bold text-slate-800">No Assignments Posted Yet</h4>
              <p className="text-xs text-slate-500 max-w-md mx-auto">
                {isMentorOrAdmin
                  ? 'Click "Create Assignment" above to assign project deliverables, deadlines, and starter repositories to your fellows.'
                  : 'Your technical mentors have not published any assignments for this cohort yet. Check back soon!'}
              </p>
            </div>
            {isMentorOrAdmin && (
              <button
                type="button"
                onClick={() => setIsCreateModalOpen(true)}
                className="btn btn-sm btn-outline text-kulkul-purple border-purple-300 font-bold"
              >
                <Plus className="w-4 h-4" />
                <span>Post First Assignment</span>
              </button>
            )}
          </div>
        ) : (
          <div className="space-y-4">
            {assignments.map((assignment) => {
              const isPastDue =
                assignment.due_date && new Date(assignment.due_date).getTime() < Date.now();
              const mySub = assignment.my_submission;
              const isSubmitted = Boolean(mySub);
              const isGraded = mySub?.status === 'graded';

              const formattedDueDate = assignment.due_date
                ? new Intl.DateTimeFormat('en-US', {
                    weekday: 'short',
                    month: 'short',
                    day: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit',
                  }).format(new Date(assignment.due_date))
                : 'No deadline set';

              return (
                <div
                  key={assignment.id}
                  className={`p-6 rounded-2xl border transition flex flex-col gap-4 shadow-2xs ${
                    isGraded
                      ? 'bg-emerald-50/20 border-emerald-200 hover:border-emerald-300'
                      : isSubmitted
                      ? 'bg-purple-50/20 border-purple-200 hover:border-purple-300'
                      : isPastDue
                      ? 'bg-rose-50/10 border-rose-200 hover:border-rose-300'
                      : 'bg-white border-slate-200 hover:border-slate-300'
                  }`}
                >
                  {/* Top Bar: Title, Track, Deadlines, Status */}
                  <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
                    <div className="space-y-2 max-w-2xl">
                      <div className="flex items-center gap-2 flex-wrap">
                        <h4 className="text-base font-extrabold text-slate-900">
                          {assignment.title}
                        </h4>
                        {assignment.track_name ? (
                          <span className="text-3xs font-extrabold px-2.5 py-0.5 rounded-full bg-purple-100 text-kulkul-purple border border-purple-200 uppercase tracking-wider">
                            {assignment.track_name}
                          </span>
                        ) : tracks && tracks.length > 0 ? (
                          <span className="text-3xs font-bold px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 uppercase tracking-wider">
                            All Tracks
                          </span>
                        ) : null}
                        {assignment.target_applicant_ids && assignment.target_applicant_ids.length === 1 ? (
                          <span className="text-3xs font-extrabold px-2.5 py-0.5 rounded-full bg-blue-50 text-blue-700 border border-blue-200 uppercase tracking-wider flex items-center gap-1">
                            <User className="w-2.5 h-2.5" />
                            {isMentorOrAdmin ? '1-on-1 Target' : '1-on-1 Assigned to You'}
                          </span>
                        ) : assignment.target_applicant_ids && assignment.target_applicant_ids.length > 1 ? (
                          <span className="text-3xs font-extrabold px-2.5 py-0.5 rounded-full bg-indigo-50 text-indigo-700 border border-indigo-200 uppercase tracking-wider flex items-center gap-1">
                            <Users className="w-2.5 h-2.5" />
                            {isMentorOrAdmin
                              ? `Group (${assignment.target_applicant_ids.length} fellows)`
                              : 'Group Assignment'}
                          </span>
                        ) : null}
                        <span className="text-3xs font-extrabold px-2 py-0.5 rounded-full bg-slate-100 text-slate-700">
                          Max: {assignment.max_score} pts
                        </span>
                      </div>

                      {/* Description */}
                      <p className="text-xs text-slate-600 whitespace-pre-line leading-relaxed">
                        {assignment.description || 'No additional instructions specified.'}
                      </p>

                      {/* Metadata: Due Date & Starter File Attachment */}
                      <div className="flex items-center gap-4 text-xs text-slate-500 flex-wrap pt-1">
                        <div
                          className={`flex items-center gap-1.5 font-semibold ${
                            isPastDue ? 'text-rose-600' : 'text-slate-600'
                          }`}
                        >
                          <Clock className="w-3.5 h-3.5" />
                          <span>Due: {formattedDueDate}</span>
                          {isPastDue && !isSubmitted && (
                            <span className="text-3xs font-extrabold uppercase px-1.5 py-0.5 rounded bg-rose-100 text-rose-700 ml-1">
                              Past Due
                            </span>
                          )}
                        </div>

                        {assignment.attachment_url && (
                          <a
                            href={assignment.attachment_url}
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex items-center gap-1 text-kulkul-purple hover:underline font-bold text-xs"
                          >
                            <Download className="w-3.5 h-3.5" />
                            <span>
                              Download Materials (
                              {assignment.attachment_name || 'Starter Files'})
                            </span>
                          </a>
                        )}

                        {assignment.creator_name && (
                          <span className="text-slate-400">
                            Created by <strong>{assignment.creator_name}</strong>
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Status & Action Buttons */}
                    <div className="flex items-center gap-3 shrink-0 flex-wrap self-start sm:self-auto">
                      {/* For Mentors/Admins: Submission Stats & Manage Buttons */}
                      {isMentorOrAdmin ? (
                        <div className="flex items-center gap-2 flex-wrap">
                          <button
                            type="button"
                            onClick={() => setReviewAssignment(assignment)}
                            className="btn btn-sm bg-purple-600 hover:bg-purple-700 text-white font-bold flex items-center gap-1.5 shadow-2xs rounded-xl"
                          >
                            <Users className="w-3.5 h-3.5" />
                            <span>Submissions ({assignment.total_submissions || 0})</span>
                          </button>

                          <button
                            type="button"
                            onClick={() => {
                              setEditingAssignment(assignment);
                              setIsCreateModalOpen(true);
                            }}
                            className="btn btn-sm btn-outline text-slate-700 hover:text-kulkul-purple rounded-xl"
                            title="Edit Assignment"
                          >
                            <Edit3 className="w-3.5 h-3.5" />
                          </button>

                          <button
                            type="button"
                            onClick={() => handleDelete(assignment)}
                            disabled={deleteMutation.isPending}
                            className="btn btn-sm btn-outline text-rose-600 border-rose-200 hover:bg-rose-50 rounded-xl"
                            title="Delete Assignment"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      ) : (
                        /* For Fellows / Candidates: Submission & Grade Badges */
                        <div className="flex items-center gap-3 flex-wrap">
                          {isGraded ? (
                            <div className="flex flex-col items-end">
                              <span className="inline-flex items-center gap-1 px-3 py-1 rounded-xl bg-emerald-50 text-emerald-800 border border-emerald-200 text-xs font-black shadow-2xs">
                                <Award className="w-4 h-4 text-emerald-600" />
                                <span>
                                  Grade: {mySub?.score} / {assignment.max_score} pts
                                </span>
                              </span>
                              <span className="text-3xs text-emerald-700 mt-0.5 font-bold">
                                Reviewed by {mySub?.grader_name || 'Mentor'}
                              </span>
                            </div>
                          ) : isSubmitted ? (
                            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-xl bg-purple-50 text-kulkul-purple border border-purple-200 text-xs font-bold">
                              <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                              <span>Submitted &bull; Pending Review</span>
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-xl bg-slate-100 text-slate-600 text-xs font-bold">
                              <AlertCircle className="w-3.5 h-3.5 text-amber-500" />
                              <span>Not Submitted</span>
                            </span>
                          )}

                          <button
                            type="button"
                            onClick={() => setSubmitModalAssignment(assignment)}
                            className={`btn btn-sm font-bold flex items-center gap-1.5 rounded-xl shadow-xs ${
                              isSubmitted
                                ? 'btn-outline text-slate-700 hover:text-kulkul-purple'
                                : 'bg-emerald-600 hover:bg-emerald-700 text-white'
                            }`}
                          >
                            <UploadCloud className="w-4 h-4" />
                            <span>{isSubmitted ? 'Edit / Resubmit' : 'Submit Assignment'}</span>
                          </button>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* If fellow has submitted & has mentor feedback, display feedback banner */}
                  {!isMentorOrAdmin && mySub && (
                    <div className="mt-2 pt-3 border-t border-slate-100/80 space-y-2">
                      <div className="flex items-center gap-3 text-xs text-slate-600 flex-wrap">
                        {mySub.file_url && (
                          <a
                            href={mySub.file_url}
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex items-center gap-1.5 text-slate-700 hover:text-kulkul-purple font-bold bg-white px-2.5 py-1 rounded-lg border border-slate-200"
                          >
                            <FileText className="w-3.5 h-3.5 text-kulkul-purple" />
                            <span>{mySub.file_name || 'View Uploaded File'}</span>
                            <Download className="w-3 h-3 text-slate-400" />
                          </a>
                        )}

                        {mySub.github_url && (
                          <a
                            href={mySub.github_url}
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex items-center gap-1.5 text-slate-700 hover:text-kulkul-purple font-bold bg-white px-2.5 py-1 rounded-lg border border-slate-200"
                          >
                            <Github className="w-3.5 h-3.5" />
                            <span>View GitHub Repo</span>
                            <ExternalLink className="w-3 h-3 text-slate-400" />
                          </a>
                        )}

                        <span className="text-3xs text-slate-400">
                          Submitted on {new Date(mySub.submitted_at).toLocaleString()}
                        </span>
                      </div>

                      {mySub.feedback && (
                        <div className="p-4 rounded-xl bg-purple-50/60 border border-purple-100 text-xs space-y-1">
                          <div className="flex items-center gap-1.5 font-bold text-kulkul-purple">
                            <MessageSquare className="w-3.5 h-3.5" />
                            <span>Mentor Feedback:</span>
                          </div>
                          <p className="text-slate-700 italic whitespace-pre-line pl-5">
                            "{mySub.feedback}"
                          </p>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* ========================================================================= */}
      {/* MODAL 1: CREATE / EDIT ASSIGNMENT (Mentor / Admin) */}
      {/* ========================================================================= */}
      {isCreateModalOpen && (
        <CreateAssignmentModal
          programId={programId}
          tracks={tracks}
          existing={editingAssignment}
          onClose={() => {
            setIsCreateModalOpen(false);
            setEditingAssignment(null);
          }}
          onSuccess={() => {
            setIsCreateModalOpen(false);
            setEditingAssignment(null);
            queryClient.invalidateQueries({ queryKey: ['program-assignments', programId] });
          }}
        />
      )}

      {/* ========================================================================= */}
      {/* MODAL 2: SUBMIT ASSIGNMENT (Member / Fellow) */}
      {/* ========================================================================= */}
      {submitModalAssignment && (
        <SubmitAssignmentModal
          programId={programId}
          assignment={submitModalAssignment}
          onClose={() => setSubmitModalAssignment(null)}
          onSuccess={() => {
            setSubmitModalAssignment(null);
            queryClient.invalidateQueries({ queryKey: ['program-assignments', programId] });
          }}
        />
      )}

      {/* ========================================================================= */}
      {/* MODAL 3: VIEW SUBMISSIONS & GRADE (Mentor / Admin) */}
      {/* ========================================================================= */}
      {reviewAssignment && (
        <ReviewSubmissionsModal
          programId={programId}
          assignment={reviewAssignment}
          onClose={() => setReviewAssignment(null)}
          onSubmissionsUpdated={() => {
            queryClient.invalidateQueries({ queryKey: ['program-assignments', programId] });
          }}
        />
      )}
    </div>
  );
};

// =========================================================================
// SUB-COMPONENT: Create / Edit Assignment Modal
// =========================================================================
interface CreateAssignmentModalProps {
  programId: string;
  tracks: Array<{ id: string; name: string }>;
  existing: ProgramAssignment | null;
  onClose: () => void;
  onSuccess: () => void;
}

const CreateAssignmentModal: React.FC<CreateAssignmentModalProps> = ({
  programId,
  tracks,
  existing,
  onClose,
  onSuccess,
}) => {
  const [title, setTitle] = useState(existing?.title || '');
  const [trackId, setTrackId] = useState(existing?.track_id || '');
  const [description, setDescription] = useState(existing?.description || '');
  const [maxScore, setMaxScore] = useState<number>(existing?.max_score || 100);
  const [attachmentUrl, setAttachmentUrl] = useState(existing?.attachment_url || '');
  const [attachmentName, setAttachmentName] = useState(existing?.attachment_name || '');
  const [status, setStatus] = useState<AssignmentStatus>(existing?.status || 'published');
  const [isUploading, setIsUploading] = useState(false);

  // Program fellows for targeting
  const { data: fellowsData } = useQuery({
    queryKey: ['program-fellows-for-assignment', programId],
    queryFn: () => mentorService.getProgramFellows(programId),
    enabled: Boolean(programId),
  });
  const allFellows = fellowsData?.fellows || [];

  const [targetAudience, setTargetAudience] = useState<'all' | 'specific'>(() => {
    return existing?.target_applicant_ids && existing.target_applicant_ids.length > 0
      ? 'specific'
      : 'all';
  });
  const [selectedFellowIds, setSelectedFellowIds] = useState<string[]>(
    existing?.target_applicant_ids || []
  );
  const [fellowSearch, setFellowSearch] = useState('');

  const filteredFellows = useMemo(() => {
    if (!fellowSearch.trim()) return allFellows;
    const q = fellowSearch.toLowerCase();
    return allFellows.filter(
      (f) =>
        f.full_name?.toLowerCase().includes(q) ||
        f.email?.toLowerCase().includes(q) ||
        f.track_name?.toLowerCase().includes(q)
    );
  }, [allFellows, fellowSearch]);

  // Due date format
  const [dueDate, setDueDate] = useState<string>(() => {
    if (!existing?.due_date) return '';
    try {
      const d = new Date(existing.due_date);
      // Format as YYYY-MM-DDTHH:mm for datetime-local input
      return new Date(d.getTime() - d.getTimezoneOffset() * 60000)
        .toISOString()
        .slice(0, 16);
    } catch {
      return '';
    }
  });

  const mutation = useMutation({
    mutationFn: async (payload: CreateAssignmentPayload) => {
      if (existing) {
        return assignmentService.updateAssignment(programId, existing.id, payload);
      }
      return assignmentService.createAssignment(programId, payload);
    },
    onSuccess: () => {
      toast.success(existing ? 'Assignment updated!' : 'Assignment published!');
      onSuccess();
    },
    onError: (err: any) => {
      toast.error(err?.response?.data?.error || err.message || 'Failed to save assignment');
    },
  });

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      setIsUploading(true);
      const res = await uploadService.uploadFile(file, 'assignments');
      setAttachmentUrl(res.url);
      setAttachmentName(res.filename || file.name);
      toast.success('Starter attachment uploaded!');
    } catch (err: any) {
      toast.error(err?.response?.data?.error || err.message || 'Attachment upload failed');
    } finally {
      setIsUploading(false);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) {
      toast.error('Assignment title is required');
      return;
    }

    if (targetAudience === 'specific' && selectedFellowIds.length === 0) {
      toast.error('Please select at least one fellow for this assignment');
      return;
    }

    const payload: CreateAssignmentPayload = {
      title: title.trim(),
      description: description.trim(),
      track_id: trackId ? trackId : undefined,
      max_score: maxScore > 0 ? maxScore : 100,
      attachment_url: attachmentUrl || undefined,
      attachment_name: attachmentName || undefined,
      status,
      due_date: dueDate ? new Date(dueDate).toISOString() : undefined,
      target_applicant_ids: targetAudience === 'specific' ? selectedFellowIds : [],
    };

    mutation.mutate(payload);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-xs overflow-y-auto">
      <div className="bg-white rounded-3xl max-w-xl w-full p-6 sm:p-8 shadow-2xl border border-slate-200 space-y-6 my-8">
        <div className="flex items-center justify-between pb-4 border-b border-slate-100">
          <div>
            <h3 className="text-lg font-black text-slate-900">
              {existing ? 'Edit Assignment' : 'Create New Cohort Assignment'}
            </h3>
            <p className="text-xs text-slate-500">
              Assign deliverables, due dates, and starter code to your fellowship cohort.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded-xl text-slate-400 hover:text-slate-600 hover:bg-slate-100"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-2xs font-extrabold uppercase text-slate-700 tracking-wider mb-1">
              Assignment Title *
            </label>
            <input
              type="text"
              required
              placeholder="e.g. Sprint 1: Concurrency Pipeline in Go"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="input input-bordered w-full text-xs font-semibold rounded-xl"
            />
          </div>

          <div className={tracks.length > 0 ? "grid grid-cols-1 sm:grid-cols-2 gap-4" : ""}>
            {tracks.length > 0 && (
              <div>
                <label className="block text-2xs font-extrabold uppercase text-slate-700 tracking-wider mb-1">
                  Target Track
                </label>
                <select
                  value={trackId}
                  onChange={(e) => setTrackId(e.target.value)}
                  className="select select-bordered w-full text-xs font-semibold rounded-xl"
                >
                  <option value="">All Fellows (Program-Wide)</option>
                  {tracks.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name}
                    </option>
                  ))}
                </select>
              </div>
            )}

            <div>
              <label className="block text-2xs font-extrabold uppercase text-slate-700 tracking-wider mb-1">
                Max Score (Points)
              </label>
              <input
                type="number"
                min={1}
                max={1000}
                value={maxScore}
                onChange={(e) => setMaxScore(Number(e.target.value))}
                className="input input-bordered w-full text-xs font-semibold rounded-xl"
              />
            </div>
          </div>

          {/* Target Audience Selector */}
          <div className="space-y-3 pt-1">
            <label className="block text-2xs font-extrabold uppercase text-slate-700 tracking-wider">
              Target Audience
            </label>
            <div className="grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => setTargetAudience('all')}
                className={`p-3 rounded-2xl border text-left flex items-start gap-2.5 transition cursor-pointer ${
                  targetAudience === 'all'
                    ? 'border-kulkul-purple bg-purple-50/50 ring-2 ring-purple-100 shadow-2xs'
                    : 'border-slate-200 hover:border-slate-300 bg-white'
                }`}
              >
                <div
                  className={`p-1.5 rounded-lg shrink-0 ${
                    targetAudience === 'all'
                      ? 'bg-kulkul-purple text-white'
                      : 'bg-slate-100 text-slate-500'
                  }`}
                >
                  <Users className="w-4 h-4" />
                </div>
                <div>
                  <div className="text-xs font-bold text-slate-900">All Fellows</div>
                  <div className="text-3xs text-slate-500">
                    {tracks.length > 0 ? 'Cohort or track-wide' : 'Cohort-wide'}
                  </div>
                </div>
              </button>

              <button
                type="button"
                onClick={() => setTargetAudience('specific')}
                className={`p-3 rounded-2xl border text-left flex items-start gap-2.5 transition cursor-pointer ${
                  targetAudience === 'specific'
                    ? 'border-kulkul-purple bg-purple-50/50 ring-2 ring-purple-100 shadow-2xs'
                    : 'border-slate-200 hover:border-slate-300 bg-white'
                }`}
              >
                <div
                  className={`p-1.5 rounded-lg shrink-0 ${
                    targetAudience === 'specific'
                      ? 'bg-kulkul-purple text-white'
                      : 'bg-slate-100 text-slate-500'
                  }`}
                >
                  <UserCheck className="w-4 h-4" />
                </div>
                <div>
                  <div className="text-xs font-bold text-slate-900">Specific Fellows / Group</div>
                  <div className="text-3xs text-slate-500">
                    {selectedFellowIds.length > 0
                      ? `${selectedFellowIds.length} selected`
                      : 'Assign to 1 or small group'}
                  </div>
                </div>
              </button>
            </div>

            {targetAudience === 'specific' && (
              <div className="space-y-2.5 p-3.5 bg-slate-50 rounded-2xl border border-slate-200">
                <div className="flex items-center justify-between gap-2">
                  <div className="relative flex-1">
                    <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
                    <input
                      type="text"
                      placeholder={tracks.length > 0 ? "Search fellows by name, email, or track..." : "Search fellows by name or email..."}
                      value={fellowSearch}
                      onChange={(e) => setFellowSearch(e.target.value)}
                      className="input input-xs input-bordered w-full pl-8 text-xs rounded-xl bg-white"
                    />
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <button
                      type="button"
                      onClick={() => setSelectedFellowIds(allFellows.map((f) => f.id))}
                      className="text-3xs font-extrabold text-kulkul-purple hover:underline cursor-pointer"
                    >
                      Select All
                    </button>
                    <span className="text-slate-300">|</span>
                    <button
                      type="button"
                      onClick={() => setSelectedFellowIds([])}
                      className="text-3xs font-extrabold text-slate-500 hover:underline cursor-pointer"
                    >
                      Clear
                    </button>
                  </div>
                </div>

                <div className="max-h-48 overflow-y-auto space-y-1 pr-1">
                  {filteredFellows.length === 0 ? (
                    <div className="text-center py-4 text-xs text-slate-400">
                      No fellows found matching "{fellowSearch}"
                    </div>
                  ) : (
                    filteredFellows.map((fellow) => {
                      const isChecked = selectedFellowIds.includes(fellow.id);
                      return (
                        <label
                          key={fellow.id}
                          className={`flex items-center justify-between p-2 rounded-xl border text-xs cursor-pointer transition ${
                            isChecked
                              ? 'bg-purple-50/70 border-purple-200'
                              : 'bg-white border-slate-200 hover:bg-slate-50'
                          }`}
                        >
                          <div className="flex items-center gap-2.5 min-w-0">
                            <input
                              type="checkbox"
                              checked={isChecked}
                              onChange={(e) => {
                                if (e.target.checked) {
                                  setSelectedFellowIds((prev) => [...prev, fellow.id]);
                                } else {
                                  setSelectedFellowIds((prev) => prev.filter((id) => id !== fellow.id));
                                }
                              }}
                              className="checkbox checkbox-xs checkbox-primary rounded"
                            />
                            <div className="truncate">
                              <span className="font-bold text-slate-900">{fellow.full_name}</span>
                              <span className="text-slate-400 text-3xs ml-1.5">({fellow.email})</span>
                            </div>
                          </div>
                          {fellow.track_name && tracks.length > 0 && (
                            <span className="text-3xs font-semibold px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 shrink-0">
                              {fellow.track_name}
                            </span>
                          )}
                        </label>
                      );
                    })
                  )}
                </div>

                <div className="text-3xs text-slate-500 font-semibold flex items-center justify-between pt-1">
                  <span>
                    {selectedFellowIds.length === 0
                      ? 'No fellows selected (must select at least 1)'
                      : selectedFellowIds.length === 1
                      ? '1 fellow selected (1-on-1 assignment)'
                      : `${selectedFellowIds.length} fellows selected (Group assignment)`}
                  </span>
                  {selectedFellowIds.length > 0 && (
                    <span className="text-kulkul-purple font-bold">
                      {selectedFellowIds.length} / {allFellows.length}
                    </span>
                  )}
                </div>
              </div>
            )}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-2xs font-extrabold uppercase text-slate-700 tracking-wider mb-1">
                Submission Due Date &amp; Time
              </label>
              <input
                type="datetime-local"
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
                className="input input-bordered w-full text-xs font-semibold rounded-xl"
              />
            </div>

            <div>
              <label className="block text-2xs font-extrabold uppercase text-slate-700 tracking-wider mb-1">
                Publication Status
              </label>
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value as any)}
                className="select select-bordered w-full text-xs font-semibold rounded-xl"
              >
                <option value="published">Published (Visible to Fellows)</option>
                <option value="draft">Draft (Hidden)</option>
              </select>
            </div>
          </div>

          <div>
            <label className="block text-2xs font-extrabold uppercase text-slate-700 tracking-wider mb-1">
              Instructions &amp; Requirements
            </label>
            <textarea
              rows={4}
              placeholder="Outline project deliverables, edge cases, grading criteria, and required repository structure..."
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="textarea textarea-bordered w-full text-xs font-normal rounded-xl leading-relaxed"
            />
          </div>

          {/* Starter Attachment Upload */}
          <div>
            <label className="block text-2xs font-extrabold uppercase text-slate-700 tracking-wider mb-1">
              Starter Materials / Template File (Optional)
            </label>
            {attachmentUrl ? (
              <div className="p-3 bg-purple-50 border border-purple-200 rounded-xl flex items-center justify-between">
                <div className="flex items-center gap-2 text-xs font-bold text-kulkul-purple truncate">
                  <FileText className="w-4 h-4 shrink-0" />
                  <span className="truncate">{attachmentName || 'Attachment Uploaded'}</span>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setAttachmentUrl('');
                    setAttachmentName('');
                  }}
                  className="text-xs text-rose-600 hover:underline font-bold"
                >
                  Remove
                </button>
              </div>
            ) : (
              <div className="relative border-2 border-dashed border-slate-200 rounded-2xl p-4 text-center hover:border-kulkul-purple transition">
                <input
                  type="file"
                  onChange={handleFileUpload}
                  disabled={isUploading}
                  className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                />
                <div className="flex flex-col items-center justify-center gap-1.5 text-slate-500">
                  {isUploading ? (
                    <Loader2 className="w-6 h-6 animate-spin text-kulkul-purple" />
                  ) : (
                    <UploadCloud className="w-6 h-6 text-kulkul-purple" />
                  )}
                  <span className="text-xs font-bold text-slate-700">
                    {isUploading ? 'Uploading starter archive...' : 'Upload starter .zip, .pdf, or template'}
                  </span>
                  <span className="text-3xs text-slate-400">Up to 100MB supported</span>
                </div>
              </div>
            )}
          </div>

          <div className="pt-4 border-t border-slate-100 flex items-center justify-end gap-3">
            <button
              type="button"
              onClick={onClose}
              disabled={mutation.isPending}
              className="btn btn-sm btn-ghost rounded-xl font-bold text-slate-600"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={mutation.isPending || isUploading}
              className="btn btn-sm bg-kulkul-purple hover:bg-[#431970] text-white font-bold rounded-xl shadow-xs flex items-center gap-1.5"
            >
              {mutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
              <span>{existing ? 'Save Changes' : 'Publish Assignment'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

// =========================================================================
// SUB-COMPONENT: Submit Assignment Modal (Fellow / Candidate)
// =========================================================================
interface SubmitAssignmentModalProps {
  programId: string;
  assignment: ProgramAssignment;
  onClose: () => void;
  onSuccess: () => void;
}

const SubmitAssignmentModal: React.FC<SubmitAssignmentModalProps> = ({
  programId,
  assignment,
  onClose,
  onSuccess,
}) => {
  const existing = assignment.my_submission;
  const [fileUrl, setFileUrl] = useState(existing?.file_url || '');
  const [fileName, setFileName] = useState(existing?.file_name || '');
  const [fileSize, setFileSize] = useState<number>(existing?.file_size || 0);
  const [githubUrl, setGithubUrl] = useState(existing?.github_url || '');
  const [notes, setNotes] = useState(existing?.notes || '');
  const [isUploading, setIsUploading] = useState(false);

  const mutation = useMutation({
    mutationFn: (payload: { file_url?: string; file_name?: string; file_size?: number; github_url?: string; notes?: string }) =>
      assignmentService.submitAssignment(programId, assignment.id, payload),
    onSuccess: (data) => {
      toast.success(data.message || 'Assignment submitted successfully!');
      onSuccess();
    },
    onError: (err: any) => {
      toast.error(err?.response?.data?.error || err.message || 'Submission failed');
    },
  });

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      setIsUploading(true);
      const res = await uploadService.uploadFile(file, 'assignments');
      setFileUrl(res.url);
      setFileName(res.filename || file.name);
      setFileSize(res.size || file.size);
      toast.success('Work file uploaded successfully!');
    } catch (err: any) {
      toast.error(err?.response?.data?.error || err.message || 'Upload failed');
    } finally {
      setIsUploading(false);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!fileUrl && !githubUrl.trim() && !notes.trim()) {
      toast.error('Please upload a submission file, provide a GitHub repo link, or enter notes.');
      return;
    }

    mutation.mutate({
      file_url: fileUrl || undefined,
      file_name: fileName || undefined,
      file_size: fileSize || undefined,
      github_url: githubUrl.trim() || undefined,
      notes: notes.trim() || undefined,
    });
  };

  const formatBytes = (bytes: number) => {
    if (!bytes) return '';
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(1024));
    return `${(bytes / Math.pow(1024, i)).toFixed(1)} ${sizes[i]}`;
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-xs overflow-y-auto">
      <div className="bg-white rounded-3xl max-w-lg w-full p-6 sm:p-8 shadow-2xl border border-slate-200 space-y-6 my-8">
        <div className="flex items-center justify-between pb-4 border-b border-slate-100">
          <div>
            <h3 className="text-lg font-black text-slate-900">
              {existing ? 'Edit / Resubmit Assignment' : 'Submit Assignment'}
            </h3>
            <p className="text-xs text-slate-500 font-medium">
              {assignment.title} &bull; Max {assignment.max_score} pts
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded-xl text-slate-400 hover:text-slate-600 hover:bg-slate-100"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* File Upload Area */}
          <div>
            <label className="block text-2xs font-extrabold uppercase text-slate-700 tracking-wider mb-1.5">
              Upload Work Deliverable (.zip, .pdf, .tar.gz, code files)
            </label>
            {fileUrl ? (
              <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-2xl flex items-center justify-between">
                <div className="flex items-center gap-2.5 truncate">
                  <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
                  <div className="truncate">
                    <p className="text-xs font-bold text-slate-900 truncate">{fileName || 'Uploaded Deliverable'}</p>
                    {fileSize > 0 && <p className="text-3xs text-slate-500">{formatBytes(fileSize)}</p>}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setFileUrl('');
                    setFileName('');
                    setFileSize(0);
                  }}
                  className="text-xs text-rose-600 hover:underline font-bold ml-2 shrink-0"
                >
                  Change File
                </button>
              </div>
            ) : (
              <div className="relative border-2 border-dashed border-slate-200 rounded-2xl p-6 text-center hover:border-emerald-500 transition group cursor-pointer bg-slate-50/50 hover:bg-emerald-50/20">
                <input
                  type="file"
                  onChange={handleFileUpload}
                  disabled={isUploading}
                  className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                />
                <div className="flex flex-col items-center justify-center gap-2 text-slate-500">
                  {isUploading ? (
                    <Loader2 className="w-7 h-7 animate-spin text-emerald-600" />
                  ) : (
                    <UploadCloud className="w-7 h-7 text-emerald-600 group-hover:scale-110 transition-transform" />
                  )}
                  <span className="text-xs font-bold text-slate-800">
                    {isUploading ? 'Uploading deliverable...' : 'Click or drag files here to upload'}
                  </span>
                  <span className="text-3xs text-slate-400">Supports .zip, .tar.gz, .pdf, .docx, code archives up to 100MB</span>
                </div>
              </div>
            )}
          </div>

          {/* GitHub Repository URL */}
          <div>
            <label className="block text-2xs font-extrabold uppercase text-slate-700 tracking-wider mb-1">
              GitHub / Code Repository URL (Optional)
            </label>
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
                <Github className="w-4 h-4" />
              </div>
              <input
                type="url"
                placeholder="https://github.com/username/project-repo"
                value={githubUrl}
                onChange={(e) => setGithubUrl(e.target.value)}
                className="input input-bordered w-full pl-9 text-xs font-semibold rounded-xl"
              />
            </div>
          </div>

          {/* Fellow Notes */}
          <div>
            <label className="block text-2xs font-extrabold uppercase text-slate-700 tracking-wider mb-1">
              Submission Notes / Remarks to Mentor
            </label>
            <textarea
              rows={3}
              placeholder="Explain how you approached the challenge, key engineering trade-offs, or instructions to run your code..."
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="textarea textarea-bordered w-full text-xs rounded-xl leading-relaxed"
            />
          </div>

          <div className="pt-4 border-t border-slate-100 flex items-center justify-end gap-3">
            <button
              type="button"
              onClick={onClose}
              disabled={mutation.isPending}
              className="btn btn-sm btn-ghost rounded-xl font-bold text-slate-600"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={mutation.isPending || isUploading}
              className="btn btn-sm bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-xl shadow-xs flex items-center gap-1.5"
            >
              {mutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <UploadCloud className="w-4 h-4" />}
              <span>{existing ? 'Confirm Resubmission' : 'Submit Assignment'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

// =========================================================================
// SUB-COMPONENT: Review Submissions & Grade Modal (Mentor / Admin)
// =========================================================================
interface ReviewSubmissionsModalProps {
  programId: string;
  assignment: ProgramAssignment;
  onClose: () => void;
  onSubmissionsUpdated: () => void;
}

const ReviewSubmissionsModal: React.FC<ReviewSubmissionsModalProps> = ({
  programId,
  assignment,
  onClose,
  onSubmissionsUpdated,
}) => {
  const [selectedSub, setSelectedSub] = useState<AssignmentSubmission | null>(null);
  const [scoreInput, setScoreInput] = useState<string>('');
  const [feedbackInput, setFeedbackInput] = useState<string>('');

  const {
    data: submissions = [],
    isLoading,
    refetch,
  } = useQuery({
    queryKey: ['assignment-submissions', programId, assignment.id],
    queryFn: () => assignmentService.listSubmissions(programId, assignment.id),
  });

  const gradeMutation = useMutation({
    mutationFn: (payload: { score: number; feedback: string }) => {
      if (!selectedSub) throw new Error('No submission selected');
      return assignmentService.gradeSubmission(
        programId,
        assignment.id,
        selectedSub.id,
        payload
      );
    },
    onSuccess: (data) => {
      toast.success('Grade and feedback saved!');
      refetch();
      onSubmissionsUpdated();
      setSelectedSub(data.submission);
    },
    onError: (err: any) => {
      toast.error(err?.response?.data?.error || err.message || 'Failed to save grade');
    },
  });

  const handleSelectSubmission = (sub: AssignmentSubmission) => {
    setSelectedSub(sub);
    setScoreInput(sub.score != null ? String(sub.score) : '');
    setFeedbackInput(sub.feedback || '');
  };

  const handleSaveGrade = (e: React.FormEvent) => {
    e.preventDefault();
    const scoreNum = parseFloat(scoreInput);
    if (isNaN(scoreNum) || scoreNum < 0) {
      toast.error('Please enter a valid numeric score &ge; 0');
      return;
    }
    gradeMutation.mutate({
      score: scoreNum,
      feedback: feedbackInput.trim(),
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-xs overflow-y-auto">
      <div className="bg-white rounded-3xl max-w-4xl w-full p-6 sm:p-8 shadow-2xl border border-slate-200 space-y-6 my-8 max-h-[90vh] flex flex-col">
        {/* Modal Header */}
        <div className="flex items-center justify-between pb-4 border-b border-slate-100 shrink-0">
          <div>
            <h3 className="text-lg font-black text-slate-900">
              Fellow Submissions &bull; {assignment.title}
            </h3>
            <p className="text-xs text-slate-500 font-medium">
              Review submitted code archives, check GitHub repositories, and assign scores out of {assignment.max_score} pts.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded-xl text-slate-400 hover:text-slate-600 hover:bg-slate-100"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Body: Split view (List on Left, Grading Panel on Right) */}
        <div className="flex-1 overflow-y-auto grid grid-cols-1 md:grid-cols-12 gap-6 min-h-[350px]">
          {/* Left Column: Submissions List */}
          <div className="md:col-span-5 border-r border-slate-100 pr-0 md:pr-4 space-y-3">
            <div className="flex items-center justify-between text-xs font-bold text-slate-500 pb-1">
              <span>Submitted Fellows ({submissions.length})</span>
            </div>

            {isLoading ? (
              <div className="py-12 flex flex-col items-center justify-center gap-2 text-slate-400">
                <Loader2 className="w-6 h-6 animate-spin text-kulkul-purple" />
                <span className="text-xs">Loading submissions...</span>
              </div>
            ) : submissions.length === 0 ? (
              <div className="py-12 text-center text-slate-400 space-y-2">
                <Users className="w-8 h-8 mx-auto text-slate-300" />
                <p className="text-xs font-semibold">No fellow has submitted yet.</p>
              </div>
            ) : (
              <div className="space-y-2.5">
                {submissions.map((sub) => {
                  const isSelected = selectedSub?.id === sub.id;
                  const isGraded = sub.status === 'graded';

                  return (
                    <button
                      key={sub.id}
                      type="button"
                      onClick={() => handleSelectSubmission(sub)}
                      className={`w-full text-left p-3.5 rounded-2xl border transition flex flex-col gap-1.5 ${
                        isSelected
                          ? 'bg-purple-50/80 border-kulkul-purple shadow-2xs'
                          : 'bg-slate-50/60 border-slate-100 hover:bg-slate-50 hover:border-slate-200'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-xs font-extrabold text-slate-900 truncate">
                          {sub.fellow_name || sub.fellow_email || 'Fellow'}
                        </span>
                        {isGraded ? (
                          <span className="text-3xs font-extrabold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 shrink-0">
                            {sub.score}/{assignment.max_score}
                          </span>
                        ) : (
                          <span className="text-3xs font-bold px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 shrink-0">
                            Pending
                          </span>
                        )}
                      </div>

                      <div className="flex items-center justify-between text-3xs text-slate-500">
                        <span className="truncate">{sub.track_name || 'Fellow'}</span>
                        <span>{new Date(sub.submitted_at).toLocaleDateString()}</span>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {/* Right Column: Submission Details & Grading Form */}
          <div className="md:col-span-7 flex flex-col justify-between space-y-4">
            {selectedSub ? (
              <div className="space-y-4">
                {/* Fellow Header */}
                <div className="p-4 rounded-2xl bg-slate-50 border border-slate-100 space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <div>
                      <h4 className="text-sm font-extrabold text-slate-900">
                        {selectedSub.fellow_name || 'Fellow Submission'}
                      </h4>
                      <p className="text-xs text-slate-500">{selectedSub.fellow_email}</p>
                    </div>
                    <span
                      className={`text-2xs font-extrabold uppercase px-2.5 py-1 rounded-full ${
                        selectedSub.status === 'graded'
                          ? 'bg-emerald-100 text-emerald-800'
                          : 'bg-amber-100 text-amber-800'
                      }`}
                    >
                      {selectedSub.status}
                    </span>
                  </div>

                  {/* Submitted Links & Files */}
                  <div className="flex items-center gap-3 pt-1 flex-wrap">
                    {selectedSub.file_url && (
                      <a
                        href={selectedSub.file_url}
                        target="_blank"
                        rel="noreferrer"
                        className="btn btn-xs bg-white border border-slate-200 hover:border-kulkul-purple font-bold flex items-center gap-1.5 shadow-2xs"
                      >
                        <Download className="w-3 h-3 text-kulkul-purple" />
                        <span>Download: {selectedSub.file_name || 'Work Archive'}</span>
                      </a>
                    )}

                    {selectedSub.github_url && (
                      <a
                        href={selectedSub.github_url}
                        target="_blank"
                        rel="noreferrer"
                        className="btn btn-xs btn-outline font-bold flex items-center gap-1.5"
                      >
                        <Github className="w-3 h-3" />
                        <span>GitHub Repo</span>
                        <ExternalLink className="w-2.5 h-2.5 text-slate-400" />
                      </a>
                    )}
                  </div>

                  {/* Candidate notes */}
                  {selectedSub.notes && (
                    <div className="mt-2 pt-2 border-t border-slate-200/60 text-xs text-slate-700">
                      <strong className="text-slate-500 font-bold block text-3xs uppercase">Fellow Notes:</strong>
                      <p className="mt-0.5 whitespace-pre-line leading-relaxed">{selectedSub.notes}</p>
                    </div>
                  )}
                </div>

                {/* Grade & Feedback Form */}
                <form onSubmit={handleSaveGrade} className="space-y-4">
                  <div>
                    <label className="block text-2xs font-extrabold uppercase text-slate-700 tracking-wider mb-1">
                      Assigned Score (Max {assignment.max_score} pts) *
                    </label>
                    <input
                      type="number"
                      step="0.5"
                      min={0}
                      max={assignment.max_score}
                      required
                      placeholder={`0 - ${assignment.max_score}`}
                      value={scoreInput}
                      onChange={(e) => setScoreInput(e.target.value)}
                      className="input input-bordered w-full text-xs font-semibold rounded-xl"
                    />
                  </div>

                  <div>
                    <label className="block text-2xs font-extrabold uppercase text-slate-700 tracking-wider mb-1">
                      Mentor Feedback &amp; Suggestions
                    </label>
                    <textarea
                      rows={4}
                      placeholder="Highlight strong architectural choices, concurrency safety, clean code principles, and areas for improvement..."
                      value={feedbackInput}
                      onChange={(e) => setFeedbackInput(e.target.value)}
                      className="textarea textarea-bordered w-full text-xs rounded-xl leading-relaxed"
                    />
                  </div>

                  <div className="flex items-center justify-end gap-2 pt-2">
                    <button
                      type="submit"
                      disabled={gradeMutation.isPending}
                      className="btn btn-sm bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-xl shadow-xs flex items-center gap-1.5"
                    >
                      {gradeMutation.isPending ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <Check className="w-4 h-4" />
                      )}
                      <span>Save Grade &amp; Feedback</span>
                    </button>
                  </div>
                </form>
              </div>
            ) : (
              <div className="h-full flex flex-col items-center justify-center text-slate-400 p-8 text-center space-y-2">
                <FileText className="w-10 h-10 text-slate-300" />
                <p className="text-xs font-semibold">Select a fellow submission from the left to view files and record grades.</p>
              </div>
            )}
          </div>
        </div>

        {/* Modal Footer */}
        <div className="pt-3 border-t border-slate-100 flex items-center justify-end shrink-0">
          <button
            type="button"
            onClick={onClose}
            className="btn btn-sm btn-ghost rounded-xl font-bold text-slate-600"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
