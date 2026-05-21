'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '@/context/AuthContext';
import { useRouter } from 'next/navigation';
import { localAuth } from '@/lib/localAuth';
import { useToast } from '@/components/Toast';
import {
  getAllBookingsRest,
  getAllPaymentsRest,
  getAllProvidersRest,
  getAllReviewsRest,
  deleteBookingRest,
  deletePaymentRest,
  deleteProviderDocRest,
  deleteUserDocRest,
  deleteReviewRest,
  updateBookingRest,
  updatePaymentRest,
  updateReviewRest,
  updateProviderByIdRest,
  getReviewsByProviderRest,
} from '@/lib/firestore-rest';
import type { BookingDoc, PaymentDoc } from '@/lib/firestore-rest';
import type { ReviewDoc } from '@/lib/firestore-rest';
import { ServiceProvider } from '@/lib/types';

type AdminTab = 'users' | 'services' | 'bookings' | 'analytics' | 'payments' | 'reviews';

interface EditStatusState {
  id: string;
  value: string;
}

const ADMIN_EMAIL = 'rolandabj@gmail.com';

export default function AdminPage() {
  const { user, loading } = useAuth();
  const { showToast } = useToast();
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<AdminTab>('users');
  const [userSearch, setUserSearch] = useState('');

  // Live data states
  const [bookings, setBookings] = useState<BookingDoc[]>([]);
  const [providers, setProviders] = useState<ServiceProvider[]>([]);
  const [payments, setPayments] = useState<PaymentDoc[]>([]);
  const [allReviews, setAllReviews] = useState<ReviewDoc[]>([]);
  const [editStatus, setEditStatus] = useState<EditStatusState | null>(null);
  const [editReviewId, setEditReviewId] = useState<string | null>(null);
  const [editReviewComment, setEditReviewComment] = useState('');
  const [editReviewRating, setEditReviewRating] = useState(0);
  const [dataLoading, setDataLoading] = useState(true);

  const isAdmin = user?.email === ADMIN_EMAIL;

  // Exclusive admin gate — only rolandabj@gmail.com may access
  useEffect(() => {
    if (loading) return;
    if (!user || user.email !== ADMIN_EMAIL) {
      if (!user) {
        router.push('/login');
      } else {
        showToast('🔒 Access denied. Admin only.', 'error');
        router.push('/');
      }
    }
  }, [user, loading, router, showToast]);

  const fetchLiveData = useCallback(async () => {
    setDataLoading(true);
    try {
      const [bList, pList, paymentList, rList] = await Promise.all([
        getAllBookingsRest(),
        getAllProvidersRest(),
        getAllPaymentsRest(),
        getAllReviewsRest(),
      ]);
      setBookings(bList);
      setProviders(pList);
      setPayments(paymentList);
      setAllReviews(rList);
    } catch (err) {
      console.error('Failed to fetch admin data:', err);
    } finally {
      setDataLoading(false);
    }
  }, []);

  // Only fetch data for the admin user — no wasted API calls for others
  useEffect(() => {
    if (!loading && isAdmin) fetchLiveData();
  }, [loading, isAdmin, fetchLiveData]);

  // ── Derived analytics ──────────────────────────────────────────
  // All computed from live Firestore data — no hardcoded values.

  /** Revenue MTD — sum of all payments with status === 'paid'. */
  const revenueMtd = payments
    .filter((p) => p.status === 'paid')
    .reduce((sum, p) => sum + (p.amount ?? 0), 0);

  /** Monthly booking counts — index 0 = January. */
  const monthlyBookings = (() => {
    const counts = new Array(12).fill(0);
    for (const b of bookings) {
      // Try createdAt first, fall back to the date field
      const raw = b.createdAt || b.date;
      if (!raw) continue;
      const d = new Date(raw);
      if (!isNaN(d.getTime())) {
        counts[d.getMonth()] += 1; // getMonth() is 0-based
      }
    }
    return counts;
  })();

  /** Service distribution — tallied from booking serviceType. */
  const serviceDistribution = (() => {
    const displayMap: Record<string, { label: string; color: string }> = {
      walking: { label: 'Dog Walking', color: '#E86A33' },
      vet: { label: 'Vet Visits', color: '#2C3E50' },
      vets: { label: 'Vet Visits', color: '#2C3E50' },
      sitting: { label: 'Pet Sitting', color: '#3AB795' },
      sitters: { label: 'Pet Sitting', color: '#3AB795' },
      grooming: { label: 'Grooming', color: '#F39C12' },
      hotel: { label: 'Dog Hotels', color: '#9B59B6' },
      hotels: { label: 'Dog Hotels', color: '#9B59B6' },
      shops: { label: 'Pet Shops', color: '#E67E22' },
    };
    const tally: Record<string, number> = {};
    for (const b of bookings) {
      const key = b.serviceType;
      tally[key] = (tally[key] ?? 0) + 1;
    }
    const total = bookings.length || 1; // avoid division by zero
    const labels = Object.keys(tally);
    // Sort by count descending, take top 5
    const sorted = labels.sort((a, b) => (tally[b] ?? 0) - (tally[a] ?? 0)).slice(0, 5);
    // If nothing found, show all-zero entries for the main categories
    if (sorted.length === 0) {
      return [
        { label: 'Dog Walking', pct: 0, color: '#E86A33' },
        { label: 'Pet Sitting', pct: 0, color: '#3AB795' },
        { label: 'Vet Visits', pct: 0, color: '#2C3E50' },
        { label: 'Grooming', pct: 0, color: '#F39C12' },
        { label: 'Dog Hotels', pct: 0, color: '#9B59B6' },
      ];
    }
    return sorted.map((key) => ({
      label: displayMap[key]?.label ?? key,
      pct: Math.round(((tally[key] ?? 0) / total) * 100),
      color: displayMap[key]?.color ?? '#E86A33',
    }));
  })();

  // Early returns while auth resolves or during redirect
  if (loading || !user || !isAdmin) {
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
    { key: 'payments', icon: '💳', label: 'Payments' },
    { key: 'reviews', icon: '⭐', label: 'Reviews' },
    { key: 'analytics', icon: '📊', label: 'Analytics' },
  ];

  const statusColors: Record<string, string> = {
    pending: 'bg-amber-50 text-amber-700 border-amber-200',
    confirmed: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    completed: 'bg-emerald-500/10 text-emerald-600',
    cancelled: 'bg-rose-50 text-rose-700 border-rose-200',
    declined: 'bg-rose-50 text-rose-700 border-rose-200',
  };

  const serviceIcons: Record<string, string> = {
    walking: '🐕', vet: '🏥', hotel: '🏨', sitting: '🛋️', grooming: '✂️', shop: '🛍️',
  };

  const serviceLabels: Record<string, string> = {
    walking: 'Dog Walking', vet: 'Vet Visit', hotel: 'Dog Hotel', sitting: 'Pet Sitting', grooming: 'Grooming', shop: 'Pet Shop',
  };

  const handleDeleteUser = async (userId: string, userName: string) => {
    try {
      await deleteUserDocRest(userId);
      localAuth.deleteUser(userId);
      showToast(`✅ User "${userName}" successfully removed from database.`, 'success');
    } catch (err) {
      console.error('Failed to delete user:', err);
      showToast('❌ Failed to delete user.', 'error');
    }
  };

  const handleDeleteBooking = async (bookingId: string) => {
    try {
      await deleteBookingRest(bookingId);
      setBookings(prev => prev.filter(b => b.id !== bookingId));
      showToast('✅ Booking cancelled and removed.', 'success');
    } catch (err) {
      console.error('Failed to delete booking:', err);
      showToast('❌ Failed to cancel booking.', 'error');
    }
  };

  const handleCancelBooking = async (bookingId: string) => {
    try {
      await updateBookingRest(bookingId, { status: 'cancelled' });
      setBookings(prev => prev.map(b => b.id === bookingId ? { ...b, status: 'cancelled' } : b));
      showToast('✅ Booking status set to cancelled.', 'success');
    } catch (err) {
      console.error('Failed to cancel booking:', err);
      showToast('❌ Failed to update booking.', 'error');
    }
  };

  const handleDeleteProvider = async (provider: ServiceProvider) => {
    try {
      // Use the actual Firestore document name (string) for auto-created providers,
      // fall back to the numeric id for seeded providers whose doc names match.
      const docId = provider._firestoreId || String(provider.id);
      await deleteProviderDocRest(docId);
      setProviders(prev => prev.filter(p => p.id !== provider.id));
      showToast(`✅ Provider "${provider.name}" removed from database.`, 'success');
    } catch (err) {
      console.error('Failed to delete provider:', err);
      showToast('❌ Failed to delete provider.', 'error');
    }
  };

  const handlePaymentStatusEdit = async (paymentId: string, newStatus: string) => {
    try {
      await updatePaymentRest(paymentId, newStatus);
      setPayments(prev => prev.map(p => p.id === paymentId ? { ...p, status: newStatus } : p));
      setEditStatus(null);
      showToast(`✅ Payment status updated to "${newStatus}".`, 'success');
    } catch (err) {
      console.error('Failed to update payment:', err);
      showToast('❌ Failed to update payment status.', 'error');
    }
  };

  const handleDeletePayment = async (paymentId: string) => {
    try {
      await deletePaymentRest(paymentId);
      setPayments(prev => prev.filter(p => p.id !== paymentId));
      showToast('✅ Payment record deleted.', 'success');
    } catch (err) {
      console.error('Failed to delete payment:', err);
      showToast('❌ Failed to delete payment.', 'error');
    }
  };

  // ── Review CRUD ────────────────────────────────────────────────
  const handleStartEditReview = (r: ReviewDoc) => {
    setEditReviewId(r.id);
    setEditReviewComment(r.comment);
    setEditReviewRating(r.rating);
  };

  const handleCancelEditReview = () => {
    setEditReviewId(null);
    setEditReviewComment('');
    setEditReviewRating(0);
  };

  const handleSaveReview = async (reviewId: string) => {
    // Snapshot the old rating before updating state
    const oldReview = allReviews.find(r => r.id === reviewId);
    try {
      await updateReviewRest(reviewId, {
        comment: editReviewComment.trim(),
        rating: editReviewRating,
      });
      setAllReviews(prev =>
        prev.map(r =>
          r.id === reviewId
            ? { ...r, comment: editReviewComment.trim(), rating: editReviewRating }
            : r,
        ),
      );
      showToast('✅ Review updated.', 'success');
      handleCancelEditReview();

      // Recalculate provider aggregates if the rating changed
      if (oldReview && oldReview.providerId) {
        const remaining = await getReviewsByProviderRest(oldReview.providerId);
        const totalRemaining = remaining.length;
        let sumStars = 0;
        for (const r of remaining) sumStars += r.rating;
        const computedAvgRating = totalRemaining > 0 ? sumStars / totalRemaining : 0;

        await updateProviderByIdRest(oldReview.providerId, {
          reviews: totalRemaining,
          rating: parseFloat(computedAvgRating.toFixed(1)),
        });

        setProviders(prev =>
          prev.map(p =>
            p.id === oldReview.providerId
              ? { ...p, reviews: totalRemaining, rating: parseFloat(computedAvgRating.toFixed(1)) }
              : p,
          ),
        );
      }
    } catch (err) {
      console.error('Failed to update review:', err);
      showToast('❌ Failed to update review.', 'error');
    }
  };

  const handleDeleteReview = async (reviewId: string) => {
    try {
      // Extract the providerId from the review before deleting it
      const review = allReviews.find(r => r.id === reviewId);
      const targetProviderId = review?.providerId;

      await deleteReviewRest(reviewId);
      setAllReviews(prev => prev.filter(r => r.id !== reviewId));
      showToast('✅ Review deleted.', 'success');

      // Recalculate provider review aggregates so public cards update instantly
      if (targetProviderId) {
        const remaining = await getReviewsByProviderRest(targetProviderId);
        const totalRemaining = remaining.length;
        let sumStars = 0;
        for (const r of remaining) sumStars += r.rating;
        const computedAvgRating = totalRemaining > 0 ? sumStars / totalRemaining : 0;

        await updateProviderByIdRest(targetProviderId, {
          reviews: totalRemaining,
          rating: parseFloat(computedAvgRating.toFixed(1)),
        });

        // Keep local providers state in sync
        setProviders(prev =>
          prev.map(p =>
            p.id === targetProviderId
              ? { ...p, reviews: totalRemaining, rating: parseFloat(computedAvgRating.toFixed(1)) }
              : p,
          ),
        );

        console.log(
          `[Admin] Review sync complete for provider ${targetProviderId}. Remaining: ${totalRemaining}, Avg rating: ${computedAvgRating.toFixed(1)}`,
        );
      }
    } catch (err) {
      console.error('Failed to delete review:', err);
      showToast('❌ Failed to delete review.', 'error');
    }
  };

  return (
    <div className="pt-[100px] pb-20 min-h-screen">
      <div className="max-w-[1200px] mx-auto px-6">
        <div className="flex justify-between items-center mb-8">
          <div>
            <h2 className="text-3xl font-heading text-[#2C3E50]">⚙️ Admin Panel</h2>
            <p className="text-sm text-gray-500">Manage users, services, and platform activity.</p>
          </div>
          <button onClick={() => showToast('📥 Data exported!', 'success')} className="border-2 border-[#2C3E50] text-[#2C3E50] text-sm font-semibold px-5 py-2.5 rounded-full hover:bg-[#2C3E50] hover:text-white transition-all">📥 Export</button>
        </div>

        {/* Stats */}
        {dataLoading ? (
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-5 mb-8">
            {[1, 2, 3, 4].map(i => (
              <div key={i} className="bg-white border border-[#F0E4D8] rounded-2xl p-6 animate-pulse">
                <div className="w-12 h-12 bg-gray-200 rounded-xl mb-4" />
                <div className="h-8 w-16 bg-gray-200 rounded-lg mb-2" />
                <div className="h-4 w-28 bg-gray-100 rounded-lg" />
              </div>
            ))}
          </div>
        ) : (
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-5 mb-8">
            {[
              { icon: '👥', bg: 'bg-orange-500/12', value: String(allUsers.length), label: 'Total Users' },
              { icon: '🏪', bg: 'bg-emerald-500/12', value: String(providers.length), label: 'Active Providers' },
              { icon: '📅', bg: 'bg-yellow-500/12', value: String(bookings.length), label: 'Total Bookings' },
              { icon: '💰', bg: 'bg-blue-500/12', value: `$${revenueMtd.toFixed(2)}`, label: 'Revenue (MTD)' },
            ].map((s, i) => (
              <div key={i} className="bg-white border border-[#F0E4D8] rounded-2xl p-6 hover:shadow-md transition-all">
                <div className={`w-12 h-12 ${s.bg} rounded-xl flex items-center justify-center text-lg mb-4`}>{s.icon}</div>
                <h3 className="text-2xl font-heading text-[#2C3E50]">{s.value}</h3>
                <p className="text-sm text-gray-400">{s.label}</p>
              </div>
            ))}
          </div>
        )}

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
                      <button
                        onClick={() => handleDeleteUser(u.id, u.name || u.email)}
                        className="text-xs text-red-500 hover:text-red-700"
                      >
                        🗑️ Delete
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Services / Providers tab */}
        {activeTab === 'services' && (
          <div className="bg-white border border-[#F0E4D8] rounded-2xl overflow-hidden">
            <div className="p-5 border-b border-[#F0E4D8]">
              <h4 className="text-sm font-semibold text-[#2C3E50]">Providers ({providers.length})</h4>
            </div>
            {dataLoading ? (
              <div className="animate-pulse">
                <div className="flex gap-6 px-5 py-4 border-b border-[#F0E4D8]">
                  {[1, 2, 3, 4, 5].map(i => (
                    <div key={i} className="h-3 w-20 bg-gray-200 rounded-lg" />
                  ))}
                </div>
                {[1, 2, 3, 4].map(i => (
                  <div key={i} className="flex gap-6 px-5 py-4 border-b border-[#F0E4D8]">
                    <div className="h-4 w-40 bg-gray-200 rounded-lg" />
                    <div className="h-4 w-24 bg-gray-100 rounded-lg" />
                    <div className="h-4 w-16 bg-gray-100 rounded-lg" />
                    <div className="h-4 w-20 bg-gray-100 rounded-lg" />
                    <div className="h-6 w-16 bg-gray-200 rounded-full" />
                    <div className="h-4 w-12 bg-gray-100 rounded-lg" />
                  </div>
                ))}
              </div>
            ) : (
              <table className="w-full">
                <thead>
                  <tr className="border-b border-[#F0E4D8]">
                    {['Provider', 'Category', 'Rating', 'Price', 'Status', ''].map(h => (
                      <th key={h} className="text-left px-5 py-4 text-xs font-semibold text-gray-400 uppercase tracking-wider">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {providers.length === 0 ? (
                    <tr><td colSpan={6} className="text-center py-10 text-gray-400 text-sm">No providers found.</td></tr>
                  ) : providers.map(p => (
                    <tr key={p.id} className="border-b border-[#F0E4D8] hover:bg-[#FFF8F0]">
                      <td className="px-5 py-4 text-sm font-semibold text-[#2C3E50]">{p.emoji} {p.businessName || p.name}</td>
                      <td className="px-5 py-4 text-sm text-gray-500">{p.category}</td>
                      <td className="px-5 py-4 text-sm text-yellow-500">★ {p.rating}</td>
                      <td className="px-5 py-4 text-sm text-gray-500">{p.price}</td>
                      <td className="px-5 py-4"><span className="text-xs px-3 py-1.5 rounded-full bg-emerald-500/10 text-emerald-600 font-semibold">Active</span></td>
                      <td className="px-5 py-4">
                        <button
                          onClick={() => handleDeleteProvider(p)}
                          className="text-xs text-red-500 hover:text-red-700"
                        >
                          🗑️ Remove
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        )}

        {/* Bookings tab */}
        {activeTab === 'bookings' && (
          <div className="bg-white border border-[#F0E4D8] rounded-2xl overflow-hidden">
            <div className="p-5 border-b border-[#F0E4D8]">
              <h4 className="text-sm font-semibold text-[#2C3E50]">All Bookings ({bookings.length})</h4>
            </div>
            {dataLoading ? (
              <div className="animate-pulse">
                <div className="flex gap-6 px-5 py-4 border-b border-[#F0E4D8]">
                  {[1, 2, 3, 4, 5, 6].map(i => (
                    <div key={i} className="h-3 w-24 bg-gray-200 rounded-lg" />
                  ))}
                </div>
                {[1, 2, 3, 4].map(i => (
                  <div key={i} className="flex gap-6 px-5 py-4 border-b border-[#F0E4D8]">
                    <div className="h-4 w-20 bg-gray-200 rounded-lg" />
                    <div className="h-4 w-28 bg-gray-100 rounded-lg" />
                    <div className="h-4 w-24 bg-gray-100 rounded-lg" />
                    <div className="h-4 w-28 bg-gray-100 rounded-lg" />
                    <div className="h-4 w-16 bg-gray-100 rounded-lg" />
                    <div className="h-6 w-20 bg-gray-200 rounded-full" />
                    <div className="h-4 w-16 bg-gray-100 rounded-lg" />
                  </div>
                ))}
              </div>
            ) : bookings.length === 0 ? (
              <div className="text-center py-10 text-gray-400 text-sm">No bookings found.</div>
            ) : (
              <table className="w-full">
                <thead>
                  <tr className="border-b border-[#F0E4D8]">
                    {['Customer', 'Service', 'Provider', 'Date', 'Amount', 'Status', ''].map(h => (
                      <th key={h} className="text-left px-5 py-4 text-xs font-semibold text-gray-400 uppercase tracking-wider">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {bookings.map(b => {
                    const matchingUser = allUsers.find(u => u.id === b.userId || (u as any).uid === b.userId);
                    const displayCustomerName = matchingUser ? (matchingUser.name || matchingUser.email) : (b.customerName || b.userId);
                    const matchingProvider = providers.find(p => p.id === b.providerId);
                    const displayBusinessName = matchingProvider ? (matchingProvider.businessName || matchingProvider.name) : (b.providerBusinessName || b.providerName);
                    return (
                    <tr key={b.id} className="border-b border-[#F0E4D8] hover:bg-[#FFF8F0]">
                      <td className="px-5 py-4 text-sm text-gray-500">{displayCustomerName}</td>
                      <td className="px-5 py-4 text-sm font-semibold text-[#2C3E50]">
                        {serviceIcons[b.serviceType] || '🐾'} {serviceLabels[b.serviceType] || b.serviceType}
                      </td>
                      <td className="px-5 py-4 text-sm text-gray-500">{displayBusinessName}</td>
                      <td className="px-5 py-4 text-sm text-gray-500">{b.date}{b.time ? `, ${b.time}` : ''}</td>
                      <td className="px-5 py-4 text-sm text-gray-500">${b.price || 0}</td>
                      <td className="px-5 py-4">
                        <span className={`text-xs px-3 py-1.5 rounded-full font-semibold ${statusColors[b.status] || 'bg-gray-500/10 text-gray-500'}`}>
                          {b.status.charAt(0).toUpperCase() + b.status.slice(1)}
                        </span>
                      </td>
                      <td className="px-5 py-4">
                        <div className="flex gap-2">
                          {b.status !== 'cancelled' && b.status !== 'completed' && (
                            <button onClick={() => handleCancelBooking(b.id)} className="text-xs text-yellow-600 hover:text-yellow-800">⏸️ Cancel</button>
                          )}
                          <button onClick={() => handleDeleteBooking(b.id)} className="text-xs text-red-500 hover:text-red-700">🗑️ Delete</button>
                        </div>
                      </td>
                    </tr>
                  );})}
                </tbody>
              </table>
            )}
          </div>
        )}

        {/* Payments Ledger tab */}
          {activeTab === 'payments' && (
            <div className="bg-white border border-[#F0E4D8] rounded-2xl overflow-hidden">
              <div className="p-5 border-b border-[#F0E4D8]">
                <h4 className="text-sm font-semibold text-[#2C3E50]">Payments Ledger ({payments.length})</h4>
              </div>
              {dataLoading ? (
                <div className="animate-pulse">
                  <div className="flex gap-6 px-5 py-4 border-b border-[#F0E4D8]">
                    {[1, 2, 3, 4, 5, 6].map(i => (
                      <div key={i} className="h-3 w-24 bg-gray-200 rounded-lg" />
                    ))}
                  </div>
                  {[1, 2, 3, 4].map(i => (
                    <div key={i} className="flex gap-6 px-5 py-4 border-b border-[#F0E4D8]">
                      <div className="h-4 w-20 bg-gray-200 rounded-lg" />
                      <div className="h-4 w-24 bg-gray-100 rounded-lg" />
                      <div className="h-4 w-28 bg-gray-100 rounded-lg" />
                      <div className="h-4 w-24 bg-gray-100 rounded-lg" />
                      <div className="h-4 w-16 bg-gray-100 rounded-lg" />
                      <div className="h-6 w-20 bg-gray-200 rounded-full" />
                      <div className="h-4 w-16 bg-gray-100 rounded-lg" />
                    </div>
                  ))}
                </div>
              ) : payments.length === 0 ? (
                <div className="text-center py-10 text-gray-400 text-sm">No payment records found.</div>
              ) : (
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-[#F0E4D8]">
                      {['Booking', 'Customer', 'Provider', 'Category', 'Amount', 'Status', ''].map(h => (
                        <th key={h} className="text-left px-5 py-4 text-xs font-semibold text-gray-400 uppercase tracking-wider">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {payments.map(p => (
                      <tr key={p.id} className="border-b border-[#F0E4D8] hover:bg-[#FFF8F0]">
                        <td className="px-5 py-4 text-sm text-gray-500 font-mono">{p.bookingId.slice(0, 8)}...</td>
                        <td className="px-5 py-4 text-sm text-gray-500">{p.customerName}</td>
                        <td className="px-5 py-4 text-sm font-semibold text-[#2C3E50]">{(m => m ? (m.businessName || m.name) : p.providerName)(providers.find(pr => pr.id === p.providerId))}</td>
                        <td className="px-5 py-4 text-sm text-gray-500">{p.category}</td>
                        <td className="px-5 py-4 text-sm text-gray-500">${p.amount.toFixed(2)}</td>
                        <td className="px-5 py-4">
                          {editStatus?.id === p.id ? (
                            <div className="flex gap-1">
                              <select
                                value={editStatus.value}
                                onChange={e => setEditStatus({ id: p.id, value: e.target.value })}
                                className="text-xs px-2 py-1 border border-[#F0E4D8] rounded-lg bg-white"
                              >
                                {['paid', 'pending', 'refunded', 'cancelled'].map(s => (
                                  <option key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</option>
                                ))}
                              </select>
                              <button onClick={() => handlePaymentStatusEdit(p.id, editStatus.value)} className="text-xs text-emerald-600 hover:text-emerald-800">Save</button>
                              <button onClick={() => setEditStatus(null)} className="text-xs text-gray-400 hover:text-gray-600">✕</button>
                            </div>
                          ) : (
                            <span className={`text-xs px-3 py-1.5 rounded-full font-semibold ${p.status === 'paid' ? 'bg-emerald-500/10 text-emerald-600' : p.status === 'refunded' ? 'bg-red-500/10 text-red-500' : 'bg-gray-500/10 text-gray-500'}`}>
                              {p.status.charAt(0).toUpperCase() + p.status.slice(1)}
                            </span>
                          )}
                        </td>
                        <td className="px-5 py-4">
                          <div className="flex gap-2">
                            <button onClick={() => setEditStatus({ id: p.id, value: p.status })} className="text-xs text-blue-500 hover:text-blue-700">✏️ Edit</button>
                            <button onClick={() => handleDeletePayment(p.id)} className="text-xs text-red-500 hover:text-red-700">🗑️ Delete</button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          )}

          {/* Reviews management tab */}
          {activeTab === 'reviews' && (
            <div className="bg-white border border-[#F0E4D8] rounded-2xl overflow-hidden">
              <div className="p-5 border-b border-[#F0E4D8] flex items-center justify-between">
                <h4 className="text-sm font-semibold text-[#2C3E50]">⭐ Platform Reviews ({allReviews.length})</h4>
              </div>
              {dataLoading ? (
                <div className="animate-pulse p-6 space-y-4">
                  {[1, 2, 3].map(i => (
                    <div key={i} className="h-12 bg-gray-100 rounded-xl" />
                  ))}
                </div>
              ) : allReviews.length === 0 ? (
                <div className="text-center py-10 text-gray-400 text-sm">No reviews found.</div>
              ) : (
                <div className="divide-y divide-[#F0E4D8]">
                  {allReviews.map(r => (
                    <div key={r.id} className="px-5 py-4 hover:bg-[#FFF8F0]/50 transition-colors">
                      {editReviewId === r.id ? (
                        <div className="flex flex-col gap-3">
                          <div className="flex items-center gap-3">
                            <span className="text-xs font-semibold text-[#2C3E50] w-20">Rating:</span>
                            <div className="flex gap-1">
                              {[1, 2, 3, 4, 5].map(star => (
                                <button
                                  key={star}
                                  type="button"
                                  onClick={() => setEditReviewRating(star)}
                                  className={`text-lg ${star <= editReviewRating ? 'text-yellow-500' : 'text-gray-300'} transition-all`}
                                >
                                  ★
                                </button>
                              ))}
                            </div>
                          </div>
                          <div className="flex items-start gap-3">
                            <span className="text-xs font-semibold text-[#2C3E50] w-20 pt-2">Comment:</span>
                            <textarea
                              value={editReviewComment}
                              onChange={e => setEditReviewComment(e.target.value)}
                              rows={2}
                              className="flex-1 px-3 py-2 border-2 border-[#F0E4D8] rounded-xl bg-[#FFF8F0] focus:border-primary focus:outline-none text-sm resize-none"
                            />
                          </div>
                          <div className="flex gap-2 justify-end">
                            <button
                              onClick={() => handleSaveReview(r.id)}
                              className="text-xs bg-emerald-500 text-white px-4 py-1.5 rounded-full hover:bg-emerald-600 transition-all"
                            >
                              💾 Save
                            </button>
                            <button
                              onClick={handleCancelEditReview}
                              className="text-xs text-gray-400 px-4 py-1.5 hover:text-gray-600 transition-all"
                            >
                              Cancel
                            </button>
                          </div>
                        </div>
                      ) : (
                        <div className="flex items-start justify-between gap-4">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-1">
                              <span className="text-sm font-semibold text-[#2C3E50] truncate">{r.userName}</span>
                              <span className="text-xs text-gray-400">·</span>
                              <span className="text-yellow-500 text-sm">
                                {'★'.repeat(r.rating)}{'☆'.repeat(5 - r.rating)}
                              </span>
                              <span className="text-xs text-gray-400">·</span>
                              <span className="text-[10px] text-gray-400 font-mono">ID: {r.id.slice(0, 8)}…</span>
                            </div>
                            <p className="text-sm text-gray-600 line-clamp-2">{r.comment}</p>
                            <div className="flex items-center gap-2 mt-1.5">
                              <span className="text-[10px] text-gray-400">Provider:</span>
                              <span className="text-[10px] font-mono text-gray-500">{(m => m ? (m.businessName || m.name) : `${r.providerId.slice(0, 12)}...`)(providers.find(pr => pr.id === r.providerId))}</span>
                              <span className="text-[10px] text-gray-400">·</span>
                              <span className="text-[10px] text-gray-400">User:</span>
                              <span className="text-[10px] font-mono text-gray-500">{r.userId.slice(0, 12)}…</span>
                              {r.createdAt && (
                                <>
                                  <span className="text-[10px] text-gray-400">·</span>
                                  <span className="text-[10px] text-gray-400">
                                    {new Date(r.createdAt).toLocaleDateString()}
                                  </span>
                                </>
                              )}
                            </div>
                          </div>
                          <div className="flex gap-2 flex-shrink-0">
                            <button
                              onClick={() => handleStartEditReview(r)}
                              className="text-xs text-blue-500 hover:text-blue-700 transition-all"
                            >
                              ✏️ Edit
                            </button>
                            <button
                              onClick={() => handleDeleteReview(r.id)}
                              className="text-xs text-red-500 hover:text-red-700 transition-all"
                            >
                              🗑️ Delete
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Analytics tab — all values computed from live Firestore data */}
        {activeTab === 'analytics' && (
          <div className="grid lg:grid-cols-2 gap-6">
            <div className="bg-white border border-[#F0E4D8] rounded-2xl p-8">
              <h4 className="text-sm font-heading text-[#2C3E50] mb-5">📈 Monthly Bookings</h4>
              <div className="flex items-end gap-3 h-[160px] pt-5">
                {(() => {
                  const max = Math.max(...monthlyBookings, 1);
                  const months = ['J','F','M','A','M','J','J','A','S','O','N','D'];
                  return months.map((label, i) => {
                    const count = monthlyBookings[i];
                    const heightPx = Math.max((count / max) * 140, count > 0 ? 12 : 4);
                    return (
                      <div key={i} className="flex-1 flex flex-col items-center gap-1">
                        <div
                          className="w-full bg-[#E86A33] rounded-t-md transition-all"
                          style={{ height: `${heightPx}px`, opacity: count > 0 ? (0.4 + (i / 12) * 0.6) : 0.15 }}
                        />
                        <span className="text-[10px] text-gray-400">{label}</span>
                      </div>
                    );
                  });
                })()}
              </div>
            </div>
            <div className="bg-white border border-[#F0E4D8] rounded-2xl p-8">
              <h4 className="text-sm font-heading text-[#2C3E50] mb-5">🎯 Service Distribution</h4>
              <div className="flex flex-col gap-4">
                {serviceDistribution.map((s) => (
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
