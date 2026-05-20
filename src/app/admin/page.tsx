'use client';

import React, { useState, useEffect } from 'react';
import { useAuth } from '@/context/AuthContext';
import { useRouter } from 'next/navigation';
import { localAuth } from '@/lib/localAuth';

type AdminTab = 'users' | 'services' | 'bookings' | 'analytics';

export default function AdminPage() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<AdminTab>('users');
  const [userSearch, setUserSearch] = useState('');

  useEffect(() => {
    if (!loading && !user) router.push('/login');
  }, [user, loading, router]);

  if (loading || !user) {
    return <div className="pt-[100px] min-h-screen flex items-center justify-center"><div className="w-10 h-10 border-3 border-[#F0E4D8] border-t-[#E86A33] rounded-full animate-spin" /></div>;
  }

  const allUsers = localAuth.getAllUsers();

  const filteredUsers = allUsers.filter(u =>
    !userSearch || u.name?.toLowerCase().includes(userSearch.toLowerCase()) || u.email?.toLowerCase().includes(userSearch.toLowerCase())
  );

  const tabs: { key: AdminTab; icon: string; label: string }[] = [
    { key: 'users', icon: '👥', label: 'Users' },
    { key: 'services', icon: '🏪', label: 'Services' },
    { key: 'bookings', icon: '📅', label: 'Bookings' },
    { key: 'analytics', icon: '📊', label: 'Analytics' },
  ];

  return (
    <div className="pt-[100px] pb-20 min-h-screen">
      <div className="max-w-[1200px] mx-auto px-6">
        <div className="flex justify-between items-center mb-8">
          <div>
            <h2 className="text-3xl font-heading text-[#2C3E50]">⚙️ Admin Panel</h2>
            <p className="text-sm text-gray-500">Manage users, services, and platform activity.</p>
          </div>
          <button onClick={() => alert('📥 Data exported!')} className="border-2 border-[#2C3E50] text-[#2C3E50] text-sm font-semibold px-5 py-2.5 rounded-full hover:bg-[#2C3E50] hover:text-white transition-all">📥 Export</button>
        </div>

        {/* Stats */}
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-5 mb-8">
          {[
            { icon: '👥', bg: 'bg-orange-500/12', value: String(allUsers.length), label: 'Total Users' },
            { icon: '🏪', bg: 'bg-emerald-500/12', value: '24', label: 'Active Providers' },
            { icon: '📅', bg: 'bg-yellow-500/12', value: '156', label: 'Total Bookings' },
            { icon: '💰', bg: 'bg-blue-500/12', value: '$12.4K', label: 'Revenue (MTD)' },
          ].map((s, i) => (
            <div key={i} className="bg-white border border-[#F0E4D8] rounded-2xl p-6 hover:shadow-md transition-all">
              <div className={`w-12 h-12 ${s.bg} rounded-xl flex items-center justify-center text-lg mb-4`}>{s.icon}</div>
              <h3 className="text-2xl font-heading text-[#2C3E50]">{s.value}</h3>
              <p className="text-sm text-gray-400">{s.label}</p>
            </div>
          ))}
        </div>

        {/* Tabs */}
        <div className="flex gap-1 mb-6 border-b border-[#F0E4D8] pb-1">
          {tabs.map(tab => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`px-4 py-2.5 rounded-xl text-sm font-medium transition-all ${
                activeTab === tab.key ? 'bg-[#E86A33] text-white' : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              {tab.icon} {tab.label}
            </button>
          ))}
        </div>

        {/* Users tab */}
        {activeTab === 'users' && (
          <div className="bg-white border border-[#F0E4D8] rounded-2xl overflow-hidden">
            <div className="p-5 border-b border-[#F0E4D8] flex justify-between items-center">
              <h4 className="text-sm font-semibold text-[#2C3E50]">Registered Users ({allUsers.length})</h4>
              <input type="text" value={userSearch} onChange={(e) => setUserSearch(e.target.value)} placeholder="Search users..." className="max-w-[280px] px-3 py-2 border-2 border-[#F0E4D8] rounded-xl bg-[#FFF8F0] focus:border-[#E86A33] focus:outline-none focus:ring-4 focus:ring-orange-500/10 transition-all text-sm" />
            </div>
            <table className="w-full">
              <thead>
                <tr className="border-b border-[#F0E4D8]">
                  {['Name', 'Email', 'Role', 'Auth', 'Joined', ''].map(h => (
                    <th key={h} className="text-left px-5 py-4 text-xs font-semibold text-gray-400 uppercase tracking-wider">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filteredUsers.length === 0 ? (
                  <tr><td colSpan={6} className="text-center py-10 text-gray-400 text-sm">No users found.</td></tr>
                ) : filteredUsers.map(u => (
                  <tr key={u.id} className="border-b border-[#F0E4D8] hover:bg-[#FFF8F0]">
                    <td className="px-5 py-4 text-sm font-semibold text-[#2C3E50]">{u.name || 'Unnamed'}</td>
                    <td className="px-5 py-4 text-sm text-gray-500">{u.email}</td>
                    <td className="px-5 py-4">
                      <span className={`text-xs px-3 py-1.5 rounded-full font-semibold ${u.role === 'provider' ? 'bg-blue-500/10 text-blue-500' : 'bg-emerald-500/10 text-emerald-600'}`}>
                        {u.role === 'provider' ? 'Provider' : 'Owner'}
                      </span>
                    </td>
                    <td className="px-5 py-4 text-sm text-gray-400">{u.authMethod || 'email'}</td>
                    <td className="px-5 py-4 text-sm text-gray-400">{u.createdAt ? new Date(u.createdAt).toLocaleDateString() : 'N/A'}</td>
                    <td className="px-5 py-4">
                      <button onClick={() => { localAuth.deleteUser(u.id); window.location.reload(); }} className="text-xs text-red-500 hover:text-red-700">🗑️ Delete</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Services tab */}
        {activeTab === 'services' && (
          <div className="bg-white border border-[#F0E4D8] rounded-2xl overflow-hidden">
            <table className="w-full">
              <thead>
                <tr className="border-b border-[#F0E4D8]">
                  {['Service Type', 'Providers', 'Total Bookings', 'Revenue', 'Status'].map(h => (
                    <th key={h} className="text-left px-5 py-4 text-xs font-semibold text-gray-400 uppercase tracking-wider">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {[
                  ['Pet Shops', '28', '312', '$8,450'],
                  ['Dog Walkers', '45', '890', '$22,250'],
                  ['Veterinarians', '18', '445', '$44,500'],
                  ['Dog Hotels', '12', '167', '$33,400'],
                  ['Pet Sitters', '35', '523', '$31,380'],
                  ['Grooming', '22', '378', '$13,230'],
                ].map((row, i) => (
                  <tr key={i} className="border-b border-[#F0E4D8] hover:bg-[#FFF8F0]">
                    <td className="px-5 py-4 text-sm font-semibold text-[#2C3E50]">{row[0]}</td>
                    <td className="px-5 py-4 text-sm text-gray-500">{row[1]}</td>
                    <td className="px-5 py-4 text-sm text-gray-500">{row[2]}</td>
                    <td className="px-5 py-4 text-sm text-gray-500">{row[3]}</td>
                    <td className="px-5 py-4"><span className="text-xs px-3 py-1.5 rounded-full bg-emerald-500/10 text-emerald-600 font-semibold">Active</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Bookings tab */}
        {activeTab === 'bookings' && (
          <div className="bg-white border border-[#F0E4D8] rounded-2xl overflow-hidden">
            <table className="w-full">
              <thead>
                <tr className="border-b border-[#F0E4D8]">
                  {['Customer', 'Service', 'Provider', 'Date', 'Amount', 'Status'].map(h => (
                    <th key={h} className="text-left px-5 py-4 text-xs font-semibold text-gray-400 uppercase tracking-wider">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {[
                  ['Emily R.', '🐕 Dog Walking', 'Sarah W.', 'May 21', '$25', 'Upcoming', 'bg-blue-500/10 text-blue-500'],
                  ['Marcus J.', '🏥 Vet Visit', 'Dr. Martinez', 'May 23', '$60', 'Pending', 'bg-yellow-500/10 text-yellow-600'],
                  ['Sophia K.', '🏨 Dog Hotel', 'Paws Paradise', 'May 26', '$180', 'Confirmed', 'bg-emerald-500/10 text-emerald-600'],
                  ['Tom H.', '✂️ Grooming', 'Fluffy Cuts', 'May 14', '$45', 'Completed', 'bg-emerald-500/10 text-emerald-600'],
                  ['Lisa M.', '🛍️ Pet Shop', 'PetCozy', 'May 12', '$32', 'Completed', 'bg-emerald-500/10 text-emerald-600'],
                ].map((row, i) => (
                  <tr key={i} className="border-b border-[#F0E4D8] hover:bg-[#FFF8F0]">
                    {row.slice(0, 5).map((cell, j) => (
                      <td key={j} className={`px-5 py-4 text-sm ${j === 0 ? 'font-semibold text-[#2C3E50]' : 'text-gray-500'}`}>{cell}</td>
                    ))}
                    <td className="px-5 py-4">
                      <span className={`text-xs px-3 py-1.5 rounded-full font-semibold ${row[6]}`}>{row[5]}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Analytics tab */}
        {activeTab === 'analytics' && (
          <div className="grid lg:grid-cols-2 gap-6">
            <div className="bg-white border border-[#F0E4D8] rounded-2xl p-8">
              <h4 className="text-sm font-heading text-[#2C3E50] mb-5">📈 Monthly Bookings</h4>
              <div className="flex items-end gap-3 h-[160px] pt-5">
                {[45, 58, 72, 65, 89, 102, 95, 120, 138, 145, 156, 168].map((v, i) => (
                  <div key={i} className="flex-1 flex flex-col items-center gap-1">
                    <div className="w-full bg-[#E86A33] rounded-t-md transition-all" style={{ height: `${v * 0.8}px`, opacity: 0.4 + (i / 12) * 0.6 }} />
                    <span className="text-[10px] text-gray-400">{['J','F','M','A','M','J','J','A','S','O','N','D'][i]}</span>
                  </div>
                ))}
              </div>
            </div>
            <div className="bg-white border border-[#F0E4D8] rounded-2xl p-8">
              <h4 className="text-sm font-heading text-[#2C3E50] mb-5">🎯 Service Distribution</h4>
              <div className="flex flex-col gap-4">
                {[
                  { label: 'Dog Walking', pct: 35, color: '#E86A33' },
                  { label: 'Pet Sitting', pct: 22, color: '#3AB795' },
                  { label: 'Vet Visits', pct: 18, color: '#2C3E50' },
                  { label: 'Grooming', pct: 15, color: '#F39C12' },
                  { label: 'Dog Hotels', pct: 10, color: '#9B59B6' },
                ].map(s => (
                  <div key={s.label}>
                    <div className="flex justify-between text-sm mb-1">
                      <span className="text-gray-700">{s.label}</span>
                      <span className="text-gray-400">{s.pct}%</span>
                    </div>
                    <div className="h-2 bg-[#FFF0E0] rounded-full overflow-hidden">
                      <div className="h-full rounded-full transition-all" style={{ width: `${s.pct}%`, background: s.color }} />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
