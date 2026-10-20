import React, { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import {
  Download,
  CheckCircle2,
  Copy,
  ExternalLink,
  Code2,
  ArrowLeft,
  Calendar,
  Building,
  User,
  AlertCircle,
} from 'lucide-react';
import toast from 'react-hot-toast';
import { credentialService } from '@/services/credentialService';
import type { PublicBadgeVerification } from '@/services/types';
import { Navbar } from '@/components/Navbar';
import { Footer } from '@/components/Footer';

export const BadgeVerificationPage: React.FC = () => {
  const { badgeId } = useParams<{ badgeId: string }>();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<PublicBadgeVerification | null>(null);
  const [showJson, setShowJson] = useState(false);
  // The assertion exactly as served to Open Badges verifiers and backpacks
  const [assertionJson, setAssertionJson] = useState<string | null>(null);
  const [assertionError, setAssertionError] = useState(false);

  useEffect(() => {
    if (!badgeId) {
      setError('Badge identifier is missing.');
      setLoading(false);
      return;
    }

    credentialService
      .verifyBadgePublic(badgeId)
      .then((res) => {
        setData(res);
        setLoading(false);
      })
      .catch((err) => {
        console.error('Failed to verify badge', err);
        setError(
          err.response?.data?.message || 'Open Badge assertion not found or has expired.'
        );
        setLoading(false);
      });
  }, [badgeId]);

  const handleCopyLink = () => {
    navigator.clipboard.writeText(window.location.href);
    toast.success('Badge verification link copied!');
  };

  const handleToggleJson = () => {
    const next = !showJson;
    setShowJson(next);
    if (next && !assertionJson && data?.assertion_url) {
      setAssertionError(false);
      fetch(data.assertion_url)
        .then((res) => res.json())
        .then((json) => setAssertionJson(JSON.stringify(json, null, 2)))
        .catch(() => setAssertionError(true));
    }
  };

  const handleCopyCredentialURL = () => {
    if (!data?.credential_url) return;
    navigator.clipboard.writeText(data.credential_url);
    toast.success('Open Badges 3.0 credential URL copied!');
  };

  const handleCopyAssertionURL = () => {
    if (!data?.assertion_url) return;
    navigator.clipboard.writeText(data.assertion_url);
    toast.success('Open Badges v2.0 JSON-LD URL copied!');
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 flex flex-col justify-between">
        <Navbar />
        <div className="flex-1 flex flex-col items-center justify-center p-4">
          <div className="w-10 h-10 border-4 border-kulkul-purple/30 border-t-kulkul-purple rounded-full animate-spin mb-4" />
          <p className="text-sm font-bold text-kulkul-purple">Verifying Open Badge v2.0 assertion...</p>
        </div>
        <Footer />
      </div>
    );
  }

  if (error || !data || !data.valid || !data.badge) {
    return (
      <div className="min-h-screen bg-slate-50 flex flex-col justify-between">
        <Navbar />
        <div className="flex-1 flex items-center justify-center p-4">
          <div className="max-w-md w-full content-card text-center">
            <div className="w-14 h-14 mx-auto bg-rose-50 border border-rose-200 text-rose-600 rounded-2xl flex items-center justify-center mb-4">
              <AlertCircle className="w-7 h-7" />
            </div>
            <h1 className="heading-page mb-2">Unverified Badge Assertion</h1>
            <p className="text-sm text-slate-600 mb-6 leading-relaxed">
              {error ||
                (data?.badge
                  ? 'This digital badge has been revoked by the issuing organization and is no longer valid.'
                  : 'This digital badge does not exist or has been revoked by the issuing authority.')}
            </p>
            <Link to="/" className="btn btn-md btn-primary w-full">
              <ArrowLeft className="w-4 h-4" /> Return to Homepage
            </Link>
          </div>
        </div>
        <Footer />
      </div>
    );
  }

  const badge = data.badge;
  const isMember = badge.badge_type === 'member';

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 flex flex-col justify-between selection:bg-kulkul-orange/20 selection:text-kulkul-purple">
      <Navbar />

      <main className="flex-1 py-10 px-4 sm:px-6 lg:px-8 max-w-4xl mx-auto w-full">
        {/* Navigation Bar */}
        <div className="mb-6 flex items-center justify-between">
          <Link
            to="/"
            className="inline-flex items-center gap-1.5 text-xs font-bold text-slate-600 hover:text-kulkul-purple transition"
          >
            <ArrowLeft className="w-4 h-4" /> Back to FellowHire
          </Link>
          <div className="flex items-center gap-3">
            <button
              onClick={handleCopyLink}
              className="btn btn-md btn-outline"
            >
              <Copy className="w-4 h-4 text-slate-500" />
              <span>Share Badge</span>
            </button>
          </div>
        </div>

        {/* Main Badge Card */}
        <div className="content-card relative overflow-hidden">
          <div className="flex flex-col md:flex-row items-center md:items-start gap-8 relative z-10">
            {/* Badge SVG Graphic */}
            <div className="w-48 h-48 sm:w-56 sm:h-56 shrink-0 bg-purple-50/70 border border-purple-100 rounded-3xl p-6 flex items-center justify-center shadow-2xs">
              <img
                src={badge.image_url}
                alt={badge.name}
                className="w-full h-full object-contain filter drop-shadow-[0_10px_20px_rgba(51,18,93,0.15)] transition-transform duration-300 hover:scale-105"
              />
            </div>

            {/* Badge Details */}
            <div className="flex-1 text-center md:text-left">
              <div className="flex flex-wrap items-center justify-center md:justify-start gap-x-2 gap-y-1 mb-3 text-xs">
                <span className={`font-bold ${isMember ? 'text-kulkul-purple' : 'text-amber-700'}`}>
                  {isMember ? 'Cohort Member Badge' : 'Program Graduate Badge'}
                </span>
                <span className="text-slate-300">&middot;</span>
                <span className="inline-flex items-center gap-1 font-bold text-emerald-700">
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                  Verified
                </span>
                <span className="text-slate-300">&middot;</span>
                <span className="font-mono text-slate-500">Open Badges 2.0</span>
              </div>

              <h1 className="heading-page mb-2">
                {badge.name}
              </h1>
              <p className="text-sm text-slate-600 leading-relaxed mb-6">
                {badge.description}
              </p>

              {/* Recipient & Program Info Grid */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5 panel-muted mb-6 text-xs">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-xl bg-purple-100 border border-purple-200 text-kulkul-purple flex items-center justify-center shrink-0">
                    <User className="w-4 h-4" />
                  </div>
                  <div className="min-w-0">
                    <div className="subsection-title">Recipient</div>
                    <div className="font-bold text-slate-900 truncate">
                      {badge.recipient_name || 'Fellowship Candidate'}
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-xl bg-purple-100 border border-purple-200 text-kulkul-purple flex items-center justify-center shrink-0">
                    <Building className="w-4 h-4" />
                  </div>
                  <div className="min-w-0">
                    <div className="subsection-title">Issuing Organization</div>
                    <div className="font-bold text-slate-900 truncate">
                      {badge.organization_name || 'FellowHire Fellowship Board'}
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-xl bg-purple-100 border border-purple-200 text-kulkul-purple flex items-center justify-center shrink-0">
                    <Calendar className="w-4 h-4" />
                  </div>
                  <div className="min-w-0">
                    <div className="subsection-title">Date Conferred</div>
                    <div className="font-bold text-slate-900">
                      {new Date(badge.issued_at).toLocaleDateString('en-US', {
                        month: 'long',
                        day: 'numeric',
                        year: 'numeric',
                      })}
                    </div>
                  </div>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex flex-wrap items-center gap-3">
                <button
                  onClick={handleToggleJson}
                  className="btn btn-md btn-outline"
                >
                  <Code2 className="w-4 h-4 text-kulkul-purple" />
                  <span>{showJson ? 'Hide JSON' : 'View JSON'}</span>
                </button>
                <a
                  href={badge.image_url}
                  target="_blank"
                  rel="noreferrer"
                  download
                  className="btn btn-md btn-outline"
                >
                  <span>Download SVG</span>
                </a>
              </div>

              {/* Add to a badge wallet (Accredible, Credly, digital credential wallets) */}
              {data.valid && data.credential_url && (
                <div className="panel-muted space-y-3">
                  <div>
                    <div className="card-title">Add to a badge wallet</div>
                    <p className="meta-text mt-0.5">
                      Accredible and most wallets import the .json file. Credly imports the badge image, which has the
                      credential built in.
                    </p>
                  </div>
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                    <div className="min-w-0">
                      <div className="text-xs font-bold text-slate-900">Open Badges 3.0</div>
                      <div className="meta-text">Signed Verifiable Credential (recommended)</div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <a href={`${data.credential_url}?download=1`} download className="btn btn-sm btn-primary">
                        <Download className="w-3.5 h-3.5" />
                        <span>Download .json</span>
                      </a>
                      <button type="button" onClick={handleCopyCredentialURL} className="btn btn-sm btn-outline">
                        <Copy className="w-3.5 h-3.5" />
                        <span>Copy URL</span>
                      </button>
                    </div>
                  </div>
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pt-3 border-t border-slate-200">
                    <div className="min-w-0">
                      <div className="text-xs font-bold text-slate-900">Badge image with credential</div>
                      <div className="meta-text">For Credly and wallets that import badge images</div>
                    </div>
                    <a href={`${data.credential_url}/badge.svg?download=1`} download className="btn btn-sm btn-outline shrink-0">
                      <Download className="w-3.5 h-3.5" />
                      <span>Download .svg</span>
                    </a>
                  </div>
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pt-3 border-t border-slate-200">
                    <div className="min-w-0">
                      <div className="text-xs font-bold text-slate-900">Open Badges 2.0</div>
                      <div className="meta-text">For wallets that don't support 3.0 yet</div>
                    </div>
                    <button type="button" onClick={handleCopyAssertionURL} className="btn btn-sm btn-outline shrink-0">
                      <Copy className="w-3.5 h-3.5" />
                      <span>Copy URL</span>
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* JSON-LD Inspector Accordion */}
          {showJson && (
            <div className="mt-8 pt-8 border-t border-slate-200">
              <div className="flex items-center justify-between mb-3">
                <span className="text-2xs font-mono uppercase font-bold text-slate-500 tracking-wider">
                  Open Badges v2.0 JSON-LD Assertion
                </span>
                <div className="flex items-center gap-2">
                  <a
                    href={data.assertion_url}
                    target="_blank"
                    rel="noreferrer"
                    className="btn btn-sm btn-ghost"
                  >
                    <ExternalLink className="w-3.5 h-3.5" />
                    <span>Open</span>
                  </a>
                  <button
                    onClick={handleCopyAssertionURL}
                    className="btn btn-sm btn-ghost"
                  >
                    <Copy className="w-3.5 h-3.5" />
                    <span>Copy URL</span>
                  </button>
                </div>
              </div>
              <pre className="bg-slate-900 border border-slate-800 rounded-2xl p-4 text-xs font-mono text-purple-200 overflow-x-auto leading-relaxed shadow-inner">
                {assertionError
                  ? 'Could not load the assertion. Use Open above to view it in a new tab instead.'
                  : assertionJson ?? 'Loading assertion…'}
              </pre>
            </div>
          )}
        </div>
      </main>

      <Footer />
    </div>
  );
};
