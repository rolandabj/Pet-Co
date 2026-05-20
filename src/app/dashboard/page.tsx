'use client';

import React, { useEffect, useState } from 'react';
import { useAuth } from '@/context/AuthContext';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

type Tab = 'overview' | 'bookings' | 'favorites' | 'profile' | 'reviews';

export default function DashboardPage() {
  const { user, loading, updateProfile } = useAuth();
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<Tab>('overview');
  const [profileName, setProfileName] = useState('');

  useEffect(() => {
    if (!loading && !user) {
      router.push('/login');
    }
    if (user) setProfileName(user.name || '');
  }, [user, loading, router]);

  if (loading || !user) {
    return (
      <div className="pt-[100px] min-h-screen flex items-center justify-center">
        <div className="w-10 h-10 border-3 border-[#F0E4D8] border-t-[#E86A33] rounded-full animate-spin" />
      </div>
    );
  }

  const tabs: { key: Tab; icon: string; label: string }[] = [
    { key: 'overview', icon: '📊', label: 'Overview' },
    { key: 'bookings', icon: '📅', label: 'My Bookings' },
    { key: 'favorites', icon: '❤️', label: 'Favorites' },
    { key: 'profile', icon: '👤', label: 'My Profile' },
    { key: 'reviews', icon: '⭐', label: 'Reviews' },
  ];

  const isProvider = user.role === 'provider';

  const handleProfileUpdate = (e: React.FormEvent) => {
    e.preventDefault();
    if (profileName.trim()) {
      updateProfile({ name: profileName.trim() });
      alert('Profile updated!');
    }
  };

  return (
    <div className="pt-[76px] min-h-screen bg-[#FFF8F0]">
      <div className="max-w-[1200px] mx-auto flex">
        {/* Sidebar */}
        <aside className="hidden md:block w-[260px] bg-white border-r border-[#F0E4D8] p-8 sticky top-[76px] h-[calc(100vh-76px)] overflow-y-auto">
          <div className="text-center pb-6 border-b border-[#F0E4D8] mb-6">
            <div className="w-16 h-16 rounded-full bg-[#FFF0E0] flex items-center justify-center text-2xl mx-auto mb-3">
              {isProvider ? '💼' : '🐾'}
            </div>
            <h4 className="text-sm font-semibold text-[#2C3E50]">{user.name}</h4>
            <p className="text-xs text-gray-400">{isProvider ? 'Service Provider' : 'Pet Owner'}</p>
          </div>
          <nav className="flex flex-col gap-1">
            {tabs.map(tab => (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                className={`flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-all text-left ${
                  activeTab === tab.key ? 'bg-orange-500/10 text-[#E86A33]' : 'text-gray-500 hover:bg-[#FFF8F0] hover:text-gray-700'
                }`}
              >
                <span className="w-5 text-center">{tab.icon}</span>
                {tab.label}
              </button>
            ))}
            <Link href="/admin" className="flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium text-gray-500 hover:bg-[#FFF8F0] hover:text-gray-700 mt-5">
              <span className="w-5 text-center">⚙️</span>
              Admin Panel
            </Link>
          </nav>
        </aside>

        {/* Main */}
        <main className="flex-1 p-8">
          {activeTab === 'overview' && (
            <>
              <div className="flex justify-between items-center mb-8 flex-wrap gap-4">
                <div>
                  <h2 className="text-2xl font-heading text-[#2C3E50]">Welcome back, {user.name?.split(' ')[0] || 'there'}! 👋</h2>
                  <p className="text-sm text-gray-500">Here&apos;s what&apos;s happening with your pets.</p>
                </div>
                <Link href="/services" className="bg-[#E86A33] hover:bg-[#D4552A] text-white text-sm font-semibold px-5 py-2.5 rounded-full transition-all">
                  Book a Service
                </Link>
              </div>

              <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-5 mb-10">
                {[
                  { icon: '📅', bg: 'bg-orange-500/12', value: '3', label: 'Upcoming Bookings' },
                  { icon: '✅', bg: 'bg-emerald-500/12', value: '12', label: 'Completed Services' },
                  { icon: '❤️', bg: 'bg-yellow-500/12', value: '5', label: 'Saved Favorites' },
                  { icon: '⭐', bg: 'bg-purple-500/12', value: '4.9', label: 'Average Rating' },
                ].map((s, i) => (
                  <div key={i} className="bg-white border border-[#F0E4D8] rounded-2xl p-6 hover:shadow-md hover:-translate-y-1 transition-all">
                    <div className={`w-12 h-12 ${s.bg} rounded-xl flex items-center justify-center text-lg mb-4`}>{s.icon}</div>
                    <h3 className="text-2xl font-heading text-[#2C3E50]">{s.value}</h3>
                    <p className="text-sm text-gray-400">{s.label}</p>
                  </div>
                ))}
              </div>

              <div className="bg-white border border-[#F0E4D8] rounded-2xl p-8">
                <h3 className="text-base font-heading text-[#2C3E50] mb-5">📅 Upcoming Bookings</h3>
                {isProvider ? (
                  <div className="flex flex-col gap-4">
                    {[
                      { pet: 'Max · Golden Retriever', date: 'Tomorrow, 10:00 AM', tag: 'Dog Walking' },
                      { pet: 'Luna · Siberian Husky', date: 'Fri, 2:00 PM', tag: 'Pet Sitting' },
                    ].map((b, i) => (
                      <div key={i} className="flex justify-between items-center p-4 bg-[#FFF8F0] rounded-xl">
                        <span className="text-sm font-semibold text-[#2C3E50]">{b.pet}</span>
                        <span className="text-sm text-gray-500">{b.date}</span>
                        <span className="text-xs px-3 py-1.5 rounded-full bg-blue-500/10 text-blue-500 font-semibold">{b.tag}</span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="flex flex-col gap-4">
                    {[
                      { service: '🐕 Dog Walking with Sarah', date: 'Tomorrow, 10:00 AM', badge: 'Confirmed', badgeColor: 'bg-blue-500/10 text-blue-500' },
                      { service: '🏥 Vet Visit with Dr. Martinez', date: 'Fri, 2:00 PM', badge: 'Pending', badgeColor: 'bg-yellow-500/10 text-yellow-600' },
                      { service: '🏨 Dog Hotel · Paws Paradise', date: 'Next Week', badge: 'Confirmed', badgeColor: 'bg-emerald-500/10 text-emerald-600' },
                    ].map((b, i) => (
                      <div key={i} className="flex justify-between items-center p-4 bg-[#FFF8F0] rounded-xl">
                        <span className="text-sm font-semibold text-[#2C3E50]">{b.service}</span>
                        <span className="text-sm text-gray-500">{b.date}</span>
                        <span className={`text-xs px-3 py-1.5 rounded-full font-semibold ${b.badgeColor}`}>{b.badge}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </>
          )}

          {activeTab === 'bookings' && (
            <>
              <div className="flex justify-between items-center mb-8">
                <h2 className="text-2xl font-heading text-[#2C3E50]">📅 My Bookings</h2>
                <Link href="/services" className="bg-[#E86A33] hover:bg-[#D4552A] text-white text-sm font-semibold px-5 py-2.5 rounded-full transition-all">+ New Booking</Link>
              </div>
              <div className="bg-white border border-[#F0E4D8] rounded-2xl overflow-hidden">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-[#F0E4D8]">
                      {['Service', 'Provider', 'Date', 'Status', 'Price'].map(h => (
                        <th key={h} className="text-left px-5 py-4 text-xs font-semibold text-gray-400 uppercase tracking-wider">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {[
                      ['🐕 Dog Walking', 'Sarah W.', 'May 21, 2026', 'Confirmed', '$25'],
                      ['🏥 Vet Visit', 'Dr. Martinez', 'May 23, 2026', 'Pending', '$60'],
                      ['🏨 Dog Hotel', 'Paws Paradise', 'May 26, 2026', 'Confirmed', '$180'],
                      ['🛍️ Pet Supplies', 'PetCozy Shop', 'May 15, 2026', 'Completed', '$45'],
                      ['✂️ Grooming', 'Fluffy Cuts', 'May 10, 2026', 'Completed', '$35'],
                    ].map((row, i) => (
                      <tr key={i} className="border-b border-[#F0E4D8] hover:bg-[#FFF8F0]">
                        {row.map((cell, j) => (
                          <td key={j} className="px-5 py-4 text-sm">
                            {j === 3 ? (
                              <span className={`text-xs px-3 py-1.5 rounded-full font-semibold ${
                                cell === 'Confirmed' ? 'bg-blue-500/10 text-blue-500' :
                                cell === 'Pending' ? 'bg-yellow-500/10 text-yellow-600' :
                                'bg-emerald-500/10 text-emerald-600'
                              }`}>{cell}</span>
                            ) : j === 0 ? <strong className="text-[#2C3E50]">{cell}</strong> : (
                              <span className="text-gray-500">{cell}</span>
                            )}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}

          {activeTab === 'favorites' && (
            <>
              <h2 className="text-2xl font-heading text-[#2C3E50] mb-8">❤️ Favorite Providers</h2>
              <div className="grid sm:grid-cols-2 gap-6">
                {[
                  { emoji: '🐕', name: 'Sarah W.', rating: '★★★★★ 4.9', desc: 'Experienced dog walker · 5+ years', tags: ['Dog Walking', 'Pet Sitting'] },
                  { emoji: '🏥', name: 'Dr. Martinez', rating: '★★★★★ 4.8', desc: 'Veterinarian · Specializes in small animals', tags: ['Vet', 'Vaccinations'] },
                  { emoji: '🏨', name: 'Paws Paradise Hotel', rating: '★★★★★ 4.9', desc: 'Luxury pet boarding · Indoor pool', tags: ['Dog Hotel', 'Daycare'] },
                ].map((p, i) => (
                  <div key={i} className="bg-white rounded-2xl p-6 border border-[#F0E4D8] hover:shadow-md transition-all flex gap-4">
                    <div className="w-14 h-14 rounded-full bg-[#FFF0E0] flex items-center justify-center text-lg flex-shrink-0">{p.emoji}</div>
                    <div>
                      <h3 className="text-sm font-semibold text-[#2C3E50]">{p.name}</h3>
                      <div className="text-yellow-500 text-xs mb-1">{p.rating}</div>
                      <p className="text-xs text-gray-500 mb-3">{p.desc}</p>
                      <div className="flex gap-2 flex-wrap">
                        {p.tags.map(t => <span key={t} className="px-2.5 py-1 bg-[#FFF8F0] rounded-full text-xs text-gray-500">{t}</span>)}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}

          {activeTab === 'profile' && (
            <>
              <h2 className="text-2xl font-heading text-[#2C3E50] mb-8">👤 My Profile</h2>
              <div className="bg-white border border-[#F0E4D8] rounded-2xl p-10 max-w-[600px]">
                <form onSubmit={handleProfileUpdate}>
                  <div className="mb-5">
                    <label className="block text-sm font-semibold text-[#2C3E50] mb-2">Full Name</label>
                    <input type="text" value={profileName} onChange={(e) => setProfileName(e.target.value)}
                      className="w-full px-4 py-3 border-2 border-[#F0E4D8] rounded-xl bg-[#FFF8F0] focus:border-[#E86A33] focus:bg-white focus:outline-none focus:ring-4 focus:ring-orange-500/10 transition-all text-sm" />
                  </div>
                  <div className="mb-5">
                    <label className="block text-sm font-semibold text-[#2C3E50] mb-2">Email</label>
                    <input type="email" value={user.email} disabled className="w-full px-4 py-3 border-2 border-[#F0E4D8] rounded-xl bg-gray-50 text-sm opacity-60 cursor-not-allowed" />
                  </div>
                  <div className="mb-5">
                    <label className="block text-sm font-semibold text-[#2C3E50] mb-2">Phone Number</label>
                    <input type="tel" placeholder="+1 (555) 000-0000" className="w-full px-4 py-3 border-2 border-[#F0E4D8] rounded-xl bg-[#FFF8F0] focus:border-[#E86A33] focus:bg-white focus:outline-none focus:ring-4 focus:ring-orange-500/10 transition-all text-sm" />
                  </div>
                  <div className="mb-5">
                    <label className="block text-sm font-semibold text-[#2C3E50] mb-2">Location</label>
                    <input type="text" placeholder="City, State" className="w-full px-4 py-3 border-2 border-[#F0E4D8] rounded-xl bg-[#FFF8F0] focus:border-[#E86A33] focus:bg-white focus:outline-none focus:ring-4 focus:ring-orange-500/10 transition-all text-sm" />
                  </div>
                  <button type="submit" className="bg-[#E86A33] hover:bg-[#D4552A] text-white font-semibold px-6 py-3 rounded-full text-sm transition-all">Save Changes</button>
                </form>
              </div>
            </>
          )}

          {activeTab === 'reviews' && (
            <>
              <h2 className="text-2xl font-heading text-[#2C3E50] mb-8">⭐ My Reviews</h2>
              <div className="flex flex-col gap-4">
                {[
                  { name: 'Dog Walking with Sarah', rating: '★★★★★', date: '2 days ago', text: 'Sarah was amazing with Max! He came back tired and happy. Highly recommend!' },
                  { name: 'Vet Visit at City Vet', rating: '★★★★★', date: '1 week ago', text: 'Dr. Martinez is so gentle with Bella. Best vet experience we\'ve ever had!' },
                ].map((r, i) => (
                  <div key={i} className="bg-white border border-[#F0E4D8] rounded-2xl p-6">
                    <div className="flex justify-between items-center mb-3">
                      <div>
                        <strong className="text-sm text-[#2C3E50]">{r.name}</strong>
                        <div className="text-yellow-500 text-sm">{r.rating}</div>
                      </div>
                      <span className="text-xs text-gray-400">{r.date}</span>
                    </div>
                    <p className="text-sm text-[#2C3E50]">{r.text}</p>
                  </div>
                ))}
              </div>
            </>
          )}
        </main>
      </div>

      {/* Mobile tab bar */}
      <div className="md:hidden fixed bottom-0 left-0 right-0 bg-white border-t border-[#F0E4D8] flex justify-around py-2 px-2 z-50">
        {tabs.map(tab => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`flex flex-col items-center px-3 py-1.5 rounded-xl text-xs transition-all ${
              activeTab === tab.key ? 'text-[#E86A33]' : 'text-gray-400'
            }`}
          >
            <span className="text-lg">{tab.icon}</span>
            <span className="text-[10px]">{tab.label}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
