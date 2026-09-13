import React from 'react';
import { Link } from 'react-router-dom';
import {
  ShieldCheck,
  Lock,
  Trash2,
  Mail,
  ArrowLeft,
  CheckCircle2,
  ExternalLink,
  Server,
  UserCheck,
} from 'lucide-react';
import { Navbar } from '@/components/Navbar';
import { Footer } from '@/components/Footer';

export const PrivacyPolicyPage: React.FC = () => {
  return (
    <div className="min-h-screen bg-slate-50 flex flex-col text-slate-900 selection:bg-kulkul-orange/20 selection:text-kulkul-purple">
      {/* Header Navigation */}
      <Navbar showNavLinks={false} />

      {/* Main Content Area */}
      <main className="flex-1 py-12 sm:py-16">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
          {/* Back Link */}
          <div className="mb-6">
            <Link
              to="/"
              className="inline-flex items-center gap-1.5 text-xs font-bold text-slate-500 hover:text-kulkul-purple transition"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              <span>Back to Home</span>
            </Link>
          </div>

          {/* Hero Header */}
          <div className="bg-white border border-slate-200/80 rounded-3xl p-6 sm:p-10 shadow-xs mb-8">
            <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-purple-50 text-kulkul-purple text-xs font-bold mb-4">
              <ShieldCheck className="w-4 h-4 text-kulkul-purple" />
              <span>Legal & Data Protection</span>
            </div>
            <h1 className="text-3xl sm:text-4xl font-extrabold text-slate-900 tracking-tight">
              Privacy Policy
            </h1>
            <p className="mt-3 text-sm sm:text-base text-slate-600 leading-relaxed max-w-2xl">
              This Privacy Policy explains how FellowHire (&ldquo;Fellowship Management System&rdquo;, &ldquo;Platform&rdquo;, &ldquo;we&rdquo;, &ldquo;us&rdquo;, or &ldquo;our&rdquo;), operated by Kulkul Tech, collects, uses, protects, and discloses personal information when you use our website, applicant portals, and assessment platforms.
            </p>
            <div className="mt-6 pt-6 border-t border-slate-100 flex flex-wrap items-center gap-4 text-xs font-semibold text-slate-500">
              <div>Effective Date: <span className="text-slate-800 font-bold">September 13, 2026</span></div>
              <span className="text-slate-300">&bull;</span>
              <div>Last Updated: <span className="text-slate-800 font-bold">September 13, 2026</span></div>
            </div>
          </div>

          {/* Policy Document Body */}
          <div className="bg-white border border-slate-200/80 rounded-3xl p-6 sm:p-10 shadow-xs space-y-10 text-sm leading-relaxed text-slate-700">
            {/* 1. Introduction */}
            <section className="space-y-3">
              <h2 className="text-lg sm:text-xl font-extrabold text-slate-900 flex items-center gap-2.5">
                <span className="w-7 h-7 rounded-xl bg-purple-50 text-kulkul-purple flex items-center justify-center text-xs font-bold">
                  1
                </span>
                <span>Overview & Scope</span>
              </h2>
              <p>
                FellowHire (&ldquo;Fellowship Management System&rdquo;) is an enterprise software platform designed to manage fellowship admissions, logic tests, and conversational AI screening interviews. We respect your privacy and are committed to protecting personal data collected through candidate applications and administrative accounts.
              </p>
            </section>

            {/* 2. Information We Collect & Google OAuth Data */}
            <section className="space-y-4">
              <h2 className="text-lg sm:text-xl font-extrabold text-slate-900 flex items-center gap-2.5">
                <span className="w-7 h-7 rounded-xl bg-purple-50 text-kulkul-purple flex items-center justify-center text-xs font-bold">
                  2
                </span>
                <span>Information We Collect & Google OAuth Data</span>
              </h2>
              <p>
                We collect personal information directly from you when you register, apply for a fellowship cohort, authenticate via third-party sign-in providers, or complete technical assessments.
              </p>

              <div className="bg-slate-50 border border-slate-200/70 rounded-2xl p-5 space-y-3">
                <h3 className="font-bold text-slate-900 flex items-center gap-2">
                  <UserCheck className="w-4 h-4 text-kulkul-purple" />
                  <span>Google User Data (Google OAuth)</span>
                </h3>
                <p className="text-xs sm:text-sm text-slate-600">
                  When you authenticate using Google Sign-In, we request access only to your public profile and email address (<code className="bg-purple-100/60 text-kulkul-purple px-1.5 py-0.5 rounded font-mono text-2xs">openid</code>, <code className="bg-purple-100/60 text-kulkul-purple px-1.5 py-0.5 rounded font-mono text-2xs">userinfo.email</code>, and <code className="bg-purple-100/60 text-kulkul-purple px-1.5 py-0.5 rounded font-mono text-2xs">userinfo.profile</code>). We access and store:
                </p>
                <ul className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs sm:text-sm text-slate-700">
                  <li className="flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                    <span>Full Name</span>
                  </li>
                  <li className="flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                    <span>Primary Email Address</span>
                  </li>
                  <li className="flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                    <span>Profile Avatar URL</span>
                  </li>
                  <li className="flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                    <span>Unique Google Account Identifier</span>
                  </li>
                </ul>
              </div>

              <div className="space-y-2">
                <h3 className="font-bold text-slate-900">Application & Assessment Data</h3>
                <p>
                  During the application and evaluation lifecycle, we also collect:
                </p>
                <ul className="list-disc pl-5 space-y-1 text-slate-600 text-xs sm:text-sm">
                  <li>Application details (resume, portfolio links, phone number, work experience).</li>
                  <li>Logic assessment test responses, time elapsed, and automated score tallies.</li>
                  <li>Audio and textual transcriptions generated during conversational AI technical interviews.</li>
                  <li>Technical logs, IP addresses, browser agent, and session timestamps for anti-cheating verification.</li>
                </ul>
              </div>
            </section>

            {/* 3. Google API Services User Data Policy (Limited Use) */}
            <section className="space-y-4">
              <h2 className="text-lg sm:text-xl font-extrabold text-slate-900 flex items-center gap-2.5">
                <span className="w-7 h-7 rounded-xl bg-purple-50 text-kulkul-purple flex items-center justify-center text-xs font-bold">
                  3
                </span>
                <span>Google API Services User Data Policy Compliance</span>
              </h2>
              <div className="bg-purple-50/70 border border-purple-200/80 rounded-2xl p-5 text-kulkul-purple space-y-3">
                <div className="flex items-center gap-2 font-bold text-sm">
                  <Lock className="w-4 h-4 text-kulkul-purple" />
                  <span>Google Limited Use Disclosure</span>
                </div>
                <p className="text-xs sm:text-sm leading-relaxed text-slate-800">
                  FellowHire&rsquo;s use and transfer to any other app of information received from Google APIs will adhere to the{' '}
                  <a
                    href="https://developers.google.com/terms/api-services-user-data-policy"
                    target="_blank"
                    rel="noreferrer"
                    className="font-bold underline text-kulkul-purple hover:text-kulkul-purple-hover inline-flex items-center gap-1"
                  >
                    <span>Google API Services User Data Policy</span>
                    <ExternalLink className="w-3 h-3" />
                  </a>
                  , including the Limited Use requirements.
                </p>
                <p className="text-xs sm:text-sm leading-relaxed text-slate-800">
                  Specifically:
                </p>
                <ul className="list-disc pl-5 space-y-1 text-xs sm:text-sm text-slate-700">
                  <li>We do not transfer Google user data to third parties, unless necessary to provide or improve our core services, comply with applicable laws, or as part of a merger/acquisition.</li>
                  <li>We do not use or transfer Google user data for serving advertisements, including personalized, re-targeted, or interest-based advertising.</li>
                  <li>We do not allow humans to read Google user data unless we have obtained your affirmative agreement, it is necessary for security purposes (investigating abuse), to comply with law, or our use is limited to internal operations on aggregated, de-identified data.</li>
                </ul>
              </div>
            </section>

            {/* 4. How We Use Your Information */}
            <section className="space-y-3">
              <h2 className="text-lg sm:text-xl font-extrabold text-slate-900 flex items-center gap-2.5">
                <span className="w-7 h-7 rounded-xl bg-purple-50 text-kulkul-purple flex items-center justify-center text-xs font-bold">
                  4
                </span>
                <span>How We Use Your Information</span>
              </h2>
              <p>We use the collected information for the following specific purposes:</p>
              <ul className="list-disc pl-5 space-y-1.5 text-slate-600 text-xs sm:text-sm">
                <li><strong>Account Authentication:</strong> Verifying your identity and enabling passwordless sign-in via Google OAuth.</li>
                <li><strong>Candidate Assessment Processing:</strong> Linking your logic test submissions and AI interview evaluations to your candidate record.</li>
                <li><strong>Reviewer Workspace Access:</strong> Allowing authorized program administrators and recruiters from the fellowship organization to review candidate profiles and scorecards.</li>
                <li><strong>Communications:</strong> Sending administrative updates, application confirmations, invitation tokens, and evaluation status notifications.</li>
                <li><strong>Security & Integrity:</strong> Detecting and preventing fraud, unauthorized test retakes, or academic dishonesty.</li>
              </ul>
            </section>

            {/* 5. Data Sharing & Third Parties */}
            <section className="space-y-3">
              <h2 className="text-lg sm:text-xl font-extrabold text-slate-900 flex items-center gap-2.5">
                <span className="w-7 h-7 rounded-xl bg-purple-50 text-kulkul-purple flex items-center justify-center text-xs font-bold">
                  5
                </span>
                <span>Data Sharing & Disclosure</span>
              </h2>
              <p>
                <strong>We never sell, rent, or trade your personal data to advertisers or data brokers.</strong> We share information solely with:
              </p>
              <ul className="list-disc pl-5 space-y-1.5 text-slate-600 text-xs sm:text-sm">
                <li><strong>Fellowship Cohort Administrators:</strong> The specific hiring company or organization hosting the fellowship program you applied to.</li>
                <li><strong>Infrastructure Service Providers:</strong> Trusted cloud hosting, database, and AI evaluation providers under confidentiality and data protection agreements.</li>
                <li><strong>Legal Authorities:</strong> When required by applicable law, court subpoena, or to protect the vital rights and security of our users and platform.</li>
              </ul>
            </section>

            {/* 6. Data Storage, Security & Retention */}
            <section className="space-y-4">
              <h2 className="text-lg sm:text-xl font-extrabold text-slate-900 flex items-center gap-2.5">
                <span className="w-7 h-7 rounded-xl bg-purple-50 text-kulkul-purple flex items-center justify-center text-xs font-bold">
                  6
                </span>
                <span>Data Storage, Security & Retention</span>
              </h2>
              <p>
                We implement industry-standard administrative, physical, and technical safeguards to protect your personal data:
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200/80 flex items-start gap-3">
                  <Lock className="w-4 h-4 text-kulkul-purple shrink-0 mt-0.5" />
                  <div>
                    <h4 className="font-bold text-slate-900 text-xs sm:text-sm">Encryption</h4>
                    <p className="text-2xs sm:text-xs text-slate-600 mt-0.5">All data is encrypted in transit using TLS 1.3/HTTPS and encrypted at rest in secure databases.</p>
                  </div>
                </div>
                <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200/80 flex items-start gap-3">
                  <Server className="w-4 h-4 text-kulkul-purple shrink-0 mt-0.5" />
                  <div>
                    <h4 className="font-bold text-slate-900 text-xs sm:text-sm">Access Control</h4>
                    <p className="text-2xs sm:text-xs text-slate-600 mt-0.5">Strict role-based access control prevents unauthorized internal or external data exposure.</p>
                  </div>
                </div>
              </div>
              <p className="text-xs sm:text-sm text-slate-600">
                Personal application data is retained for the duration of the fellowship recruitment cycle, typically up to 24 months, after which it is archived or securely deleted unless you request earlier removal.
              </p>
            </section>

            {/* 7. User Rights & Data Deletion */}
            <section className="space-y-4">
              <h2 className="text-lg sm:text-xl font-extrabold text-slate-900 flex items-center gap-2.5">
                <span className="w-7 h-7 rounded-xl bg-purple-50 text-kulkul-purple flex items-center justify-center text-xs font-bold">
                  7
                </span>
                <span>Your Rights & Data Deletion</span>
              </h2>
              <p>
                Depending on your jurisdiction, you have the right to access, rectify, export, or request the permanent deletion of your personal data.
              </p>

              <div className="bg-slate-50 border border-slate-200/80 rounded-2xl p-5 space-y-3">
                <h3 className="font-bold text-slate-900 flex items-center gap-2 text-xs sm:text-sm">
                  <Trash2 className="w-4 h-4 text-red-600" />
                  <span>How to Request Account & Data Deletion</span>
                </h3>
                <p className="text-xs sm:text-sm text-slate-600 leading-relaxed">
                  You may request complete erasure of your candidate record, test submissions, and Google profile data by sending an email with the subject line &ldquo;Data Deletion Request&rdquo; to{' '}
                  <a href="mailto:support@kulkul.tech" className="text-kulkul-purple font-bold underline">
                    support@kulkul.tech
                  </a>
                  . We will process and confirm your request within 30 calendar days.
                </p>
                <p className="text-xs sm:text-sm text-slate-600 leading-relaxed">
                  You can also revoke our app&rsquo;s access to your Google Account at any time through your Google Security settings at{' '}
                  <a
                    href="https://myaccount.google.com/permissions"
                    target="_blank"
                    rel="noreferrer"
                    className="text-kulkul-purple font-bold underline inline-flex items-center gap-1"
                  >
                    <span>Google Third-party apps & services</span>
                    <ExternalLink className="w-3 h-3" />
                  </a>
                  .
                </p>
              </div>
            </section>

            {/* 8. Cookies & Analytics */}
            <section className="space-y-3">
              <h2 className="text-lg sm:text-xl font-extrabold text-slate-900 flex items-center gap-2.5">
                <span className="w-7 h-7 rounded-xl bg-purple-50 text-kulkul-purple flex items-center justify-center text-xs font-bold">
                  8
                </span>
                <span>Cookies & Local Storage</span>
              </h2>
              <p>
                We use strictly necessary browser cookies and local storage tokens to maintain user authentication sessions, preserve test progress during assessments, and remember user interface preferences. We do not employ tracking cookies for third-party behavioral advertising.
              </p>
            </section>

            {/* 9. Policy Updates */}
            <section className="space-y-3">
              <h2 className="text-lg sm:text-xl font-extrabold text-slate-900 flex items-center gap-2.5">
                <span className="w-7 h-7 rounded-xl bg-purple-50 text-kulkul-purple flex items-center justify-center text-xs font-bold">
                  9
                </span>
                <span>Changes to this Privacy Policy</span>
              </h2>
              <p>
                We may update this Privacy Policy from time to time to reflect operational or legal changes. The &ldquo;Last Updated&rdquo; date at the top of this policy will reflect any revisions. We encourage you to periodically review this page.
              </p>
            </section>

            {/* 10. Contact Information */}
            <section className="space-y-3 pt-4 border-t border-slate-100">
              <h2 className="text-lg sm:text-xl font-extrabold text-slate-900 flex items-center gap-2.5">
                <span className="w-7 h-7 rounded-xl bg-purple-50 text-kulkul-purple flex items-center justify-center text-xs font-bold">
                  10
                </span>
                <span>Contact Us</span>
              </h2>
              <p>
                If you have questions, privacy concerns, or data inquiries regarding this policy or our data practices, please contact our team:
              </p>
              <div className="p-4 rounded-2xl bg-purple-50/50 border border-purple-100 flex items-center gap-3 text-xs sm:text-sm">
                <Mail className="w-4 h-4 text-kulkul-purple shrink-0" />
                <div>
                  <div className="font-bold text-slate-900">Kulkul Tech &ndash; Support & Compliance</div>
                  <a href="mailto:support@kulkul.tech" className="text-kulkul-purple font-semibold hover:underline">
                    support@kulkul.tech
                  </a>
                </div>
              </div>
            </section>
          </div>
        </div>
      </main>

      {/* Footer */}
      <Footer />
    </div>
  );
};
