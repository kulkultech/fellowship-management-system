import React, { useState } from 'react';
import { FileCode, FileText, MoreHorizontal, PenTool, Plus, X } from 'lucide-react';
import { SUPPORTED_EXTENSIONS_HINT, WorkspaceFile, fileKind, validateFileName } from './workspaceFiles';

const FileIcon: React.FC<{ name: string }> = ({ name }) => {
  const kind = fileKind(name).kind;
  const Icon = kind === 'board' ? PenTool : kind === 'code' ? FileCode : FileText;
  return <Icon className="w-4 h-4" />;
};

/** Dialog asking for a file name (new file or rename). */
const FileNameDialog: React.FC<{
  title: string;
  initial: string;
  files: WorkspaceFile[];
  exceptId?: string;
  submitLabel: string;
  onSubmit: (name: string) => string | null;
  onClose: () => void;
}> = ({ title, initial, files, exceptId, submitLabel, onSubmit, onClose }) => {
  const [name, setName] = useState(initial);
  const [error, setError] = useState<string | null>(null);
  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const problem = validateFileName(name, files, exceptId) || onSubmit(name.trim());
    if (problem) setError(problem);
    else onClose();
  };
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <form className="modal-panel max-w-sm" onClick={(e) => e.stopPropagation()} onSubmit={submit}>
        <div className="section-header">
          <h2 className="section-title">{title}</h2>
          <button type="button" onClick={onClose} className="btn btn-icon-sm btn-ghost" aria-label="Close">
            <X className="w-4 h-4" />
          </button>
        </div>
        <div>
          <label className="field-label" htmlFor="workspace-file-name">
            File name
          </label>
          <input
            id="workspace-file-name"
            autoFocus
            value={name}
            onChange={(e) => {
              setName(e.target.value);
              setError(null);
            }}
            placeholder="e.g. notes.txt, main.py, board.excalidraw"
            className="form-input"
          />
          {error ? (
            <p className="text-xs font-semibold text-rose-600 mt-1">{error}</p>
          ) : (
            <p className="meta-text mt-1">The extension decides how it opens: {SUPPORTED_EXTENSIONS_HINT}.</p>
          )}
        </div>
        <div className="modal-footer">
          <button type="button" onClick={onClose} className="btn btn-sm btn-outline">
            Cancel
          </button>
          <button type="submit" className="btn btn-sm btn-primary">
            {submitLabel}
          </button>
        </div>
      </form>
    </div>
  );
};

/** Top edge of the workspace frame: the files as tabs, plus "New file". Staff can rename and remove files. */
export const WorkspaceFileBar: React.FC<{
  files: WorkspaceFile[];
  activeId: string;
  canManage: boolean;
  onSelect: (id: string) => void;
  onCreate: (name: string) => string | null;
  onRename: (file: WorkspaceFile, name: string) => string | null;
  onRemove: (file: WorkspaceFile) => void;
  trailing?: React.ReactNode;
}> = ({ files, activeId, canManage, onSelect, onCreate, onRename, onRemove, trailing }) => {
  const [dialog, setDialog] = useState<{ mode: 'new' } | { mode: 'rename'; file: WorkspaceFile } | null>(null);
  const [menuFor, setMenuFor] = useState<string | null>(null);

  return (
    <div className="flex flex-wrap items-stretch bg-slate-50 border-b border-slate-200" role="tablist" aria-label="Workspace files">
      {files.map((f) => {
        const active = f.id === activeId;
        return (
          <div
            key={f.id}
            className={`relative flex items-center border-r border-slate-200 ${
              active ? 'bg-white text-slate-900' : 'text-slate-500 hover:text-slate-800 hover:bg-white/70'
            }`}
          >
            {active && <span className="absolute inset-x-0 top-0 h-0.5 bg-kulkul-purple" aria-hidden />}
            <button
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => onSelect(f.id)}
              className={`flex items-center gap-1.5 h-10 text-xs font-semibold ${active && canManage ? 'pl-3.5 pr-1' : 'px-3.5'}`}
              title={f.name}
            >
              <FileIcon name={f.name} />
              <span className="max-w-[10rem] truncate">{f.name}</span>
            </button>
            {active && canManage && (
              <button
                type="button"
                onClick={() => setMenuFor(menuFor === f.id ? null : f.id)}
                className="mr-1.5 p-1 rounded-md text-slate-400 hover:text-slate-700 hover:bg-slate-100"
                aria-label={`Options for ${f.name}`}
              >
                <MoreHorizontal className="w-3.5 h-3.5" />
              </button>
            )}
            {menuFor === f.id && (
              <div className="absolute left-0 top-full mt-1 z-30 w-40 bg-white border border-slate-200 rounded-2xl shadow-lg p-1">
                <button
                  type="button"
                  onClick={() => {
                    setMenuFor(null);
                    setDialog({ mode: 'rename', file: f });
                  }}
                  className="w-full text-left px-3 py-2 rounded-xl text-xs font-semibold text-slate-700 hover:bg-slate-50"
                >
                  Rename
                </button>
                <button
                  type="button"
                  disabled={files.length <= 1}
                  onClick={() => {
                    setMenuFor(null);
                    if (window.confirm(`Remove ${f.name} from the workspace?`)) onRemove(f);
                  }}
                  className="w-full text-left px-3 py-2 rounded-xl text-xs font-semibold text-rose-600 hover:bg-rose-50 disabled:opacity-40"
                >
                  Remove
                </button>
              </div>
            )}
          </div>
        );
      })}
      <button
        type="button"
        onClick={() => setDialog({ mode: 'new' })}
        className="flex items-center gap-1 h-10 px-3 text-xs font-semibold text-slate-500 hover:text-slate-800 hover:bg-white/70"
        title="New file"
      >
        <Plus className="w-4 h-4" />
        <span>New file</span>
      </button>
      {trailing && <div className="ml-auto flex items-stretch border-l border-slate-200">{trailing}</div>}

      {dialog?.mode === 'new' && (
        <FileNameDialog
          title="New file"
          initial=""
          files={files}
          submitLabel="Create"
          onSubmit={onCreate}
          onClose={() => setDialog(null)}
        />
      )}
      {dialog?.mode === 'rename' && (
        <FileNameDialog
          title="Rename file"
          initial={dialog.file.name}
          files={files}
          exceptId={dialog.file.id}
          submitLabel="Rename"
          onSubmit={(name) => onRename(dialog.file, name)}
          onClose={() => setDialog(null)}
        />
      )}
    </div>
  );
};
