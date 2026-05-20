import React from 'react';
import Link from 'next/link';

export default function Footer() {
  return (
    <footer className="bg-[#1A1A2E] text-white/80 pt-16 pb-8">
      <div className="max-w-[1200px] mx-auto px-6">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-10 mb-10">
          {/* Brand */}
          <div className="sm:col-span-2 lg:col-span-1">
            <div className="flex items-center gap-2.5 font-serif text-lg text-white">
              <span className="w-9 h-9 bg-[#E86A33] rounded-lg flex items-center justify-center text-sm">
                🐾
              </span>
              Paws & Co.
            </div>
            <p className="text-white/60 text-sm mt-3 max-w-[280px] leading-relaxed">
              Connecting pet parents with trusted care providers. Because your furry family deserves the very best.
            </p>
          </div>

          {/* Services */}
          <div>
            <h4 className="text-white text-xs font-semibold uppercase tracking-widest mb-5">Services</h4>
            <div className="flex flex-col gap-3">
              <Link href="/services" className="text-white/60 text-sm hover:text-[#E86A33] transition-all">Pet Shops</Link>
              <Link href="/services" className="text-white/60 text-sm hover:text-[#E86A33] transition-all">Dog Walkers</Link>
              <Link href="/services" className="text-white/60 text-sm hover:text-[#E86A33] transition-all">Veterinarians</Link>
              <Link href="/services" className="text-white/60 text-sm hover:text-[#E86A33] transition-all">Dog Hotels</Link>
              <Link href="/services" className="text-white/60 text-sm hover:text-[#E86A33] transition-all">Pet Sitters</Link>
              <Link href="/services" className="text-white/60 text-sm hover:text-[#E86A33] transition-all">Grooming</Link>
            </div>
          </div>

          {/* Company */}
          <div>
            <h4 className="text-white text-xs font-semibold uppercase tracking-widest mb-5">Company</h4>
            <div className="flex flex-col gap-3">
              <Link href="/about" className="text-white/60 text-sm hover:text-[#E86A33] transition-all">About Us</Link>
              <Link href="/contact" className="text-white/60 text-sm hover:text-[#E86A33] transition-all">Contact</Link>
              <span className="text-white/60 text-sm cursor-default">Blog</span>
              <span className="text-white/60 text-sm cursor-default">Careers</span>
              <span className="text-white/60 text-sm cursor-default">Press</span>
            </div>
          </div>

          {/* Support */}
          <div>
            <h4 className="text-white text-xs font-semibold uppercase tracking-widest mb-5">Support</h4>
            <div className="flex flex-col gap-3">
              <span className="text-white/60 text-sm cursor-default">Help Center</span>
              <span className="text-white/60 text-sm cursor-default">Safety</span>
              <span className="text-white/60 text-sm cursor-default">Terms of Service</span>
              <span className="text-white/60 text-sm cursor-default">Privacy Policy</span>
              <span className="text-white/60 text-sm cursor-default">FAQs</span>
            </div>
          </div>
        </div>

        {/* Bottom */}
        <div className="border-t border-white/10 pt-8 flex flex-col sm:flex-row justify-between items-center gap-4">
          <p className="text-white/40 text-sm">&copy; {new Date().getFullYear()} Paws & Co. All rights reserved.</p>
          <div className="flex gap-4">
            {['📷', '🐦', '📘', '🎵'].map((icon, i) => (
              <span
                key={i}
                className="w-9 h-9 rounded-full border border-white/15 flex items-center justify-center text-sm text-white/50 hover:border-[#E86A33] hover:text-[#E86A33] hover:bg-[#E86A33]/10 transition-all cursor-default"
              >
                {icon}
              </span>
            ))}
          </div>
        </div>
      </div>
    </footer>
  );
}
