'use client';

import React, { useEffect, useState, useCallback } from 'react';
import { useToast } from '@/components/Toast';
import {
  getProviderByEmailRest,
  updateProviderDocRest,
  getBookingsByProviderRest,
  getUserPaymentsRest,
  getReviewsByProviderRest,
  updateBookingRest,
} from '@/lib/firestore-rest';
import type { BookingDoc, PaymentDoc, ReviewDoc } from '@/lib/firestore-rest';
import type { ServiceProvider, ServiceItem, ProductItem } from '@/lib/types';

type ProviderTab =
  | 'overview'
  | 'services'
  | 'products'
  | 'bookings'
  | 'reviews'
  | 'profile';

const statusColors: Record<string, string> = {
  pending: 'bg-yellow-500/10 text-yellow-600',
  confirmed: 'bg-blue-500/10 text-blue-500',
  completed: 'bg-emerald-500/10 text-emerald-600',
  cancelled: 'bg-red-500/10 text-red-500',
};

const tabConfig: { key: ProviderTab; icon: string; label: string }[] = [
  { key: 'overview', icon: '📊', label: 'Overview' },
  { key: 'services', icon: '🔧', label: 'Services' },
  { key: 'products', icon: '📦', label: 'Products' },
  { key: 'bookings', icon: '📅', label: 'Bookings' },
  { key: 'reviews', icon: '⭐', label: 'Reviews' },
  { key: 'profile', icon: '👤', label: 'Business Profile' },
];

function StarRating({ rating }: { rating: number }) {
  return (
    <span className="text-yellow-500 text-sm">
      {Array.from({ length: 5 }, (_, i) => (i < Math.round(rating) ? '★' : '☆')).join('')}
    </span>
  );
}

interface Props {
  userEmail: string;
  userId: string;
}

export default function ProviderDashboard({ userEmail, userId }: Props) {
  const { showToast } = useToast();
  const [activeTab, setActiveTab] = useState<ProviderTab>('overview');

  // ── Provider data ──────────────────────────────────────────────
  const [provider, setProvider] = useState<ServiceProvider | null>(null);
  const [providerLoading, setProviderLoading] = useState(true);

  // ── Bookings ───────────────────────────────────────────────────
  const [bookings, setBookings] = useState<BookingDoc[]>([]);
  const [bookingsLoading, setBookingsLoading] = useState(true);

  // ── Payments ───────────────────────────────────────────────────
  const [payments, setPayments] = useState<PaymentDoc[]>([]);
  const [paymentsLoading, setPaymentsLoading] = useState(true);

  // ── Reviews ────────────────────────────────────────────────────
  const [reviews, setReviews] = useState<ReviewDoc[]>([]);
  const [reviewsLoading, setReviewsLoading] = useState(true);

  // ── Service form state ─────────────────────────────────────────
  const [showServiceForm, setShowServiceForm] = useState(false);
  const [svcName, setSvcName] = useState('');
  const [svcCategory, setSvcCategory] = useState('');
  const [svcDesc, setSvcDesc] = useState('');
  const [svcPrice, setSvcPrice] = useState('');
  const [editingSvcIdx, setEditingSvcIdx] = useState<number | null>(null);

  // ── Product form state ─────────────────────────────────────────
  const [showProductForm, setShowProductForm] = useState(false);
  const [prodName, setProdName] = useState('');
  const [prodPrice, setProdPrice] = useState('');
  const [prodDesc, setProdDesc] = useState('');
  const [prodInStock, setProdInStock] = useState(true);
  const [editingProdIdx, setEditingProdIdx] = useState<number | null>(null);

  // ── Business profile form state ────────────────────────────────
  const [bizName, setBizName] = useState('');
  const [bizEmail, setBizEmail] = useState('');
  const [bizPhone, setBizPhone] = useState('');
  const [bizLocation, setBizLocation] = useState('');
  const [bizInsta, setBizInsta] = useState('');
  const [bizFacebook, setBizFacebook] = useState('');
  const [bizWebsite, setBizWebsite] = useState('');

  // ── Fetch provider ─────────────────────────────────────────────
  const fetchProvider = useCallback(async () => {
    setProviderLoading(true);
    try {
      const p = await getProviderByEmailRest(userEmail);
      setProvider(p);
      if (p) {
        setBizName(p.businessName ?? p.name ?? '');
        setBizEmail(p.contactEmail ?? p.email ?? '');
        setBizPhone(p.contactPhone ?? p.phone ?? '');
        setBizLocation(p.location ?? '');
        setBizInsta(p.socialMedia?.instagram ?? '');
        setBizFacebook(p.socialMedia?.facebook ?? '');
        setBizWebsite(p.socialMedia?.website ?? '');
      }
    } catch (err) {
      console.error('Failed to fetch provider:', err);
    } finally {
      setProviderLoading(false);
    }
  }, [userEmail]);

  // ── Fetch bookings ─────────────────────────────────────────────
  const fetchBookings = useCallback(async () => {
    setBookingsLoading(true);
    try {
      const list = await getBookingsByProviderRest(userId);
      setBookings(list);
    } catch (err) {
      console.error('Failed to fetch bookings:', err);
    } finally {
      setBookingsLoading(false);
    }
  }, [userId]);

  // ── Fetch payments ─────────────────────────────────────────────
  const fetchPayments = useCallback(async () => {
    setPaymentsLoading(true);
    try {
      const list = await getUserPaymentsRest(userId, 'provider');
      setPayments(list);
    } catch (err) {
      console.error('Failed to fetch payments:', err);
    } finally {
      setPaymentsLoading(false);
    }
  }, [userId]);

  // ── Fetch reviews ──────────────────────────────────────────────
  const fetchReviews = useCallback(async () => {
    setReviewsLoading(true);
    try {
      const list = await getReviewsByProviderRest(provider?.id ?? 0);
      setReviews(list);
    } catch (err) {
      console.error('Failed to fetch reviews:', err);
    } finally {
      setReviewsLoading(false);
    }
  }, [provider?.id]);

  // ── Initial data load ──────────────────────────────────────────
  useEffect(() => {
    fetchProvider();
    fetchBookings();
    fetchPayments();
  }, [fetchProvider, fetchBookings, fetchPayments]);

  useEffect(() => {
    if (provider) fetchReviews();
  }, [provider, fetchReviews]);

  // ── Derived stats ──────────────────────────────────────────────
  const totalEarnings = payments
    .filter((p) => p.status === 'paid')
    .reduce((sum, p) => sum + (p.amount ?? 0), 0);
  const activeBookings = bookings.filter(
    (b) => b.status === 'pending' || b.status === 'confirmed',
  );
  const activeListings =
    (provider?.services?.length ?? 0) + (provider?.products?.length ?? 0);
  const avgRating =
    reviews.length > 0
      ? reviews.reduce((sum, r) => sum + (r.rating ?? 0), 0) / reviews.length
      : 0;

  // ── Booking status transition ──────────────────────────────────
  const handleBookingStatus = async (bookingId: string, status: string) => {
    try {
      await updateBookingRest(bookingId, { status } as Partial<BookingDoc>);
      setBookings((prev) =>
        prev.map((b) => (b.id === bookingId ? { ...b, status } : b)),
      );
      showToast(`✅ Booking ${status}!`, 'success');
    } catch {
      showToast('❌ Failed to update booking.', 'error');
    }
  };

  // ── Service CRUD ───────────────────────────────────────────────
  const saveService = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!svcName.trim() || !svcPrice.trim()) {
      showToast('⚠️ Name and price are required.', 'error');
      return;
    }
    if (!provider) return;
    const current = provider.services ?? [];
    const service: ServiceItem = {
      name: svcName.trim(),
      price: svcPrice.trim(),
    };
    let updated: ServiceItem[];
    if (editingSvcIdx !== null) {
      updated = current.map((s, i) => (i === editingSvcIdx ? service : s));
    } else {
      updated = [...current, service];
    }
    try {
      await updateProviderDocRest(provider.id, { services: updated });
      setProvider({ ...provider, services: updated });
      showToast(
        editingSvcIdx !== null
          ? '✅ Service updated!'
          : '✅ Service added!',
        'success',
      );
      resetServiceForm();
    } catch {
      showToast('❌ Failed to save service.', 'error');
    }
  };

  const editService = (idx: number) => {
    const s = provider?.services?.[idx];
    if (!s) return;
    setSvcName(s.name);
    setSvcCategory('');
    setSvcDesc('');
    setSvcPrice(s.price);
    setEditingSvcIdx(idx);
    setShowServiceForm(true);
  };

  const deleteService = async (idx: number) => {
    if (!provider?.services) return;
    const updated = provider.services.filter((_, i) => i !== idx);
    try {
      await updateProviderDocRest(provider.id, { services: updated });
      setProvider({ ...provider, services: updated });
      showToast('🗑️ Service removed.', 'success');
    } catch {
      showToast('❌ Failed to remove service.', 'error');
    }
  };

  const resetServiceForm = () => {
    setSvcName('');
    setSvcCategory('');
    setSvcDesc('');
    setSvcPrice('');
    setEditingSvcIdx(null);
    setShowServiceForm(false);
  };

  // ── Product CRUD ───────────────────────────────────────────────
  const saveProduct = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!prodName.trim() || !prodPrice) {
      showToast('⚠️ Name and price are required.', 'error');
      return;
    }
    if (!provider) return;
    const current = provider.products ?? [];
    const product: ProductItem = {
      id: editingProdIdx !== null ? (current[editingProdIdx]?.id ?? String(Date.now())) : String(Date.now()),
      name: prodName.trim(),
      price: Number(prodPrice),
      description: prodDesc.trim() || undefined,
      inStock: prodInStock,
    };
    let updated: ProductItem[];
    if (editingProdIdx !== null) {
      updated = current.map((p, i) => (i === editingProdIdx ? product : p));
    } else {
      updated = [...current, product];
    }
    try {
      await updateProviderDocRest(provider.id, { products: updated });
      setProvider({ ...provider, products: updated });
      showToast(
        editingProdIdx !== null ? '✅ Product updated!' : '✅ Product added!',
        'success',
      );
      resetProductForm();
    } catch {
      showToast('❌ Failed to save product.', 'error');
    }
  };

  const editProduct = (idx: number) => {
    const p = provider?.products?.[idx];
    if (!p) return;
    setProdName(p.name);
    setProdPrice(String(p.price));
    setProdDesc(p.description ?? '');
    setProdInStock(p.inStock);
    setEditingProdIdx(idx);
    setShowProductForm(true);
  };

  const deleteProduct = async (idx: number) => {
    if (!provider?.products) return;
    const updated = provider.products.filter((_, i) => i !== idx);
    try {
      await updateProviderDocRest(provider.id, { products: updated });
      setProvider({ ...provider, products: updated });
      showToast('🗑️ Product removed.', 'success');
    } catch {
      showToast('❌ Failed to remove product.', 'error');
    }
  };

  const resetProductForm = () => {
    setProdName('');
    setProdPrice('');
    setProdDesc('');
    setProdInStock(true);
    setEditingProdIdx(null);
    setShowProductForm(false);
  };

  // ── Save business profile ──────────────────────────────────────
  const saveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!provider) return;
    try {
      await updateProviderDocRest(provider.id, {
        businessName: bizName.trim(),
        contactEmail: bizEmail.trim(),
        contactPhone: bizPhone.trim(),
        location: bizLocation.trim(),
        socialMedia: {
          instagram: bizInsta.trim(),
          facebook: bizFacebook.trim(),
          website: bizWebsite.trim(),
        },
      });
      setProvider({
        ...provider,
        businessName: bizName.trim(),
        contactEmail: bizEmail.trim(),
        contactPhone: bizPhone.trim(),
        location: bizLocation.trim(),
        socialMedia: {
          instagram: bizInsta.trim(),
          facebook: bizFacebook.trim(),
          website: bizWebsite.trim(),
        },
      });
      showToast('✅ Business profile updated!', 'success');
    } catch {
      showToast('❌ Failed to save profile.', 'error');
    }
  };

  // ── Render helpers ─────────────────────────────────────────────
  const skeleton = (count = 3) => (
    <div className="flex flex-col gap-4">
      {Array.from({ length: count }, (_, i) => (
        <div key={i} className="bg-white border border-[#F0E4D8] rounded-2xl p-6 animate-pulse">
          <div className="h-4 w-32 bg-gray-200 rounded-lg mb-3" />
          <div className="h-3 w-full bg-gray-100 rounded-lg mb-1" />
          <div className="h-3 w-2/3 bg-gray-100 rounded-lg" />
        </div>
      ))}
    </div>
  );

  const modalOverlay = (
    onClick: () => void,
    children: React.ReactNode,
  ) => (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClick();
      }}
    >
      <div className="bg-white rounded-2xl p-8 w-full max-w-lg max-h-[90vh] overflow-y-auto shadow-2xl">
        {children}
      </div>
    </div>
  );

  // ── Loading state ──────────────────────────────────────────────
  if (providerLoading) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="w-10 h-10 border-3 border-[#F0E4D8] border-t-[#E86A33] rounded-full animate-spin" />
      </div>
    );
  }

  if (!provider) {
    return (
      <div className="bg-white border border-[#F0E4D8] rounded-2xl p-10 text-center">
        <div className="text-5xl mb-4 opacity-50">🏪</div>
        <h3 className="text-xl font-heading text-[#2C3E50] mb-2">
          Provider Profile Not Found
        </h3>
        <p className="text-sm text-gray-400 mb-5">
          We couldn&apos;t find a provider profile linked to your account.
          Contact support to set one up.
        </p>
      </div>
    );
  }

  // ══════════════════════════════════════════════════════════════
  // RENDER
  // ══════════════════════════════════════════════════════════════
  return (
    <>
      {/* Header */}
      <div className="mb-8">
        <div className="flex items-center gap-3">
          <span className="text-3xl">{provider.emoji || '🏪'}</span>
          <div>
            <h1 className="text-2xl font-heading text-[#2C3E50]">
              {provider.businessName || provider.name}
            </h1>
            <p className="text-sm text-gray-400">
              {provider.category} &middot; {provider.type}
            </p>
          </div>
        </div>
      </div>

      {/* Tab bar */}
      <div className="flex gap-1 mb-8 overflow-x-auto pb-2">
        {tabConfig.map((t) => (
          <button
            key={t.key}
            onClick={() => setActiveTab(t.key)}
            className={`flex items-center gap-1.5 px-4 py-2 rounded-full text-sm font-medium whitespace-nowrap transition-all ${
              activeTab === t.key
                ? 'bg-[#E86A33] text-white'
                : 'bg-white text-gray-500 hover:bg-[#FFF0E0] hover:text-[#E86A33] border border-[#F0E4D8]'
            }`}
          >
            <span>{t.icon}</span>
            {t.label}
          </button>
        ))}
      </div>

      {/* ──────────────── A. OVERVIEW ──────────────── */}
      {activeTab === 'overview' && (
        <div>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
            <div className="bg-white rounded-2xl p-6 border border-[#F0E4D8]">
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1">
                Total Earnings
              </p>
              <p className="text-2xl font-heading text-emerald-600">
                ${totalEarnings.toFixed(2)}
              </p>
            </div>
            <div className="bg-white rounded-2xl p-6 border border-[#F0E4D8]">
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1">
                Active Bookings
              </p>
              <p className="text-2xl font-heading text-[#E86A33]">
                {activeBookings.length}
              </p>
            </div>
            <div className="bg-white rounded-2xl p-6 border border-[#F0E4D8]">
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1">
                Active Listings
              </p>
              <p className="text-2xl font-heading text-blue-500">
                {activeListings}
              </p>
            </div>
            <div className="bg-white rounded-2xl p-6 border border-[#F0E4D8]">
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1">
                Avg. Rating
              </p>
              <p className="text-2xl font-heading text-yellow-500">
                {avgRating > 0 ? avgRating.toFixed(1) : '—'}
              </p>
            </div>
          </div>

          <div className="grid lg:grid-cols-2 gap-6">
            {/* Recent bookings */}
            <div className="bg-white rounded-2xl p-6 border border-[#F0E4D8]">
              <h3 className="text-lg font-heading text-[#2C3E50] mb-4">
                Recent Bookings
              </h3>
              {bookingsLoading ? (
                skeleton(3)
              ) : bookings.length === 0 ? (
                <p className="text-sm text-gray-400">No bookings yet.</p>
              ) : (
                <div className="space-y-3">
                  {bookings.slice(0, 5).map((b) => (
                    <div
                      key={b.id}
                      className="flex items-center justify-between py-2 border-b border-[#F0E4D8] last:border-0"
                    >
                      <div>
                        <p className="text-sm font-medium text-[#2C3E50]">
                          {b.serviceType}
                        </p>
                        <p className="text-xs text-gray-400">
                          {b.date} &middot; {b.time}
                        </p>
                      </div>
                      <span
                        className={`text-[10px] px-2 py-0.5 rounded-full font-semibold ${
                          statusColors[b.status] || ''
                        }`}
                      >
                        {b.status}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Recent reviews */}
            <div className="bg-white rounded-2xl p-6 border border-[#F0E4D8]">
              <h3 className="text-lg font-heading text-[#2C3E50] mb-4">
                Recent Reviews
              </h3>
              {reviewsLoading ? (
                skeleton(3)
              ) : reviews.length === 0 ? (
                <p className="text-sm text-gray-400">No reviews yet.</p>
              ) : (
                <div className="space-y-3">
                  {reviews.slice(0, 5).map((r) => (
                    <div
                      key={r.id}
                      className="py-2 border-b border-[#F0E4D8] last:border-0"
                    >
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-sm font-medium text-[#2C3E50]">
                          {r.userName}
                        </span>
                        <StarRating rating={r.rating} />
                      </div>
                      <p className="text-xs text-gray-500 line-clamp-2">
                        {r.comment}
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ──────────────── B. SERVICES ──────────────── */}
      {activeTab === 'services' && (
        <div>
          <div className="flex justify-between items-center mb-6">
            <h2 className="text-xl font-heading text-[#2C3E50]">
              🔧 Service &amp; Pricing
            </h2>
            <button
              onClick={() => {
                resetServiceForm();
                setShowServiceForm(true);
              }}
              className="bg-[#E86A33] hover:bg-[#D4552A] text-white text-sm font-semibold px-5 py-2.5 rounded-full transition-all"
            >
              + Add Service
            </button>
          </div>

          {!provider.services || provider.services.length === 0 ? (
            <div className="bg-white border border-[#F0E4D8] rounded-2xl p-10 text-center">
              <div className="text-4xl mb-4 opacity-50">🔧</div>
              <h3 className="text-lg font-heading text-[#2C3E50] mb-2">
                No services yet
              </h3>
              <p className="text-sm text-gray-400">
                Add your first service to start receiving bookings.
              </p>
            </div>
          ) : (
            <div className="grid gap-4">
              {provider.services.map((s, idx) => (
                <div
                  key={idx}
                  className="bg-white border border-[#F0E4D8] rounded-2xl p-5 flex items-center justify-between"
                >
                  <div>
                    <h4 className="font-semibold text-[#2C3E50]">{s.name}</h4>
                    <p className="text-sm font-medium text-emerald-600">
                      {s.price}
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={() => editService(idx)}
                      className="text-sm text-gray-400 hover:text-[#E86A33] px-3 py-1.5 rounded-lg hover:bg-[#FFF0E0] transition-all"
                    >
                      Edit
                    </button>
                    <button
                      onClick={() => deleteService(idx)}
                      className="text-sm text-gray-400 hover:text-red-500 px-3 py-1.5 rounded-lg hover:bg-red-500/10 transition-all"
                    >
                      Delete
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Service form modal */}
          {showServiceForm &&
            modalOverlay(resetServiceForm, (
              <>
                <h3 className="text-xl font-heading text-[#2C3E50] mb-6">
                  {editingSvcIdx !== null ? 'Edit Service' : 'Add New Service'}
                </h3>
                <form onSubmit={saveService} className="space-y-4">
                  <div>
                    <label className="block text-sm font-semibold text-[#2C3E50] mb-1.5">
                      Service Name *
                    </label>
                    <input
                      type="text"
                      value={svcName}
                      onChange={(e) => setSvcName(e.target.value)}
                      placeholder="e.g. Dog Walking"
                      required
                      className="w-full px-4 py-3 border-2 border-[#F0E4D8] rounded-xl bg-[#FFF8F0] focus:border-[#E86A33] focus:outline-none focus:ring-4 focus:ring-orange-500/10 transition-all text-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-semibold text-[#2C3E50] mb-1.5">
                      Price *
                    </label>
                    <input
                      type="text"
                      value={svcPrice}
                      onChange={(e) => setSvcPrice(e.target.value)}
                      placeholder="e.g. $25/hr"
                      required
                      className="w-full px-4 py-3 border-2 border-[#F0E4D8] rounded-xl bg-[#FFF8F0] focus:border-[#E86A33] focus:outline-none focus:ring-4 focus:ring-orange-500/10 transition-all text-sm"
                    />
                  </div>
                  <div className="flex gap-3 pt-2">
                    <button
                      type="submit"
                      className="flex-1 bg-[#E86A33] hover:bg-[#D4552A] text-white font-semibold py-3 rounded-full text-sm transition-all"
                    >
                      {editingSvcIdx !== null ? 'Update' : 'Add Service'}
                    </button>
                    <button
                      type="button"
                      onClick={resetServiceForm}
                      className="px-6 py-3 border-2 border-[#F0E4D8] rounded-full text-sm font-medium text-gray-500 hover:bg-gray-50 transition-all"
                    >
                      Cancel
                    </button>
                  </div>
                </form>
              </>
            ))}
        </div>
      )}

      {/* ──────────────── C. PRODUCTS ──────────────── */}
      {activeTab === 'products' && (
        <div>
          <div className="flex justify-between items-center mb-6">
            <h2 className="text-xl font-heading text-[#2C3E50]">
              📦 Product Catalog
            </h2>
            <button
              onClick={() => {
                resetProductForm();
                setShowProductForm(true);
              }}
              className="bg-[#E86A33] hover:bg-[#D4552A] text-white text-sm font-semibold px-5 py-2.5 rounded-full transition-all"
            >
              + Add Product
            </button>
          </div>

          {!provider.products || provider.products.length === 0 ? (
            <div className="bg-white border border-[#F0E4D8] rounded-2xl p-10 text-center">
              <div className="text-4xl mb-4 opacity-50">📦</div>
              <h3 className="text-lg font-heading text-[#2C3E50] mb-2">
                No products yet
              </h3>
              <p className="text-sm text-gray-400">
                List retail items for your customers to browse.
              </p>
            </div>
          ) : (
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {provider.products.map((p, idx) => (
                <div
                  key={p.id}
                  className="bg-white border border-[#F0E4D8] rounded-2xl p-5"
                >
                  <div className="flex items-start justify-between mb-3">
                    <h4 className="font-semibold text-[#2C3E50]">{p.name}</h4>
                    <span
                      className={`text-[10px] px-2 py-0.5 rounded-full font-semibold ${
                        p.inStock
                          ? 'bg-emerald-500/10 text-emerald-600'
                          : 'bg-red-500/10 text-red-500'
                      }`}
                    >
                      {p.inStock ? 'In Stock' : 'Out of Stock'}
                    </span>
                  </div>
                  <p className="text-lg font-heading text-emerald-600 mb-1">
                    ${p.price.toFixed(2)}
                  </p>
                  {p.description && (
                    <p className="text-xs text-gray-500 mb-3">{p.description}</p>
                  )}
                  <div className="flex gap-2 pt-2 border-t border-[#F0E4D8]">
                    <button
                      onClick={() => editProduct(idx)}
                      className="text-xs text-gray-400 hover:text-[#E86A33] transition-all"
                    >
                      Edit
                    </button>
                    <button
                      onClick={() => deleteProduct(idx)}
                      className="text-xs text-gray-400 hover:text-red-500 transition-all"
                    >
                      Delete
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Product form modal */}
          {showProductForm &&
            modalOverlay(resetProductForm, (
              <>
                <h3 className="text-xl font-heading text-[#2C3E50] mb-6">
                  {editingProdIdx !== null ? 'Edit Product' : 'Add New Product'}
                </h3>
                <form onSubmit={saveProduct} className="space-y-4">
                  <div>
                    <label className="block text-sm font-semibold text-[#2C3E50] mb-1.5">
                      Product Name *
                    </label>
                    <input
                      type="text"
                      value={prodName}
                      onChange={(e) => setProdName(e.target.value)}
                      placeholder="e.g. Premium Dog Food"
                      required
                      className="w-full px-4 py-3 border-2 border-[#F0E4D8] rounded-xl bg-[#FFF8F0] focus:border-[#E86A33] focus:outline-none focus:ring-4 focus:ring-orange-500/10 transition-all text-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-semibold text-[#2C3E50] mb-1.5">
                      Price *
                    </label>
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      value={prodPrice}
                      onChange={(e) => setProdPrice(e.target.value)}
                      placeholder="0.00"
                      required
                      className="w-full px-4 py-3 border-2 border-[#F0E4D8] rounded-xl bg-[#FFF8F0] focus:border-[#E86A33] focus:outline-none focus:ring-4 focus:ring-orange-500/10 transition-all text-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-semibold text-[#2C3E50] mb-1.5">
                      Description
                    </label>
                    <textarea
                      value={prodDesc}
                      onChange={(e) => setProdDesc(e.target.value)}
                      placeholder="Short description..."
                      rows={2}
                      className="w-full px-4 py-3 border-2 border-[#F0E4D8] rounded-xl bg-[#FFF8F0] focus:border-[#E86A33] focus:outline-none focus:ring-4 focus:ring-orange-500/10 transition-all text-sm resize-none"
                    />
                  </div>
                  <label className="flex items-center gap-3 cursor-pointer">
                    <button
                      type="button"
                      onClick={() => setProdInStock(!prodInStock)}
                      className={`relative w-11 h-6 rounded-full transition-all ${
                        prodInStock ? 'bg-emerald-500' : 'bg-gray-300'
                      }`}
                    >
                      <span
                        className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-all ${
                          prodInStock ? 'translate-x-5' : ''
                        }`}
                      />
                    </button>
                    <span className="text-sm font-medium text-[#2C3E50]">
                      In Stock
                    </span>
                  </label>
                  <div className="flex gap-3 pt-2">
                    <button
                      type="submit"
                      className="flex-1 bg-[#E86A33] hover:bg-[#D4552A] text-white font-semibold py-3 rounded-full text-sm transition-all"
                    >
                      {editingProdIdx !== null ? 'Update' : 'Add Product'}
                    </button>
                    <button
                      type="button"
                      onClick={resetProductForm}
                      className="px-6 py-3 border-2 border-[#F0E4D8] rounded-full text-sm font-medium text-gray-500 hover:bg-gray-50 transition-all"
                    >
                      Cancel
                    </button>
                  </div>
                </form>
              </>
            ))}
        </div>
      )}

      {/* ──────────────── D. BOOKINGS ──────────────── */}
      {activeTab === 'bookings' && (
        <div>
          <div className="flex justify-between items-center mb-6">
            <h2 className="text-xl font-heading text-[#2C3E50]">
              📅 Booking Pipeline
            </h2>
            <span className="text-sm text-gray-400">
              {bookings.length} booking{bookings.length !== 1 ? 's' : ''}
            </span>
          </div>

          {bookingsLoading ? (
            skeleton(4)
          ) : bookings.length === 0 ? (
            <div className="bg-white border border-[#F0E4D8] rounded-2xl p-10 text-center">
              <div className="text-4xl mb-4 opacity-50">📅</div>
              <h3 className="text-lg font-heading text-[#2C3E50] mb-2">
                No bookings yet
              </h3>
              <p className="text-sm text-gray-400">
                Bookings from clients will appear here.
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              {bookings.map((b) => (
                <div
                  key={b.id}
                  className="bg-white border border-[#F0E4D8] rounded-2xl p-6"
                >
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <h4 className="font-semibold text-[#2C3E50]">
                          {b.serviceType}
                        </h4>
                        <span
                          className={`text-[10px] px-2 py-0.5 rounded-full font-semibold ${
                            statusColors[b.status] || ''
                          }`}
                        >
                          {b.status.charAt(0).toUpperCase() + b.status.slice(1)}
                        </span>
                      </div>
                      <p className="text-sm text-gray-500">
                        {b.date} &middot; {b.time}
                        {b.price ? ` · $${b.price.toFixed(2)}` : ''}
                      </p>
                      <p className="text-xs text-gray-400">
                        Booking #{b.id.slice(0, 8)}
                      </p>
                    </div>

                    {/* Status transition buttons */}
                    <div className="flex gap-2 flex-wrap">
                      {b.status === 'pending' && (
                        <div className="flex gap-2">
                          <button
                            onClick={() => handleBookingStatus(b.id, 'confirmed')}
                            className="bg-emerald-500 hover:bg-emerald-600 text-white text-xs font-semibold px-4 py-2 rounded-full transition-all"
                          >
                            Confirm
                          </button>
                          <button
                            onClick={() => handleBookingStatus(b.id, 'cancelled')}
                            className="bg-red-500 hover:bg-red-600 text-white text-xs font-semibold px-4 py-2 rounded-full transition-all"
                          >
                            Decline
                          </button>
                        </div>
                      )}
                      {b.status === 'confirmed' && (
                        <button
                          onClick={() => handleBookingStatus(b.id, 'completed')}
                          className="bg-blue-500 hover:bg-blue-600 text-white text-xs font-semibold px-4 py-2 rounded-full transition-all"
                        >
                          Mark Completed
                        </button>
                      )}
                      {b.status === 'completed' && (
                        <span className="text-xs text-gray-400 italic">
                          Completed
                        </span>
                      )}
                      {b.status === 'cancelled' && (
                        <span className="text-xs text-red-400 italic">
                          Cancelled
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ──────────────── E. REVIEWS ──────────────── */}
      {activeTab === 'reviews' && (
        <div>
          <div className="flex justify-between items-center mb-6">
            <h2 className="text-xl font-heading text-[#2C3E50]">
              ⭐ Reviews &amp; Reputation
            </h2>
            {reviews.length > 0 && (
              <span className="text-sm text-gray-400">
                Avg: <strong className="text-yellow-500">{avgRating.toFixed(1)}</strong> / 5
                &middot; {reviews.length} review{reviews.length !== 1 ? 's' : ''}
              </span>
            )}
          </div>

          {reviewsLoading ? (
            skeleton(4)
          ) : reviews.length === 0 ? (
            <div className="bg-white border border-[#F0E4D8] rounded-2xl p-10 text-center">
              <div className="text-4xl mb-4 opacity-50">⭐</div>
              <h3 className="text-lg font-heading text-[#2C3E50] mb-2">
                No reviews yet
              </h3>
              <p className="text-sm text-gray-400">
                Reviews from customers will appear here once they leave feedback.
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              {reviews.map((r) => (
                <div
                  key={r.id}
                  className="bg-white border border-[#F0E4D8] rounded-2xl p-6"
                >
                  <div className="flex items-start justify-between mb-2">
                    <div>
                      <span className="font-semibold text-[#2C3E50] text-sm">
                        {r.userName}
                      </span>
                      <StarRating rating={r.rating} />
                    </div>
                    {r.createdAt && (
                      <span className="text-xs text-gray-400">
                        {new Date(r.createdAt).toLocaleDateString()}
                      </span>
                    )}
                  </div>
                  <p className="text-sm text-gray-600">{r.comment}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ──────────────── F. BUSINESS PROFILE ──────────────── */}
      {activeTab === 'profile' && (
        <div>
          <h2 className="text-xl font-heading text-[#2C3E50] mb-6">
            👤 Business Profile &amp; Contact Settings
          </h2>

          <form
            onSubmit={saveProfile}
            className="bg-white border border-[#F0E4D8] rounded-2xl p-8 max-w-2xl"
          >
            <div className="grid sm:grid-cols-2 gap-5 mb-5">
              <div>
                <label className="block text-sm font-semibold text-[#2C3E50] mb-1.5">
                  Business Name
                </label>
                <input
                  type="text"
                  value={bizName}
                  onChange={(e) => setBizName(e.target.value)}
                  placeholder="Your business name"
                  className="w-full px-4 py-3 border-2 border-[#F0E4D8] rounded-xl bg-[#FFF8F0] focus:border-[#E86A33] focus:outline-none focus:ring-4 focus:ring-orange-500/10 transition-all text-sm"
                />
              </div>
              <div>
                <label className="block text-sm font-semibold text-[#2C3E50] mb-1.5">
                  Contact Email
                </label>
                <input
                  type="email"
                  value={bizEmail}
                  onChange={(e) => setBizEmail(e.target.value)}
                  placeholder="public@email.com"
                  className="w-full px-4 py-3 border-2 border-[#F0E4D8] rounded-xl bg-[#FFF8F0] focus:border-[#E86A33] focus:outline-none focus:ring-4 focus:ring-orange-500/10 transition-all text-sm"
                />
              </div>
              <div>
                <label className="block text-sm font-semibold text-[#2C3E50] mb-1.5">
                  Contact Phone
                </label>
                <input
                  type="tel"
                  value={bizPhone}
                  onChange={(e) => setBizPhone(e.target.value)}
                  placeholder="+1 555-0123"
                  className="w-full px-4 py-3 border-2 border-[#F0E4D8] rounded-xl bg-[#FFF8F0] focus:border-[#E86A33] focus:outline-none focus:ring-4 focus:ring-orange-500/10 transition-all text-sm"
                />
              </div>
              <div>
                <label className="block text-sm font-semibold text-[#2C3E50] mb-1.5">
                  Location
                </label>
                <input
                  type="text"
                  value={bizLocation}
                  onChange={(e) => setBizLocation(e.target.value)}
                  placeholder="City, State"
                  className="w-full px-4 py-3 border-2 border-[#F0E4D8] rounded-xl bg-[#FFF8F0] focus:border-[#E86A33] focus:outline-none focus:ring-4 focus:ring-orange-500/10 transition-all text-sm"
                />
              </div>
            </div>

            <h4 className="font-semibold text-[#2C3E50] text-sm mb-3">
              Social Media Links
            </h4>
            <div className="grid sm:grid-cols-3 gap-4 mb-6">
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">
                  Instagram
                </label>
                <input
                  type="text"
                  value={bizInsta}
                  onChange={(e) => setBizInsta(e.target.value)}
                  placeholder="@handle"
                  className="w-full px-4 py-3 border-2 border-[#F0E4D8] rounded-xl bg-[#FFF8F0] focus:border-[#E86A33] focus:outline-none focus:ring-4 focus:ring-orange-500/10 transition-all text-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">
                  Facebook
                </label>
                <input
                  type="text"
                  value={bizFacebook}
                  onChange={(e) => setBizFacebook(e.target.value)}
                  placeholder="URL or handle"
                  className="w-full px-4 py-3 border-2 border-[#F0E4D8] rounded-xl bg-[#FFF8F0] focus:border-[#E86A33] focus:outline-none focus:ring-4 focus:ring-orange-500/10 transition-all text-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">
                  Website
                </label>
                <input
                  type="text"
                  value={bizWebsite}
                  onChange={(e) => setBizWebsite(e.target.value)}
                  placeholder="https://"
                  className="w-full px-4 py-3 border-2 border-[#F0E4D8] rounded-xl bg-[#FFF8F0] focus:border-[#E86A33] focus:outline-none focus:ring-4 focus:ring-orange-500/10 transition-all text-sm"
                />
              </div>
            </div>

            <button
              type="submit"
              className="bg-[#E86A33] hover:bg-[#D4552A] text-white font-semibold px-8 py-3 rounded-full text-sm transition-all"
            >
              Save Changes
            </button>
          </form>
        </div>
      )}

      {/* Mobile bottom nav */}
      <div className="md:hidden fixed bottom-0 left-0 right-0 bg-white border-t border-[#F0E4D8] flex justify-around py-2 px-2 z-50">
        {tabConfig.map((t) => (
          <button
            key={t.key}
            onClick={() => setActiveTab(t.key)}
            className={`flex flex-col items-center px-2 py-1.5 rounded-xl text-xs transition-all ${
              activeTab === t.key ? 'text-[#E86A33]' : 'text-gray-400'
            }`}
          >
            <span className="text-lg">{t.icon}</span>
            <span className="text-[10px]">{t.label}</span>
          </button>
        ))}
      </div>
    </>
  );
}
