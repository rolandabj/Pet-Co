import React from 'react';
import Link from 'next/link';

export default function Footer() {
  return (
    <footer className="bg-[#2C2416] text-white/80 pt-20 pb-8 relative overflow-hidden">
      {/* Decorative top divider */}
      <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-[#E86A33]/30 to-transparent" />

      {/* Subtle floating paws */}
      <span className="absolute top-[15%] left-[8%] text-3xl animate-float-delayed pointer-events-none select-none opacity-[0.04]">🐾</span>
      <span className="absolute top-[45%] right-[12%] text-2xl animate-float-delayed pointer-events-none select-none opacity-[0.03]" style={{ animationDelay: '2s' }}>🐾</span>
      <span className="absolute bottom-[25%] left-[60%] text-4xl animate-float-delayed pointer-events-none select-none opacity-[0.03]" style={{ animationDelay: '4s' }}>🐾</span>

      <div className="max-w-[1200px] mx-auto px-6 relative z-10">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-10 lg:gap-12 mb-12">
          {/* Brand */}
          <div className="sm:col-span-2 lg:col-span-1">
            <Link href="/" className="group inline-flex items-center gap-2.5 font-serif text-lg text-white no-underline">
              <span className="w-10 h-10 rounded-xl flex items-center justify-center text-base text-white transition-all duration-300 group-hover:rounded-2xl"
                style={{ background: 'linear-gradient(135deg, #E86A33, #D4A853)' }}>
                🐾
              </span>
              Paws & Co.
            </Link>
            <p className="text-white/50 text-sm mt-4 max-w-[280px] leading-relaxed">
              Connecting pet parents with trusted care providers. Because your furry family deserves the very best.
            </p>
            {/* Newsletter hint */}
            <div className="mt-6 flex items-center gap-2 text-white/30 text-xs">
              <span className="inline-block w-2 h-2 rounded-full bg-[#3AB795] animate-pulse-soft" />
              All providers verified
            </div>
          </div>

          {/* Services */}
          <div>
            <h4 className="text-white/90 text-xs font-semibold uppercase tracking-[0.15em] mb-6 flex items-center gap-2">
              <span className="text-[#E86A33]">🐕</span> Services
            </h4>
            <div className="flex flex-col gap-3">
              {['Pet Shops', 'Dog Walkers', 'Veterinarians', 'Dog Hotels', 'Pet Sitters', 'Grooming'].map((label, i) => (
                <Link key={i} href="/services" className="group/link flex items-center gap-2 text-white/50 text-sm hover:text-[#E86A33] transition-all duration-300 no-underline">
                  <span className="w-0 overflow-hidden transition-all duration-300 group-hover/link:w-2 text-[#E86A33]">·</span>
                  {label}
                </Link>
              ))}
            </div>
          </div>

          {/* Company */}
          <div>
            <h4 className="text-white/90 text-xs font-semibold uppercase tracking-[0.15em] mb-6 flex items-center gap-2">
              <span className="text-[#E86A33]">📖</span> Company
            </h4>
            <div className="flex flex-col gap-3">
              {[
                { href: '/about', label: 'About Us' },
                { href: '/contact', label: 'Contact' },
                { label: 'Blog', disabled: true },
                { label: 'Careers', disabled: true },
                { label: 'Press', disabled: true },
              ].map((item, i) => (
                item.href ? (
                  <Link key={i} href={item.href} className="group/link flex items-center gap-2 text-white/50 text-sm hover:text-[#E86A33] transition-all duration-300 no-underline">
                    <span className="w-0 overflow-hidden transition-all duration-300 group-hover/link:w-2 text-[#E86A33]">·</span>
                    {item.label}
                  </Link>
                ) : (
                  <span key={i} className="text-white/30 text-sm cursor-default">{item.label}</span>
                )
              ))}
            </div>
          </div>

          {/* Support */}
          <div>
            <h4 className="text-white/90 text-xs font-semibold uppercase tracking-[0.15em] mb-6 flex items-center gap-2">
              <span className="text-[#E86A33]">💬</span> Support
            </h4>
            <div className="flex flex-col gap-3">
              {[
                { label: 'Help Center', disabled: true },
                { label: 'Safety', disabled: true },
                { href: '/terms', label: 'Terms of Service' },
                { href: '/privacy', label: 'Privacy Policy' },
                { label: 'FAQs', disabled: true },
              ].map((item, i) => (
                item.href ? (
                  <Link key={i} href={item.href} className="group/link flex items-center gap-2 text-white/50 text-sm hover:text-[#E86A33] transition-all duration-300 no-underline">
                    <span className="w-0 overflow-hidden transition-all duration-300 group-hover/link:w-2 text-[#E86A33]">·</span>
                    {item.label}
                  </Link>
                ) : (
                  <span key={i} className="text-white/30 text-sm cursor-default">{item.label}</span>
                )
              ))}
            </div>
          </div>
        </div>

        {/* Bottom */}
        <div className="border-t border-white/8 pt-8 flex flex-col sm:flex-row justify-between items-center gap-6">
          <p className="text-white/30 text-sm">&copy; {new Date().getFullYear()} Paws & Co. All rights reserved.</p>
          <div className="flex gap-3">
            {[
              { icon: '📷', label: 'Instagram' },
              { icon: '🐦', label: 'Twitter' },
              { icon: '📘', label: 'Facebook' },
              { icon: '🎵', label: 'TikTok' },
            ].map((item, i) => (
              <span
                key={i}
                className="group w-10 h-10 rounded-xl border border-white/10 flex items-center justify-center text-sm text-white/40 transition-all duration-300 hover:border-[#E86A33]/30 hover:text-[#E86A33] hover:bg-[#E86A33]/8 hover:shadow-lg hover:shadow-[#E86A33]/10 cursor-default"
                title={item.label}
              >
                <span className="transition-transform duration-300 group-hover:scale-110">{item.icon}</span>
              </span>
            ))}
          </div>
        </div>
      </div>
    </footer>
  );
}
