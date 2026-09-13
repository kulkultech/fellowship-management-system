import React from 'react';
import { Link } from 'react-router-dom';
import {
  AlertTriangle,
  Mail,
  ArrowLeft,
  Scale,
  BrainCircuit,
} from 'lucide-react';
import { Navbar } from '@/components/Navbar';
import { Footer } from '@/components/Footer';

export const TermsOfServicePage: React.FC = () => {
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
              <Scale className="w-4 h-4 text-kulkul-purple" />
              <span>Terms & Agreement</span>
            </div>
            <h1 className="text-3xl sm:text-4xl font-extrabold text-slate-900 tracking-tight">
              Terms of Service
            </h1>
            <p className="mt-3 text-sm sm:text-base text-slate-600 leading-relaxed max-w-2xl">
              Please read these Terms of Service carefully before accessing or using FellowHire (&ldquo;Fellowship Management System&rdquo;, &ldquo;Platform&rdquo;, &ldquo;Service&rdquo;), operated by Kulkul Tech. By accessing or using any part of the site, you agree to become bound by these terms.
            </p>
            <div className="mt-6 pt-6 border-t border-slate-100 flex flex-wrap items-center gap-4 text-xs font-semibold text-slate-500">
              <div>Effective Date: <span className="text-slate-800 font-bold">September 13, 2026</span></div>
              <span className="text-slate-300">&bull;</span>
              <div>Last Updated: <span className="text-slate-800 font-bold">September 13, 2026</span></div>
            </div>
          </div>

          {/* Terms Document Body */}
          <div className="bg-white border border-slate-200/80 rounded-3xl p-6 sm:p-10 shadow-xs space-y-10 text-sm leading-relaxed text-slate-700">
            {/* 1. Acceptance of Terms */}
            <section className="space-y-3">
              <h2 className="text-lg sm:text-xl font-extrabold text-slate-900 flex items-center gap-2.5">
                <span className="w-7 h-7 rounded-xl bg-purple-50 text-kulkul-purple flex items-center justify-center text-xs font-bold">
                  1
                </span>
                <span>Acceptance of Terms</span>
              </h2>
              <p>
                By creating an account, registering a fellowship cohort, signing in with Google OAuth, applying for an open fellowship program, or participating in automated logic tests and AI technical interviews, you confirm that you are at least 18 years old and agree to comply with and be bound by these Terms of Service and our{' '}
                <Link to="/privacy" className="text-kulkul-purple font-bold underline hover:text-kulkul-purple-hover">
                  Privacy Policy
                </Link>
                .
              </p>
            </section>

            {/* 2. Platform Description */}
            <section className="space-y-3">
              <h2 className="text-lg sm:text-xl font-extrabold text-slate-900 flex items-center gap-2.5">
                <span className="w-7 h-7 rounded-xl bg-purple-50 text-kulkul-purple flex items-center justify-center text-xs font-bold">
                  2
                </span>
                <span>Description of Services</span>
              </h2>
              <p>
                FellowHire (&ldquo;Fellowship Management System&rdquo;) provides an enterprise infrastructure enabling companies and organizations (&ldquo;Clients&rdquo;) to manage fellowship applications, configure multi-track screening modules, administer timed logic/technical assessments, and host automated AI-driven candidate interviews.
              </p>
            </section>

            {/* 3. User Accounts & Google OAuth */}
            <section className="space-y-4">
              <h2 className="text-lg sm:text-xl font-extrabold text-slate-900 flex items-center gap-2.5">
                <span className="w-7 h-7 rounded-xl bg-purple-50 text-kulkul-purple flex items-center justify-center text-xs font-bold">
                  3
                </span>
                <span>User Accounts & Authentication</span>
              </h2>
              <p>
                To access candidate portals or administrative workspaces, you may authenticate via Google Sign-In or email credentials. You agree that:
              </p>
              <ul className="list-disc pl-5 space-y-1.5 text-slate-600 text-xs sm:text-sm">
                <li>You will provide accurate, truthful, and complete profile information.</li>
                <li>You are solely responsible for maintaining the confidentiality and security of your account credentials.</li>
                <li>You will immediately notify us of any unauthorized use or security breach related to your account.</li>
                <li>Accounts cannot be shared or transferred between different individuals.</li>
              </ul>
            </section>

            {/* 4. Candidate Integrity & Assessment Rules */}
            <section className="space-y-4">
              <h2 className="text-lg sm:text-xl font-extrabold text-slate-900 flex items-center gap-2.5">
                <span className="w-7 h-7 rounded-xl bg-purple-50 text-kulkul-purple flex items-center justify-center text-xs font-bold">
                  4
                </span>
                <span>Candidate Integrity & Assessment Rules</span>
              </h2>
              <div className="bg-amber-50/70 border border-amber-200/80 rounded-2xl p-5 space-y-2 text-amber-950">
                <div className="flex items-center gap-2 font-bold text-xs sm:text-sm text-amber-900">
                  <AlertTriangle className="w-4 h-4 text-amber-600" />
                  <span>Academic Honesty & Testing Code of Conduct</span>
                </div>
                <p className="text-xs sm:text-sm leading-relaxed">
                  When participating in timed logic assessments or AI technical interviews, candidates must uphold the highest standards of academic and professional honesty.
                </p>
              </div>
              <p>You strictly agree that you will not:</p>
              <ul className="list-disc pl-5 space-y-1.5 text-slate-600 text-xs sm:text-sm">
                <li>Use automated scripts, bots, or unauthorized assistance to generate test responses.</li>
                <li>Impersonate another individual or allow third parties to take assessments on your behalf.</li>
                <li>Copy, record, screenshot, distribute, or publicly disclose assessment questions, logic riddles, or interview prompts.</li>
                <li>Attempt to reverse-engineer, bypass time restrictions, or exploit vulnerabilities in the assessment engine.</li>
              </ul>
              <p className="text-xs sm:text-sm text-slate-600">
                Violation of these rules will result in immediate disqualification, cancellation of submissions, and potential permanent suspension from the platform.
              </p>
            </section>

            {/* 5. Organization & Reviewer Responsibilities */}
            <section className="space-y-3">
              <h2 className="text-lg sm:text-xl font-extrabold text-slate-900 flex items-center gap-2.5">
                <span className="w-7 h-7 rounded-xl bg-purple-50 text-kulkul-purple flex items-center justify-center text-xs font-bold">
                  5
                </span>
                <span>Organization & Reviewer Responsibilities</span>
              </h2>
              <p>
                Organizations hosting fellowship cohorts agree to:
              </p>
              <ul className="list-disc pl-5 space-y-1.5 text-slate-600 text-xs sm:text-sm">
                <li>Comply with all applicable labor laws, non-discrimination requirements, and applicant privacy regulations.</li>
                <li>Maintain confidentiality regarding candidate submissions, resumes, test scores, and interview transcripts.</li>
                <li>Assume full responsibility for final admissions, candidate rejections, fellowship offers, and hiring commitments.</li>
              </ul>
            </section>

            {/* 6. AI Evaluation Disclaimer */}
            <section className="space-y-4">
              <h2 className="text-lg sm:text-xl font-extrabold text-slate-900 flex items-center gap-2.5">
                <span className="w-7 h-7 rounded-xl bg-purple-50 text-kulkul-purple flex items-center justify-center text-xs font-bold">
                  6
                </span>
                <span>AI Technical Evaluation & Automated Scoring Disclaimer</span>
              </h2>
              <div className="bg-slate-50 border border-slate-200/80 rounded-2xl p-5 space-y-3">
                <div className="flex items-center gap-2 font-bold text-slate-900 text-xs sm:text-sm">
                  <BrainCircuit className="w-4 h-4 text-kulkul-purple" />
                  <span>Advisory Nature of Algorithmic Recommendations</span>
                </div>
                <p className="text-xs sm:text-sm text-slate-600 leading-relaxed">
                  Our conversational AI screening features and automated scoring systems provide quantitative suggestions, preliminary rubrics, and summarizations to assist human reviewers. <strong>They do not constitute automated legally-binding employment determinations.</strong>
                </p>
                <p className="text-xs sm:text-sm text-slate-600 leading-relaxed">
                  Kulkul Tech does not warrant that AI-generated scorecards will be completely error-free or free of algorithmic bias. Participating organizations remain solely responsible for validating scores and making human-reviewed candidate selections.
                </p>
              </div>
            </section>

            {/* 7. Intellectual Property */}
            <section className="space-y-3">
              <h2 className="text-lg sm:text-xl font-extrabold text-slate-900 flex items-center gap-2.5">
                <span className="w-7 h-7 rounded-xl bg-purple-50 text-kulkul-purple flex items-center justify-center text-xs font-bold">
                  7
                </span>
                <span>Intellectual Property</span>
              </h2>
              <p>
                All platform software, user interface design, logos, question sets created by Kulkul Tech, source code, and algorithms are the proprietary intellectual property of Kulkul Tech or its licensors. You may not reproduce, modify, distribute, or reverse-engineer any portion of the platform without prior written consent.
              </p>
            </section>

            {/* 8. Disclaimer of Warranties & Limitation of Liability */}
            <section className="space-y-4">
              <h2 className="text-lg sm:text-xl font-extrabold text-slate-900 flex items-center gap-2.5">
                <span className="w-7 h-7 rounded-xl bg-purple-50 text-kulkul-purple flex items-center justify-center text-xs font-bold">
                  8
                </span>
                <span>Disclaimer of Warranties & Limitation of Liability</span>
              </h2>
              <p className="text-xs sm:text-sm text-slate-600">
                THE SERVICE IS PROVIDED ON AN &ldquo;AS IS&rdquo; AND &ldquo;AS AVAILABLE&rdquo; BASIS WITHOUT WARRANTIES OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE, OR UNINTERRUPTED AVAILABILITY.
              </p>
              <p className="text-xs sm:text-sm text-slate-600">
                IN NO EVENT SHALL KULKUL TECH, ITS DIRECTORS, EMPLOYEES, OR PARTNERS BE LIABLE FOR ANY INDIRECT, INCIDENTAL, SPECIAL, CONSEQUENTIAL, OR PUNITIVE DAMAGES RESULTING FROM YOUR USE OR INABILITY TO USE THE SERVICE, INCLUDING LOSS OF DATA, LOSS OF EMPLOYMENT OPPORTUNITIES, OR UNAUTHORIZED DATA ACCESS.
              </p>
            </section>

            {/* 9. Termination */}
            <section className="space-y-3">
              <h2 className="text-lg sm:text-xl font-extrabold text-slate-900 flex items-center gap-2.5">
                <span className="w-7 h-7 rounded-xl bg-purple-50 text-kulkul-purple flex items-center justify-center text-xs font-bold">
                  9
                </span>
                <span>Termination</span>
              </h2>
              <p>
                We reserve the right to suspend or terminate your account or access to the Service at our sole discretion, without prior notice, for conduct that we believe violates these Terms of Service or is harmful to other users or the platform.
              </p>
            </section>

            {/* 10. Governing Law */}
            <section className="space-y-3">
              <h2 className="text-lg sm:text-xl font-extrabold text-slate-900 flex items-center gap-2.5">
                <span className="w-7 h-7 rounded-xl bg-purple-50 text-kulkul-purple flex items-center justify-center text-xs font-bold">
                  10
                </span>
                <span>Governing Law</span>
              </h2>
              <p>
                These Terms shall be governed by and construed in accordance with the laws of Indonesia, without regard to its conflict of law principles. Any dispute arising under these Terms shall be resolved in the competent courts of Jakarta, Indonesia.
              </p>
            </section>

            {/* 11. Contact Information */}
            <section className="space-y-3 pt-4 border-t border-slate-100">
              <h2 className="text-lg sm:text-xl font-extrabold text-slate-900 flex items-center gap-2.5">
                <span className="w-7 h-7 rounded-xl bg-purple-50 text-kulkul-purple flex items-center justify-center text-xs font-bold">
                  11
                </span>
                <span>Questions & Support</span>
              </h2>
              <p>
                If you have questions regarding these Terms of Service, please contact us at:
              </p>
              <div className="p-4 rounded-2xl bg-purple-50/50 border border-purple-100 flex items-center gap-3 text-xs sm:text-sm">
                <Mail className="w-4 h-4 text-kulkul-purple shrink-0" />
                <div>
                  <div className="font-bold text-slate-900">Kulkul Tech &ndash; Legal & Support</div>
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
