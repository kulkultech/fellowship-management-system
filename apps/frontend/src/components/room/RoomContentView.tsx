import React, { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ArrowDown,
  ArrowUp,
  BookOpen,
  ExternalLink,
  FileText,
  Github,
  Link2,
  Loader2,
  MessageSquare,
  Pencil,
  Plus,
  Trash2,
  X,
} from 'lucide-react';
import toast from 'react-hot-toast';
import {
  roomContentService,
  type CurriculumItem,
  type RoomResource,
  type RoomResourceCategory,
} from '@/services/roomContentService';

interface RoomContentViewProps {
  programId: string;
  section: 'curriculum' | 'resources';
}

export const roomContentQueryKey = (programId: string) => ['room-content', programId];

const CATEGORY_META: Record<RoomResourceCategory, { label: string; icon: React.ComponentType<{ className?: string }> }> = {
  channel: { label: 'Channel', icon: MessageSquare },
  repository: { label: 'Repository', icon: Github },
  document: { label: 'Document', icon: FileText },
  link: { label: 'Link', icon: Link2 },
};

const formatDate = (iso?: string) =>
  iso ? new Date(`${iso}T00:00:00`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '';

const dateRange = (item: CurriculumItem) => {
  if (item.start_date && item.end_date) return `${formatDate(item.start_date)} – ${formatDate(item.end_date)}`;
  if (item.start_date) return `From ${formatDate(item.start_date)}`;
  if (item.end_date) return `Until ${formatDate(item.end_date)}`;
  return '';
};

const isCurrent = (item: CurriculumItem) => {
  const today = new Date().toISOString().slice(0, 10);
  if (!item.start_date && !item.end_date) return false;
  return (!item.start_date || item.start_date <= today) && (!item.end_date || today <= item.end_date);
};

const hostOf = (url: string) => {
  try {
    return new URL(url).host.replace(/^www\./, '');
  } catch {
    return url;
  }
};

type Draft = { id?: string; title: string; description: string; start_date: string; end_date: string; url: string; category: RoomResourceCategory };
const emptyDraft: Draft = { title: '', description: '', start_date: '', end_date: '', url: '', category: 'link' };

/** Curriculum or resources of a program room. Fellows read; the program's admins and mentors can edit. */
export const RoomContentView: React.FC<RoomContentViewProps> = ({ programId, section }) => {
  const queryClient = useQueryClient();
  const [draft, setDraft] = useState<Draft | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: roomContentQueryKey(programId),
    queryFn: () => roomContentService.getContent(programId),
    enabled: Boolean(programId),
  });
  const canEdit = Boolean(data?.can_edit);
  const curriculum = data?.content.curriculum || [];
  const resources = data?.content.resources || [];
  const items: Array<CurriculumItem | RoomResource> = section === 'curriculum' ? curriculum : resources;

  const saveMutation = useMutation({
    mutationFn: (next: Array<CurriculumItem | RoomResource>) =>
      section === 'curriculum'
        ? roomContentService.saveCurriculum(programId, next as CurriculumItem[])
        : roomContentService.saveResources(programId, next as RoomResource[]),
    onSuccess: (content) => {
      queryClient.setQueryData(roomContentQueryKey(programId), { content, can_edit: true });
      setDraft(null);
    },
    onError: (err: any) => {
      toast.error(err?.response?.data?.error || 'Failed to save changes');
    },
  });

  const save = (next: Array<CurriculumItem | RoomResource>, message: string) =>
    saveMutation.mutate(next, { onSuccess: () => toast.success(message) });

  const move = (index: number, delta: number) => {
    const next = [...items];
    const [moved] = next.splice(index, 1);
    next.splice(index + delta, 0, moved);
    save(next, 'Order updated');
  };

  const remove = (index: number) => {
    const item = items[index];
    if (!window.confirm(`Remove "${item.title}"?`)) return;
    save(items.filter((_, i) => i !== index), 'Removed');
  };

  const submitDraft = (e: React.FormEvent) => {
    e.preventDefault();
    if (!draft) return;
    const entry =
      section === 'curriculum'
        ? {
            id: draft.id || '',
            title: draft.title,
            description: draft.description,
            start_date: draft.start_date,
            end_date: draft.end_date,
          }
        : { id: draft.id || '', title: draft.title, description: draft.description, url: draft.url, category: draft.category };
    const next = draft.id
      ? items.map((it) => (it.id === draft.id ? (entry as CurriculumItem | RoomResource) : it))
      : [...items, entry as CurriculumItem | RoomResource];
    save(next, draft.id ? 'Saved' : 'Added');
  };

  const openEditor = (item?: CurriculumItem | RoomResource) => {
    if (!item) return setDraft({ ...emptyDraft });
    const asCurriculum = item as CurriculumItem;
    const asResource = item as RoomResource;
    setDraft({
      id: item.id,
      title: item.title,
      description: item.description || '',
      start_date: asCurriculum.start_date || '',
      end_date: asCurriculum.end_date || '',
      url: asResource.url || '',
      category: asResource.category || 'link',
    });
  };

  const noun = section === 'curriculum' ? 'Module' : 'Resource';

  if (isLoading) {
    return (
      <div className="content-card p-12 flex items-center justify-center gap-2 text-xs text-slate-500">
        <Loader2 className="w-4 h-4 animate-spin" />
        <span>Loading…</span>
      </div>
    );
  }

  return (
    <div className="content-card space-y-4">
      {canEdit && (
        <div className="flex justify-end">
          <button type="button" onClick={() => openEditor()} className="btn btn-sm btn-primary">
            <Plus className="w-3.5 h-3.5" />
            <span>Add {noun}</span>
          </button>
        </div>
      )}

      {items.length === 0 ? (
        <div className="py-12 text-center space-y-2">
          {section === 'curriculum' ? (
            <BookOpen className="w-8 h-8 text-slate-300 mx-auto" />
          ) : (
            <Link2 className="w-8 h-8 text-slate-300 mx-auto" />
          )}
          <p className="text-xs text-slate-500">
            {section === 'curriculum' ? 'No curriculum yet.' : 'No resources yet.'}
          </p>
        </div>
      ) : section === 'curriculum' ? (
        <ol className="space-y-3">
          {curriculum.map((item, index) => {
            const current = isCurrent(item);
            const range = dateRange(item);
            return (
              <li key={item.id} className={`panel flex gap-4 ${current ? 'border-kulkul-purple' : ''}`}>
                <span
                  className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-extrabold shrink-0 ${
                    current ? 'bg-kulkul-purple text-white' : 'bg-slate-100 text-slate-600'
                  }`}
                >
                  {index + 1}
                </span>
                <div className="flex-1 min-w-0 space-y-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="card-title">{item.title}</span>
                    {current && <span className="text-2xs font-bold text-kulkul-purple">Now</span>}
                  </div>
                  {range && <p className="meta-text">{range}</p>}
                  {item.description && (
                    <p className="text-xs text-slate-600 leading-relaxed whitespace-pre-line">{item.description}</p>
                  )}
                </div>
                {canEdit && (
                  <ItemControls
                    index={index}
                    count={curriculum.length}
                    busy={saveMutation.isPending}
                    onMove={move}
                    onEdit={() => openEditor(item)}
                    onRemove={() => remove(index)}
                  />
                )}
              </li>
            );
          })}
        </ol>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {resources.map((item, index) => {
            const meta = CATEGORY_META[item.category] || CATEGORY_META.link;
            const Icon = meta.icon;
            return (
              <div key={item.id} className="panel flex gap-3">
                <div className="w-9 h-9 rounded-xl bg-slate-100 text-slate-600 flex items-center justify-center shrink-0">
                  <Icon className="w-4 h-4" />
                </div>
                <div className="flex-1 min-w-0 space-y-1">
                  <div className="card-title truncate">{item.title}</div>
                  <p className="meta-text truncate">
                    {meta.label} · {hostOf(item.url)}
                  </p>
                  {item.description && <p className="text-xs text-slate-600 leading-relaxed">{item.description}</p>}
                  <a href={item.url} target="_blank" rel="noopener noreferrer" className="btn btn-sm btn-outline mt-1">
                    <ExternalLink className="w-3.5 h-3.5" />
                    <span>Open</span>
                  </a>
                </div>
                {canEdit && (
                  <ItemControls
                    index={index}
                    count={resources.length}
                    busy={saveMutation.isPending}
                    onMove={move}
                    onEdit={() => openEditor(item)}
                    onRemove={() => remove(index)}
                  />
                )}
              </div>
            );
          })}
        </div>
      )}

      {draft && (
        <div className="modal-backdrop" onClick={() => setDraft(null)}>
          <form className="modal-panel max-w-lg" onClick={(e) => e.stopPropagation()} onSubmit={submitDraft}>
            <div className="section-header">
              <h2 className="section-title">{draft.id ? `Edit ${noun}` : `Add ${noun}`}</h2>
              <button type="button" onClick={() => setDraft(null)} className="btn btn-icon-sm btn-ghost" aria-label="Close">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="field-label" htmlFor="room-item-title">
                  Title <span className="text-rose-500">*</span>
                </label>
                <input
                  id="room-item-title"
                  type="text"
                  required
                  autoFocus
                  maxLength={200}
                  value={draft.title}
                  onChange={(e) => setDraft({ ...draft, title: e.target.value })}
                  placeholder={section === 'curriculum' ? 'e.g. Week 1: Foundations' : 'e.g. Cohort Discord'}
                  className="form-input"
                />
              </div>

              {section === 'resources' && (
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div className="sm:col-span-2">
                    <label className="field-label" htmlFor="room-item-url">
                      Link <span className="text-rose-500">*</span>
                    </label>
                    <input
                      id="room-item-url"
                      type="url"
                      required
                      value={draft.url}
                      onChange={(e) => setDraft({ ...draft, url: e.target.value })}
                      placeholder="https://"
                      className="form-input"
                    />
                  </div>
                  <div>
                    <label className="field-label" htmlFor="room-item-category">
                      Type
                    </label>
                    <select
                      id="room-item-category"
                      value={draft.category}
                      onChange={(e) => setDraft({ ...draft, category: e.target.value as RoomResourceCategory })}
                      className="form-input"
                    >
                      {(Object.keys(CATEGORY_META) as RoomResourceCategory[]).map((c) => (
                        <option key={c} value={c}>
                          {CATEGORY_META[c].label}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              )}

              {section === 'curriculum' && (
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="field-label" htmlFor="room-item-start">
                      Start
                    </label>
                    <input
                      id="room-item-start"
                      type="date"
                      value={draft.start_date}
                      onChange={(e) => setDraft({ ...draft, start_date: e.target.value })}
                      className="form-input"
                    />
                  </div>
                  <div>
                    <label className="field-label" htmlFor="room-item-end">
                      End
                    </label>
                    <input
                      id="room-item-end"
                      type="date"
                      min={draft.start_date || undefined}
                      value={draft.end_date}
                      onChange={(e) => setDraft({ ...draft, end_date: e.target.value })}
                      className="form-input"
                    />
                  </div>
                </div>
              )}

              <div>
                <label className="field-label" htmlFor="room-item-description">
                  Description
                </label>
                <textarea
                  id="room-item-description"
                  rows={3}
                  maxLength={2000}
                  value={draft.description}
                  onChange={(e) => setDraft({ ...draft, description: e.target.value })}
                  className="form-textarea"
                />
              </div>
            </div>

            <div className="modal-footer">
              <button type="button" onClick={() => setDraft(null)} className="btn btn-sm btn-outline">
                Cancel
              </button>
              <button type="submit" disabled={saveMutation.isPending} className="btn btn-sm btn-primary">
                {saveMutation.isPending && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                <span>Save</span>
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
};

const ItemControls: React.FC<{
  index: number;
  count: number;
  busy: boolean;
  onMove: (index: number, delta: number) => void;
  onEdit: () => void;
  onRemove: () => void;
}> = ({ index, count, busy, onMove, onEdit, onRemove }) => (
  <div className="flex items-start gap-0.5 shrink-0">
    <button type="button" disabled={busy || index === 0} onClick={() => onMove(index, -1)} className="btn btn-icon-sm btn-ghost" aria-label="Move up">
      <ArrowUp className="w-4 h-4" />
    </button>
    <button type="button" disabled={busy || index === count - 1} onClick={() => onMove(index, 1)} className="btn btn-icon-sm btn-ghost" aria-label="Move down">
      <ArrowDown className="w-4 h-4" />
    </button>
    <button type="button" disabled={busy} onClick={onEdit} className="btn btn-icon-sm btn-ghost" aria-label="Edit">
      <Pencil className="w-4 h-4" />
    </button>
    <button type="button" disabled={busy} onClick={onRemove} className="btn btn-icon-sm btn-ghost-danger" aria-label="Remove">
      <Trash2 className="w-4 h-4" />
    </button>
  </div>
);
