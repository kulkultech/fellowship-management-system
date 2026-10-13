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
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in overflow-y-auto"
      onClick={onClose}
    >
      <div
        className="content-card max-w-lg w-full shadow-2xl space-y-5 my-8"
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
            className="p-2 text-slate-400 hover:text-slate-600 rounded-full hover:bg-slate-100 transition"
            aria-label="Close"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <p className="text-xs text-slate-500 leading-relaxed">
            They join the program directly, without applying. They get an email with a link to the Program Room
            and sign in with this email address to enter.
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

          <div className="flex items-center justify-end gap-2 pt-2">
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
