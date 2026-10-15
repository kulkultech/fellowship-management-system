import React, { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Check, Search, X } from 'lucide-react';
import toast from 'react-hot-toast';
import { fellowGroupService } from '@/services/fellowGroupService';
import type { ApplicantListItem } from '@/services/types';

interface FellowPickerProps {
  programId: string;
  fellows: ApplicantListItem[];
  showTracks: boolean;
  selectedIds: string[];
  onChange: (ids: string[]) => void;
  /** Text shown under the list for the current selection count */
  summaryLabel?: (count: number) => string;
}

const defaultSummary = (count: number) =>
  count === 0
    ? 'No fellows selected (must select at least 1)'
    : `${count} fellow${count > 1 ? 's' : ''} selected`;

/** Picks fellows one by one or a whole Fellow Group at once, for sessions and assignments. */
export const FellowPicker: React.FC<FellowPickerProps> = ({
  programId,
  fellows,
  showTracks,
  selectedIds,
  onChange,
  summaryLabel = defaultSummary,
}) => {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [isNamingGroup, setIsNamingGroup] = useState(false);
  const [newGroupName, setNewGroupName] = useState('');

  const { data: groups = [] } = useQuery({
    queryKey: ['fellow-groups', programId],
    queryFn: () => fellowGroupService.listGroups(programId),
    enabled: Boolean(programId),
  });

  const fellowIds = useMemo(() => new Set(fellows.map((f) => f.id)), [fellows]);
  const selected = useMemo(() => new Set(selectedIds), [selectedIds]);

  const filteredFellows = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return fellows;
    return fellows.filter(
      (f) =>
        f.full_name?.toLowerCase().includes(q) ||
        f.email?.toLowerCase().includes(q) ||
        f.track_name?.toLowerCase().includes(q)
    );
  }, [fellows, search]);

  const createGroupMutation = useMutation({
    mutationFn: () =>
      fellowGroupService.createGroup(programId, { name: newGroupName.trim(), member_ids: selectedIds }),
    onSuccess: (group) => {
      toast.success(`Saved "${group.name}" as a Fellow Group`);
      setIsNamingGroup(false);
      setNewGroupName('');
      queryClient.invalidateQueries({ queryKey: ['fellow-groups', programId] });
    },
    onError: (err: any) => {
      toast.error(err?.response?.data?.error || 'Failed to save Fellow Group');
    },
  });

  const deleteGroupMutation = useMutation({
    mutationFn: (groupId: string) => fellowGroupService.deleteGroup(programId, groupId),
    onSuccess: () => {
      toast.success('Fellow Group deleted');
      queryClient.invalidateQueries({ queryKey: ['fellow-groups', programId] });
    },
    onError: (err: any) => {
      toast.error(err?.response?.data?.error || 'Failed to delete Fellow Group');
    },
  });

  const toggleFellow = (id: string, checked: boolean) => {
    onChange(checked ? [...selectedIds.filter((x) => x !== id), id] : selectedIds.filter((x) => x !== id));
  };

  const toggleGroup = (memberIds: string[], allSelected: boolean) => {
    if (allSelected) {
      const remove = new Set(memberIds);
      onChange(selectedIds.filter((id) => !remove.has(id)));
    } else {
      onChange(Array.from(new Set([...selectedIds, ...memberIds])));
    }
  };

  return (
    <div className="panel-muted space-y-3 mt-2">
      {/* Fellow Groups */}
      <div className="space-y-2">
        <div className="flex items-center justify-between gap-2">
          <span className="field-label mb-0">Fellow Groups</span>
          {selectedIds.length > 0 && !isNamingGroup && (
            <button
              type="button"
              onClick={() => setIsNamingGroup(true)}
              className="btn btn-sm btn-ghost"
            >
              Save selection as group
            </button>
          )}
        </div>

        {isNamingGroup && (
          <div className="flex items-center gap-2">
            <input
              type="text"
              autoFocus
              value={newGroupName}
              onChange={(e) => setNewGroupName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  if (newGroupName.trim()) createGroupMutation.mutate();
                }
                if (e.key === 'Escape') setIsNamingGroup(false);
              }}
              placeholder={`Group name for ${selectedIds.length} fellow${selectedIds.length > 1 ? 's' : ''}`}
              className="form-input flex-1"
            />
            <button
              type="button"
              disabled={!newGroupName.trim() || createGroupMutation.isPending}
              onClick={() => createGroupMutation.mutate()}
              className="btn btn-sm btn-primary"
            >
              Save
            </button>
            <button type="button" onClick={() => setIsNamingGroup(false)} className="btn btn-sm btn-outline">
              Cancel
            </button>
          </div>
        )}

        {groups.length === 0 ? (
          <p className="meta-text">
            No groups yet. Tick fellows below, then save them as a group to reuse next time.
          </p>
        ) : (
          <div className="flex flex-wrap gap-1.5">
            {groups.map((group) => {
              const members = group.member_ids.filter((id) => fellowIds.has(id));
              const allSelected = members.length > 0 && members.every((id) => selected.has(id));
              return (
                <div
                  key={group.id}
                  className={`inline-flex items-center rounded-xl border text-xs font-semibold transition ${
                    allSelected
                      ? 'bg-kulkul-purple border-kulkul-purple text-white'
                      : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-100'
                  }`}
                >
                  <button
                    type="button"
                    disabled={members.length === 0}
                    onClick={() => toggleGroup(members, allSelected)}
                    className="inline-flex items-center gap-1.5 pl-3 pr-1.5 py-1.5 disabled:opacity-50"
                    title={allSelected ? 'Unselect this group' : 'Select everyone in this group'}
                  >
                    {allSelected && <Check className="w-3.5 h-3.5" />}
                    <span>{group.name}</span>
                    <span className={allSelected ? 'text-white/70' : 'text-slate-400'}>{members.length}</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      if (window.confirm(`Delete the Fellow Group "${group.name}"? Sessions and assignments already sent keep their fellows.`)) {
                        deleteGroupMutation.mutate(group.id);
                      }
                    }}
                    className={`pr-2 pl-0.5 py-1.5 ${allSelected ? 'text-white/70 hover:text-white' : 'text-slate-300 hover:text-rose-600'}`}
                    title="Delete group"
                    aria-label={`Delete group ${group.name}`}
                  >
                    <X className="w-3 h-3" />
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Individual fellows */}
      <div className="flex items-center justify-between gap-2 pt-1 border-t border-slate-200">
        <div className="search-field flex-1 mt-2 sm:w-auto">
          <Search />
          <input
            type="text"
            placeholder={showTracks ? 'Search fellows by name, email, or track...' : 'Search fellows by name or email...'}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="search-input bg-white"
          />
        </div>
        <div className="flex items-center gap-1 shrink-0 mt-2">
          <button
            type="button"
            onClick={() => onChange(fellows.map((f) => f.id))}
            className="btn btn-sm btn-ghost"
          >
            Select All
          </button>
          <button
            type="button"
            onClick={() => onChange([])}
            className="btn btn-sm btn-ghost"
          >
            Clear
          </button>
        </div>
      </div>

      <div className="max-h-48 overflow-y-auto space-y-1.5 pr-1">
        {filteredFellows.length === 0 ? (
          <div className="meta-text text-center py-4">
            {search ? `No fellows found matching "${search}"` : 'No fellows in this program yet'}
          </div>
        ) : (
          filteredFellows.map((fellow) => {
            const isChecked = selected.has(fellow.id);
            return (
              <label
                key={fellow.id}
                className={`flex items-center justify-between p-2.5 rounded-xl border text-sm cursor-pointer transition ${
                  isChecked ? 'bg-purple-50/70 border-purple-200' : 'bg-white border-slate-200 hover:bg-slate-50'
                }`}
              >
                <div className="flex items-center gap-3 min-w-0">
                  <input
                    type="checkbox"
                    checked={isChecked}
                    onChange={(e) => toggleFellow(fellow.id, e.target.checked)}
                    className="checkbox checkbox-sm checkbox-primary rounded"
                  />
                  <div className="truncate">
                    <span className="font-semibold text-slate-900">{fellow.full_name}</span>
                    <span className="meta-text ml-1.5">({fellow.email})</span>
                  </div>
                </div>
                {fellow.track_name && showTracks && (
                  <span className="meta-text shrink-0 font-medium ml-2">{fellow.track_name}</span>
                )}
              </label>
            );
          })
        )}
      </div>

      <div className="meta-text font-medium flex items-center justify-between pt-1">
        <span>{summaryLabel(selectedIds.length)}</span>
        {selectedIds.length > 0 && (
          <span className="text-kulkul-purple font-semibold">
            {selectedIds.length} / {fellows.length}
          </span>
        )}
      </div>
    </div>
  );
};
