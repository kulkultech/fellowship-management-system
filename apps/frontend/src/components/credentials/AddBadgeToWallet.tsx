import React, { useState } from 'react';
import { Download, ExternalLink, X } from 'lucide-react';

type Wallet = 'credly' | 'accredible';

// Neither Credly nor Accredible has a link that imports a badge directly, so each shortcut hands
// over the file the wallet accepts and opens the wallet, with where to upload it.
const WALLETS: Record<
  Wallet,
  { name: string; url: string; file: string; fileLabel: string; howTo: string; note?: string }
> = {
  credly: {
    name: 'Credly',
    url: 'https://www.credly.com',
    file: '/badge.svg?download=1',
    fileLabel: 'Download badge image',
    howTo: 'On Credly, open your profile, choose Upload Other Badges and drop in the image.',
    note: 'Credly may label badges from other platforms as Unverified. Your badge details still show in full.',
  },
  accredible: {
    name: 'Accredible',
    url: 'https://www.credential.net',
    file: '?download=1',
    fileLabel: 'Download badge file (.json)',
    howTo: 'On Accredible, open My credentials, choose Add Credential, then JSON Credential, and upload the file.',
  },
};

/** "Add to Credly" and "Add to Accredible" shortcuts for an Open Badges 3.0 credential. */
export const AddBadgeToWallet: React.FC<{ credentialUrl: string; badgeName: string }> = ({
  credentialUrl,
  badgeName,
}) => {
  const [open, setOpen] = useState<Wallet | null>(null);
  const wallet = open ? WALLETS[open] : null;

  return (
    <>
      <button type="button" onClick={() => setOpen('credly')} className="btn btn-sm btn-outline">
        Add to Credly
      </button>
      <button type="button" onClick={() => setOpen('accredible')} className="btn btn-sm btn-outline">
        Add to Accredible
      </button>

      {wallet && (
        <div className="modal-backdrop" onClick={() => setOpen(null)}>
          <div className="modal-panel max-w-md" onClick={(e) => e.stopPropagation()}>
            <div className="section-header">
              <div>
                <h2 className="section-title">Add to {wallet.name}</h2>
                <p className="section-subtitle">{badgeName}</p>
              </div>
              <button type="button" onClick={() => setOpen(null)} className="btn btn-icon-sm btn-ghost" aria-label="Close">
                <X className="w-4 h-4" />
              </button>
            </div>

            <ol className="space-y-4">
              <li className="panel-muted space-y-2">
                <div className="card-title">1. Download your badge</div>
                <a href={`${credentialUrl}${wallet.file}`} download className="btn btn-sm btn-primary">
                  <Download className="w-3.5 h-3.5" />
                  <span>{wallet.fileLabel}</span>
                </a>
              </li>
              <li className="panel-muted space-y-2">
                <div className="card-title">2. Upload it on {wallet.name}</div>
                <p className="text-xs text-slate-600">{wallet.howTo}</p>
                <a href={wallet.url} target="_blank" rel="noreferrer" className="btn btn-sm btn-outline">
                  <span>Open {wallet.name}</span>
                  <ExternalLink className="w-3.5 h-3.5" />
                </a>
              </li>
            </ol>
            {wallet.note && <p className="meta-text">{wallet.note}</p>}

            <div className="modal-footer">
              <button type="button" onClick={() => setOpen(null)} className="btn btn-sm btn-outline">
                Done
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};
