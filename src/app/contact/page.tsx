'use client';

import React, { useState } from 'react';
import { useToast } from '@/components/Toast';

export default function ContactPage() {
  const { showToast } = useToast();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [subject, setSubject] = useState('general');
  const [message, setMessage] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    showToast(`Thanks, ${name}! We've received your message and will get back to you soon. 🐾`, 'success');
    setName('');
    setEmail('');
    setSubject('general');
    setMessage('');
  };

  return (
    <div className="pt-[120px] pb-20 min-h-screen">
      <div className="max-w-[1200px] mx-auto px-6">
        <div className="text-center mb-16 animate-fade-in-up">
          <span className="inline-block px-3.5 py-1 bg-orange-500/10 rounded-full text-xs font-semibold text-[#E86A33] uppercase tracking-wider mb-4">Contact</span>
          <h1 className="text-4xl sm:text-5xl font-heading text-[#2C3E50] mb-3">Get In Touch</h1>
          <p className="text-lg text-gray-500">Have a question? We&apos;d love to hear from you.</p>
        </div>

        <div className="grid lg:grid-cols-2 gap-12 items-start animate-fade-in-up" style={{ animationDelay: '0.1s' }}>
          {/* Info */}
          <div>
            <h2 className="text-xl font-heading text-[#2C3E50] mb-4">Let&apos;s Talk</h2>
            <p className="text-gray-500 mb-8">Whether you&apos;re a pet owner looking for recommendations or a service provider wanting to join our platform, we&apos;re here to help.</p>

            <div className="flex flex-col gap-6">
              {[
                { icon: '📧', title: 'Email', details: ['hello@pawsandco.com', 'support@pawsandco.com'] },
                { icon: '📞', title: 'Phone', details: ['+1 (555) 000-PAWS', 'Mon-Fri, 9AM-6PM EST'] },
                { icon: '📍', title: 'Location', details: ['123 Pet Street, Suite 200', 'New York, NY 10001'] },
              ].map((item, i) => (
                <div key={i} className="flex gap-4">
                  <div className="w-12 h-12 rounded-xl bg-orange-500/10 flex items-center justify-center text-lg flex-shrink-0">{item.icon}</div>
                  <div>
                    <h4 className="text-sm font-semibold text-[#2C3E50]">{item.title}</h4>
                    {item.details.map((d, j) => <p key={j} className="text-sm text-gray-500">{d}</p>)}
                  </div>
                </div>
              ))}
            </div>

            <div className="mt-8">
              <h4 className="text-sm font-semibold text-[#2C3E50] mb-3">Follow Us</h4>
              <div className="flex gap-3">
                {['📷', '🐦', '📘', '🎵'].map((icon, i) => (
                  <span key={i} className="w-11 h-11 rounded-full bg-[#FFF0E0] flex items-center justify-center text-lg cursor-default hover:bg-[#E86A33]/10 transition-all">{icon}</span>
                ))}
              </div>
            </div>
          </div>

          {/* Form */}
          <div className="bg-white border border-[#F0E4D8] rounded-2xl p-8 sm:p-10">
            <h3 className="text-lg font-heading text-[#2C3E50] mb-6">Send Us a Message</h3>
            <form onSubmit={handleSubmit}>
              <div className="grid sm:grid-cols-2 gap-4 mb-5">
                <div>
                  <label className="block text-sm font-semibold text-[#2C3E50] mb-2">Your Name</label>
                  <input type="text" value={name} onChange={(e) => setName(e.target.value)} placeholder="John Doe" required
                    className="w-full px-4 py-3 border-2 border-[#F0E4D8] rounded-xl bg-[#FFF8F0] focus:border-[#E86A33] focus:bg-white focus:outline-none focus:ring-4 focus:ring-orange-500/10 transition-all text-sm" />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-[#2C3E50] mb-2">Email</label>
                  <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="john@example.com" required
                    className="w-full px-4 py-3 border-2 border-[#F0E4D8] rounded-xl bg-[#FFF8F0] focus:border-[#E86A33] focus:bg-white focus:outline-none focus:ring-4 focus:ring-orange-500/10 transition-all text-sm" />
                </div>
              </div>
              <div className="mb-5">
                <label className="block text-sm font-semibold text-[#2C3E50] mb-2">Subject</label>
                <select value={subject} onChange={(e) => setSubject(e.target.value)}
                  className="w-full px-4 py-3 border-2 border-[#F0E4D8] rounded-xl bg-[#FFF8F0] focus:border-[#E86A33] focus:bg-white focus:outline-none focus:ring-4 focus:ring-orange-500/10 transition-all text-sm">
                  <option value="general">General Inquiry</option>
                  <option value="support">Customer Support</option>
                  <option value="partner">Partnership Opportunity</option>
                  <option value="provider">Become a Provider</option>
                  <option value="feedback">Feedback</option>
                </select>
              </div>
              <div className="mb-6">
                <label className="block text-sm font-semibold text-[#2C3E50] mb-2">Message</label>
                <textarea value={message} onChange={(e) => setMessage(e.target.value)} rows={6} placeholder="Tell us how we can help..." required
                  className="w-full px-4 py-3 border-2 border-[#F0E4D8] rounded-xl bg-[#FFF8F0] focus:border-[#E86A33] focus:bg-white focus:outline-none focus:ring-4 focus:ring-orange-500/10 transition-all text-sm resize-vertical" />
              </div>
              <button type="submit" className="w-full bg-[#E86A33] hover:bg-[#D4552A] text-white font-semibold py-3.5 px-6 rounded-full text-base transition-all hover:shadow-lg">
                Send Message
              </button>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
}
