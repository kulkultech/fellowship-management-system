import React, { useState, useMemo } from 'react';
import type { Program, ApplicantListItem } from '@/services/types';
import {
  X,
  Check,
  Plus,
  ArrowUp,
  ArrowDown,
  RotateCcw,
  Search,
  Sliders,
  FileText,
  Award,
  User,
  GraduationCap,
  Sparkles,
} from 'lucide-react';

export interface CandidateTableColumnDef {
  id: string;
  label: string;
  category: 'core' | 'assessment' | 'form_standard' | 'form_custom';
  description?: string;
  removable?: boolean;
}

export const DEFAULT_VISIBLE_COLUMNS: string[] = [
  'candidate',
  'track',
  'stage',
  'mcq_score',
  'ai_score',
  'ai_recommendation',
  'actions',
];

export function getAllAvailableColumns(
  program?: Program,
  applicants: ApplicantListItem[] = []
): CandidateTableColumnDef[] {
  const cols: CandidateTableColumnDef[] = [
    {
      id: 'candidate',
      label: 'Candidate',
      category: 'core',
      description: 'Candidate full name & email address',
      removable: false,
    },
    {
      id: 'track',
      label: 'Specialization Track',
      category: 'core',
      description: 'Chosen fellowship specialization track',
      removable: true,
    },
    {
      id: 'stage',
      label: 'Stage Status',
      category: 'assessment',
      description: 'Current stage in the recruitment pipeline',
      removable: true,
    },
    {
      id: 'mcq_score',
      label: 'Logic MCQ Score',
      category: 'assessment',
      description: 'Multiple-choice logic test score percentage and duration',
      removable: true,
    },
    {
      id: 'ai_score',
      label: 'AI Interview Score',
      category: 'assessment',
      description: 'Automated AI oral interview scorecard result (0-100)',
      removable: true,
    },
    {
      id: 'ai_recommendation',
      label: 'AI Recommendation',
      category: 'assessment',
      description: 'AI recommendation verdict (Recommended, Considered, etc.)',
      removable: true,
    },
    {
      id: 'applied_date',
      label: 'Applied Date',
      category: 'core',
      description: 'Timestamp when candidate submitted their application',
      removable: true,
    },
    // Standard Application Form Fields
    {
      id: 'phone',
      label: 'Phone / WhatsApp',
      category: 'form_standard',
      description: 'Candidate phone contact number',
      removable: true,
    },
    {
      id: 'university',
      label: 'University / Campus',
      category: 'form_standard',
      description: 'Candidate higher education institution name',
      removable: true,
    },
    {
      id: 'major',
      label: 'Major / Study Field',
      category: 'form_standard',
      description: 'Academic discipline / IT degree',
      removable: true,
    },
    {
      id: 'semester',
      label: 'Current Semester',
      category: 'form_standard',
      description: 'Academic progress level or graduation status',
      removable: true,
    },
    {
      id: 'referral_source',
      label: 'Referral Source',
      category: 'form_standard',
      description: 'How candidate heard about this program',
      removable: true,
    },
    {
      id: 'date_of_birth',
      label: 'Date of Birth',
      category: 'form_standard',
      description: 'Candidate birth date',
      removable: true,
    },
    {
      id: 'linkedin_url',
      label: 'LinkedIn Profile',
      category: 'form_standard',
      description: 'Link to candidate LinkedIn profile',
      removable: true,
    },
    {
      id: 'github_url',
      label: 'GitHub Profile',
      category: 'form_standard',
      description: 'Link to candidate GitHub portfolio',
      removable: true,
    },
    {
      id: 'resume_url',
      label: 'Resume / CV (PDF)',
      category: 'form_standard',
      description: 'Uploaded curriculum vitae PDF file link',
      removable: true,
    },
  ];

  // Custom Form Questions from Program Application Form Schema
  const customFieldMap = new Map<string, { label: string; description?: string }>();
  if (program?.application_form_schema?.custom_fields) {
    for (const f of program.application_form_schema.custom_fields) {
      customFieldMap.set(f.id, {
        label: f.label || f.id,
        description: f.placeholder || `Custom question (${f.type})`,
      });
    }
  }

  // Also discover any extra keys from candidate submissions (custom_responses)
  for (const app of applicants) {
    if (app.custom_responses && typeof app.custom_responses === 'object') {
      for (const k of Object.keys(app.custom_responses)) {
        if (!customFieldMap.has(k)) {
          const humanLabel = k
            .replace(/[_-]/g, ' ')
            .replace(/\b\w/g, (char) => char.toUpperCase());
          customFieldMap.set(k, {
            label: humanLabel,
            description: 'Custom question answer from candidate submission',
          });
        }
      }
    }
  }

  for (const [key, info] of customFieldMap.entries()) {
    cols.push({
      id: `custom_${key}`,
      label: info.label,
      category: 'form_custom',
      description: info.description,
      removable: true,
    });
  }

  // Actions column (pinned at the end)
  cols.push({
    id: 'actions',
    label: 'Inspect & Actions',
    category: 'core',
    description: 'Quick actions (view details drawer, delete candidate)',
    removable: false,
  });

  return cols;
}

interface CandidateTableCustomizerProps {
  isOpen: boolean;
  onClose: () => void;
  program?: Program;
  applicants?: ApplicantListItem[];
  activeColumns: string[];
  onChangeColumns: (newColumns: string[]) => void;
}

export const CandidateTableCustomizer: React.FC<CandidateTableCustomizerProps> = ({
  isOpen,
  onClose,
  program,
  applicants = [],
  activeColumns,
  onChangeColumns,
}) => {
  const [searchQuery, setSearchQuery] = useState('');

  const allColumns = useMemo(
    () => getAllAvailableColumns(program, applicants),
    [program, applicants]
  );

  const allColumnsMap = useMemo(() => {
    const map = new Map<string, CandidateTableColumnDef>();
    allColumns.forEach((c) => map.set(c.id, c));
    return map;
  }, [allColumns]);

  if (!isOpen) return null;

  const handleMoveUp = (index: number) => {
    if (index <= 0) return;
    const item = activeColumns[index];
    // Prevent moving above candidate (candidate is usually index 0)
    if (activeColumns[index - 1] === 'candidate') return;
    const next = [...activeColumns];
    next.splice(index, 1);
    next.splice(index - 1, 0, item);
    onChangeColumns(next);
  };

  const handleMoveDown = (index: number) => {
    if (index >= activeColumns.length - 1) return;
    const item = activeColumns[index];
    // Prevent moving below actions (actions is usually last)
    if (activeColumns[index + 1] === 'actions') return;
    const next = [...activeColumns];
    next.splice(index, 1);
    next.splice(index + 1, 0, item);
    onChangeColumns(next);
  };

  const handleRemove = (colId: string) => {
    if (colId === 'candidate' || colId === 'actions') return;
    onChangeColumns(activeColumns.filter((id) => id !== colId));
  };

  const handleAdd = (colId: string) => {
    if (activeColumns.includes(colId)) return;
    // Insert right before 'actions' if 'actions' is present, otherwise at the end
    const actionsIndex = activeColumns.indexOf('actions');
    if (actionsIndex !== -1) {
      const next = [...activeColumns];
      next.splice(actionsIndex, 0, colId);
      onChangeColumns(next);
    } else {
      onChangeColumns([...activeColumns, colId]);
    }
  };

  const handleResetToDefault = () => {
    onChangeColumns([...DEFAULT_VISIBLE_COLUMNS]);
  };

  const handleAddAllFormFields = () => {
    const formCols = allColumns
      .filter((c) => c.category === 'form_standard' || c.category === 'form_custom')
      .map((c) => c.id);

    const next = [...activeColumns];
    const actionsIndex = next.indexOf('actions');

    for (const colId of formCols) {
      if (!next.includes(colId)) {
        if (actionsIndex !== -1) {
          next.splice(next.indexOf('actions'), 0, colId);
        } else {
          next.push(colId);
        }
      }
    }
    onChangeColumns(next);
  };

  // Filter available columns based on search
  const filteredAvailable = allColumns.filter((c) => {
    if (c.id === 'candidate' || c.id === 'actions') return false;
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    return (
      c.label.toLowerCase().includes(q) ||
      (c.description && c.description.toLowerCase().includes(q)) ||
      c.category.toLowerCase().includes(q)
    );
  });

  const standardFormFields = filteredAvailable.filter((c) => c.category === 'form_standard');
  const customFormFields = filteredAvailable.filter((c) => c.category === 'form_custom');
  const assessmentFields = filteredAvailable.filter((c) => c.category === 'assessment' || c.category === 'core');

  const getCategoryBadge = (category: string) => {
    switch (category) {
      case 'form_custom':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-2xs font-extrabold bg-purple-100 text-purple-800 border border-purple-200">
            <Sparkles className="w-2.5 h-2.5" />
            Custom Form Question
          </span>
        );
      case 'form_standard':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-2xs font-bold bg-blue-50 text-blue-700 border border-blue-200">
            <GraduationCap className="w-2.5 h-2.5" />
            Form Intake Field
          </span>
        );
      case 'assessment':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-2xs font-bold bg-amber-50 text-amber-700 border border-amber-200">
            <Award className="w-2.5 h-2.5" />
            Assessment
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-2xs font-bold bg-slate-100 text-slate-700 border border-slate-200">
            <User className="w-2.5 h-2.5" />
            Core Info
          </span>
        );
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-150">
      <div className="bg-white rounded-3xl shadow-2xl border border-slate-200 w-full max-w-4xl max-h-[90vh] flex flex-col overflow-hidden animate-in zoom-in-95 duration-150">
        {/* Header */}
        <div className="p-5 sm:p-6 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-purple-100 flex items-center justify-center text-kulkul-purple shadow-sm">
              <Sliders className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg font-black text-slate-900">Customize Candidate Table Columns</h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Add standard intake answers, custom form questions, or evaluation scores to your candidate table.
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-xl text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Quick Toolbar */}
        <div className="px-6 py-3 border-b border-slate-100 bg-white flex flex-wrap items-center justify-between gap-3">
          <div className="relative flex-1 min-w-[240px]">
            <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              placeholder="Search available columns or form fields..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-4 py-2 rounded-xl text-xs bg-slate-50 border border-slate-200 focus:outline-none focus:ring-2 focus:ring-kulkul-purple font-medium"
            />
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={handleResetToDefault}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold text-slate-600 hover:text-slate-900 hover:bg-slate-100 border border-slate-200 transition"
              title="Restore standard default table columns"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>Reset Default</span>
            </button>
            <button
              onClick={handleAddAllFormFields}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold bg-purple-50 text-kulkul-purple hover:bg-purple-100 border border-purple-200 transition"
              title="Add all available form fields and custom questions to the table"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Add All Form Fields</span>
            </button>
          </div>
        </div>

        {/* Body Split */}
        <div className="flex-1 overflow-y-auto p-6 grid grid-cols-1 md:grid-cols-12 gap-6 bg-slate-50/30">
          {/* Active Columns List (Left/Top) */}
          <div className="md:col-span-5 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-black text-slate-700 uppercase tracking-wider">
                Visible Columns ({activeColumns.length})
              </span>
              <span className="text-2xs text-slate-400 font-medium">Reorder or remove</span>
            </div>

            <div className="space-y-2 max-h-[460px] overflow-y-auto pr-1">
              {activeColumns.map((colId, index) => {
                const colDef = allColumnsMap.get(colId) || {
                  id: colId,
                  label: colId,
                  category: 'form_custom',
                  removable: true,
                };
                const isCandidate = colId === 'candidate';
                const isActions = colId === 'actions';
                const canMoveUp = index > 0 && activeColumns[index - 1] !== 'candidate' && !isCandidate && !isActions;
                const canMoveDown = index < activeColumns.length - 1 && activeColumns[index + 1] !== 'actions' && !isCandidate && !isActions;

                return (
                  <div
                    key={colId}
                    className={`flex items-center justify-between p-3 rounded-2xl border transition ${
                      isCandidate || isActions
                        ? 'bg-slate-100/70 border-slate-200 text-slate-600'
                        : 'bg-white border-slate-200 shadow-xs hover:border-purple-300'
                    }`}
                  >
                    <div className="flex items-center gap-2.5 min-w-0 pr-2">
                      <span className="text-2xs font-black text-slate-400 w-4 text-center">
                        {index + 1}
                      </span>
                      <div className="min-w-0">
                        <div className="text-xs font-extrabold text-slate-900 truncate">
                          {colDef.label}
                        </div>
                        <div className="mt-0.5">{getCategoryBadge(colDef.category)}</div>
                      </div>
                    </div>

                    <div className="flex items-center gap-1 shrink-0">
                      {!isCandidate && !isActions && (
                        <>
                          <button
                            type="button"
                            disabled={!canMoveUp}
                            onClick={() => handleMoveUp(index)}
                            className="p-1 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 disabled:opacity-30 disabled:pointer-events-none transition"
                            title="Move column left/up"
                          >
                            <ArrowUp className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            disabled={!canMoveDown}
                            onClick={() => handleMoveDown(index)}
                            className="p-1 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 disabled:opacity-30 disabled:pointer-events-none transition"
                            title="Move column right/down"
                          >
                            <ArrowDown className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleRemove(colId)}
                            className="p-1 rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-50 transition ml-0.5"
                            title="Remove this column"
                          >
                            <X className="w-4 h-4" />
                          </button>
                        </>
                      )}
                      {(isCandidate || isActions) && (
                        <span className="text-2xs text-slate-400 font-bold whitespace-nowrap">
                          (Fixed)
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Available Columns to Add (Right/Bottom) */}
          <div className="md:col-span-7 space-y-4">
            <div className="flex items-center justify-between">
              <span className="text-xs font-black text-slate-700 uppercase tracking-wider">
                Available Fields & Questions
              </span>
              <span className="text-2xs text-slate-400 font-medium">
                Click + Add to include in table
              </span>
            </div>

            <div className="space-y-4 max-h-[460px] overflow-y-auto pr-1">
              {/* Custom Form Questions (Highlighted for the user's explicit request) */}
              {customFormFields.length > 0 && (
                <div className="space-y-2">
                  <div className="flex items-center gap-1.5 text-xs font-black text-purple-900">
                    <Sparkles className="w-3.5 h-3.5 text-kulkul-purple" />
                    <span>Custom Form Questions ({customFormFields.length})</span>
                  </div>
                  <div className="grid grid-cols-1 gap-2">
                    {customFormFields.map((col) => {
                      const isAdded = activeColumns.includes(col.id);
                      return (
                        <div
                          key={col.id}
                          className="flex items-center justify-between p-3 rounded-2xl bg-white border border-purple-100 hover:border-purple-300 transition"
                        >
                          <div className="min-w-0 pr-3">
                            <div className="text-xs font-black text-slate-900 truncate">
                              {col.label}
                            </div>
                            <div className="text-2xs text-slate-500 truncate">
                              {col.description || 'Custom answer from form'}
                            </div>
                          </div>
                          {isAdded ? (
                            <span className="inline-flex items-center gap-1 text-xs font-bold text-emerald-700 shrink-0 whitespace-nowrap">
                              <Check className="w-3.5 h-3.5" />
                              Added
                            </span>
                          ) : (
                            <button
                              type="button"
                              onClick={() => handleAdd(col.id)}
                              className="inline-flex items-center gap-1 px-3 py-1 rounded-xl text-xs font-bold bg-purple-600 text-white hover:bg-purple-700 transition shadow-xs shrink-0"
                            >
                              <Plus className="w-3 h-3" />
                              Add
                            </button>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Standard Application Form Fields */}
              {standardFormFields.length > 0 && (
                <div className="space-y-2">
                  <div className="flex items-center gap-1.5 text-xs font-black text-slate-800">
                    <FileText className="w-3.5 h-3.5 text-blue-600" />
                    <span>Standard Application Form Fields ({standardFormFields.length})</span>
                  </div>
                  <div className="grid grid-cols-1 gap-2">
                    {standardFormFields.map((col) => {
                      const isAdded = activeColumns.includes(col.id);
                      return (
                        <div
                          key={col.id}
                          className="flex items-center justify-between p-3 rounded-2xl bg-white border border-slate-200 hover:border-blue-300 transition"
                        >
                          <div className="min-w-0 pr-3">
                            <div className="text-xs font-extrabold text-slate-900 truncate">
                              {col.label}
                            </div>
                            <div className="text-2xs text-slate-500 truncate">
                              {col.description}
                            </div>
                          </div>
                          {isAdded ? (
                            <span className="inline-flex items-center gap-1 text-xs font-bold text-emerald-700 shrink-0 whitespace-nowrap">
                              <Check className="w-3.5 h-3.5" />
                              Added
                            </span>
                          ) : (
                            <button
                              type="button"
                              onClick={() => handleAdd(col.id)}
                              className="inline-flex items-center gap-1 px-3 py-1 rounded-xl text-xs font-bold bg-slate-900 text-white hover:bg-slate-800 transition shadow-xs shrink-0"
                            >
                              <Plus className="w-3 h-3" />
                              Add
                            </button>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Assessment & Pipeline Columns */}
              {assessmentFields.length > 0 && (
                <div className="space-y-2">
                  <div className="flex items-center gap-1.5 text-xs font-black text-slate-800">
                    <Award className="w-3.5 h-3.5 text-amber-600" />
                    <span>Evaluation & Pipeline Fields</span>
                  </div>
                  <div className="grid grid-cols-1 gap-2">
                    {assessmentFields.map((col) => {
                      const isAdded = activeColumns.includes(col.id);
                      return (
                        <div
                          key={col.id}
                          className="flex items-center justify-between p-3 rounded-2xl bg-white border border-slate-200 hover:border-amber-300 transition"
                        >
                          <div className="min-w-0 pr-3">
                            <div className="text-xs font-extrabold text-slate-900 truncate">
                              {col.label}
                            </div>
                            <div className="text-2xs text-slate-500 truncate">
                              {col.description}
                            </div>
                          </div>
                          {isAdded ? (
                            <span className="inline-flex items-center gap-1 text-xs font-bold text-emerald-700 shrink-0 whitespace-nowrap">
                              <Check className="w-3.5 h-3.5" />
                              Added
                            </span>
                          ) : (
                            <button
                              type="button"
                              onClick={() => handleAdd(col.id)}
                              className="inline-flex items-center gap-1 px-3 py-1 rounded-xl text-xs font-bold bg-slate-900 text-white hover:bg-slate-800 transition shadow-xs shrink-0"
                            >
                              <Plus className="w-3 h-3" />
                              Add
                            </button>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {filteredAvailable.length === 0 && (
                <div className="py-8 text-center text-slate-400 text-xs">
                  No matching fields found for &ldquo;{searchQuery}&rdquo;.
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="p-4 sm:p-5 border-t border-slate-100 bg-white flex items-center justify-between">
          <div className="text-xs text-slate-500">
            <span className="font-bold text-slate-800">{activeColumns.length}</span> columns will be displayed in the candidate table. Changes save automatically.
          </div>
          <button
            onClick={onClose}
            className="px-6 py-2.5 rounded-2xl bg-kulkul-purple text-white font-extrabold text-xs shadow-md hover:bg-kulkul-purple-hover transition"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
};
