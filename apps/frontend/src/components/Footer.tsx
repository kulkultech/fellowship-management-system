import React from 'react';
import { Link } from 'react-router-dom';

export const Footer: React.FC = () => {
  return (
    <footer className="mt-auto border-t border-slate-200/80 bg-slate-50 py-10 sm:py-12">
      <div className="max-w-7xl mx-auto px-4 sm:px-8 lg:px-12 flex flex-col sm:flex-row items-center justify-between gap-6">
        {/* Brand & Copyright */}
        <div className="flex flex-col sm:flex-row items-center gap-3 sm:gap-4 text-center sm:text-left">
          <Link to="/" className="inline-block">
            <img src="/kulkul-logo.svg" alt="Kulkul" className="h-7 sm:h-8 w-auto object-contain" />
          </Link>
          <span className="hidden sm:inline-block text-slate-300">|</span>
          <p className="text-xs text-slate-500 font-medium">
            &copy; {new Date().getFullYear()} Kulkul Tech &middot; All rights reserved.
          </p>
        </div>

        {/* Navigation Links */}
        <div className="flex flex-wrap items-center justify-center gap-5 sm:gap-6 text-xs font-semibold text-slate-600">
          <Link to="/" className="hover:text-kulkul-purple transition">
            Home
          </Link>
          <Link to="/programs/rsa/lit2026" className="hover:text-kulkul-purple transition">
            LIT 2026
          </Link>
          <Link to="/candidate/dashboard" className="hover:text-kulkul-purple transition">
            Candidate Portal
          </Link>
          <Link to="/register-company" className="hover:text-kulkul-purple transition">
            Register Company
          </Link>
          <Link to="/admin/login" className="text-kulkul-purple hover:underline font-bold">
            Sign In
          </Link>
        </div>
      </div>
    </footer>
  );
};
