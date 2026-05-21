'use client';

import React, { useState, useEffect, Suspense } from 'react';
import { useAuth } from '@/context/AuthContext';
import { useToast } from '@/components/Toast';
import { useSearchParams, useRouter } from 'next/navigation';
import { serviceTypes } from '@/lib/providers';
import { getAllProvidersRest, getUserPetsRest, addBookingRest, addPaymentRest } from '@/lib/firestore-rest';
import { ServiceProvider } from '@/lib/types';
import Link from 'next/link';

function BookingForm() {
  const { user, firebaseUser, loading: authLoading } = useAuth();
  const { showToast } = useToast();
  const router = useRouter();
  const searchParams = useSearchParams();

  const [serviceType, setServiceType] = useState('');
  const [provider, setProvider] = useState('');
  const [providersList, setProvidersList] = useState<ServiceProvider[]>([]);
  const [selectedPet, setSelectedPet] = useState('');
  const [pets, setPets] = useState<{ id: string; name: string; type: string }[]>([]);
  const [petsLoading, setPetsLoading] = useState(true);
  const [date, setDate] = useState('');
  const [time, setTime] = useState('');
  const [instructions, setInstructions] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    getAllProvidersRest().then(setProvidersList).catch(console.error);
  }, []);

  useEffect(() => {
    if (!firebaseUser && !user) return;
    const uid = firebaseUser?.uid || user?.id;
    if (!uid) return;
    setPetsLoading(true);
    getUserPetsRest(uid)
      .then(list => {
        setPets(list.map(p => ({ id: p.id, name: p.name, type: p.type })));
      })
      .catch(err => console.error('Failed to fetch pets:', err))
      .finally(() => setPetsLoading(false));
  }, [user, firebaseUser]);

  useEffect(() => {
    if (!authLoading && !user) router.push('/login');
    const providerParam = searchParams.get('provider');
    if (providerParam) setProvider(providerParam);
  }, [user, authLoading, router, searchParams]);

  if (authLoading || !user) {
    return <div className="pt-[120px] min-h-screen flex items-center justify-center"><div className="w-10 h-10 border-3 border-[#F0E4D8] border-t-[#E86A33] rounded-full animate-spin" /></div>;
  }

  const selectedService = serviceTypes.find(s => s.value === serviceType);
  const servicePrice = selectedService?.price || 0;
  const total = servicePrice * 1.1;
  const selectedProvider = providersList.find(p => String(p.id) === provider);

  const handleBooking = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!serviceType || !provider || !date) {
      showToast('Please fill in all required fields.', 'error');
      return;
    }

    const uid = firebaseUser?.uid || user.id;

    setSaving(true);
    try {
      // 1. Create the booking document
      const bookingId = await addBookingRest({
        userId: uid,
        serviceType,
        providerId: provider,
        providerName: selectedProvider?.name || 'Unknown Provider',
        date,
        time: time || '',
        instructions,
        petId: selectedPet || '',
        petName: pets.find(p => p.id === selectedPet)?.name || '',
        price: servicePrice,
        status: 'pending',
      });

      // 2. Simultaneously create a payment ledger entry
      await addPaymentRest({
        bookingId,
        customerId: uid,
        customerName: user?.name || 'Unknown Customer',
        providerId: provider,
        providerName: selectedProvider?.name || 'Unknown Provider',
        category: selectedService?.label || serviceType,
        amount: total,
        status: 'paid',
      });

      showToast('🎉 Booking confirmed! Check your dashboard for details.', 'success');
      setTimeout(() => router.push('/dashboard'), 1500);
    } catch (err) {
      console.error('Failed to save booking:', err);
      showToast('❌ Failed to save booking. Please try again.', 'error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="pt-[120px] pb-20 min-h-screen">
      <div className="max-w-[1200px] mx-auto px-6">
        <Link href="/services" className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-[#E86A33] mb-6">← Back</Link>

        <div className="mb-10">
          <span className="inline-block px-3.5 py-1 bg-orange-500/10 rounded-full text-xs font-semibold text-[#E86A33] uppercase tracking-wider mb-4">Book a Service</span>
          <h2 className="text-3xl font-heading text-[#2C3E50]">Schedule Your Appointment</h2>
        </div>

        <div className="grid lg:grid-cols-2 gap-10 items-start">
          {/* Form */}
          <div className="bg-white border border-[#F0E4D8] rounded-2xl p-8 sm:p-10">
            <form onSubmit={handleBooking}>
              <div className="mb-5">
                <label className="block text-sm font-semibold text-[#2C3E50] mb-2">Service Type</label>
                <select value={serviceType} onChange={(e) => setServiceType(e.target.value)} className="w-full px-4 py-3.5 border-2 border-[#F0E4D8] rounded-xl bg-[#FFF8F0] focus:border-[#E86A33] focus:bg-white focus:outline-none focus:ring-4 focus:ring-orange-500/10 transition-all text-sm">
                  <option value="">Select a service...</option>
                  {serviceTypes.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
                </select>
              </div>
              <div className="mb-5">
                <label className="block text-sm font-semibold text-[#2C3E50] mb-2">Provider</label>
                <select value={provider} onChange={(e) => setProvider(e.target.value)} className="w-full px-4 py-3.5 border-2 border-[#F0E4D8] rounded-xl bg-[#FFF8F0] focus:border-[#E86A33] focus:bg-white focus:outline-none focus:ring-4 focus:ring-orange-500/10 transition-all text-sm">
                  <option value="">Select a provider...</option>
                  {providersList.map(p => (
                    <option key={p.id} value={p.id}>{p.name} — {p.category} ⭐{p.rating}</option>
                  ))}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-4 mb-5">
                <div>
                  <label className="block text-sm font-semibold text-[#2C3E50] mb-2">Date</label>
                  <input type="date" value={date} onChange={(e) => setDate(e.target.value)} min={new Date().toISOString().split('T')[0]}
                    className="w-full px-4 py-3.5 border-2 border-[#F0E4D8] rounded-xl bg-[#FFF8F0] focus:border-[#E86A33] focus:bg-white focus:outline-none focus:ring-4 focus:ring-orange-500/10 transition-all text-sm" />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-[#2C3E50] mb-2">Time</label>
                  <select value={time} onChange={(e) => setTime(e.target.value)} className="w-full px-4 py-3.5 border-2 border-[#F0E4D8] rounded-xl bg-[#FFF8F0] focus:border-[#E86A33] focus:bg-white focus:outline-none focus:ring-4 focus:ring-orange-500/10 transition-all text-sm">
                    <option value="">Select time...</option>
                    <option value="09:00">9:00 AM</option>
                    <option value="10:00">10:00 AM</option>
                    <option value="11:00">11:00 AM</option>
                    <option value="13:00">1:00 PM</option>
                    <option value="14:00">2:00 PM</option>
                    <option value="15:00">3:00 PM</option>
                    <option value="16:00">4:00 PM</option>
                  </select>
                </div>
              </div>
              <div className="mb-5">
                <label className="block text-sm font-semibold text-[#2C3E50] mb-2">Your Pet</label>
                {petsLoading ? (
                  <div className="w-full px-4 py-3.5 border-2 border-[#F0E4D8] rounded-xl bg-gray-50 flex items-center gap-2 text-sm text-gray-400">
                    <div className="w-4 h-4 border-2 border-[#F0E4D8] border-t-[#E86A33] rounded-full animate-spin" />
                    Loading your pets...
                  </div>
                ) : pets.length === 0 ? (
                  <div className="w-full px-4 py-3.5 border-2 border-red-200 rounded-xl bg-red-50 text-sm">
                    <span className="text-red-500 font-semibold">⚠️ Please <Link href="/dashboard" className="underline font-bold">add a pet to your profile first</Link> before booking.</span>
                  </div>
                ) : (
                  <select value={selectedPet} onChange={e => setSelectedPet(e.target.value)} className="w-full px-4 py-3.5 border-2 border-[#F0E4D8] rounded-xl bg-[#FFF8F0] focus:border-[#E86A33] focus:bg-white focus:outline-none focus:ring-4 focus:ring-orange-500/10 transition-all text-sm">
                    <option value="">Select your pet...</option>
                    {pets.map(p => (
                      <option key={p.id} value={p.id}>{p.type === 'Dog' ? '🐕' : p.type === 'Cat' ? '🐈' : p.type === 'Bird' ? '🐦' : p.type === 'Rabbit' ? '🐇' : p.type === 'Fish' ? '🐟' : '🐾'} {p.name}</option>
                    ))}
                  </select>
                )}
              </div>
              <div className="mb-6">
                <label className="block text-sm font-semibold text-[#2C3E50] mb-2">Special Instructions</label>
                <textarea value={instructions} onChange={(e) => setInstructions(e.target.value)} rows={4} placeholder="Any special needs or instructions for the provider..." className="w-full px-4 py-3.5 border-2 border-[#F0E4D8] rounded-xl bg-[#FFF8F0] focus:border-[#E86A33] focus:bg-white focus:outline-none focus:ring-4 focus:ring-orange-500/10 transition-all text-sm resize-vertical" />
              </div>
              <button type="submit" disabled={saving} className="w-full bg-[#E86A33] hover:bg-[#D4552A] text-white font-semibold py-3.5 px-6 rounded-full text-base transition-all hover:shadow-lg disabled:opacity-50 disabled:cursor-not-allowed">{saving ? 'Saving...' : 'Confirm Booking'}</button>
            </form>
          </div>

          {/* Summary */}
          <div>
            <div className="bg-white border border-[#F0E4D8] rounded-2xl p-8 sticky top-[100px]">
              <h3 className="text-sm font-heading text-[#2C3E50] mb-5 pb-4 border-b border-[#F0E4D8]">📋 Booking Summary</h3>
              {!serviceType ? (
                <div className="text-center py-6 text-gray-400 text-sm"><p>Select a service to see the summary.</p></div>
              ) : (
                <>
                  <div className="flex justify-between py-3 text-sm"><span>Service</span><span className="font-semibold text-[#2C3E50]">{selectedService?.label}</span></div>
                  <div className="flex justify-between py-3 text-sm"><span>Date</span><span className="text-gray-500">{date ? new Date(date).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' }) : 'Not selected'}</span></div>
                  <div className="flex justify-between py-3 text-sm"><span>Time</span><span className="text-gray-500">{time ? time : 'Not selected'}</span></div>
                  <div className="flex justify-between py-3 text-sm"><span>Service Fee</span><span>${servicePrice.toFixed(2)}</span></div>
                  <div className="flex justify-between py-3 text-sm"><span>Platform Fee</span><span>${(servicePrice * 0.1).toFixed(2)}</span></div>
                  <div className="flex justify-between py-3 mt-3 pt-4 border-t-2 border-[#F0E4D8] font-semibold text-base"><span>Total</span><span className="text-[#E86A33]">${total.toFixed(2)}</span></div>
                </>
              )}
            </div>

            <div className="bg-white border border-[#F0E4D8] rounded-2xl p-8 mt-6">
              <h4 className="text-sm font-heading text-[#2C3E50] mb-4">💡 Why Book with Paws & Co.?</h4>
              <div className="flex flex-col gap-3 text-sm text-gray-500">
                <p>✅ Trusted & verified providers</p>
                <p>✅ Secure payments & booking</p>
                <p>✅ 24/7 customer support</p>
                <p>✅ Free cancellation up to 24h before</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function BookingPage() {
  return (
    <Suspense fallback={<div className="pt-[120px] min-h-screen flex items-center justify-center"><div className="w-10 h-10 border-3 border-[#F0E4D8] border-t-[#E86A33] rounded-full animate-spin" /></div>}>
      <BookingForm />
    </Suspense>
  );
}
