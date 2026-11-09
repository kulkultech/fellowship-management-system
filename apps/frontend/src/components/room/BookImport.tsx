import React, { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { FileArchive, Github, Loader2, RefreshCw, Upload, X } from 'lucide-react';
import toast from 'react-hot-toast';
import {
  roomContentService,
  type CurriculumImportInput,
  type CurriculumImportReport,
  type CurriculumSource,
} from '@/services/roomContentService';

const queryKey = (programId: string) => ['room-content', programId];

const formatWhen = (iso: string) =>
  new Date(iso).toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' });

/** One line naming the book, e.g. "kulkultech/qa-courses · main · 6f79cee". */
export const sourceName = (source: CurriculumSource) =>
  source.kind === 'github'
    ? [source.repo, source.ref, source.commit].filter(Boolean).join(' · ')
    : source.file_name || 'Uploaded zip';

const useBookImport = (programId: string, onDone: (report: CurriculumImportReport) => void) => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CurriculumImportInput) => roomContentService.importBook(programId, input),
    onSuccess: ({ content, report }) => {
      queryClient.setQueryData(queryKey(programId), { content, can_edit: true });
      onDone(report);
    },
    onError: (err: any) => {
      toast.error(err?.response?.data?.error || 'Import failed');
    },
  });
};

const summary = (r: CurriculumImportReport) => {
  const parts = [`${r.added} added`, `${r.updated} updated`, `${r.unchanged} unchanged`];
  if (r.removed.length) parts.push(`${r.removed.length} removed`);
  return `${r.chapters} chapter${r.chapters === 1 ? '' : 's'}: ${parts.join(', ')}`;
};

/** Staff line above the modules: which book they come from, with Sync now for GitHub books. */
export const BookSourceBar: React.FC<{ programId: string; source: CurriculumSource; onImport: () => void }> = ({
  programId,
  source,
  onImport,
}) => {
  const sync = useBookImport(programId, (report) => {
    toast.success(`Synced. ${summary(report)}`);
    if (report.warnings.length) toast(`${report.warnings.length} warning${report.warnings.length > 1 ? 's' : ''}: ${report.warnings[0]}`);
  });
  const url = source.kind === 'github' && source.repo ? `https://github.com/${source.repo}${source.ref ? `/tree/${source.ref}` : ''}` : '';
  return (
    <div className="panel flex flex-wrap items-center gap-x-3 gap-y-2">
      {source.kind === 'github' ? <Github className="w-4 h-4 text-slate-500 shrink-0" /> : <FileArchive className="w-4 h-4 text-slate-500 shrink-0" />}
      <div className="flex-1 min-w-0">
        <p className="text-xs font-bold text-slate-900 truncate">
          Imported from{' '}
          {url ? (
            <a href={url} target="_blank" rel="noopener noreferrer" className="text-kulkul-purple hover:underline">
              {sourceName(source)}
            </a>
          ) : (
            sourceName(source)
          )}
        </p>
        <p className="meta-text">
          {formatWhen(source.imported_at)}. Edit chapters in the book; importing again updates their modules and keeps dates and audience.
        </p>
      </div>
      {source.kind === 'github' ? (
        <button
          type="button"
          disabled={sync.isPending}
          onClick={() => sync.mutate({ repo: source.repo || '', ref: source.ref, path: source.path })}
          className="btn btn-sm btn-outline"
        >
          {sync.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
          <span>{sync.isPending ? 'Syncing…' : 'Sync now'}</span>
        </button>
      ) : (
        <button type="button" onClick={onImport} className="btn btn-sm btn-outline">
          <Upload className="w-3.5 h-3.5" />
          <span>Upload new version</span>
        </button>
      )}
    </div>
  );
};

/** Import a Leanpub-style book (Book.txt + Markua chapters) from GitHub or a zip. */
export const BookImportDialog: React.FC<{ programId: string; source?: CurriculumSource; onClose: () => void }> = ({
  programId,
  source,
  onClose,
}) => {
  const [mode, setMode] = useState<'github' | 'zip'>(source?.kind === 'zip' ? 'zip' : 'github');
  const [repo, setRepo] = useState(source?.kind === 'github' ? source.repo || '' : '');
  const [ref, setRef] = useState(source?.kind === 'github' ? source.ref || '' : '');
  const [file, setFile] = useState<File | null>(null);
  const [report, setReport] = useState<CurriculumImportReport | null>(null);
  const importBook = useBookImport(programId, setReport);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (mode === 'zip') {
      if (!file) return toast.error('Choose a .zip file');
      importBook.mutate({ file });
    } else {
      if (!repo.trim()) return toast.error('Enter a GitHub repository');
      importBook.mutate({ repo: repo.trim(), ref: ref.trim() || undefined, path: source?.kind === 'github' && source.repo === repo.trim() ? source.path : undefined });
    }
  };

  const choice = (value: 'github' | 'zip', icon: React.ReactNode, title: string, hint: string) => (
    <button
      type="button"
      onClick={() => setMode(value)}
      className={`p-3 rounded-2xl border text-left flex items-start gap-3 transition cursor-pointer ${
        mode === value ? 'border-kulkul-purple bg-purple-50/50 ring-2 ring-purple-100 shadow-2xs' : 'border-slate-200 hover:border-slate-300 bg-white'
      }`}
    >
      <div className={`p-2 rounded-xl shrink-0 ${mode === value ? 'bg-kulkul-purple text-white' : 'bg-slate-100 text-slate-500'}`}>{icon}</div>
      <div>
        <div className="text-sm font-bold text-slate-900">{title}</div>
        <div className="text-xs text-slate-500 mt-0.5">{hint}</div>
      </div>
    </button>
  );

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <form className="modal-panel max-w-lg" onClick={(e) => e.stopPropagation()} onSubmit={submit}>
        <div className="section-header">
          <h2 className="section-title">Import Book</h2>
          <button type="button" onClick={onClose} className="btn btn-icon-sm btn-ghost" aria-label="Close">
            <X className="w-4 h-4" />
          </button>
        </div>

        {report ? (
          <div className="space-y-3">
            <p className="text-sm font-bold text-slate-900">{summary(report)}</p>
            {report.images > 0 && <p className="text-xs text-slate-600">{report.images} image{report.images > 1 ? 's' : ''} uploaded.</p>}
            {report.removed.length > 0 && (
              <div>
                <p className="field-label">Removed (no longer in the book)</p>
                <ul className="list-disc pl-5 text-xs text-slate-600 space-y-0.5">
                  {report.removed.map((t) => (
                    <li key={t}>{t}</li>
                  ))}
                </ul>
              </div>
            )}
            {report.warnings.length > 0 && (
              <div>
                <p className="field-label">Warnings</p>
                <ul className="list-disc pl-5 text-xs text-amber-700 space-y-0.5">
                  {report.warnings.map((w) => (
                    <li key={w}>{w}</li>
                  ))}
                </ul>
              </div>
            )}
            <div className="modal-footer">
              <button type="button" onClick={onClose} className="btn btn-sm btn-primary">
                Done
              </button>
            </div>
          </div>
        ) : (
          <>
            <div className="space-y-4">
              <p className="text-xs text-slate-600">
                Import a Leanpub-style book written in Markua. <code>Book.txt</code> lists the chapter files in order (usually in{' '}
                <code>manuscript/</code>); each chapter (<code># heading</code>) becomes a module, with images from{' '}
                <code>resources/</code>, and quizzes and exercises fellows can answer. Importing again updates those modules and keeps their dates and
                audience. Modules you wrote here are left alone.
              </p>
              <div className="grid grid-cols-2 gap-3">
                {choice('github', <Github className="w-4 h-4" />, 'GitHub repository', 'Sync again any time')}
                {choice('zip', <FileArchive className="w-4 h-4" />, 'Upload zip', 'Up to 50 MB')}
              </div>
              {mode === 'github' ? (
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div className="sm:col-span-2">
                    <label className="field-label" htmlFor="book-repo">
                      Repository <span className="text-rose-500">*</span>
                    </label>
                    <input
                      id="book-repo"
                      type="text"
                      autoFocus
                      value={repo}
                      onChange={(e) => setRepo(e.target.value)}
                      placeholder="owner/repo or https://github.com/…"
                      className="form-input"
                    />
                  </div>
                  <div>
                    <label className="field-label" htmlFor="book-ref">
                      Branch
                    </label>
                    <input id="book-ref" type="text" value={ref} onChange={(e) => setRef(e.target.value)} placeholder="default" className="form-input" />
                  </div>
                  <p className="meta-text sm:col-span-3">Private repositories need FellowHire's GitHub token to have read access.</p>
                </div>
              ) : (
                <div>
                  <label className="field-label" htmlFor="book-zip">
                    Zip of the repository or manuscript folder <span className="text-rose-500">*</span>
                  </label>
                  <input
                    id="book-zip"
                    type="file"
                    accept=".zip,application/zip"
                    onChange={(e) => setFile(e.target.files?.[0] || null)}
                    className="form-input"
                  />
                </div>
              )}
            </div>
            <div className="modal-footer">
              <button type="button" onClick={onClose} className="btn btn-sm btn-outline">
                Cancel
              </button>
              <button type="submit" disabled={importBook.isPending} className="btn btn-sm btn-primary">
                {importBook.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Upload className="w-3.5 h-3.5" />}
                <span>{importBook.isPending ? 'Importing…' : 'Import'}</span>
              </button>
            </div>
          </>
        )}
      </form>
    </div>
  );
};
