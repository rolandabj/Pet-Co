'use client';

import Link from 'next/link';
import { useAuth } from '@/context/AuthContext';

const services = [
  { emoji: '🛍️', title: 'Pet Shops', slug: 'shops', desc: 'Premium food, toys, accessories, and supplies delivered to your door.', count: '120+ shops available' },
  { emoji: '🐕', title: 'Dog Walkers', slug: 'walkers', desc: 'Trusted walkers who\'ll give your pup the exercise and attention they deserve.', count: '200+ walkers near you' },
  { emoji: '🏥', title: 'Veterinarians', slug: 'vets', desc: 'Experienced vets for checkups, vaccinations, and emergency care.', count: '80+ vet clinics' },
  { emoji: '🏨', title: 'Dog Hotels', slug: 'hotels', desc: 'Luxury accommodations and daycare for when you\'re away from home.', count: '50+ pet hotels' },
  { emoji: '🛋️', title: 'Pet Sitters', slug: 'sitters', desc: 'In-home sitters who\'ll treat your pets like family while you\'re gone.', count: '160+ sitters' },
  { emoji: '✂️', title: 'Grooming', slug: 'grooming', desc: 'Professional grooming, bathing, nail trimming, and styling services.', count: '90+ groomers' },
];

const steps = [
  { num: '1', title: 'Create Your Profile', desc: 'Sign up as a pet owner or service provider. It takes less than 2 minutes.' },
  { num: '2', title: 'Find & Book', desc: 'Browse trusted providers, check reviews, and book the perfect service.' },
  { num: '3', title: 'Enjoy Peace of Mind', desc: 'Relax knowing your pet is in good hands. Rate and review after each visit.' },
];

const testimonials = [
  { stars: '★★★★★', text: 'Paws & Co. made finding a reliable dog walker so easy. Bella absolutely loves her walks with Sarah. Highly recommend!', avatar: '🐱', name: 'Emily R.', role: 'Pet Owner · 2 dogs' },
  { stars: '★★★★★', text: 'As a pet sitter, Paws & Co. has helped me grow my business tremendously. The platform is intuitive and brings me quality clients.', avatar: '🐶', name: 'Marcus J.', role: 'Pet Sitter · 3 years' },
  { stars: '★★★★★', text: 'Found an amazing vet through Paws & Co. The booking was seamless and the prices were transparent. No hidden fees!', avatar: '🐰', name: 'Sophia K.', role: 'Pet Owner · 1 rabbit' },
];

export default function Home() {
  const { user } = useAuth();

  return (
    <>
      {/* Hero */}
      <section className="pt-[140px] pb-20 bg-gradient-to-br from-[#FFF8F0] via-[#FFF0E0] to-[#FFF0D0] relative overflow-hidden">
        <div className="absolute top-[-50%] right-[-20%] w-[600px] h-[600px] rounded-full bg-gradient-radial from-orange-500/8 to-transparent pointer-events-none" />
        <div className="absolute bottom-[-30%] left-[-10%] w-[400px] h-[400px] rounded-full bg-gradient-radial from-emerald-500/6 to-transparent pointer-events-none" />
        
        <div className="max-w-[1200px] mx-auto px-6 grid lg:grid-cols-2 gap-16 items-center relative z-10">
          <div className="animate-fade-in-up">
            <div className="inline-flex items-center gap-2 px-4 py-1.5 bg-orange-500/10 border border-orange-500/20 rounded-full text-sm font-semibold text-[#E86A33] mb-6">
              <span>🐶</span> Trusted by 10,000+ pet parents
            </div>
            <h1 className="text-4xl sm:text-5xl lg:text-6xl font-heading text-[#2C3E50] mb-5 leading-tight">
              Your Pet Deserves the <span className="text-[#E86A33]">Best Care</span>
            </h1>
            <p className="text-lg text-gray-500 mb-8 max-w-[520px] leading-relaxed">
              Find trusted pet shops, dog walkers, vets, dog hotels, and sitters — all in one place. Because your furry family member deserves nothing less.
            </p>
            <div className="flex gap-4 flex-wrap">
              <Link href="/login" className="bg-[#E86A33] hover:bg-[#D4552A] text-white font-semibold px-8 py-4 rounded-full text-base transition-all hover:shadow-lg hover:shadow-orange-500/30">
                Find a Service
              </Link>
              <Link href="/services" className="border-2 border-[#2C3E50] text-[#2C3E50] font-semibold px-8 py-4 rounded-full text-base hover:bg-[#2C3E50] hover:text-white transition-all">
                Browse Providers
              </Link>
            </div>
            <div className="flex gap-10 mt-12 pt-8 border-t border-[#F0E4D8]">
              {[
                { num: '10K+', label: 'Happy Pet Parents' },
                { num: '500+', label: 'Trusted Providers' },
                { num: '98%', label: 'Satisfaction Rate' },
              ].map((stat, i) => (
                <div key={i}>
                  <h3 className="text-2xl font-heading text-[#E86A33]">{stat.num}</h3>
                  <p className="text-sm text-gray-400">{stat.label}</p>
                </div>
              ))}
            </div>
          </div>

          <div className="flex items-center justify-center animate-fade-in-up" style={{ animationDelay: '0.1s' }}>
            <div className="relative w-full max-w-[450px] aspect-square">
              <div className="w-full h-full rounded-full bg-gradient-to-br from-[#F5A07A] via-[#6FCFB0] to-[#FFE0B2] flex items-center justify-center text-[8rem] shadow-2xl animate-float">
                🐕
              </div>
              <div className="absolute top-[8%] right-[-5%] bg-white p-4 pr-5 rounded-xl shadow-lg flex items-center gap-3 animate-float" style={{ animationDelay: '0.5s' }}>
                <div className="w-11 h-11 rounded-lg bg-orange-500/15 flex items-center justify-center text-lg">🏥</div>
                <div><h4 className="text-sm font-semibold text-[#2C3E50]">Top Vets</h4><p className="text-xs text-gray-400">4.9 ⭐ · 2km away</p></div>
              </div>
              <div className="absolute bottom-[15%] left-[-5%] bg-white p-4 pr-5 rounded-xl shadow-lg flex items-center gap-3 animate-float" style={{ animationDelay: '1.5s' }}>
                <div className="w-11 h-11 rounded-lg bg-emerald-500/15 flex items-center justify-center text-lg">🐕</div>
                <div><h4 className="text-sm font-semibold text-[#2C3E50]">Dog Walkers</h4><p className="text-xs text-gray-400">4.8 ⭐ · 5 available</p></div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Services */}
      <section className="py-24">
        <div className="max-w-[1200px] mx-auto px-6">
          <div className="text-center max-w-[600px] mx-auto mb-16 animate-fade-in-up">
            <span className="inline-block px-3.5 py-1 bg-orange-500/10 rounded-full text-xs font-semibold text-[#E86A33] uppercase tracking-wider mb-4">Our Services</span>
            <h2 className="text-3xl sm:text-4xl lg:text-5xl font-heading text-[#2C3E50] mb-4">Everything Your Pet Needs</h2>
            <p className="text-lg text-gray-500">From daily walks to vet checkups, find the perfect service for your furry friend.</p>
          </div>

          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {services.map((s, i) => (
              <Link
                key={i}
                href={`/services?type=${s.slug}`}
                className="block bg-white rounded-2xl p-9 text-center border border-[#F0E4D8] hover:shadow-lg hover:-translate-y-1.5 hover:border-transparent transition-all relative overflow-hidden before:content-[''] before:absolute before:top-0 before:left-0 before:right-0 before:h-1 before:bg-[#E86A33] before:scale-x-0 before:origin-left before:transition-transform before:duration-300 hover:before:scale-x-100 animate-fade-in-up no-underline"
                style={{ animationDelay: `${(i + 1) * 0.1}s` }}>
                <div className={`w-16 h-16 rounded-xl flex items-center justify-center text-2xl mx-auto mb-5 ${
                  ['bg-orange-500/12', 'bg-emerald-500/12', 'bg-[#2C3E50]/10', 'bg-yellow-500/12', 'bg-purple-500/12', 'bg-red-500/10'][i]
                }`}>
                  {s.emoji}
                </div>
                <h3 className="text-lg font-heading text-[#2C3E50] mb-2">{s.title}</h3>
                <p className="text-sm text-gray-500 mb-4">{s.desc}</p>
                <span className="text-xs text-gray-400 font-medium">{s.count}</span>
              </Link>
            ))}
          </div>
        </div>
      </section>

      {/* How It Works */}
      <section className="py-24 bg-[#FFF0E0]">
        <div className="max-w-[1200px] mx-auto px-6">
          <div className="text-center max-w-[600px] mx-auto mb-16 animate-fade-in-up">
            <span className="inline-block px-3.5 py-1 bg-orange-500/10 rounded-full text-xs font-semibold text-[#E86A33] uppercase tracking-wider mb-4">How It Works</span>
            <h2 className="text-3xl sm:text-4xl lg:text-5xl font-heading text-[#2C3E50] mb-4">Three Simple Steps</h2>
            <p className="text-lg text-gray-500">Getting started is as easy as a wag of the tail.</p>
          </div>

          <div className="grid sm:grid-cols-3 gap-10">
            {steps.map((step, i) => (
              <div key={i} className="text-center relative animate-fade-in-up" style={{ animationDelay: `${(i + 1) * 0.1}s` }}>
                <div className="w-14 h-14 rounded-full bg-[#E86A33] text-white font-heading text-xl flex items-center justify-center mx-auto mb-6 relative z-10">
                  {step.num}
                </div>
                {i < steps.length - 1 && (
                  <div className="hidden sm:block absolute top-7 left-[calc(50%+40px)] right-[calc(-50%+40px)] h-0.5 bg-gradient-to-r from-[#F0E4D8] to-transparent z-0" />
                )}
                <h3 className="text-lg font-heading text-[#2C3E50] mb-2">{step.title}</h3>
                <p className="text-sm text-gray-500 max-w-[280px] mx-auto">{step.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Testimonials */}
      <section className="py-24">
        <div className="max-w-[1200px] mx-auto px-6">
          <div className="text-center max-w-[600px] mx-auto mb-16 animate-fade-in-up">
            <span className="inline-block px-3.5 py-1 bg-orange-500/10 rounded-full text-xs font-semibold text-[#E86A33] uppercase tracking-wider mb-4">Testimonials</span>
            <h2 className="text-3xl sm:text-4xl lg:text-5xl font-heading text-[#2C3E50] mb-4">What Pet Parents Say</h2>
            <p className="text-lg text-gray-500">Join thousands of happy pet owners who found their perfect provider.</p>
          </div>

          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {testimonials.map((t, i) => (
              <div key={i} className="bg-white rounded-2xl p-8 border border-[#F0E4D8] hover:shadow-md hover:-translate-y-1 transition-all animate-fade-in-up" style={{ animationDelay: `${(i + 1) * 0.1}s` }}>
                <div className="text-yellow-500 text-sm mb-4">{t.stars}</div>
                <p className="text-sm italic text-[#2C3E50] mb-5 leading-relaxed">&ldquo;{t.text}&rdquo;</p>
                <div className="flex items-center gap-3">
                  <div className="w-11 h-11 rounded-full bg-[#FFF0E0] flex items-center justify-center text-lg">{t.avatar}</div>
                  <div>
                    <div className="text-sm font-semibold text-[#2C3E50]">{t.name}</div>
                    <div className="text-xs text-gray-400">{t.role}</div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="py-20 bg-gradient-to-br from-[#2C3E50] to-[#1A1A2E] text-center relative overflow-hidden">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_20%_50%,rgba(232,106,51,0.12)_0%,transparent_50%),radial-gradient(circle_at_80%_50%,rgba(58,183,149,0.08)_0%,transparent_50%)] pointer-events-none" />
        <div className="max-w-[1200px] mx-auto px-6 relative z-10">
          <h2 className="text-3xl sm:text-4xl lg:text-5xl font-heading text-white mb-4 animate-fade-in-up">Ready to Get Started?</h2>
          <p className="text-white/70 text-lg mb-8 max-w-[500px] mx-auto animate-fade-in-up" style={{ animationDelay: '0.1s' }}>Join the fastest-growing pet care community. Whether you&apos;re a pet owner or a service provider, there&apos;s a place for you here.</p>
          <div className="flex gap-4 justify-center flex-wrap">
            <Link href="/register" className="bg-[#E86A33] hover:bg-[#D4552A] text-white font-semibold px-8 py-4 rounded-full text-base transition-all hover:shadow-lg">
              Join as Pet Owner
            </Link>
            <Link href="/register?provider=true" className="bg-[#3AB795] hover:bg-[#2E9A7A] text-white font-semibold px-8 py-4 rounded-full text-base transition-all hover:shadow-lg">
              List Your Service
            </Link>
          </div>
        </div>
      </section>
    </>
  );
}
