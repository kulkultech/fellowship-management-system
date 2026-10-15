import React, { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { Send, X } from 'lucide-react';
import toast from 'react-hot-toast';
import { adminService } from '@/services/adminService';
import type { Track } from '@/services/types';

interface InviteFellowModalProps {
  programId: string;
  programName: string;
  tracks: Track[];
  onClose: () => void;
  onInvited: () => void;
}

/** Adds someone straight into a program as a fellow, skipping the application flow. */
export const InviteFellowModal: React.FC<InviteFellowModalProps> = ({
  programId,
  programName,
  tracks,
  onClose,
  onInvited,
}) => {
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [trackId, setTrackId] = useState('');

  const inviteMutation = useMutation({
    mutationFn: () =>
      adminService.inviteProgramFellow(programId, {
        full_name: fullName.trim(),
        email: email.trim(),
        track_id: trackId || undefined,
      }),
    onSuccess: (data) => {
      toast.success(data?.message || 'Fellow invited');
      onInvited();
      onClose();
    },
    onError: (err: any) => {
      toast.error(err?.response?.data?.error || err?.response?.data?.message || 'Failed to invite fellow');
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!fullName.trim()) {
      toast.error('Full name is required');
      return;
    }
    if (!email.trim()) {
      toast.error('Email is required');
      return;
    }
    inviteMutation.mutate();
  };

  return (
    <div
      className="modal-backdrop animate-in fade-in"
      onClick={onClose}
    >
      <div
        className="modal-panel max-w-lg"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="section-header">
          <div>
            <h2 className="section-title">Invite Fellow</h2>
            <p className="section-subtitle">{programName}</p>
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

        <form onSubmit={handleSubmit} className="space-y-4">
          <p className="text-xs text-slate-600">
            They join without applying and get an email with a link to the Program Room.
          </p>

          <div>
            <label className="field-label" htmlFor="invite-fellow-name">
              Full Name <span className="text-rose-500">*</span>
            </label>
            <input
              id="invite-fellow-name"
              type="text"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              placeholder="e.g. Ada Lovelace"
              className="form-input"
              autoFocus
            />
          </div>

          <div>
            <label className="field-label" htmlFor="invite-fellow-email">
              Email <span className="text-rose-500">*</span>
            </label>
            <input
              id="invite-fellow-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="name@example.com"
              className="form-input"
            />
          </div>

          {tracks.length > 0 && (
            <div>
              <label className="field-label" htmlFor="invite-fellow-track">
                Track
              </label>
              <select
                id="invite-fellow-track"
                value={trackId}
                onChange={(e) => setTrackId(e.target.value)}
                className="form-input"
              >
                <option value="">No track</option>
                {tracks.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </select>
            </div>
          )}

          <div className="modal-footer">
            <button type="button" onClick={onClose} className="btn btn-sm btn-outline">
              Cancel
            </button>
            <button type="submit" disabled={inviteMutation.isPending} className="btn btn-sm btn-primary">
              <Send className="w-3.5 h-3.5" />
              <span>{inviteMutation.isPending ? 'Sending…' : 'Send Invitation'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
