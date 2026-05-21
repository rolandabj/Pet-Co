'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { useAuth } from '@/context/AuthContext';
import { usePathname } from 'next/navigation';

export default function Navbar() {
  const { user, logout } = useAuth();
  const pathname = usePathname();
  const [menuOpen, setMenuOpen] = useState(false);

  const isActive = (path: string) => pathname === path;

  const navLinks = [
    { href: '/', label: 'Home' },
    { href: '/services', label: 'Services' },
    { href: '/about', label: 'About' },
    { href: '/contact', label: 'Contact' },
  ];

  return (
    <nav className="fixed top-0 left-0 right-0 z-50 bg-[#FFF8F0]/92 backdrop-blur-xl border-b border-[#F0E4D8] h-[76px]">
      <div className="max-w-[1200px] mx-auto px-6 h-full flex items-center justify-between">
        <Link href="/" className="flex items-center gap-2.5 font-serif text-xl text-[#2C3E50] no-underline">
          <span className="w-10 h-10 bg-[#E86A33] rounded-lg flex items-center justify-center text-lg text-white">
            🐾
          </span>
          Paws & Co.
        </Link>

        {/* Desktop nav */}
        <div className="hidden md:flex items-center gap-2">
          {navLinks.map(link => (
            <Link
              key={link.href}
              href={link.href}
              className={`px-4 py-2 text-sm font-medium rounded-full transition-all ${
                isActive(link.href)
                  ? 'text-[#E86A33] bg-[#FFF0E0]'
                  : 'text-gray-500 hover:text-[#E86A33] hover:bg-[#FFF0E0]'
              }`}
            >
              {link.label}
            </Link>
          ))}
        </div>

        {/* Auth actions */}
        <div className="hidden md:flex items-center gap-3">
          {user ? (
            <>
              {user.email === 'rolandabj@gmail.com' && (
                <Link href="/admin" className="text-sm font-medium text-gray-500 hover:text-[#E86A33] px-3 py-2">
                  ⚙️ Admin
                </Link>
              )}
              <Link href="/dashboard" className="flex items-center gap-2 bg-[#E86A33] text-white text-sm font-semibold px-4 py-2 rounded-full hover:bg-[#D4552A] transition-all">
                <span>👤</span>
                {user.name || user.email}
              </Link>
              <button onClick={logout} className="text-sm font-medium text-gray-500 hover:text-gray-700 px-3 py-2">
                Logout
              </button>
            </>
          ) : (
            <>
              <Link href="/login" className="text-sm font-medium text-gray-500 hover:text-gray-700 px-4 py-2">
                Log In
              </Link>
              <Link href="/register" className="bg-[#E86A33] text-white text-sm font-semibold px-5 py-2 rounded-full hover:bg-[#D4552A] transition-all hover:shadow-lg">
                Get Started
              </Link>
            </>
          )}
        </div>

        {/* Mobile toggle */}
        <button
          onClick={() => setMenuOpen(!menuOpen)}
          className="md:hidden flex flex-col gap-1.5 p-1 bg-none border-none cursor-pointer"
          aria-label="Toggle menu"
        >
          <span className={`w-6 h-0.5 bg-[#2C3E50] rounded transition-all ${menuOpen ? 'rotate-45 translate-y-1.5' : ''}`} />
          <span className={`w-6 h-0.5 bg-[#2C3E50] rounded transition-all ${menuOpen ? 'opacity-0' : ''}`} />
          <span className={`w-6 h-0.5 bg-[#2C3E50] rounded transition-all ${menuOpen ? '-rotate-45 -translate-y-1.5' : ''}`} />
        </button>
      </div>

      {/* Mobile menu */}
      {menuOpen && (
        <div className="md:hidden bg-white border-b border-gray-200 px-6 py-4 shadow-lg">
          {navLinks.map(link => (
            <Link
              key={link.href}
              href={link.href}
              onClick={() => setMenuOpen(false)}
              className={`block px-4 py-2.5 text-sm font-medium rounded-xl ${
                isActive(link.href) ? 'text-[#E86A33] bg-[#FFF0E0]' : 'text-gray-600'
              }`}
            >
              {link.label}
            </Link>
          ))}
          <div className="border-t border-gray-100 mt-3 pt-3">
            {user ? (
              <>
                {user.email === 'rolandabj@gmail.com' && (
                  <Link href="/admin" onClick={() => setMenuOpen(false)} className="block px-4 py-2.5 text-sm font-medium text-gray-600">
                    ⚙️ Admin
                  </Link>
                )}
                <Link href="/dashboard" onClick={() => setMenuOpen(false)} className="block px-4 py-2.5 text-sm font-medium text-[#E86A33]">
                  👤 Dashboard
                </Link>
                <button onClick={() => { logout(); setMenuOpen(false); }} className="block w-full text-left px-4 py-2.5 text-sm font-medium text-red-500">
                  Logout
                </button>
              </>
            ) : (
              <>
                <Link href="/login" onClick={() => setMenuOpen(false)} className="block px-4 py-2.5 text-sm font-medium text-gray-600">
                  Log In
                </Link>
                <Link href="/register" onClick={() => setMenuOpen(false)} className="block px-4 py-2.5 text-sm font-medium text-[#E86A33]">
                  Get Started
                </Link>
              </>
            )}
          </div>
        </div>
      )}
    </nav>
  );
}
