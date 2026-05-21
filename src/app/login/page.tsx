'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { useAuth } from '@/context/AuthContext';
import { useToast } from '@/components/Toast';

export default function LoginPage() {
  const { login, googleLogin } = useAuth();
  const { showToast } = useToast();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);

  const handleEmailLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    const result = await login(email.trim(), password);
    setLoading(false);
    if (result.error) {
      setError(result.error);
      return;
    }
    showToast('Welcome back! 🎉', 'success');
    window.location.href = '/dashboard';
  };

  const handleGoogleLogin = async () => {
    setError('');
    setGoogleLoading(true);
    const result = await googleLogin();
    setGoogleLoading(false);
    if (result.error) {
      if (result.error === 'cancelled') return; // user closed popup — no-op
      setError(result.error);
      return;
    }
    showToast('Signed in with Google! 🎉', 'success');
    window.location.href = '/dashboard';
  };

  return (
    <div className="min-h-screen flex items-center justify-center px-6 py-24 bg-gradient-to-br from-[#FFF8F0] to-[#FFF0E0]">
      <div className="w-full max-w-[460px]">
        <div className="bg-white rounded-2xl p-12 sm:p-10 border border-[#F0E4D8] shadow-lg">
          <div className="text-center mb-8">
            <div className="w-14 h-14 bg-orange-500/10 rounded-xl flex items-center justify-center text-2xl mx-auto mb-5">🐾</div>
            <h2 className="text-2xl font-heading text-[#2C3E50] mb-1">Welcome Back</h2>
            <p className="text-sm text-gray-500">Sign in to your Paws & Co. account</p>
          </div>

          {error && (
            <div className="bg-red-500/10 border border-red-500/20 rounded-xl px-4 py-3 text-sm text-red-500 mb-5">{error}</div>
          )}

          {/* Google */}
          <button
            onClick={handleGoogleLogin}
            disabled={googleLoading}
            className="w-full flex items-center justify-center gap-3 bg-white border-2 border-gray-200 text-gray-700 font-semibold py-3.5 px-6 rounded-full cursor-pointer hover:border-gray-400 hover:shadow-md transition-all disabled:opacity-60 disabled:cursor-wait"
          >
            {googleLoading ? (
              <div className="w-5 h-5 border-2 border-gray-400 border-t-transparent rounded-full animate-spin" />
            ) : (
              <svg width="20" height="20" viewBox="0 0 24 24"><path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z"/><path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/><path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/><path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/></svg>
            )}
            {googleLoading ? 'Signing in...' : 'Continue with Google'}
          </button>

          <div className="flex items-center gap-4 my-6">
            <div className="flex-1 h-px bg-gray-200" />
            <span className="text-sm text-gray-400">or sign in with email</span>
            <div className="flex-1 h-px bg-gray-200" />
          </div>

          {/* Email */}
          <form onSubmit={handleEmailLogin}>
            <div className="mb-5">
              <label className="block text-sm font-semibold text-[#2C3E50] mb-2">Email Address</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                required
                className="w-full px-4 py-3.5 border-2 border-[#F0E4D8] rounded-xl bg-[#FFF8F0] focus:border-[#E86A33] focus:bg-white focus:outline-none focus:ring-4 focus:ring-orange-500/10 transition-all text-sm"
              />
            </div>
            <div className="mb-5">
              <label className="block text-sm font-semibold text-[#2C3E50] mb-2">Password</label>
              <div className="relative">
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Enter your password"
                  required
                  className="w-full px-4 py-3.5 pr-12 border-2 border-[#F0E4D8] rounded-xl bg-[#FFF8F0] focus:border-[#E86A33] focus:bg-white focus:outline-none focus:ring-4 focus:ring-orange-500/10 transition-all text-sm"
                />
                <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute right-3.5 top-1/2 -translate-y-1/2 text-gray-400 text-sm">
                  {showPassword ? '🙈' : '👁️'}
                </button>
              </div>
            </div>
            <button
              type="submit"
              disabled={loading}
              className="w-full bg-[#E86A33] hover:bg-[#D4552A] text-white font-semibold py-3.5 px-6 rounded-full text-base transition-all disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {loading ? 'Signing in...' : 'Sign In'}
            </button>
          </form>

          <p className="text-center mt-6 text-sm text-gray-500">
            Don&apos;t have an account? <Link href="/register" className="font-semibold text-[#E86A33]">Sign Up</Link>
          </p>
        </div>
      </div>
    </div>
  );
}
