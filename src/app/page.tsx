'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useAuth } from '@/context/AuthContext';
import { collection, getDocs, query, where, limit } from 'firebase/firestore';
import { getFirestoreDb } from '@/lib/firebase';

interface CategoryCounts {
  shops: number;
  walkers: number;
  vets: number;
  hotels: number;
  sitters: number;
  grooming: number;
}

const services = [
  { emoji: '🛍️', title: 'Pet Shops', slug: 'shops', desc: 'Premium food, toys, accessories, and supplies delivered to your door.' },
  { emoji: '🐕', title: 'Dog Walkers', slug: 'walkers', desc: 'Trusted walkers who\'ll give your pup the exercise and attention they deserve.' },
  { emoji: '🏥', title: 'Veterinarians', slug: 'vets', desc: 'Experienced vets for checkups, vaccinations, and emergency care.' },
  { emoji: '🏨', title: 'Dog Hotels', slug: 'hotels', desc: 'Luxury accommodations and daycare for when you\'re away from home.' },
  { emoji: '🛋️', title: 'Pet Sitters', slug: 'sitters', desc: 'In-home sitters who\'ll treat your pets like family while you\'re gone.' },
  { emoji: '✂️', title: 'Grooming', slug: 'grooming', desc: 'Professional grooming, bathing, nail trimming, and styling services.' },
];

const countLabels: Record<string, (n: number) => string> = {
  shops: (n) => `${n} ${n === 1 ? 'shop' : 'shops'} available`,
  walkers: (n) => `${n} ${n === 1 ? 'walker' : 'walkers'} near you`,
  vets: (n) => `${n} ${n === 1 ? 'clinic' : 'clinics'} available`,
  hotels: (n) => `${n} ${n === 1 ? 'hotel' : 'hotels'} available`,
  sitters: (n) => `${n} ${n === 1 ? 'sitter' : 'sitters'} available`,
  grooming: (n) => `${n} ${n === 1 ? 'groomer' : 'groomers'} available`,
};

const steps = [
  { emoji: '✨', title: 'Create Your Profile', desc: 'Sign up as a pet owner or service provider. It takes less than 2 minutes.' },
  { emoji: '🔍', title: 'Find & Book', desc: 'Browse trusted providers, check reviews, and book the perfect service.' },
  { emoji: '💚', title: 'Enjoy Peace of Mind', desc: 'Relax knowing your pet is in good hands. Rate and review after each visit.' },
];

export default function Home() {
  const { user } = useAuth();
  const [counts, setCounts] = useState<CategoryCounts>({
    shops: 0, walkers: 0, vets: 0, hotels: 0, sitters: 0, grooming: 0,
  });
  const [hoveredCard, setHoveredCard] = useState<number | null>(null);
  const [realTestimonials, setRealTestimonials] = useState<any[]>([]);

  useEffect(() => {
    const fetchCategoryCounts = async () => {
      try {
        const db = getFirestoreDb();
        if (!db) return;
        const snapshot = await getDocs(query(collection(db, 'providers')));
        const newCounts: CategoryCounts = {
          shops: 0, walkers: 0, vets: 0, hotels: 0, sitters: 0, grooming: 0,
        };
        snapshot.forEach((doc) => {
          const data = doc.data();
          const type = (data.type as string)?.toLowerCase() || '';
          if (type in newCounts) {
            newCounts[type as keyof CategoryCounts]++;
          }
        });
        setCounts(newCounts);
      } catch (err) {
        console.error('Error fetching category counts:', err);
      }
    };
    fetchCategoryCounts();
  }, []);

  useEffect(() => {
    const fetchTopReviews = async () => {
      try {
        const db = getFirestoreDb();
        if (!db) return;
        const reviewsRef = collection(db, 'reviews');
        const testimonialQuery = query(reviewsRef, where('rating', '>=', 4), limit(3));
        const snapshot = await getDocs(testimonialQuery);
        setRealTestimonials(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
      } catch (error) {
        console.error('Failed to fetch testimonials:', error);
      }
    };
    fetchTopReviews();
  }, []);

  const getCount = (slug: string) =>
    countLabels[slug]?.(counts[slug as keyof CategoryCounts] ?? 0) ?? '';

  return (
    <>
      {/* ── Hero ── */}
      <section className="relative min-h-[90vh] flex items-center overflow-hidden gradient-hero noise-texture pt-[76px]">
        {/* Decorative circles */}
        <div className="absolute top-[-20%] right-[-10%] w-[500px] h-[500px] rounded-full bg-gradient-radial from-[#E86A33]/8 to-transparent pointer-events-none" />
        <div className="absolute bottom-[-20%] left-[-10%] w-[400px] h-[400px] rounded-full bg-gradient-radial from-[#D4A853]/6 to-transparent pointer-events-none" />

        <div className="max-w-[1200px] mx-auto px-6 w-full relative z-10">
          <div className="grid lg:grid-cols-2 gap-12 lg:gap-20 items-center">
            {/* Left */}
            <div className="pt-16 lg:pt-0">
              <div className="animate-fade-in-up">
                <span className="inline-flex items-center gap-2 px-4 py-1.5 bg-[#E86A33]/8 border border-[#E86A33]/15 rounded-full text-xs font-semibold text-[#E86A33] mb-6 tracking-wide">
                  <span className="animate-bounce-in">🐶</span> Trusted by 10,000+ pet parents
                </span>
              </div>
              <h1 className="text-4xl sm:text-5xl lg:text-6xl xl:text-7xl font-heading text-[#2C3E50] mb-6 leading-[1.1] text-balance animate-fade-in-up delay-1">
                Your Pet Deserves the{' '}
                <span className="relative whitespace-nowrap">
                  <span className="text-[#E86A33]">Best Care</span>
                  <span className="absolute -bottom-2 left-0 right-0 h-3 bg-[#E86A33]/10 -z-10 rounded-full" />
                </span>
              </h1>
              <p className="text-lg text-[#7D6E5F] mb-10 max-w-[480px] leading-relaxed animate-fade-in-up delay-2">
                Find trusted pet shops, dog walkers, vets, dog hotels, and sitters — all in one place. Because your furry family member deserves nothing less.
              </p>
              <div className="flex gap-4 flex-wrap animate-fade-in-up delay-3">
                <Link
                  href="/services"
                  className="group bg-[#E86A33] hover:bg-[#D4552A] text-white font-semibold px-8 py-4 rounded-full text-base transition-all duration-300 hover:shadow-xl hover:shadow-[#E86A33]/30 active:scale-[0.97] inline-flex items-center gap-2"
                >
                  Find a Service
                  <span className="inline-block transition-transform duration-300 group-hover:translate-x-1">→</span>
                </Link>
                <Link
                  href="/services"
                  className="group border-2 border-[#EDE0D4] text-[#7D6E5F] font-semibold px-8 py-4 rounded-full text-base hover:bg-[#2C3E50] hover:text-white hover:border-[#2C3E50] transition-all duration-300 active:scale-[0.97]"
                >
                  Browse Providers
                </Link>
              </div>

              {/* Stats */}
              <div className="flex gap-8 sm:gap-12 mt-14 pt-10 border-t border-[#EDE0D4] animate-fade-in-up delay-4">
                {[
                  { num: '10K+', label: 'Happy Pet Parents' },
                  { num: '500+', label: 'Trusted Providers' },
                  { num: '98%', label: 'Satisfaction Rate' },
                ].map((stat, i) => (
                  <div key={i} className="group cursor-default">
                    <h3 className="text-2xl sm:text-3xl font-heading text-[#E86A33] transition-transform duration-200 group-hover:scale-105">
                      {stat.num}
                    </h3>
                    <p className="text-xs sm:text-sm text-[#7D6E5F] mt-1">{stat.label}</p>
                  </div>
                ))}
              </div>
            </div>

            {/* Right — Hero visual */}
            <div className="hidden lg:flex items-center justify-center animate-fade-in-scale delay-2">
              <div className="relative w-full max-w-[460px] aspect-square">
                {/* Main circle */}
                <div className="w-full h-full rounded-full bg-gradient-to-br from-[#F5A07A] via-[#6FCFB0] to-[#FFE0B2] flex items-center justify-center shadow-2xl animate-float"
                  style={{ boxShadow: '0 20px 60px rgba(232,106,51,0.15), 0 0 120px rgba(232,106,51,0.08)' }}>
                  <span className="text-[8rem] animate-bounce-in select-none">🐕</span>
                </div>

                {/* Floating floating cards */}
                <div className="absolute top-[8%] right-[-12%] bg-white/90 backdrop-blur-sm px-4 py-3 pr-5 rounded-2xl shadow-xl flex items-center gap-3 animate-float-delayed card-hover cursor-default border border-white/60"
                  style={{ animationDelay: '0.8s' }}>
                  <div className="w-11 h-11 rounded-xl bg-[#FFF0E0] flex items-center justify-center text-lg">🏥</div>
                  <div>
                    <h4 className="text-sm font-semibold text-[#2C3E50]">Top Vets</h4>
                    <p className="text-xs text-[#7D6E5F]">4.9 ⭐ · 2km away</p>
                  </div>
                </div>
                <div className="absolute bottom-[12%] left-[-12%] bg-white/90 backdrop-blur-sm px-4 py-3 pr-5 rounded-2xl shadow-xl flex items-center gap-3 animate-float-delayed card-hover cursor-default border border-white/60"
                  style={{ animationDelay: '2s' }}>
                  <div className="w-11 h-11 rounded-xl bg-[#FFF0E0] flex items-center justify-center text-lg">🐕</div>
                  <div>
                    <h4 className="text-sm font-semibold text-[#2C3E50]">Dog Walkers</h4>
                    <p className="text-xs text-[#7D6E5F]">4.8 ⭐ · 5 available</p>
                  </div>
                </div>
                <div className="absolute bottom-[45%] left-[-8%] bg-white/90 backdrop-blur-sm w-10 h-10 rounded-xl shadow-lg flex items-center justify-center animate-float-delayed"
                  style={{ animationDelay: '3.5s' }}>
                  <span className="animate-wiggle" style={{ animationIterationCount: 1 }}>🐱</span>
                </div>

              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── Services ── */}
      <section className="py-24 lg:py-32 relative">
        <div className="max-w-[1200px] mx-auto px-6">
          <div className="text-center max-w-[600px] mx-auto mb-16">
            <div className="animate-fade-in-up">
              <span className="inline-flex items-center gap-2 px-3.5 py-1 bg-[#E86A33]/8 rounded-full text-xs font-semibold text-[#E86A33] uppercase tracking-wider mb-5">
                <span>🐾</span> Our Services
              </span>
            </div>
            <h2 className="text-3xl sm:text-4xl lg:text-5xl font-heading text-[#2C3E50] mb-4 animate-fade-in-up delay-1">
              Everything Your Pet Needs
            </h2>
            <p className="text-lg text-[#7D6E5F] animate-fade-in-up delay-2">
              From daily walks to vet checkups, find the perfect service for your furry friend.
            </p>
          </div>

          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6 lg:gap-8">
            {services.map((s, i) => (
              <Link
                key={i}
                href={`/services?type=${s.slug}`}
                onMouseEnter={() => setHoveredCard(i)}
                onMouseLeave={() => setHoveredCard(null)}
                className="group bg-white rounded-2xl p-9 text-center border border-[#EDE0D4]/70 hover:border-transparent transition-all duration-500 relative overflow-hidden card-shine animate-fade-in-up no-underline"
                style={{ animationDelay: `${(i + 1) * 0.1}s` }}
              >
                {/* Hover gradient overlay */}
                <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none"
                  style={{ background: 'linear-gradient(160deg, #FFF0E0 0%, transparent 70%)' }} />

                {/* Top accent bar */}
                <div className="absolute top-0 left-0 right-0 h-1 bg-[#E86A33] origin-left transition-transform duration-500 scale-x-0 group-hover:scale-x-100" />

                {/* Emoji with bounce */}
                <div className={`w-16 h-16 rounded-2xl flex items-center justify-center text-2xl mx-auto mb-5 relative z-10 transition-all duration-500 ${
                  hoveredCard === i ? 'scale-110 rounded-3xl' : ''
                } ${['bg-[#FFF0E0]', 'bg-emerald-50', 'bg-sky-50', 'bg-amber-50', 'bg-purple-50', 'bg-rose-50'][i]}`}
                >
                  <span className={`inline-block transition-transform duration-500 ${hoveredCard === i ? 'animate-wiggle' : ''}`}>
                    {s.emoji}
                  </span>
                </div>

                <h3 className="text-lg font-heading text-[#2C3E50] mb-3 relative z-10 transition-colors duration-300 group-hover:text-[#E86A33]">
                  {s.title}
                </h3>
                <p className="text-sm text-[#7D6E5F] mb-5 leading-relaxed relative z-10">{s.desc}</p>

                {/* Count badge */}
                <span className="inline-flex items-center gap-1.5 text-xs font-medium text-[#E86A33] bg-[#FFF0E0]/80 px-3 py-1.5 rounded-full relative z-10 transition-all duration-300 group-hover:bg-[#E86A33] group-hover:text-white">
                  <span className="inline-block transition-transform duration-300 group-hover:translate-x-0.5">📍</span>
                  {getCount(s.slug) || 'Browse providers'}
                </span>
              </Link>
            ))}
          </div>
        </div>
      </section>

      {/* ── How It Works ── */}
      <section className="py-24 lg:py-32 bg-[#FFF0E0] relative overflow-hidden">
        <div className="absolute top-[-30%] right-[-20%] w-[500px] h-[500px] rounded-full bg-gradient-radial from-[#E86A33]/6 to-transparent pointer-events-none" />
        <div className="max-w-[1200px] mx-auto px-6 relative z-10">
          <div className="text-center max-w-[600px] mx-auto mb-16">
            <div className="animate-fade-in-up">
              <span className="inline-flex items-center gap-2 px-3.5 py-1 bg-[#E86A33]/8 rounded-full text-xs font-semibold text-[#E86A33] uppercase tracking-wider mb-5">
                <span>✨</span> How It Works
              </span>
            </div>
            <h2 className="text-3xl sm:text-4xl lg:text-5xl font-heading text-[#2C3E50] mb-4 animate-fade-in-up delay-1">
              Three Simple Steps
            </h2>
            <p className="text-lg text-[#7D6E5F] animate-fade-in-up delay-2">
              Getting started is as easy as a wag of the tail.
            </p>
          </div>

          <div className="grid sm:grid-cols-3 gap-8 lg:gap-12">
            {steps.map((step, i) => (
              <div key={i} className="text-center relative group animate-fade-in-up" style={{ animationDelay: `${(i + 1) * 0.15}s` }}>
                {/* Connecting line */}
                {i < steps.length - 1 && (
                  <div className="hidden sm:block absolute top-10 left-[calc(50%+35px)] right-[calc(-50%+35px)] h-0.5 bg-gradient-to-r from-[#EDE0D4] via-[#EDE0D4] to-transparent z-0
                    group-hover:via-[#E86A33]/30 transition-colors duration-500" />
                )}

                {/* Step circle */}
                <div className="relative z-10 mb-7 inline-block">
                  <div className="w-20 h-20 rounded-full bg-white shadow-lg border-2 border-[#EDE0D4] flex items-center justify-center text-2xl mx-auto
                    transition-all duration-500 group-hover:border-[#E86A33] group-hover:shadow-xl group-hover:shadow-[#E86A33]/20 group-hover:-translate-y-1">
                    <span className="transition-transform duration-300 group-hover:scale-110">{step.emoji}</span>
                  </div>
                  <div className="absolute -top-1 -right-1 w-7 h-7 rounded-full bg-[#E86A33] text-white text-xs font-bold flex items-center justify-center
                    transition-transform duration-300 group-hover:scale-110">
                    {i + 1}
                  </div>
                </div>

                <h3 className="text-lg font-heading text-[#2C3E50] mb-3 transition-colors duration-300 group-hover:text-[#E86A33]">
                  {step.title}
                </h3>
                <p className="text-sm text-[#7D6E5F] max-w-[280px] mx-auto leading-relaxed">{step.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Testimonials ── */}
      <section className="py-24 lg:py-32 relative">
        <div className="max-w-[1200px] mx-auto px-6">
          <div className="text-center max-w-[600px] mx-auto mb-16">
            <div className="animate-fade-in-up">
              <span className="inline-flex items-center gap-2 px-3.5 py-1 bg-[#E86A33]/8 rounded-full text-xs font-semibold text-[#E86A33] uppercase tracking-wider mb-5">
                <span>💬</span> Testimonials
              </span>
            </div>
            <h2 className="text-3xl sm:text-4xl lg:text-5xl font-heading text-[#2C3E50] mb-4 animate-fade-in-up delay-1">
              What Pet Parents Say
            </h2>
            <p className="text-lg text-[#7D6E5F] animate-fade-in-up delay-2">
              Join thousands of happy pet owners who found their perfect provider.
            </p>
          </div>

          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6 lg:gap-8">
            {realTestimonials.length > 0 ? (
              realTestimonials.map((review: any, idx: number) => (
                <div
                  key={review.id}
                  className="group bg-white border border-[#EDE0D4]/60 p-7 rounded-2xl flex flex-col gap-4 shadow-sm hover:shadow-xl transition-all duration-500 hover:-translate-y-1 animate-fade-in-up"
                  style={{ animationDelay: `${(idx + 1) * 0.12}s` }}
                >
                  <div className="flex items-center gap-1.5 text-amber-500 text-sm">
                    {Array.from({ length: 5 }, (_, i) => (
                      <span key={i} className={`transition-all duration-300 ${i < (review.rating || 5) ? '' : 'opacity-30'}`}>
                        ★
                      </span>
                    ))}
                  </div>
                  <p className="text-[#7D6E5F] italic text-sm leading-relaxed flex-grow relative pl-4 border-l-2 border-[#EDE0D4] group-hover:border-[#E86A33]/30 transition-colors duration-300">
                    &ldquo;{review.text || review.comment || 'Wonderful service provided on the application!'}&rdquo;
                  </p>
                  <div className="flex items-center gap-3 mt-1">
                    <div className="w-10 h-10 rounded-full bg-gradient-to-br from-[#FFF0E0] to-[#E86A33]/20 flex items-center justify-center font-bold text-[#E86A33] text-sm uppercase">
                      {(review.userName || 'U')[0]}
                    </div>
                    <div>
                      <h4 className="font-semibold text-[#2C3E50] text-sm">{review.userName || 'Valued Client'}</h4>
                      <span className="text-xs text-[#7D6E5F]">Verified Pet Owner</span>
                    </div>
                  </div>
                </div>
              ))
            ) : (
              <>
                {[0, 1, 2].map((i) => (
                  <div key={i} className="bg-white border border-[#EDE0D4]/60 p-7 rounded-2xl animate-fade-in-up opacity-50"
                    style={{ animationDelay: `${(i + 1) * 0.12}s` }}>
                    <div className="flex gap-1.5 text-amber-500 text-sm mb-4">
                      {'★★★★★'}
                    </div>
                    <div className="space-y-2 mb-6">
                      <div className="h-3 bg-[#FFF0E0] rounded-full w-full animate-shimmer" style={{ backgroundImage: 'linear-gradient(90deg, #FFF0E0 0%, #FFE8D0 50%, #FFF0E0 100%)' }} />
                      <div className="h-3 bg-[#FFF0E0] rounded-full w-3/4 animate-shimmer" style={{ backgroundImage: 'linear-gradient(90deg, #FFF0E0 0%, #FFE8D0 50%, #FFF0E0 100%)' }} />
                    </div>
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-full bg-[#FFF0E0] animate-shimmer" style={{ backgroundImage: 'linear-gradient(90deg, #FFF0E0 0%, #FFE8D0 50%, #FFF0E0 100%)' }} />
                      <div>
                        <div className="h-3 bg-[#FFF0E0] rounded-full w-24 mb-1 animate-shimmer" style={{ backgroundImage: 'linear-gradient(90deg, #FFF0E0 0%, #FFE8D0 50%, #FFF0E0 100%)' }} />
                        <div className="h-2 bg-[#FFF0E0] rounded-full w-16 animate-shimmer" style={{ backgroundImage: 'linear-gradient(90deg, #FFF0E0 0%, #FFE8D0 50%, #FFF0E0 100%)' }} />
                      </div>
                    </div>
                  </div>
                ))}
              </>
            )}
          </div>
        </div>
      </section>

      {/* ── CTA ── */}
      <section className="py-24 relative overflow-hidden gradient-dark-cta">
        {/* Animated gradient overlay */}
        <div className="absolute inset-0 animate-gradient-drift pointer-events-none"
          style={{ background: 'linear-gradient(135deg, rgba(232,106,51,0.12) 0%, transparent 30%, rgba(212,168,83,0.08) 60%, transparent 100%)' }} />

        <div className="max-w-[1200px] mx-auto px-6 relative z-10 text-center">
          <h2 className="text-3xl sm:text-4xl lg:text-5xl font-heading text-white mb-5 animate-fade-in-up">
            Ready to Get Started?
          </h2>
          <p className="text-white/60 text-lg mb-10 max-w-[520px] mx-auto leading-relaxed animate-fade-in-up delay-2">
            Join the fastest-growing pet care community. Whether you&apos;re a pet owner or a service provider, there&apos;s a place for you here.
          </p>
          <div className="flex gap-4 justify-center flex-wrap animate-fade-in-up delay-3">
            <Link href="/register" className="group bg-[#E86A33] hover:bg-[#D4552A] text-white font-semibold px-8 py-4 rounded-full text-base transition-all duration-300 hover:shadow-xl hover:shadow-[#E86A33]/25 active:scale-[0.97] inline-flex items-center gap-2">
              Join as Pet Owner
              <span className="inline-block transition-transform duration-300 group-hover:translate-x-0.5">🐾</span>
            </Link>
            <Link href="/register?provider=true" className="group bg-white/10 hover:bg-white/20 text-white border border-white/20 font-semibold px-8 py-4 rounded-full text-base transition-all duration-300 backdrop-blur-sm active:scale-[0.97] inline-flex items-center gap-2">
              List Your Service
              <span className="inline-block transition-transform duration-300 group-hover:translate-x-0.5">→</span>
            </Link>
          </div>
        </div>
      </section>
    </>
  );
}
