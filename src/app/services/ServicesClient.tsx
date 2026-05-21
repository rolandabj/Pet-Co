'use client';

import { useState } from 'react';
import { ServiceProvider } from '@/lib/types';
import Link from 'next/link';

const filterTypes = [
  { value: 'all', label: 'All' },
  { value: 'shops', label: '🛍️ Pet Shops' },
  { value: 'walkers', label: '🐕 Dog Walkers' },
  { value: 'vets', label: '🏥 Vets' },
  { value: 'hotels', label: '🏨 Dog Hotels' },
  { value: 'sitters', label: '🛋️ Pet Sitters' },
  { value: 'grooming', label: '✂️ Grooming' },
];

interface Props {
  initialProviders: ServiceProvider[];
  loadError: string;
}

export default function ServicesClient({ initialProviders, loadError }: Props) {
  const [providers] = useState(initialProviders);
  const [error] = useState(loadError);
  const [activeFilter, setActiveFilter] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');

  const filtered = providers.filter(p => {
    const matchesFilter = activeFilter === 'all' || p.type === activeFilter;
    const matchesSearch = !searchQuery || 
      p.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      p.category.toLowerCase().includes(searchQuery.toLowerCase()) ||
      p.tags.some(t => t.toLowerCase().includes(searchQuery.toLowerCase())) ||
      p.desc.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesFilter && matchesSearch;
  });

  return (
    <div className="pt-[120px] pb-20 min-h-screen">
      <div className="max-w-[1200px] mx-auto px-6">
        {/* Header */}
        <div className="text-center mb-12 animate-fade-in-up">
          <span className="inline-block px-3.5 py-1 bg-orange-500/10 rounded-full text-xs font-semibold text-[#E86A33] uppercase tracking-wider mb-4">Browse Services</span>
          <h1 className="text-4xl font-heading text-[#2C3E50] mb-3">Find the Perfect Care for Your Pet</h1>
          <p className="text-gray-500">Search through trusted providers in your area.</p>
          
          <div className="flex gap-3 max-w-[600px] mx-auto mt-8">
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search services or providers..."
              className="flex-1 px-4 py-3.5 border-2 border-[#F0E4D8] rounded-xl bg-white focus:border-[#E86A33] focus:outline-none focus:ring-4 focus:ring-orange-500/10 transition-all text-sm"
            />
            <button className="bg-[#E86A33] hover:bg-[#D4552A] text-white font-semibold px-6 py-3 rounded-xl transition-all">🔍 Search</button>
          </div>
        </div>

        {/* Filter chips */}
        <div className="flex gap-3 flex-wrap justify-center mb-8 animate-fade-in-up" style={{ animationDelay: '0.1s' }}>
          {filterTypes.map(f => (
            <button
              key={f.value}
              onClick={() => setActiveFilter(f.value)}
              className={`px-5 py-2 rounded-full border text-sm font-medium transition-all ${
                activeFilter === f.value
                  ? 'bg-[#E86A33] text-white border-[#E86A33]'
                  : 'bg-white text-gray-500 border-[#F0E4D8] hover:border-[#E86A33] hover:text-[#E86A33]'
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>

        {/* Error state */}
        {error ? (
          <div className="text-center py-20 max-w-[500px] mx-auto">
            <div className="text-4xl mb-4 opacity-50">⚠️</div>
            <h3 className="text-xl font-heading text-[#2C3E50] mb-2">Something went wrong</h3>
            <p className="text-gray-400 mb-6">{error}</p>
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-20">
            <div className="text-4xl mb-4 opacity-50">🔍</div>
            <h3 className="text-xl font-heading text-[#2C3E50] mb-2">No providers found</h3>
            <p className="text-gray-400">Try adjusting your search or filter.</p>
          </div>
        ) : (
          <div className="grid sm:grid-cols-2 gap-6">
            {filtered.map((p) => (
              <Link
                key={p.id}
                href={`/provider/${p.id}`}
                className="bg-white rounded-2xl p-7 border border-[#F0E4D8] hover:shadow-lg hover:-translate-y-1 transition-all flex gap-5"
              >
                <div className="w-14 h-14 rounded-full bg-[#FFF0E0] flex items-center justify-center text-xl flex-shrink-0">
                  {p.emoji}
                </div>
                <div className="flex-1 min-w-0">
                  <h3 className="text-base font-heading text-[#2C3E50]">{p.name}</h3>
                  <div className="text-yellow-500 text-sm mb-2">
                    {'★'.repeat(Math.floor(p.rating))}{p.rating % 1 >= 0.5 ? '½' : ''} {p.rating} ({p.reviews} reviews)
                  </div>
                  <p className="text-sm text-gray-500 mb-3 line-clamp-2">{p.desc}</p>
                  <div className="flex flex-wrap gap-2">
                    {p.tags.map(t => (
                      <span key={t} className="px-3 py-1 bg-[#FFF8F0] rounded-full text-xs font-medium text-gray-500">{t}</span>
                    ))}
                  </div>
                  <div className="flex justify-between items-center mt-3">
                    <span className="text-sm font-semibold text-[#E86A33]">{p.price}</span>
                    <span className="text-xs text-gray-400">{p.category}</span>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
