import React, { useEffect, useState } from 'react';
import { Check, Link2 } from 'lucide-react';
import toast from 'react-hot-toast';
import { copyText } from '@/utils/shareLinks';

interface CopyLinkButtonProps {
  url: string;
  /** Show "Copy link" next to the icon (toolbars); icon-only otherwise (cards). */
  withLabel?: boolean;
  /** What the link opens, for the tooltip and screen readers, e.g. "assignment". */
  what?: string;
  /** Stretch to the container's width (stacked action lists). */
  fullWidth?: boolean;
}

/** Copies a shareable link to the clipboard. */
export const CopyLinkButton: React.FC<CopyLinkButtonProps> = ({ url, withLabel = false, what, fullWidth = false }) => {
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!copied) return;
    const timer = setTimeout(() => setCopied(false), 2000);
    return () => clearTimeout(timer);
  }, [copied]);

  const handleClick = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (await copyText(url)) {
      setCopied(true);
      toast.success('Link copied');
    } else {
      toast.error('Could not copy the link');
    }
  };

  const label = what ? `Copy link to this ${what}` : 'Copy link';
  const Icon = copied ? Check : Link2;
  return (
    <button
      type="button"
      onClick={handleClick}
      className={`${withLabel ? 'btn btn-sm btn-outline' : 'btn btn-icon-sm btn-ghost'} ${fullWidth ? 'w-full' : ''}`}
      title={label}
      aria-label={label}
    >
      <Icon className={`w-3.5 h-3.5 ${copied ? 'text-emerald-600' : ''}`} />
      {withLabel && <span>{copied ? 'Copied' : 'Copy link'}</span>}
    </button>
  );
};
