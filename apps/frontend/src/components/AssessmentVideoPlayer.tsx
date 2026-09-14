import React, { useState, useRef, useEffect } from 'react';
import { Video, ExternalLink, Download, RefreshCw, AlertTriangle } from 'lucide-react';
import { resolveMediaUrl } from '@/services/apiClient';

interface AssessmentVideoPlayerProps {
  url: string;
  className?: string;
}

export const AssessmentVideoPlayer: React.FC<AssessmentVideoPlayerProps> = ({ url, className = '' }) => {
  const [hasError, setHasError] = useState(false);
  const [isRetrying, setIsRetrying] = useState(false);
  const videoRef = useRef<HTMLVideoElement | null>(null);

  const resolvedUrl = resolveMediaUrl(url);

  // Reset error state if url changes
  useEffect(() => {
    setHasError(false);
  }, [url]);

  const handleLoadedMetadata = () => {
    const vid = videoRef.current;
    if (!vid) return;
    // Fix Chromium WebM duration reporting Infinity or NaN
    if (vid.duration === Infinity || isNaN(vid.duration)) {
      vid.currentTime = 1e101;
      vid.ontimeupdate = function () {
        this.ontimeupdate = null;
        if (videoRef.current) {
          videoRef.current.currentTime = 0;
        }
      };
    }
  };

  const handleRetry = () => {
    setHasError(false);
    setIsRetrying(true);
    setTimeout(() => {
      if (videoRef.current) {
        videoRef.current.load();
      }
      setIsRetrying(false);
    }, 200);
  };

  return (
    <div className={`space-y-3 ${className}`}>
      <div className="aspect-video bg-black rounded-xl overflow-hidden border border-slate-800 relative group flex items-center justify-center">
        {hasError ? (
          <div className="flex flex-col items-center justify-center p-6 text-center text-slate-400 space-y-3">
            <div className="w-12 h-12 rounded-full bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-400">
              <AlertTriangle className="w-6 h-6" />
            </div>
            <div className="space-y-1">
              <p className="text-sm font-semibold text-slate-200">Unable to preview video inline</p>
              <p className="text-xs text-slate-400 max-w-sm">
                The video stream could not be decoded inline by this browser. You can open it in a new tab or download it directly.
              </p>
            </div>
            <div className="flex items-center gap-2 pt-1">
              <button
                type="button"
                onClick={handleRetry}
                disabled={isRetrying}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-medium rounded-lg border border-slate-700 transition"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${isRetrying ? 'animate-spin' : ''}`} />
                <span>Retry</span>
              </button>
              <a
                href={resolvedUrl}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-purple-600 hover:bg-purple-500 text-white text-xs font-medium rounded-lg transition"
              >
                <ExternalLink className="w-3.5 h-3.5" />
                <span>Open in New Tab</span>
              </a>
            </div>
          </div>
        ) : (
          <video
            ref={videoRef}
            src={resolvedUrl}
            controls
            playsInline
            preload="metadata"
            onLoadedMetadata={handleLoadedMetadata}
            onError={() => setHasError(true)}
            className="w-full h-full object-contain"
          />
        )}
      </div>

      <div className="flex items-center justify-between text-2xs text-slate-400 pt-1 flex-wrap gap-2">
        <span className="flex items-center gap-1.5 text-slate-400">
          <Video className="w-3.5 h-3.5 text-purple-400" />
          <span>HTML5 Range-Streamed Assessment Video</span>
        </span>
        <div className="flex items-center gap-3">
          <a
            href={resolvedUrl}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1.5 text-slate-300 hover:text-white font-semibold transition"
          >
            <ExternalLink className="w-3.5 h-3.5" />
            <span>Open in New Tab</span>
          </a>
          <a
            href={resolvedUrl}
            target="_blank"
            rel="noreferrer"
            download
            className="inline-flex items-center gap-1.5 text-purple-400 hover:text-purple-300 font-semibold transition"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Download Video</span>
          </a>
        </div>
      </div>
    </div>
  );
};
