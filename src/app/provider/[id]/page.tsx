'use client';

import { useParams } from 'next/navigation';
import Link from 'next/link';
import { providers } from '@/lib/data';

export default function ProviderProfilePage() {
  const params = useParams();
  const id = Number(params.id);
  const provider = providers.find(p => p.id === id);

  if (!provider) {
    return (
      <div className="pt-[120px] min-h-screen text-center">
        <div className="text-4xl mb-4 opacity-50">🔍</div>
        <h2 className="text-2xl font-heading text-[#2C3E50]">Provider not found</h2>
        <Link href="/services" className="text-[#E86A33] font-semibold text-sm">Browse all providers</Link>
      </div>
    );
  }

  const reviews = [
    { avatar: '🐱', name: 'Emily R.', rating: 5, text: 'Amazing service! My dog absolutely loves coming here.', date: '2 days ago' },
    { avatar: '🐶', name: 'Tom H.', rating: 5, text: 'Professional and caring. Highly recommend to all pet parents.', date: '1 week ago' },
    { avatar: '🐰', name: 'Lisa M.', rating: 4, text: 'Great experience overall. Very reliable and trustworthy.', date: '2 weeks ago' },
  ];

  return (
    <div className="pt-[120px] pb-20 min-h-screen">
      <div className="max-w-[900px] mx-auto px-6">
        <Link href="/services" className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-[#E86A33] mb-6">← Back to Services</Link>

        {/* Provider header */}
        <div className="bg-white rounded-2xl p-8 sm:p-10 border border-[#F0E4D8] mb-8 sm:grid sm:grid-cols-[auto_1fr] gap-8">
          <div className="w-[100px] h-[100px] rounded-full bg-[#FFF0E0] flex items-center justify-center text-3xl mx-auto sm:mx-0 flex-shrink-0 mb-4 sm:mb-0">
            {provider.emoji}
          </div>
          <div>
            <h2 className="text-2xl font-heading text-[#2C3E50]">{provider.name}</h2>
            <div className="text-yellow-500 text-sm mb-2">
              {'★'.repeat(Math.floor(provider.rating))}{provider.rating % 1 >= 0.5 ? '½' : ''} <span className="text-gray-500 font-medium">{provider.rating}</span> <span className="text-gray-400">({provider.reviews} reviews)</span>
            </div>
            <div className="flex flex-wrap gap-4 text-sm text-gray-500 mb-3">
              <span>📍 {provider.location || 'New York, NY'}</span>
              <span>📅 Member since {provider.since || '2022'}</span>
              <span>💼 {provider.category}</span>
            </div>
            <p className="text-sm text-gray-600 mb-4">{provider.desc}</p>
            <div className="flex flex-wrap gap-2 mb-5">
              {provider.tags.map(t => <span key={t} className="px-3 py-1 bg-[#FFF8F0] rounded-full text-xs font-medium text-gray-500">{t}</span>)}
            </div>
            <div className="flex gap-3 flex-wrap">
              <Link href={`/booking?provider=${provider.id}`} className="bg-[#E86A33] hover:bg-[#D4552A] text-white font-semibold px-6 py-3 rounded-full text-sm transition-all">
                Book Now — {provider.price}
              </Link>
              <button className="border-2 border-[#2C3E50] text-[#2C3E50] font-semibold px-6 py-3 rounded-full text-sm hover:bg-[#2C3E50] hover:text-white transition-all">
                ❤️ Favorite
              </button>
            </div>
          </div>
        </div>

        {/* Reviews */}
        <h3 className="text-lg font-heading text-[#2C3E50] mb-5">⭐ Reviews</h3>
        <div className="flex flex-col gap-4">
          {reviews.map((r, i) => (
            <div key={i} className="bg-white border border-[#F0E4D8] rounded-2xl p-6">
              <div className="flex justify-between items-center mb-3">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-[#FFF0E0] flex items-center justify-center">{r.avatar}</div>
                  <div>
                    <strong className="text-sm text-[#2C3E50]">{r.name}</strong>
                    <div className="text-yellow-500 text-xs">{'★'.repeat(r.rating)}</div>
                  </div>
                </div>
                <span className="text-xs text-gray-400">{r.date}</span>
              </div>
              <p className="text-sm text-[#2C3E50]">{r.text}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
