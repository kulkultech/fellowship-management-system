import React, { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import {
  Award,
  Share2,
  Printer,
  Copy,
  ExternalLink,
  ShieldCheck,
  AlertCircle,
  ArrowLeft,
} from 'lucide-react';
import toast from 'react-hot-toast';
import { credentialService } from '@/services/credentialService';
import type { PublicCertificateVerification } from '@/services/types';
import { Navbar } from '@/components/Navbar';
import { Footer } from '@/components/Footer';

export const CertificateVerificationPage: React.FC = () => {
  const { certificateNumber } = useParams<{ certificateNumber: string }>();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<PublicCertificateVerification | null>(null);

  useEffect(() => {
    if (!certificateNumber) {
      setError('Certificate number is missing.');
      setLoading(false);
      return;
    }

    credentialService
      .verifyCertificatePublic(certificateNumber)
      .then((res) => {
        setData(res);
        setLoading(false);
      })
      .catch((err) => {
        console.error('Failed to verify certificate', err);
        setError(
          err.response?.data?.message ||
            'Certificate record could not be found or has been revoked.'
        );
        setLoading(false);
      });
  }, [certificateNumber]);

  const handleCopyLink = () => {
    const url = window.location.href;
    navigator.clipboard.writeText(url);
    toast.success('Verification link copied to clipboard!');
  };

  const handlePrint = () => {
    window.print();
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 flex flex-col justify-between">
        <Navbar />
        <div className="flex-1 flex flex-col items-center justify-center p-4">
          <div className="w-10 h-10 border-4 border-kulkul-purple/30 border-t-kulkul-purple rounded-full animate-spin mb-4" />
          <p className="text-sm font-bold text-kulkul-purple">Verifying credential on FellowHire Registry...</p>
        </div>
        <Footer />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="min-h-screen bg-slate-50 flex flex-col justify-between">
        <Navbar />
        <div className="flex-1 flex items-center justify-center p-4">
          <div className="max-w-md w-full stitch-card bg-white p-8 text-center border border-slate-200 shadow-sm rounded-3xl">
            <div className="w-14 h-14 mx-auto bg-rose-50 border border-rose-200 text-rose-600 rounded-2xl flex items-center justify-center mb-4">
              <AlertCircle className="w-7 h-7" />
            </div>
            <h1 className="heading-section text-slate-900 mb-2">Unverified Credential</h1>
            <p className="text-body text-slate-600 text-sm mb-6 leading-relaxed">
              {error || 'The certificate identifier provided does not match any official FellowHire issuance.'}
            </p>
            <Link to="/" className="btn btn-md btn-primary w-full gap-2">
              <ArrowLeft className="w-4 h-4" /> Return to Homepage
            </Link>
          </div>
        </div>
        <Footer />
      </div>
    );
  }

  const formattedDate = new Date(data.issue_date).toLocaleDateString('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  });

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 flex flex-col justify-between selection:bg-kulkul-orange/20 selection:text-kulkul-purple print:bg-white print:p-0">
      {/* Top Navbar (Hidden in print) */}
      <div className="print:hidden">
        <Navbar />
      </div>

      <main className="flex-1 py-10 px-4 sm:px-6 lg:px-8 max-w-5xl mx-auto w-full print:p-0 print:max-w-none">
        {/* Navigation & Action Toolbar (Hidden in print) */}
        <div className="mb-6 flex flex-col sm:flex-row items-center justify-between gap-4 print:hidden">
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
              <span>Copy Link</span>
            </button>
            {data.linked_in_url && (
              <a
                href={data.linked_in_url}
                target="_blank"
                rel="noreferrer"
                className="btn btn-md bg-[#0a66c2] hover:bg-[#084e96] text-white shadow-sm"
              >
                <Share2 className="w-4 h-4" />
                <span>Add to LinkedIn</span>
              </a>
            )}
            <button
              onClick={handlePrint}
              className="btn btn-md btn-primary"
            >
              <Printer className="w-4 h-4" />
              <span>Print / PDF</span>
            </button>
          </div>
        </div>

        {/* Verification Status Banner (Hidden in print) */}
        <div className="mb-8 print:hidden">
          <div className="bg-emerald-50/80 border border-emerald-200/90 rounded-3xl p-5 sm:p-6 flex flex-col md:flex-row md:items-center justify-between gap-4 shadow-2xs">
            <div className="flex items-start gap-4">
              <div className="w-12 h-12 rounded-2xl bg-emerald-100 border border-emerald-300 text-emerald-700 flex items-center justify-center shrink-0">
                <ShieldCheck className="w-7 h-7" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h2 className="text-base font-extrabold text-slate-900">
                    Official Verified Certificate
                  </h2>
                  <span className="badge badge-sm bg-emerald-100 text-emerald-800 border border-emerald-300">
                    Valid & Active
                  </span>
                </div>
                <p className="text-xs text-slate-600 mt-1 leading-relaxed">
                  Conferred upon <strong className="text-slate-900">{data.recipient_name}</strong> for completing{' '}
                  <strong className="text-slate-900">{data.program_name}</strong>. Authenticated against the FellowHire Credential Board.
                </p>
              </div>
            </div>
            <div className="shrink-0 font-mono text-xs text-slate-500 border-t md:border-t-0 md:border-l border-emerald-200/80 pt-3 md:pt-0 md:pl-5 space-y-0.5">
              <div>Certificate ID: <span className="font-bold text-slate-800">{data.certificate_number}</span></div>
              <div>Verification Hash: <span className="font-bold text-emerald-700">{data.verification_code}</span></div>
            </div>
          </div>
        </div>

        {/* Printable Official Certificate Frame */}
        <div className="stitch-card relative bg-white border-2 border-slate-200 rounded-3xl p-8 sm:p-14 lg:p-16 shadow-lg overflow-hidden print:shadow-none print:border-slate-300 print:rounded-none">
          {/* Inner Double Border Frame */}
          <div className="absolute inset-3 sm:inset-4 border border-kulkul-purple/15 rounded-2xl pointer-events-none" />
          <div className="absolute inset-5 sm:inset-6 border border-kulkul-purple/10 rounded-xl pointer-events-none" />

          {/* Certificate Inner Content */}
          <div className="relative text-center z-10 flex flex-col items-center">
            {/* Logo Emblem */}
            <div className="flex items-center justify-center mb-4">
              <div className="w-14 h-14 rounded-2xl bg-kulkul-purple-light border border-kulkul-purple/20 flex items-center justify-center shadow-2xs">
                <Award className="w-8 h-8 text-kulkul-purple" />
              </div>
            </div>

            <div className="text-xs uppercase tracking-[0.25em] font-extrabold text-kulkul-purple mb-1">
              {data.organization_name || 'FellowHire Fellowship Board'}
            </div>
            <div className="text-2xs uppercase tracking-widest text-slate-400 font-bold mb-6">
              Official Credential of Completion
            </div>

            <h1 className="heading-display text-slate-900 mb-6 font-extrabold tracking-tight">
              Certificate of Completion
            </h1>

            <p className="text-body text-slate-500 font-medium italic mb-4 max-w-xl">
              This acknowledges and certifies that
            </p>

            {/* Recipient Name */}
            <div className="text-2xl sm:text-4xl lg:text-5xl font-black text-kulkul-purple pb-3 mb-6 border-b-2 border-kulkul-purple/20 inline-block px-8 tracking-tight">
              {data.recipient_name}
            </div>

            <p className="text-body text-slate-600 max-w-2xl leading-relaxed mb-6 font-normal">
              has demonstrated software engineering rigor, successfully satisfied programmatic milestones,
              and fulfilled all graduation requirements for
            </p>

            {/* Program Name & Track Box */}
            <div className="bg-purple-50/70 border border-purple-100 rounded-2xl px-8 py-4 mb-8">
              <h3 className="heading-card text-kulkul-purple font-extrabold text-lg sm:text-xl">
                {data.program_name}
              </h3>
              {data.track_name && (
                <div className="text-xs font-bold uppercase tracking-wider text-kulkul-orange mt-1">
                  Specialization: {data.track_name}
                </div>
              )}
            </div>

            {/* Signature & Seal Row */}
            <div className="w-full grid grid-cols-1 sm:grid-cols-3 items-end justify-between gap-6 pt-8 mt-6 border-t border-slate-200">
              {/* Issue Date & ID */}
              <div className="text-center sm:text-left">
                <div className="text-sm font-bold text-slate-900">{formattedDate}</div>
                <div className="text-2xs uppercase tracking-wider text-slate-500 font-bold mt-1">Date of Conferral</div>
                <div className="text-3xs font-mono text-slate-400 mt-0.5">ID: {data.certificate_number}</div>
              </div>

              {/* Official Seal */}
              <div className="flex flex-col items-center justify-center">
                <div className="w-20 h-20 rounded-full border-4 border-double border-purple-300 bg-purple-50 flex flex-col items-center justify-center text-center p-2 shadow-sm">
                  <ShieldCheck className="w-6 h-6 text-kulkul-purple mb-0.5" />
                  <span className="text-[8px] font-black tracking-wider text-kulkul-purple uppercase">
                    Official Seal
                  </span>
                  <span className="text-[7px] text-emerald-700 tracking-widest font-mono font-bold">
                    VERIFIED
                  </span>
                </div>
              </div>

              {/* Signatory */}
              <div className="text-center sm:text-right">
                <div className="italic font-serif text-base text-slate-800">
                  Fellowship Governing Board
                </div>
                <div className="h-0.5 bg-gradient-to-r from-transparent via-slate-300 to-transparent my-1" />
                <div className="text-2xs uppercase tracking-wider text-slate-500 font-bold">Authorized Signatory</div>
                <div className="text-3xs font-mono text-slate-400 mt-0.5">Hash: {data.verification_code}</div>
              </div>
            </div>
          </div>
        </div>

        {/* Associated Open Badges Section (Hidden in print) */}
        {data.badges && data.badges.length > 0 && (
          <div className="mt-12 print:hidden">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="heading-section text-slate-900 flex items-center gap-2">
                  <Award className="w-5 h-5 text-kulkul-purple" />
                  <span>Associated Open Badges (v2.0)</span>
                </h3>
                <p className="text-body-sm text-slate-500 mt-0.5">
                  Verified digital credentials complying with IMS Global / 1EdTech Open Badges specifications.
                </p>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {data.badges.map((b) => (
                <div
                  key={b.id}
                  className="stitch-card bg-white border border-slate-200/90 rounded-3xl p-5 flex items-center gap-4 shadow-2xs hover:shadow-sm transition"
                >
                  <div className="w-16 h-16 shrink-0 bg-purple-50/70 border border-purple-100 rounded-2xl p-2 flex items-center justify-center shadow-2xs">
                    <img src={b.image_url} alt={b.name} className="w-full h-full object-contain filter drop-shadow-sm" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="badge badge-sm bg-purple-100 text-kulkul-purple">
                        {b.badge_type === 'member' ? 'Cohort Member' : 'Program Graduate'}
                      </span>
                      <span className="text-caption">
                        {new Date(b.issued_at).toLocaleDateString()}
                      </span>
                    </div>
                    <h4 className="heading-card text-sm text-slate-900 truncate mt-1">{b.name}</h4>
                    <p className="text-body-sm text-slate-500 line-clamp-2 mt-0.5 leading-relaxed">{b.description}</p>
                    <div className="mt-2.5">
                      <Link
                        to={`/verify/badge/${b.id}`}
                        className="btn btn-xs btn-outline"
                      >
                        <span>View Badge Assertion</span>
                        <ExternalLink className="w-3 h-3" />
                      </Link>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </main>

      {/* Footer (Hidden in print) */}
      <div className="print:hidden">
        <Footer />
      </div>
    </div>
  );
};
