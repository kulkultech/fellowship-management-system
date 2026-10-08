import React, { useState } from 'react';
import { PenLine, Plus, Save, Sparkles, Trash2, X } from 'lucide-react';
import toast from 'react-hot-toast';
import { SignaturePad } from './SignaturePad';
import {
  CERTIFICATE_DEFAULT_DESCRIPTION_TEXT,
  CERTIFICATE_DEFAULT_INTRO_TEXT,
  getCertificateSignatories,
  getCertificateText,
  type Certificate,
  type CertificateSignatory,
  type GenerateCertificatePayload,
} from '@/services/types';

// Remembers the last signatories and body text used in this browser so admins don't re-enter them per fellow.
const LAST_DETAILS_KEY = 'fms:last-certificate-details';
const MAX_SIGNATORIES = 4;

type SignatoryDraft = { key: number; name: string; role: string; signatureImage: string };

let nextDraftKey = 1;
const toDraft = (s?: Partial<CertificateSignatory>): SignatoryDraft => ({
  key: nextDraftKey++,
  name: s?.name || '',
  role: s?.role || '',
  signatureImage: s?.signature_image || '',
});

type RememberedDetails = { signatories: CertificateSignatory[]; intro_text: string; description_text: string };

function loadLastDetails(): RememberedDetails {
  try {
    const raw = localStorage.getItem(LAST_DETAILS_KEY);
    const metadata = raw ? JSON.parse(raw) : {};
    return { signatories: getCertificateSignatories({ metadata }), ...getCertificateText({ metadata }) };
  } catch {
    return { signatories: [], intro_text: '', description_text: '' };
  }
}

function saveLastDetails(value: RememberedDetails) {
  try {
    localStorage.setItem(LAST_DETAILS_KEY, JSON.stringify(value));
  } catch {
    // Storage unavailable or full; defaults are a convenience only
  }
}

interface CertificateDetailsFormProps {
  /** Existing certificate, or null when one hasn't been generated yet */
  certificate: Certificate | null | undefined;
  /** Fallback name when no certificate exists yet */
  defaultRecipientName: string;
  isPending: boolean;
  onSubmit: (payload: GenerateCertificatePayload) => void;
}

// Typography mirrors the candidate drawer's Profile and Reviewer Evaluation tabs
const sectionHeadingClass = 'block text-2xs font-extrabold uppercase text-slate-500 tracking-wider';
const fieldLabelClass = 'text-slate-400 block font-medium';
const formLabelClass = 'block text-xs font-bold text-slate-700 mb-1.5';
const inputClass =
  'w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-sm font-semibold focus:outline-hidden focus:ring-2 focus:ring-kulkul-purple/20 focus:border-kulkul-purple transition text-slate-900 bg-white disabled:opacity-60';
const textareaClass =
  'w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-xs focus:outline-hidden focus:ring-2 focus:ring-kulkul-purple/20 focus:border-kulkul-purple transition text-slate-900 resize-none leading-relaxed bg-white disabled:opacity-60';

export const CertificateDetailsForm: React.FC<CertificateDetailsFormProps> = ({
  certificate,
  defaultRecipientName,
  isPending,
  onSubmit,
}) => {
  const isEdit = !!certificate;

  const buildInitial = () => {
    // Customized certificates show their saved values; new or auto-generated ones start from the last-used details
    const saved = { signatories: getCertificateSignatories(certificate), ...getCertificateText(certificate) };
    const isCustomized = saved.signatories.length > 0 || !!saved.intro_text || !!saved.description_text;
    const source = isCustomized ? saved : loadLastDetails();
    const signatories = source.signatories;
    const text = source;
    return {
      recipientName: certificate?.recipient_name || defaultRecipientName,
      introText: text.intro_text,
      descriptionText: text.description_text,
      signatories: signatories.length > 0 ? signatories.map(toDraft) : [toDraft()],
    };
  };

  const [expanded, setExpanded] = useState(!isEdit);
  const [form, setForm] = useState(buildInitial);

  const updateSignatory = (key: number, patch: Partial<Omit<SignatoryDraft, 'key'>>) =>
    setForm((prev) => ({
      ...prev,
      signatories: prev.signatories.map((s) => (s.key === key ? { ...s, ...patch } : s)),
    }));

  const addSignatory = () =>
    setForm((prev) =>
      prev.signatories.length >= MAX_SIGNATORIES ? prev : { ...prev, signatories: [...prev.signatories, toDraft()] }
    );

  const removeSignatory = (key: number) =>
    setForm((prev) => ({ ...prev, signatories: prev.signatories.filter((s) => s.key !== key) }));

  const submit = (sendEmail: boolean) => {
    const filled = form.signatories.filter((s) => s.name.trim() || s.role.trim() || s.signatureImage);
    if (filled.some((s) => !s.name.trim())) {
      toast.error('Each signatory needs a name');
      return;
    }
    const signatories: CertificateSignatory[] = filled.map((s) => ({
      name: s.name.trim(),
      role: s.role.trim(),
      signature_image: s.signatureImage,
    }));
    const introText = form.introText.trim();
    const descriptionText = form.descriptionText.trim();
    saveLastDetails({ signatories, intro_text: introText, description_text: descriptionText });
    onSubmit({
      send_email: sendEmail,
      recipient_name: form.recipientName.trim(),
      intro_text: introText,
      description_text: descriptionText,
      signatories,
    });
  };

  if (!expanded) {
    const current = getCertificateSignatories(certificate);
    const text = getCertificateText(certificate);
    return (
      <div className="p-4 rounded-2xl bg-white border border-slate-200 space-y-4 text-xs">
        <div className="flex items-center justify-between gap-3">
          <span className={sectionHeadingClass}>Certificate Details</span>
          <button
            type="button"
            onClick={() => {
              setForm(buildInitial());
              setExpanded(true);
            }}
            className="btn btn-sm btn-outline inline-flex items-center gap-1.5 shrink-0"
          >
            <PenLine className="w-3.5 h-3.5" />
            <span>Edit Certificate Details</span>
          </button>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <span className={fieldLabelClass}>Graduate Name</span>
            <span className="font-bold text-slate-900 text-sm">{certificate?.recipient_name}</span>
          </div>
          <div>
            <span className={fieldLabelClass}>Intro Line</span>
            {text.intro_text ? (
              <span className="font-bold text-slate-900">{text.intro_text}</span>
            ) : (
              <span className="italic text-slate-400">Default wording</span>
            )}
          </div>
          <div className="sm:col-span-2">
            <span className={fieldLabelClass}>Description</span>
            {text.description_text ? (
              <span className="font-bold text-slate-900 leading-relaxed whitespace-pre-line">{text.description_text}</span>
            ) : (
              <span className="italic text-slate-400">Default wording</span>
            )}
          </div>
        </div>

        <div className="pt-3 border-t border-slate-200 space-y-3">
          <span className={sectionHeadingClass}>Signatories</span>
          {current.length === 0 ? (
            <p className="text-slate-500">No signatories set. The certificate shows "Fellowship Governing Board".</p>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {current.map((s, i) => (
                <div key={i} className="flex items-center gap-2.5 min-w-0">
                  {s.signature_image ? (
                    <img
                      src={s.signature_image}
                      alt={`Signature of ${s.name}`}
                      className="h-9 w-24 object-contain shrink-0 rounded-lg bg-slate-50 border border-slate-100"
                    />
                  ) : (
                    <div className="h-9 w-24 shrink-0 rounded-lg bg-slate-50 border border-dashed border-slate-200 flex items-center justify-center text-3xs text-slate-400 font-semibold">
                      No signature
                    </div>
                  )}
                  <div className="min-w-0">
                    <div className="font-bold text-slate-900 truncate">{s.name}</div>
                    <div className="text-slate-400 font-medium truncate">{s.role || 'Signatory'}</div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        submit(!isEdit);
      }}
      className="space-y-5 p-4 rounded-2xl bg-white border border-slate-200"
    >
      <div className="space-y-4">
        <span className={sectionHeadingClass}>Certificate Text</span>

        <div>
          <label className={formLabelClass}>Graduate Name (Main Name)</label>
          <input
            type="text"
            value={form.recipientName}
            onChange={(e) => setForm((prev) => ({ ...prev, recipientName: e.target.value }))}
            placeholder={defaultRecipientName || 'Full name of the fellow'}
            maxLength={255}
            disabled={isPending}
            className={inputClass}
          />
          <p className="text-3xs text-slate-400 mt-1">
            Printed as the recipient. Leave as is to use the candidate's registered name.
          </p>
        </div>

        <div>
          <label className={formLabelClass}>Intro Line (above the name)</label>
          <input
            type="text"
            value={form.introText}
            onChange={(e) => setForm((prev) => ({ ...prev, introText: e.target.value }))}
            placeholder={CERTIFICATE_DEFAULT_INTRO_TEXT}
            maxLength={255}
            disabled={isPending}
            className={inputClass}
          />
        </div>

        <div>
          <label className={formLabelClass}>Description (below the name)</label>
          <textarea
            rows={3}
            value={form.descriptionText}
            onChange={(e) => setForm((prev) => ({ ...prev, descriptionText: e.target.value }))}
            placeholder={CERTIFICATE_DEFAULT_DESCRIPTION_TEXT}
            maxLength={1000}
            disabled={isPending}
            className={textareaClass}
          />
          <p className="text-3xs text-slate-400 mt-1">
            Shown before the program name. Leave empty to use the default wording.
          </p>
        </div>
      </div>

      <div className="pt-4 border-t border-slate-200 space-y-3">
        <div className="flex items-center justify-between">
          <span className={sectionHeadingClass}>
            Signatories ({form.signatories.length}/{MAX_SIGNATORIES})
          </span>
          <button
            type="button"
            onClick={addSignatory}
            disabled={isPending || form.signatories.length >= MAX_SIGNATORIES}
            className="btn btn-sm btn-outline inline-flex items-center gap-1.5 disabled:opacity-60"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Add Signatory</span>
          </button>
        </div>

        {form.signatories.length === 0 && (
          <p className="text-xs text-slate-500">
            No signatories. The certificate will show "Fellowship Governing Board".
          </p>
        )}

        {form.signatories.map((s, i) => (
          <div key={s.key} className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-2xs font-extrabold uppercase tracking-wider text-slate-500">
                Signatory {i + 1}
              </span>
              <button
                type="button"
                onClick={() => removeSignatory(s.key)}
                disabled={isPending}
                className="inline-flex items-center gap-1 text-2xs font-bold text-rose-600 hover:text-rose-700 disabled:opacity-60"
                aria-label={`Remove signatory ${i + 1}`}
              >
                <Trash2 className="w-3 h-3" />
                <span>Remove</span>
              </button>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className={formLabelClass}>Name</label>
                <input
                  type="text"
                  value={s.name}
                  onChange={(e) => updateSignatory(s.key, { name: e.target.value })}
                  placeholder="e.g. Jane Doe"
                  maxLength={255}
                  disabled={isPending}
                  className={inputClass}
                />
              </div>
              <div>
                <label className={formLabelClass}>Role</label>
                <input
                  type="text"
                  value={s.role}
                  onChange={(e) => updateSignatory(s.key, { role: e.target.value })}
                  placeholder="e.g. Program Director"
                  maxLength={255}
                  disabled={isPending}
                  className={inputClass}
                />
              </div>
            </div>
            <div>
              <label className={formLabelClass}>Signature</label>
              <SignaturePad
                value={s.signatureImage}
                onChange={(v) => updateSignatory(s.key, { signatureImage: v })}
                disabled={isPending}
              />
            </div>
          </div>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-3 pt-1">
        {isEdit ? (
          <>
            <button
              type="submit"
              disabled={isPending}
              className="btn btn-sm btn-primary inline-flex items-center gap-1.5 shadow-sm disabled:opacity-60"
            >
              <Save className="w-3.5 h-3.5" />
              <span>{isPending ? 'Saving...' : 'Save Certificate Details'}</span>
            </button>
            <button
              type="button"
              onClick={() => setExpanded(false)}
              disabled={isPending}
              className="btn btn-sm btn-outline inline-flex items-center gap-1.5 disabled:opacity-60"
            >
              <X className="w-3.5 h-3.5" />
              <span>Cancel</span>
            </button>
          </>
        ) : (
          <>
            <button
              type="submit"
              disabled={isPending}
              className="btn btn-sm btn-primary inline-flex items-center gap-1.5 shadow-sm disabled:opacity-60"
            >
              <Sparkles className="w-3.5 h-3.5 text-kulkul-orange" />
              <span>{isPending ? 'Generating...' : 'Generate & Email Certificate'}</span>
            </button>
            <button
              type="button"
              onClick={() => submit(false)}
              disabled={isPending}
              className="btn btn-sm btn-outline inline-flex items-center gap-1.5 disabled:opacity-60"
            >
              <span>Generate Only (No Email)</span>
            </button>
          </>
        )}
      </div>
    </form>
  );
};
