import Link from 'next/link';

export default function AboutPage() {
  return (
    <div className="pt-[120px] pb-20 min-h-screen">
      <div className="max-w-[800px] mx-auto px-6">
        <div className="text-center mb-16 animate-fade-in-up">
          <span className="inline-block px-3.5 py-1 bg-orange-500/10 rounded-full text-xs font-semibold text-[#E86A33] uppercase tracking-wider mb-4">About Us</span>
          <h1 className="text-4xl sm:text-5xl font-heading text-[#2C3E50] mb-3">Our Story</h1>
          <p className="text-lg text-gray-500">How Paws & Co. became the most trusted pet care marketplace.</p>
        </div>

        <div className="animate-fade-in-up" style={{ animationDelay: '0.1s' }}>
          <div className="text-center mb-12">
            <div className="text-7xl mb-6">🐾</div>
            <h2 className="text-2xl font-heading text-[#2C3E50] mb-4">Connecting Pets with Love</h2>
            <p className="text-gray-600 mb-4 leading-relaxed">Paws & Co. was born from a simple idea: every pet deserves amazing care, and every pet parent deserves peace of mind. We built a platform where trust meets convenience, connecting pet owners with the best service providers in their community.</p>
            <p className="text-gray-600 leading-relaxed">Founded in 2024, we&apos;ve grown from a small local directory to a thriving marketplace serving thousands of happy pets and their families across the country.</p>
          </div>

          {/* Values */}
          <div className="grid sm:grid-cols-2 gap-6 my-12">
            {[
              { icon: '🤝', title: 'Trust First', desc: 'Every provider is verified with background checks and reviewed by real pet parents.' },
              { icon: '❤️', title: 'Pet-Centric', desc: 'Everything we do puts the well-being and happiness of pets at the center.' },
              { icon: '🌍', title: 'Community', desc: 'We\'re building a community of pet lovers who support each other and local businesses.' },
              { icon: '✨', title: 'Quality', desc: 'We never compromise on quality. Every service listed meets our high standards.' },
            ].map((v, i) => (
              <div key={i} className="bg-white border border-[#F0E4D8] rounded-2xl p-7 text-center hover:shadow-md transition-all">
                <div className="text-3xl mb-4">{v.icon}</div>
                <h4 className="text-sm font-heading text-[#2C3E50] mb-2">{v.title}</h4>
                <p className="text-sm text-gray-500">{v.desc}</p>
              </div>
            ))}
          </div>

          <h2 className="text-2xl font-heading text-[#2C3E50] mb-4 mt-12">Our Mission</h2>
          <p className="text-gray-600 mb-4 leading-relaxed">To make finding exceptional pet care effortless, so you can focus on what matters most — spending quality time with your furry family members. We believe that when pets are happy, the whole world feels brighter.</p>

          <h2 className="text-2xl font-heading text-[#2C3E50] mb-4 mt-12">Why Choose Paws & Co.?</h2>
          <p className="text-gray-600 mb-4 leading-relaxed">Unlike generic service marketplaces, we&apos;re pet specialists. Our platform is built specifically for the unique needs of pet owners and pet care providers. From our review system that highlights pet care specifics to our booking flow designed for pet schedules, every detail is crafted with pets in mind.</p>

          <div className="bg-[#FFF0E0] rounded-2xl p-10 text-center mt-12">
            <h3 className="text-xl font-heading text-[#2C3E50] mb-4">Ready to join our community?</h3>
            <p className="text-gray-500 mb-6">Whether you&apos;re a pet owner or a service provider, there&apos;s a place for you.</p>
            <Link href="/register" className="bg-[#E86A33] hover:bg-[#D4552A] text-white font-semibold px-8 py-3.5 rounded-full text-base transition-all hover:shadow-lg inline-block">
              Get Started Today
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
