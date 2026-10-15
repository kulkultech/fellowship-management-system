import React, { useState, useRef } from 'react';
import {
  UploadCloud,
  FileText,
  CheckCircle2,
  AlertCircle,
  AlertTriangle,
  X,
  RefreshCw,
  Layers,
  Check,
  HelpCircle,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import toast from 'react-hot-toast';
import { parseQuestionsCSV, type CSVParseResult } from '@/utils/csvParser';
import { adminService } from '@/services/adminService';
import type { QuestionSet, MCQQuestion, MCQOption } from '@/services/types';

interface ImportQuestionsCsvModalProps {
  isOpen: boolean;
  onClose: () => void;
  targetQuestionSet?: QuestionSet | null;
  onImportSuccess: (result: {
    questions: MCQQuestion[];
    mode: 'replace' | 'append';
    questionSet?: QuestionSet;
  }) => void;
  // If true, automatically updates question set via backend API. Default true.
  syncToBackend?: boolean;
  orgId?: string;
}

export const ImportQuestionsCsvModal: React.FC<ImportQuestionsCsvModalProps> = ({
  isOpen,
  onClose,
  targetQuestionSet,
  onImportSuccess,
  syncToBackend = true,
  orgId,
}) => {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [parseResult, setParseResult] = useState<CSVParseResult | null>(null);
  const [isParsing, setIsParsing] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [importMode, setImportMode] = useState<'replace' | 'append'>('replace');
  const [showErrorDetails, setShowErrorDetails] = useState(false);
  const [showAllPreview, setShowAllPreview] = useState(false);
  const [previewFilter, setPreviewFilter] = useState('');

  // New Question Set fields if not targeting an existing set
  const [newSetName, setNewSetName] = useState('');
  const [newSetCategory, setNewSetCategory] = useState('General Assessment');
  const [newSetDuration, setNewSetDuration] = useState(30);
  const [newSetPassingScore, setNewSetPassingScore] = useState(70);

  const fileInputRef = useRef<HTMLInputElement>(null);

  if (!isOpen) return null;

  const handleFileChange = (file: File) => {
    if (!file.name.toLowerCase().endsWith('.csv') && file.type !== 'text/csv' && file.type !== 'application/vnd.ms-excel') {
      toast.error('Please upload a valid .csv file');
      return;
    }

    setSelectedFile(file);
    setIsParsing(true);

    const defaultCat = targetQuestionSet?.category || 'General Assessment';
    const cleanName = file.name.replace(/\.[^/.]+$/, '');
    setNewSetName(cleanName);

    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const text = e.target?.result as string;
        const result = parseQuestionsCSV(text, defaultCat);
        setParseResult(result);

        if (result.questions.length > 0) {
          toast.success(`Parsed ${result.questions.length} questions successfully!`);
          if (result.questions[0].category) {
            setNewSetCategory(result.questions[0].category);
          }
        } else {
          toast.error('No valid questions found in CSV');
        }
      } catch (err: any) {
        toast.error(`Error reading CSV: ${err?.message || 'unknown error'}`);
      } finally {
        setIsParsing(false);
      }
    };
    reader.onerror = () => {
      toast.error('Failed to read the file');
      setIsParsing(false);
    };
    reader.readAsText(file);
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleFileChange(e.dataTransfer.files[0]);
    }
  };

  const handleResetFile = () => {
    setSelectedFile(null);
    setParseResult(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleConfirmImport = async () => {
    if (!parseResult || parseResult.questions.length === 0 || !selectedFile) {
      toast.error('Please select and parse a valid CSV file first');
      return;
    }

    setIsSubmitting(true);
    try {
      if (syncToBackend) {
        if (targetQuestionSet?.id) {
          // Import into existing Question Set
          const res = await adminService.importQuestionSetCSV(
            targetQuestionSet.id,
            selectedFile,
            importMode,
            orgId
          );
          toast.success(`Successfully imported ${res.imported_count} questions into "${res.question_set.name}"!`);
          onImportSuccess({
            questions: res.question_set.questions || parseResult.questions,
            mode: importMode,
            questionSet: res.question_set,
          });
        } else {
          // Create new Question Set from CSV
          const res = await adminService.createQuestionSetFromCSV(
            selectedFile,
            {
              name: newSetName || selectedFile.name.replace(/\.[^/.]+$/, ''),
              category: newSetCategory || 'General Assessment',
              duration: newSetDuration,
              passing_score: newSetPassingScore,
            },
            orgId
          );
          toast.success(`Created Question Bank "${res.question_set.name}" with ${res.imported_count} questions!`);
          onImportSuccess({
            questions: res.question_set.questions || parseResult.questions,
            mode: 'replace',
            questionSet: res.question_set,
          });
        }
      } else {
        // Pure frontend draft state update
        onImportSuccess({
          questions: parseResult.questions,
          mode: importMode,
        });
        toast.success(`Loaded ${parseResult.questions.length} questions into editor.`);
      }

      onClose();
    } catch (err: any) {
      console.error('Import error:', err);
      const msg = err.response?.data?.error || err.response?.data?.message || err.message || 'Failed to import CSV';
      toast.error(`Import failed: ${msg}`);
    } finally {
      setIsSubmitting(false);
    }
  };

  const filteredPreview = parseResult
    ? parseResult.questions.filter((q: MCQQuestion) => {
        if (!previewFilter) return true;
        const term = previewFilter.toLowerCase();
        return (
          q.question_text.toLowerCase().includes(term) ||
          q.category?.toLowerCase().includes(term) ||
          q.options.some((opt: MCQOption) => opt.text.toLowerCase().includes(term))
        );
      })
    : [];

  const displayedPreview = showAllPreview ? filteredPreview : filteredPreview.slice(0, 5);

  return (
    <div className="modal-backdrop">
      <div className="modal-panel max-w-3xl animate-in fade-in zoom-in-95 duration-150">
        {/* Modal Header */}
        <div className="section-header">
          <div>
            <h2 className="section-title flex items-center gap-2">
              <UploadCloud className="w-5 h-5 text-kulkul-purple" />
              <span>Import Questions from CSV</span>
            </h2>
            <p className="section-subtitle">
              {targetQuestionSet
                ? `Importing into question set: "${targetQuestionSet.name}"`
                : 'Create a new question bank or upload an assessment question set'}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="btn btn-icon-sm btn-ghost"
            aria-label="Close"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="space-y-6 text-slate-700">
          {/* File Picker / Drop Zone */}
          {!selectedFile ? (
            <div
              onDragOver={(e) => e.preventDefault()}
              onDrop={handleDrop}
              onClick={() => fileInputRef.current?.click()}
              className="border-2 border-dashed border-slate-300 hover:border-kulkul-purple rounded-3xl p-8 sm:p-10 text-center cursor-pointer transition bg-slate-50/60 hover:bg-purple-50/30 group"
            >
              <input
                ref={fileInputRef}
                type="file"
                accept=".csv,text/csv,application/vnd.ms-excel"
                className="hidden"
                onChange={(e) => {
                  if (e.target.files && e.target.files[0]) {
                    handleFileChange(e.target.files[0]);
                  }
                }}
              />
              <div className="w-14 h-14 rounded-2xl bg-purple-100/80 group-hover:bg-purple-200/80 text-kulkul-purple flex items-center justify-center mx-auto mb-4 transition">
                <UploadCloud className="w-7 h-7 text-kulkul-purple" />
              </div>
              <h3 className="text-sm font-bold text-slate-800 mb-1">
                Drop your CSV file here, or <span className="text-kulkul-purple underline">browse</span>
              </h3>
              <p className="text-xs text-slate-500 max-w-md mx-auto mb-4">
                Supports semicolon (;) and comma (,) delimited CSV files. Code snippets and quotes are automatically preserved.
              </p>

              <div className="meta-text inline-flex items-center gap-2 font-medium">
                <HelpCircle className="w-3.5 h-3.5 text-slate-400" />
                <span>Format: Question ; Option A ; Option B ; Option C ; Option D ; Answer Key (A/B/C/D) ; Category</span>
              </div>
            </div>
          ) : (
            /* Selected File Summary & Metrics */
            <div className="space-y-6">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-4 rounded-2xl bg-purple-50/50 border border-purple-100">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-purple-100 text-kulkul-purple flex items-center justify-center shrink-0">
                    <FileText className="w-5 h-5" />
                  </div>
                  <div className="min-w-0">
                    <div className="font-extrabold text-sm text-slate-900 truncate">
                      {selectedFile.name}
                    </div>
                    <div className="meta-text">
                      {(selectedFile.size / 1024).toFixed(1)} KB · {isParsing ? 'Parsing questions...' : `${parseResult?.questions.length || 0} questions parsed`}
                    </div>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={handleResetFile}
                  className="btn btn-sm btn-outline shrink-0"
                >
                  Choose Different File
                </button>
              </div>

              {/* Parsing Stats Badges */}
              {parseResult && (
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  <div className="panel-muted">
                    <div className="stat-label">Valid Questions</div>
                    <div className="stat-value mt-0.5 flex items-center gap-1.5">
                      <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                      <span>{parseResult.questions.length}</span>
                    </div>
                  </div>

                  <div className="panel-muted">
                    <div className="stat-label">Delimiter</div>
                    <div className="stat-value mt-0.5">
                      <span className="px-2 py-0.5 rounded-md bg-white border border-slate-200 text-xs font-mono">
                        {parseResult.delimiter === ';' ? 'Semicolon (;)' : 'Comma (,)'}
                      </span>
                    </div>
                  </div>

                  <div className="panel-muted">
                    <div className="stat-label">Total Rows</div>
                    <div className="stat-value mt-0.5">
                      {parseResult.totalRows}
                    </div>
                  </div>

                  <div className={`panel-muted ${parseResult.errors.length > 0 ? 'border-amber-200 bg-amber-50/40' : ''}`}>
                    <div className="stat-label">Skipped / Errors</div>
                    <div className={`stat-value mt-0.5 flex items-center gap-1.5 ${parseResult.errors.length > 0 ? 'text-amber-700' : 'text-slate-900'}`}>
                      {parseResult.errors.length > 0 ? <AlertTriangle className="w-4 h-4 text-amber-600" /> : <Check className="w-4 h-4 text-emerald-600" />}
                      <span>{parseResult.errors.length}</span>
                    </div>
                  </div>
                </div>
              )}

              {/* Error warning collapsible if any */}
              {parseResult && parseResult.errors.length > 0 && (
                <div className="border border-amber-200 bg-amber-50/50 rounded-2xl p-4 text-xs space-y-2">
                  <div className="flex items-center justify-between text-amber-900 font-bold">
                    <span className="flex items-center gap-1.5">
                      <AlertCircle className="w-4 h-4 text-amber-600" />
                      {parseResult.errors.length} rows had formatting issues or were skipped
                    </span>
                    <button
                      type="button"
                      onClick={() => setShowErrorDetails(!showErrorDetails)}
                      className="text-amber-800 underline font-semibold hover:text-amber-950 flex items-center gap-1"
                    >
                      {showErrorDetails ? 'Hide details' : 'View details'}
                      {showErrorDetails ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                    </button>
                  </div>
                  {showErrorDetails && (
                    <div className="max-h-32 overflow-y-auto space-y-1 font-mono text-2xs text-amber-800 bg-white/80 p-2.5 rounded-xl border border-amber-200 mt-2">
                      {parseResult.errors.map((err: string, i: number) => (
                        <div key={i}>• {err}</div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* Target & Options Mode */}
              {targetQuestionSet ? (
                <div className="panel-muted space-y-3">
                  <div className="subsection-title flex items-center gap-1.5">
                    <Layers className="w-4 h-4 text-kulkul-purple" />
                    <span>Import Destination & Mode</span>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                    <label
                      className={`p-3.5 rounded-2xl border cursor-pointer transition flex items-start gap-3 ${
                        importMode === 'replace'
                          ? 'border-kulkul-purple bg-purple-50/40 shadow-xs'
                          : 'border-slate-200 bg-white hover:bg-slate-100/60'
                      }`}
                    >
                      <input
                        type="radio"
                        name="importMode"
                        value="replace"
                        checked={importMode === 'replace'}
                        onChange={() => setImportMode('replace')}
                        className="mt-0.5 text-kulkul-purple focus:ring-kulkul-purple"
                      />
                      <div>
                        <div className="text-xs font-bold text-slate-900">Replace existing questions</div>
                        <div className="meta-text mt-0.5">
                          Overwrites all current questions in "{targetQuestionSet.name}" with the {parseResult?.questions.length || 0} imported questions.
                        </div>
                      </div>
                    </label>

                    <label
                      className={`p-3.5 rounded-2xl border cursor-pointer transition flex items-start gap-3 ${
                        importMode === 'append'
                          ? 'border-kulkul-purple bg-purple-50/40 shadow-xs'
                          : 'border-slate-200 bg-white hover:bg-slate-100/60'
                      }`}
                    >
                      <input
                        type="radio"
                        name="importMode"
                        value="append"
                        checked={importMode === 'append'}
                        onChange={() => setImportMode('append')}
                        className="mt-0.5 text-kulkul-purple focus:ring-kulkul-purple"
                      />
                      <div>
                        <div className="text-xs font-bold text-slate-900">Append to existing questions</div>
                        <div className="meta-text mt-0.5">
                          Preserves existing questions and appends the {parseResult?.questions.length || 0} new questions to the end.
                        </div>
                      </div>
                    </label>
                  </div>
                </div>
              ) : (
                /* New Question Bank Fields */
                <div className="panel-muted space-y-4">
                  <div className="subsection-title flex items-center gap-1.5">
                    <Layers className="w-4 h-4 text-kulkul-purple" />
                    <span>New Question Bank Details</span>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="field-label">
                        Question Set Name
                      </label>
                      <input
                        type="text"
                        value={newSetName}
                        onChange={(e) => setNewSetName(e.target.value)}
                        placeholder="e.g. Fullstack & QA Assessment 2026"
                        className="form-input"
                      />
                    </div>

                    <div>
                      <label className="field-label">
                        Category
                      </label>
                      <input
                        type="text"
                        value={newSetCategory}
                        onChange={(e) => setNewSetCategory(e.target.value)}
                        placeholder="e.g. General Assessment"
                        className="form-input"
                      />
                    </div>

                    <div>
                      <label className="field-label">
                        Duration (Minutes)
                      </label>
                      <input
                        type="number"
                        min={1}
                        max={180}
                        value={newSetDuration}
                        onChange={(e) => setNewSetDuration(Number(e.target.value))}
                        className="form-input"
                      />
                    </div>

                    <div>
                      <label className="field-label">
                        Passing Score (%)
                      </label>
                      <input
                        type="number"
                        min={1}
                        max={100}
                        value={newSetPassingScore}
                        onChange={(e) => setNewSetPassingScore(Number(e.target.value))}
                        className="form-input"
                      />
                    </div>
                  </div>
                </div>
              )}

              {/* Questions Preview List */}
              {parseResult && parseResult.questions.length > 0 && (
                <div className="border border-slate-200 rounded-2xl overflow-hidden bg-white">
                  <div className="p-4 bg-slate-50 border-b border-slate-200 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                    <div className="card-title">
                      Questions Preview ({filteredPreview.length} of {parseResult.questions.length})
                    </div>
                    <div className="flex items-center gap-2 w-full sm:w-auto">
                      <input
                        type="text"
                        placeholder="Filter preview questions..."
                        value={previewFilter}
                        onChange={(e) => setPreviewFilter(e.target.value)}
                        className="form-input text-xs sm:w-48"
                      />
                    </div>
                  </div>

                  <div className="divide-y divide-slate-100 max-h-72 overflow-y-auto p-2">
                    {displayedPreview.map((q: MCQQuestion, idx: number) => (
                      <div key={idx} className="p-3.5 space-y-2 text-xs hover:bg-slate-50/80 rounded-xl transition">
                        <div className="flex items-start justify-between gap-3">
                          <div className="font-bold text-slate-900 flex items-baseline gap-2">
                            <span className="text-2xs font-mono px-1.5 py-0.5 rounded-md bg-slate-100 text-slate-600">
                              #{idx + 1}
                            </span>
                            <span className="whitespace-pre-wrap">{q.question_text}</span>
                          </div>
                          {q.category && (
                            <span className="text-3xs font-extrabold text-kulkul-purple shrink-0">
                              {q.category}
                            </span>
                          )}
                        </div>

                        {/* Options */}
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 pt-1">
                          {q.options.map((opt: MCQOption, optIdx: number) => {
                            const isCorrect = opt.id === q.correct_option_id;
                            const label = (opt.id || String.fromCharCode(65 + optIdx)).toUpperCase();
                            return (
                              <div
                                key={opt.id || optIdx}
                                className={`px-2.5 py-1.5 rounded-lg text-2xs border flex items-center justify-between gap-2 ${
                                  isCorrect
                                    ? 'bg-emerald-50 border-emerald-300 font-bold text-emerald-900'
                                    : 'bg-slate-50/80 border-slate-200 text-slate-600'
                                }`}
                              >
                                <div className="truncate">
                                  <span className="font-mono font-bold mr-1.5">{label}.</span>
                                  <span>{opt.text}</span>
                                </div>
                                {isCorrect && (
                                  <span className="font-mono text-3xs font-bold text-emerald-700 shrink-0">
                                    KEY
                                  </span>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    ))}
                  </div>

                  {filteredPreview.length > 5 && (
                    <div className="p-3 text-center border-t border-slate-100 bg-slate-50/50">
                      <button
                        type="button"
                        onClick={() => setShowAllPreview(!showAllPreview)}
                        className="btn btn-sm btn-ghost"
                      >
                        {showAllPreview ? 'Show first 5 only' : `Show all ${filteredPreview.length} questions`}
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div className="modal-footer">
          <button
            type="button"
            onClick={onClose}
            disabled={isSubmitting}
            className="btn btn-sm btn-outline"
          >
            Cancel
          </button>

          <button
            type="button"
            onClick={handleConfirmImport}
            disabled={isSubmitting || isParsing || !parseResult || parseResult.questions.length === 0}
            className="btn btn-sm btn-primary"
          >
            {isSubmitting ? (
              <>
                <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                <span>Importing...</span>
              </>
            ) : (
              <>
                <UploadCloud className="w-3.5 h-3.5 text-kulkul-orange" />
                <span>
                  {targetQuestionSet
                    ? `Import ${parseResult?.questions.length || 0} Questions`
                    : `Create & Import ${parseResult?.questions.length || 0} Questions`}
                </span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};
export default ImportQuestionsCsvModal;
