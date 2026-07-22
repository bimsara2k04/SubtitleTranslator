'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { useAuth } from '../../lib/auth-context.js';
import AuthModal from './AuthModal.js';
import { LogIn, LogOut, User as UserIcon, Sparkles } from 'lucide-react';

export default function Header() {
  const { user, loading, logOut } = useAuth();
  const [isAuthOpen, setIsAuthOpen] = useState(false);

  return (
    <>
      <header className="sticky top-0 z-40 w-full border-b border-purple-500/10 bg-[#030014]/80 backdrop-blur-xl">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          {/* Logo & Brand */}
          <Link href="/" className="flex items-center gap-3 group">
            <div className="p-2 rounded-xl bg-purple-600/20 border border-purple-500/30 text-purple-400 group-hover:scale-105 transition">
              <Sparkles className="w-5 h-5" />
            </div>
            <div>
              <span className="font-bold text-lg bg-gradient-to-r from-white via-purple-100 to-purple-300 bg-clip-text text-transparent">
                SubtitleTranslator
              </span>
              <span className="ml-2 text-[10px] uppercase tracking-wider font-semibold px-2 py-0.5 rounded-full bg-purple-500/10 border border-purple-500/20 text-purple-300">
                AI Powered
              </span>
            </div>
          </Link>

          {/* User Auth Section */}
          <div className="flex items-center gap-4">
            {loading ? (
              <div className="w-24 h-9 bg-slate-800/50 animate-pulse rounded-xl" />
            ) : user ? (
              <div className="flex items-center gap-3">
                <div className="flex items-center gap-2.5 px-3 py-1.5 rounded-xl bg-purple-950/40 border border-purple-500/20">
                  {user.photoURL ? (
                    <img
                      src={user.photoURL}
                      alt={user.displayName || 'User'}
                      className="w-6 h-6 rounded-full object-cover border border-purple-400/40"
                    />
                  ) : (
                    <div className="w-6 h-6 rounded-full bg-purple-600/30 border border-purple-400/30 flex items-center justify-center text-xs font-semibold text-purple-200">
                      {(user.email || 'U').charAt(0).toUpperCase()}
                    </div>
                  )}
                  <span className="text-xs font-medium text-slate-200 max-w-[150px] truncate">
                    {user.displayName || user.email}
                  </span>
                </div>

                <button
                  onClick={() => logOut()}
                  title="Sign Out"
                  className="p-2 text-slate-400 hover:text-red-400 rounded-xl hover:bg-red-500/10 border border-transparent hover:border-red-500/20 transition"
                >
                  <LogOut className="w-4 h-4" />
                </button>
              </div>
            ) : (
              <button
                onClick={() => setIsAuthOpen(true)}
                className="flex items-center gap-2 px-4 py-2 rounded-xl bg-purple-600/20 hover:bg-purple-600/30 border border-purple-500/30 text-purple-200 text-xs font-semibold tracking-wide transition shadow-lg shadow-purple-950/30"
              >
                <LogIn className="w-4 h-4" />
                Sign In
              </button>
            )}
          </div>
        </div>
      </header>

      {/* Auth Modal */}
      <AuthModal isOpen={isAuthOpen} onClose={() => setIsAuthOpen(false)} />
    </>
  );
}
