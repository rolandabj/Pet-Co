'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { useAuth } from '@/context/AuthContext';
import { usePathname, useRouter } from 'next/navigation';
import { useToast } from '@/components/Toast';

export default function Navbar() {
  const { user, logout } = useAuth();
  const pathname = usePathname();
  const router = useRouter();
  const { showToast } = useToast();
  const [menuOpen, setMenuOpen] = useState(false);
  const [logoWobble, setLogoWobble] = useState(false);

  const isActive = (path: string) => pathname === path;

  const handleLogout = async () => {
    await logout();
    showToast('Logged out successfully', 'success');
    router.push('/');
  };

  const navLinks = [
    { href: '/', label: 'Home' },
    { href: '/services', label: 'Services' },
    { href: '/about', label: 'About' },
    { href: '/contact', label: 'Contact' },
  ];

  const triggerWobble = () => {
    setLogoWobble(true);
    setTimeout(() => setLogoWobble(false), 500);
  };

  return (
    <nav className="fixed top-0 left-0 right-0 z-50 bg-[#FFFBF5]/85 backdrop-blur-2xl border-b border-[#EDE0D4]/60 h-[76px]">
      <div className="max-w-[1200px] mx-auto px-6 h-full flex items-center justify-between">
        {/* Logo */}
        <Link
          href="/"
          onMouseEnter={triggerWobble}
          className={`flex items-center gap-2.5 font-serif text-xl text-[#2C3E50] no-underline group ${logoWobble ? 'animate-wiggle' : ''}`}
        >
          <span className="w-10 h-10 rounded-xl flex items-center justify-center text-lg text-white transition-all duration-300 group-hover:rounded-2xl"
            style={{ background: 'linear-gradient(135deg, #E86A33, #D4A853)' }}>
            🐾
          </span>
          <span className="relative">
            Paws & Co.
            <span className="absolute -bottom-0.5 left-0 w-0 h-0.5 bg-[#E86A33] rounded-full transition-all duration-300 group-hover:w-full" />
          </span>
        </Link>

        {/* Desktop nav */}
        <div className="hidden md:flex items-center gap-1">
          {navLinks.map(link => {
            const active = isActive(link.href);
            return (
              <Link
                key={link.href}
                href={link.href}
                className={`relative px-4 py-2 text-sm font-medium rounded-full transition-all duration-300 group ${
                  active
                    ? 'text-[#E86A33]'
                    : 'text-[#7D6E5F] hover:text-[#E86A33]'
                }`}
              >
                {link.label}
                {active && (
                  <span className="absolute -bottom-0.5 left-1/2 -translate-x-1/2 w-5 h-1 bg-[#E86A33] rounded-full" />
                )}
                {!active && (
                  <span className="absolute -bottom-0.5 left-1/2 -translate-x-1/2 w-0 h-0.5 bg-[#E86A33] rounded-full transition-all duration-300 group-hover:w-5 opacity-0 group-hover:opacity-40" />
                )}
              </Link>
            );
          })}
        </div>

        {/* Auth actions */}
        <div className="hidden md:flex items-center gap-3">
          {user ? (
            <>
              {user.role === 'admin' && (
                <Link href="/admin" className="group relative text-sm font-medium text-[#7D6E5F] hover:text-[#E86A33] px-3 py-2 transition-colors">
                  <span className="inline-block transition-transform duration-200 group-hover:scale-110">⚙️</span>
                  <span className="ml-1">Admin</span>
                </Link>
              )}
              <Link href="/dashboard" className="group flex items-center gap-2 bg-[#E86A33] text-white text-sm font-semibold px-5 py-2.5 rounded-full hover:bg-[#D4552A] transition-all duration-300 hover:shadow-lg hover:shadow-[#E86A33]/30 active:scale-95">
                <span className="inline-block transition-transform duration-200 group-hover:scale-110">🐾</span>
                <span className="max-w-[120px] truncate">{user.name || user.email}</span>
              </Link>
              <button onClick={handleLogout} className="text-sm font-medium text-[#7D6E5F] hover:text-red-500 px-3 py-2 transition-colors">
                Logout
              </button>
            </>
          ) : (
            <>
              <Link href="/login" className="text-sm font-medium text-[#7D6E5F] hover:text-[#E86A33] px-4 py-2 transition-colors relative group">
                Log In
                <span className="absolute -bottom-0.5 left-1/2 -translate-x-1/2 w-0 h-0.5 bg-[#E86A33] rounded-full transition-all duration-300 group-hover:w-full opacity-0 group-hover:opacity-40" />
              </Link>
              <Link href="/register" className="bg-[#E86A33] text-white text-sm font-semibold px-6 py-2.5 rounded-full hover:bg-[#D4552A] transition-all duration-300 hover:shadow-lg hover:shadow-[#E86A33]/30 active:scale-95 animate-pulse-soft">
                Get Started 🐾
              </Link>
            </>
          )}
        </div>

        {/* Mobile toggle */}
        <button
          onClick={() => setMenuOpen(!menuOpen)}
          className="md:hidden flex flex-col gap-1.5 p-2 bg-none border-none cursor-pointer group"
          aria-label="Toggle menu"
        >
          <span className={`block w-6 h-0.5 bg-[#2C3E50] rounded-full transition-all duration-300 ${menuOpen ? 'rotate-45 translate-y-[5px]' : ''}`} />
          <span className={`block w-6 h-0.5 bg-[#2C3E50] rounded-full transition-all duration-300 ${menuOpen ? 'opacity-0 scale-x-0' : ''}`} />
          <span className={`block w-6 h-0.5 bg-[#2C3E50] rounded-full transition-all duration-300 ${menuOpen ? '-rotate-45 -translate-y-[5px]' : ''}`} />
        </button>
      </div>

      {/* Mobile menu */}
      <div className={`md:hidden overflow-hidden transition-all duration-400 ease-out ${
        menuOpen ? 'max-h-[500px] opacity-100' : 'max-h-0 opacity-0'
      }`}
        style={{ background: 'rgba(255, 251, 245, 0.98)', backdropFilter: 'blur(20px)' }}>
        <div className="px-6 py-4 border-t border-[#EDE0D4]/60">
          {navLinks.map((link, i) => (
            <Link
              key={link.href}
              href={link.href}
              onClick={() => setMenuOpen(false)}
              className={`block px-4 py-3 text-sm font-medium rounded-xl transition-all duration-300 ${
                isActive(link.href)
                  ? 'text-[#E86A33] bg-[#FFF0E0]'
                  : 'text-[#7D6E5F] hover:bg-[#FFF0E0]/50'
              }`}
              style={{ animationDelay: `${i * 0.05}s` }}
            >
              <span className="inline-block mr-2">
                {link.label === 'Home' ? '🏠' : link.label === 'Services' ? '🐕' : link.label === 'About' ? '📖' : '📧'}
              </span>
              {link.label}
            </Link>
          ))}
          <div className="border-t border-[#EDE0D4]/60 mt-3 pt-3">
            {user ? (
              <>
                {user.role === 'admin' && (
                  <Link href="/admin" onClick={() => setMenuOpen(false)} className="flex items-center gap-2 px-4 py-3 text-sm font-medium text-[#7D6E5F] rounded-xl hover:bg-[#FFF0E0]/50 transition-all">
                    <span>⚙️</span> Admin
                  </Link>
                )}
                <Link href="/dashboard" onClick={() => setMenuOpen(false)} className="flex items-center gap-2 px-4 py-3 text-sm font-medium text-[#E86A33] rounded-xl hover:bg-[#FFF0E0]/50 transition-all">
                  <span>🐾</span> Dashboard
                </Link>
                <button onClick={() => { handleLogout(); setMenuOpen(false); }} className="flex items-center gap-2 w-full text-left px-4 py-3 text-sm font-medium text-red-500 rounded-xl hover:bg-red-50/50 transition-all">
                  <span>🚪</span> Logout
                </button>
              </>
            ) : (
              <>
                <Link href="/login" onClick={() => setMenuOpen(false)} className="block px-4 py-3 text-sm font-medium text-[#7D6E5F] rounded-xl hover:bg-[#FFF0E0]/50 transition-all">
                  Log In
                </Link>
                <Link href="/register" onClick={() => setMenuOpen(false)} className="block px-4 py-3 mt-1 text-sm font-semibold text-white bg-[#E86A33] rounded-xl transition-all">
                  Get Started 🐾
                </Link>
              </>
            )}
          </div>
        </div>
      </div>
    </nav>
  );
}
