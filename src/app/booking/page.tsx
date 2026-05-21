'use client';

import React, { useState, useEffect, Suspense, useMemo, useCallback } from 'react';
import { useAuth } from '@/context/AuthContext';
import { useToast } from '@/components/Toast';
import { useSearchParams, useRouter } from 'next/navigation';
import { serviceTypes } from '@/lib/providers';
import { getAllProvidersRest, getProviderByIdRest, getUserPetsRest, addBookingRest, addPaymentRest, getBookingsForProviderDateRest } from '@/lib/firestore-rest';
import { ServiceProvider, ServiceItem } from '@/lib/types';
import Link from 'next/link';

function BookingForm() {
  const { user, firebaseUser, loading: authLoading } = useAuth();
  const { showToast } = useToast();
  const router = useRouter();
  const searchParams = useSearchParams();

  // Strip currency symbols ($, €, etc.) and non-numeric chars from price strings
  const parseCleanPrice = (priceValue: any): number => {
    if (!priceValue) return 0;
    if (typeof priceValue === 'number') return priceValue;
    const scrubbed = String(priceValue).replace(/[^0-9.]/g, '');
    return parseFloat(scrubbed) || 0;
  };

  const [serviceType, setServiceType] = useState('');
  const [provider, setProvider] = useState('');
  const [providersList, setProvidersList] = useState<ServiceProvider[]>([]);
  // Custom services from the preselected provider's document
  const [providerServices, setProviderServices] = useState<ServiceItem[] | null>(null);
  // Store the full fetched provider object for service cross-referencing
  const [providerData, setProviderData] = useState<ServiceProvider | null>(null);
  // Explicit pricing states updated on every service selection
  const [serviceFee, setServiceFee] = useState(0);
  const [platformFee, setPlatformFee] = useState(0);
  const [selectedPet, setSelectedPet] = useState('');
  const [pets, setPets] = useState<{ id: string; name: string; type: string }[]>([]);
  const [petsLoading, setPetsLoading] = useState(true);
  const [date, setDate] = useState('');
  const [time, setTime] = useState('');
  const [bookedSlots, setBookedSlots] = useState<string[]>([]);
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

  // Read providerId from URL, pre-fill provider, fetch their custom services, and seed pricing
  useEffect(() => {
    if (!authLoading && !user) router.push('/login');
    const providerIdParam = searchParams.get('providerId');
    if (providerIdParam) {
      setProvider(providerIdParam);
      // Fetch the full provider document to get their custom services array
      getProviderByIdRest(providerIdParam).then(found => {
        if (found) {
          setProviderData(found);
          if (found.services && found.services.length > 0) {
            setProviderServices(found.services);
            // Auto-select if only one service
            if (found.services.length === 1) {
              const svc = found.services[0];
              setServiceType(svc.name);
              const price = parseCleanPrice(svc.price);
              setServiceFee(price);
              setPlatformFee(price * 0.1);
            }
          }
        }
      }).catch(console.error);
    }
  }, [user, authLoading, router, searchParams]);

  const isProviderLocked = !!searchParams.get('providerId');

  // Build the service type options from the provider's custom services if available,
  // otherwise fall back to the global serviceTypes list.
  const availableServiceTypes = providerServices
    ? providerServices.map(s => ({
        value: s.name,
        label: `🐾 ${s.name}`,
        price: parseCleanPrice(s.price),
      }))
    : serviceTypes;

  // Sync pricing as soon as providerData + selectedService both resolve
  // (handles the multi-service case where no auto-select fires on mount)
  useEffect(() => {
    if (providerData?.services && serviceType) {
      const matchingService = providerData.services.find(
        s => s.name.toLowerCase() === serviceType.toLowerCase(),
      );
      if (matchingService) {
        const cleanFee = parseCleanPrice(matchingService.price);
        setServiceFee(cleanFee);
        setPlatformFee(cleanFee * 0.1);
      }
    }
  }, [providerData, serviceType]);

  // ── Fetch already-booked time slots for double-booking prevention ──
  useEffect(() => {
    if (!provider || !date) return;
    setBookedSlots([]); // reset while fetching
    getBookingsForProviderDateRest(provider, date)
      .then((existing) => {
        const booked = existing
          .filter((b) => b.status !== 'cancelled' && b.status !== 'declined')
          .map((b) => b.timeSlot || b.time)
          .filter(Boolean);
        setBookedSlots(booked);
      })
      .catch((err) => console.error('Failed to fetch booked slots:', err));
  }, [provider, date]);

  // Handler: when the user picks a service, update the service type and pricing states
  const handleServiceChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const serviceName = e.target.value;
    setServiceType(serviceName);

    // Cross-reference against the provider's custom services (if available)
    const matchingService = providerData?.services?.find(s => s.name.toLowerCase() === serviceName.toLowerCase());
    if (matchingService) {
      const dynamicPrice = parseCleanPrice(matchingService.price);
      setServiceFee(dynamicPrice);
      setPlatformFee(dynamicPrice * 0.1);
    } else {
      // Fall back to the global serviceTypes price
      const globalMatch = serviceTypes.find(s => s.value === serviceName);
      const fallbackPrice = globalMatch?.price || 0;
      setServiceFee(fallbackPrice);
      setPlatformFee(fallbackPrice * 0.1);
    }
  };

  // ── Generate dynamic time slots ───────────────────────────────────
  // NOTE: must be declared before any early return to keep hook count stable.
  const timeSlots = useMemo(() => {
    if (!providerData || !date || !serviceType) return [];

    // Parse date string locally to avoid UTC timezone shift
    const getLocalWeekday = (dateString: string): string => {
      const [year, month, day] = dateString.split('-').map(Number);
      const localDate = new Date(year, month - 1, day);
      const weekdays = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
      return weekdays[localDate.getDay()];
    };

    const targetDay = getLocalWeekday(date);
    const daySettings = (providerData as any).availability?.[targetDay];

    // Graceful fallback: default to open 09:00–18:00 if availability is unset
    const isOpen = daySettings ? daySettings.isOpen : true;
    const start = daySettings?.start || '09:00';
    const end = daySettings?.end || '18:00';

    if (!isOpen) return []; // explicitly marked closed

    // Look up this service's duration
    const svc = providerData.services?.find(
      s => s.name.toLowerCase() === serviceType.toLowerCase(),
    );
    const increment = svc?.duration ?? 60; // default 1 hour

    // Parse start/end times into minutes from midnight
    const [sh, sm] = start.split(':').map(Number);
    const [eh, em] = end.split(':').map(Number);
    const startMin = sh * 60 + sm;
    const endMin = eh * 60 + em;

    // Generate slots stepping by `increment` minutes
    const slots: { label: string; value: string }[] = [];
    for (let m = startMin; m + increment <= endMin; m += increment) {
      const h = Math.floor(m / 60);
      const min = m % 60;
      const value = `${String(h).padStart(2, '0')}:${String(min).padStart(2, '0')}`;
      const labelH = h % 12 || 12;
      const ampm = h < 12 ? 'AM' : 'PM';
      const label = `${labelH}:${String(min).padStart(2, '0')} ${ampm}`;
      slots.push({ label, value });
    }
    return slots;
  }, [providerData, date, serviceType]);

  // ── Early return: auth guard (must be below all hooks) ──────────
  if (authLoading || !user) {
    return <div className="pt-[120px] min-h-screen flex items-center justify-center"><div className="w-10 h-10 border-3 border-[#F0E4D8] border-t-[#E86A33] rounded-full animate-spin" /></div>;
  }

  const finalTotal = serviceFee + platformFee;
  const selectedService = availableServiceTypes.find(s => s.value === serviceType);
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
      // ── Race-condition guard: double-check slot is still free ──
      const existing = await getBookingsForProviderDateRest(provider, date);
      const slot = time || '';
      const conflict = existing.find(
        (b) =>
          (b.timeSlot || b.time) === slot &&
          b.status !== 'cancelled' &&
          b.status !== 'declined',
      );
      if (conflict) {
        showToast(
          'Sorry, this exact slot was just booked! Please select another time.',
          'error',
        );
        setSaving(false);
        return;
      }

      // 1. Create the booking document with timeSlot
      const bookingId = await addBookingRest({
        userId: uid,
        serviceType,
        providerId: provider,
        providerName: selectedProvider?.name || 'Unknown Provider',
        providerBusinessName: selectedProvider?.businessName || selectedProvider?.name || '',
        customerName: user?.name || user?.email || 'Unknown Customer',
        date,
        time: time || '',
        timeSlot: slot,
        instructions,
        petId: selectedPet || '',
        petName: pets.find(p => p.id === selectedPet)?.name || '',
        price: serviceFee,
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
        amount: finalTotal,
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
                <select value={serviceType} onChange={handleServiceChange} className="w-full px-4 py-3.5 border-2 border-[#F0E4D8] rounded-xl bg-[#FFF8F0] focus:border-[#E86A33] focus:bg-white focus:outline-none focus:ring-4 focus:ring-orange-500/10 transition-all text-sm">
                  <option value="">Select a service...</option>
                  {availableServiceTypes.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
                </select>
              </div>
              <div className="mb-5">
                <label className="block text-sm font-semibold text-[#2C3E50] mb-2">Provider</label>
                {isProviderLocked && selectedProvider ? (
                  <div className="w-full px-4 py-3.5 border-2 border-[#E8DDD0] rounded-xl bg-[#F5F0EB] flex items-center gap-3">
                    <span className="text-lg">{selectedProvider.emoji || '🏪'}</span>
                    <div className="flex-1">
                      <p className="text-sm font-semibold text-[#2C3E50]">{selectedProvider.businessName || selectedProvider.name}</p>
                      <p className="text-xs text-gray-400">{selectedProvider.category} · ⭐ {selectedProvider.rating} ({selectedProvider.reviews} reviews)</p>
                    </div>
                    <span className="text-[10px] text-gray-400 bg-white px-2 py-1 rounded-full">🔒 Locked</span>
                  </div>
                ) : (
                  <select value={provider} onChange={(e) => setProvider(e.target.value)} className="w-full px-4 py-3.5 border-2 border-[#F0E4D8] rounded-xl bg-[#FFF8F0] focus:border-[#E86A33] focus:bg-white focus:outline-none focus:ring-4 focus:ring-orange-500/10 transition-all text-sm">
                    <option value="">Select a provider...</option>
                    {providersList.map(p => (
                      <option key={p.id} value={p.id}>{p.name} — {p.category} ⭐{p.rating}</option>
                    ))}
                  </select>
                )}
              </div>
              <div className="grid grid-cols-2 gap-4 mb-5">
                <div>
                  <label className="block text-sm font-semibold text-[#2C3E50] mb-2">Date</label>
                  <input type="date" value={date} onChange={(e) => setDate(e.target.value)} min={new Date().toISOString().split('T')[0]}
                    className="w-full px-4 py-3.5 border-2 border-[#F0E4D8] rounded-xl bg-[#FFF8F0] focus:border-[#E86A33] focus:bg-white focus:outline-none focus:ring-4 focus:ring-orange-500/10 transition-all text-sm" />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-[#2C3E50] mb-2">Time</label>
                  {!provider || !date || !serviceType ? (
                    <div className="w-full px-4 py-3.5 border-2 border-[#F0E4D8] rounded-xl bg-gray-50 text-sm text-gray-400">
                      Select a date and service first.
                    </div>
                  ) : timeSlots.length === 0 ? (
                    <div className="w-full px-4 py-3.5 border-2 border-[#F0E4D8] rounded-xl bg-amber-50 text-sm text-amber-700">
                      🕐 Provider is not operating on this day.
                    </div>
                  ) : (
                    <div className="grid grid-cols-2 gap-3 max-w-sm w-full">
                      {timeSlots.map((slot) => {
                        const isBooked = bookedSlots.includes(slot.value);
                        const isSelected = time === slot.value;
                        return (
                          <button
                            key={slot.value}
                            type="button"
                            disabled={isBooked}
                            onClick={() => setTime(isBooked ? time : slot.value)}
                            className={`w-full text-center py-2.5 px-4 rounded-xl text-sm font-semibold border-2 transition-all duration-200 ${
                              isBooked
                                ? 'bg-gray-100 text-gray-300 border-gray-100 cursor-not-allowed line-through'
                                : isSelected
                                  ? 'bg-[#E86A33] text-white border-[#E86A33] shadow-md'
                                  : 'bg-white text-[#2C3E50] border-[#F0E4D8] hover:border-[#E86A33] hover:bg-[#FFF8F0]'
                            }`}
                          >
                            {slot.label}
                          </button>
                        );
                      })}
                    </div>
                  )}
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
                  <div className="flex justify-between py-3 text-sm"><span>Service Fee</span><span>${serviceFee.toFixed(2)}</span></div>
                  <div className="flex justify-between py-3 text-sm"><span>Platform Fee</span><span>${platformFee.toFixed(2)}</span></div>
                  <div className="flex justify-between py-3 mt-3 pt-4 border-t-2 border-[#F0E4D8] font-semibold text-base"><span>Total</span><span className="text-[#E86A33]">${finalTotal.toFixed(2)}</span></div>
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
