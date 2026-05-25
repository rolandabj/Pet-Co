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
  getAllUsersRest,
  getBookingsPaginated,
  getPaymentsPaginated,
  getProvidersPaginated,
  getReviewsPaginated,
  getMonthlyAnalyticsDataRest,
  deleteBookingRest,
  deletePaymentRest,
  deleteProviderDocRest,
  deleteProviderAccountRest,
  deleteUserDocRest,
  deleteUserAccountRest,
  deleteReviewRest,
  updateBookingRest,
  updatePaymentRest,
  updateReviewRest,
  updateProviderByIdRest,
  updateUserDocRest,
  getReviewsByProviderRest,
  getUserByIdRest,
  setPaymentFeeCollectedRest,
  type PaginatedResult,
  type MonthlyAnalyticsData,
} from '@/lib/firestore-rest';
import type { BookingDoc, PaymentDoc } from '@/lib/firestore-rest';
import type { ReviewDoc } from '@/lib/firestore-rest';
import { ServiceProvider, AppUser } from '@/lib/types';
import { ref, deleteObject } from 'firebase/storage';
import { getFirebaseAuth, getStorageDb } from '@/lib/firebase';

type AdminTab = 'users' | 'services' | 'bookings' | 'analytics' | 'payments' | 'reviews';

interface EditStatusState {
  id: string;
  value: string;
}

/** Strict role-based admin check — relies on Firestore `role` field. */
function isAdminUser(user: { role?: string; email?: string } | null): boolean {
  return user?.role === 'admin';
}

export default function AdminPage() {
  const { user, loading } = useAuth();
  const { showToast } = useToast();
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<AdminTab>('users');
  const [userSearch, setUserSearch] = useState('');

  // Live data states (F5: cursor-based pagination per tab)
  const [bookings, setBookings] = useState<BookingDoc[]>([]);
  const [bookingsToken, setBookingsToken] = useState<string | null>(null);
  const [bookingsHistory, setBookingsHistory] = useState<string[]>([]);
  const [providers, setProviders] = useState<ServiceProvider[]>([]);
  const [providersToken, setProvidersToken] = useState<string | null>(null);
  const [providersHistory, setProvidersHistory] = useState<string[]>([]);
  const [payments, setPayments] = useState<PaymentDoc[]>([]);
  const [paymentsToken, setPaymentsToken] = useState<string | null>(null);
  const [paymentsHistory, setPaymentsHistory] = useState<string[]>([]);
  const [allReviews, setAllReviews] = useState<ReviewDoc[]>([]);
  const [reviewsToken, setReviewsToken] = useState<string | null>(null);
  const [reviewsHistory, setReviewsHistory] = useState<string[]>([]);
  const [editStatus, setEditStatus] = useState<EditStatusState | null>(null);
  const [editReviewId, setEditReviewId] = useState<string | null>(null);
  const [editReviewComment, setEditReviewComment] = useState('');
  const [editReviewRating, setEditReviewRating] = useState(0);
  const [dataLoading, setDataLoading] = useState(true);

  // ── Analytics data (fetched independently of paginated tables) ──
  const [analyticsData, setAnalyticsData] = useState<MonthlyAnalyticsData>({ bookings: [], payments: [] });
  const [fullAnalyticsBookings, setFullAnalyticsBookings] = useState<BookingDoc[]>([]);
  const [fullAnalyticsPayments, setFullAnalyticsPayments] = useState<PaymentDoc[]>([]);
  const [analyticsLoading, setAnalyticsLoading] = useState(true);
  // ── Merged user list (Firestore + local, deduplicated) ──────────
  const [allUsers, setAllUsers] = useState<AppUser[]>([]);
  const [selectedBooking, setSelectedBooking] = useState<BookingDoc | null>(null);
  const [selectedPayment, setSelectedPayment] = useState<PaymentDoc | null>(null);
  const [showPaymentModal, setShowPaymentModal] = useState(false);

  // ── Payments tab state ───────────────────────────────────────────
  const [paymentsProviderFilter, setPaymentsProviderFilter] = useState('');
  const [paymentsSortOrder, setPaymentsSortOrder] = useState<'newest' | 'oldest'>('newest');

  // ── Reviews tab state ────────────────────────────────────────────
  const [reviewsProviderFilter, setReviewsProviderFilter] = useState('');
  const [reviewsSortOrder, setReviewsSortOrder] = useState<'newest' | 'oldest'>('newest');
  const [selectedProvider, setSelectedProvider] = useState<ServiceProvider | null>(null);
  const [showProviderModal, setShowProviderModal] = useState(false);

  // ── User detail modal state ────────────────────────────────────
  const [selectedUser, setSelectedUser] = useState<AppUser | null>(null);
  const [showUserModal, setShowUserModal] = useState(false);
  const [userModalLoading, setUserModalLoading] = useState(false);
  const [userDetailData, setUserDetailData] = useState<{
    user: any;
    pets: any[];
    bookings: any[];
    payments: any[];
    reviews: any[];
  } | null>(null);

  const admin = isAdminUser(user);

  // Admin gate — dual-auth: role-based OR email-based
  useEffect(() => {
    if (loading) return;
    if (!user || !isAdminUser(user)) {
      if (!user) {
        router.push('/login');
      } else {
        showToast('🔒 Access denied. Admin only.', 'error');
        router.push('/');
      }
    }
  }, [user, loading, router, showToast]);

  /** Fetch first page of each collection on mount (F5). */
  const fetchLiveData = useCallback(async () => {
    setDataLoading(true);
    try {
      const PAGE_SIZE = 20;
      const [bPage, pPage, payPage, rPage] = await Promise.all([
        getBookingsPaginated(PAGE_SIZE),
        getProvidersPaginated(PAGE_SIZE),
        getPaymentsPaginated(PAGE_SIZE),
        getReviewsPaginated(PAGE_SIZE),
      ]);
      setBookings(bPage.data);
      setBookingsToken(bPage.nextPageToken);
      setBookingsHistory([]);
      setProviders(pPage.data);
      setProvidersToken(pPage.nextPageToken);
      setProvidersHistory([]);
      setPayments(payPage.data);
      setPaymentsToken(payPage.nextPageToken);
      setPaymentsHistory([]);
      setAllReviews(rPage.data);
      setReviewsToken(rPage.nextPageToken);
      setReviewsHistory([]);
    } catch (err) {
      console.error('Failed to fetch admin data:', err);
    } finally {
      setDataLoading(false);
    }
  }, []);

  /** Fetch all users (Firestore + local, deduplicated strictly by id). */
  const fetchAllUsers = useCallback(async () => {
    try {
      const [firestoreUsers] = await Promise.all([getAllUsersRest()]);
      const localUsers = localAuth.getAllUsers();

      const combined = [...firestoreUsers, ...localUsers];

      // Deduplicate strictly by user.id using a Map
      const uniqueUsersMap = new Map<string, AppUser>();
      for (const u of combined) {
        if (u.id) {
          uniqueUsersMap.set(u.id, {
            id: u.id,
            email: u.email || '',
            name: u.name || '',
            role: (u.role as AppUser['role']) || 'owner',
            photoURL: u.photoURL || null,
            phone: u.phone,
            createdAt: 'createdAt' in u ? (u as AppUser).createdAt : '',
            authMethod: 'authMethod' in u ? (u as AppUser).authMethod : 'email',
          });
        }
      }

      setAllUsers(Array.from(uniqueUsersMap.values()));
    } catch (err) {
      console.error('Failed to fetch users:', err);
    }
  }, []);

  // ── Pagination helpers (F5) ────────────────────────────────────
  const goNextPage = useCallback(async (
    collection: 'bookings' | 'providers' | 'payments' | 'reviews',
  ) => {
    let token: string | null = null;
    let setPage: (items: any[]) => void;
    let setToken: (t: string | null) => void;
    let setHistory: (h: string[] | ((prev: string[]) => string[])) => void;
    let history: string[];
    let fetchFn: (pageSize: number, pageToken?: string | null) => Promise<PaginatedResult<any>>;

    switch (collection) {
      case 'bookings':
        token = bookingsToken; setPage = setBookings; setToken = setBookingsToken;
        setHistory = setBookingsHistory; history = bookingsHistory;
        fetchFn = getBookingsPaginated; break;
      case 'providers':
        token = providersToken; setPage = setProviders; setToken = setProvidersToken;
        setHistory = setProvidersHistory; history = providersHistory;
        fetchFn = getProvidersPaginated; break;
      case 'payments':
        token = paymentsToken; setPage = setPayments; setToken = setPaymentsToken;
        setHistory = setPaymentsHistory; history = paymentsHistory;
        fetchFn = getPaymentsPaginated; break;
      case 'reviews':
        token = reviewsToken; setPage = setAllReviews; setToken = setReviewsToken;
        setHistory = setReviewsHistory; history = reviewsHistory;
        fetchFn = getReviewsPaginated; break;
    }

    if (!token) return;
    setDataLoading(true);
    try {
      const result = await fetchFn(20, token);
      setPage(result.data);
      setToken(result.nextPageToken);
      setHistory(prev => [...prev, token]);
    } catch (err) {
      console.error(`Failed to fetch next ${collection} page:`, err);
    } finally {
      setDataLoading(false);
    }
  }, [bookingsToken, providersToken, paymentsToken, reviewsToken,
      bookingsHistory, providersHistory, paymentsHistory, reviewsHistory]);

  const goPrevPage = useCallback(async (
    collection: 'bookings' | 'providers' | 'payments' | 'reviews',
  ) => {
    let prevToken: string | undefined;
    let setPage: (items: any[]) => void;
    let setToken: (t: string | null) => void;
    let setHistory: (h: string[] | ((prev: string[]) => string[])) => void;
    let history: string[];
    let fetchFn: (pageSize: number, pageToken?: string | null) => Promise<PaginatedResult<any>>;

    switch (collection) {
      case 'bookings':
        history = bookingsHistory; setPage = setBookings; setToken = setBookingsToken;
        setHistory = setBookingsHistory; fetchFn = getBookingsPaginated; break;
      case 'providers':
        history = providersHistory; setPage = setProviders; setToken = setProvidersToken;
        setHistory = setProvidersHistory; fetchFn = getProvidersPaginated; break;
      case 'payments':
        history = paymentsHistory; setPage = setPayments; setToken = setPaymentsToken;
        setHistory = setPaymentsHistory; fetchFn = getPaymentsPaginated; break;
      case 'reviews':
        history = reviewsHistory; setPage = setAllReviews; setToken = setReviewsToken;
        setHistory = setReviewsHistory; fetchFn = getReviewsPaginated; break;
    }

    if (history.length === 0) return;
    prevToken = history[history.length - 1];

    setDataLoading(true);
    try {
      const result = await fetchFn(20, prevToken);
      setPage(result.data);
      setToken(result.nextPageToken);
      setHistory(prev => prev.slice(0, -1));
    } catch (err) {
      console.error(`Failed to fetch previous ${collection} page:`, err);
    } finally {
      setDataLoading(false);
    }
  }, [bookingsHistory, providersHistory, paymentsHistory, reviewsHistory]);

  // Only fetch data for the admin user — no wasted API calls for others.
  // Guard: user must be fully loaded and authenticated to avoid a 403 race
  // where the Firebase Auth token hasn't been issued yet (D2).
  useEffect(() => {
    if (loading || !user || !admin) return;
    fetchLiveData();
    fetchAllUsers();
  }, [loading, user, admin, fetchLiveData, fetchAllUsers]);

  // Fetch analytics data independently of paginated table state (F5 fix)
  useEffect(() => {
    if (loading || !user || !admin) return;
    setAnalyticsLoading(true);
    Promise.all([
      getMonthlyAnalyticsDataRest(),
      getAllBookingsRest(),
      getAllPaymentsRest(),
    ])
      .then(([monthly, allB, allP]) => {
        setAnalyticsData(monthly);
        setFullAnalyticsBookings(allB);
        setFullAnalyticsPayments(allP);
      })
      .catch((err) => console.error('Failed to fetch analytics data:', err))
      .finally(() => setAnalyticsLoading(false));
  }, [loading, user, admin]);

  // ── Derived analytics (from independent analyticsData) ─────────
  const aBookings = analyticsData.bookings;
  const aPayments = analyticsData.payments;

  /** Revenue MTD — sum of all payments with status === 'paid'. */
  const revenueMtd = aPayments
    .filter((p) => p.status === 'paid')
    .reduce((sum, p) => sum + (p.amount ?? 0), 0);

  /** Monthly booking counts — index 0 = January. */
  const monthlyBookings = (() => {
    const counts = new Array(12).fill(0);
    for (const b of aBookings) {
      const raw = b.createdAt || b.date;
      if (!raw) continue;
      const d = new Date(raw);
      if (!isNaN(d.getTime())) {
        counts[d.getMonth()] += 1;
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
    for (const b of aBookings) {
      const key = b.serviceType;
      tally[key] = (tally[key] ?? 0) + 1;
    }
    const total = aBookings.length || 1;
    const labels = Object.keys(tally);
    const sorted = labels.sort((a, b) => (tally[b] ?? 0) - (tally[a] ?? 0)).slice(0, 5);
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

  // ── Advanced analytics (computed from full data) ─────────────────

  /** Monthly revenue vs payouts — last 12 months. */
  const monthlyRevenueData = (() => {
    const months = Array.from({ length: 12 }, (_, i) => {
      const d = new Date();
      d.setMonth(d.getMonth() - (11 - i));
      return { year: d.getFullYear(), month: d.getMonth(), label: d.toLocaleDateString('en-GB', { month: 'short', year: '2-digit' }) };
    });
    return months.map(({ year, month, label }) => {
      const relevant = fullAnalyticsPayments.filter(p => {
        if (!p.createdAt) return false;
        const d = new Date(p.createdAt);
        return d.getFullYear() === year && d.getMonth() === month && (p.status === 'paid' || p.status === 'completed');
      });
      const total = relevant.reduce((s, p) => s + (p.amount || 0), 0);
      return { label, revenue: total * 0.10, payout: total * 0.90, total };
    });
  })();

  const maxMonthlyTotal = Math.max(...monthlyRevenueData.map(m => m.total), 1);

  // ── KPI: MoM user growth ───────────────────────────────────────────
  const userGrowth = (() => {
    if (allUsers.length === 0) return { pct: 0, direction: 'neutral' as const };
    const now = new Date();
    const thisMonth = allUsers.filter(u => {
      if (!u.createdAt) return false;
      const d = new Date(u.createdAt);
      return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth();
    }).length;
    const lastMonth = allUsers.filter(u => {
      if (!u.createdAt) return false;
      const d = new Date(u.createdAt);
      const lm = now.getMonth() === 0 ? 11 : now.getMonth() - 1;
      const ly = now.getMonth() === 0 ? now.getFullYear() - 1 : now.getFullYear();
      return d.getFullYear() === ly && d.getMonth() === lm;
    }).length;
    const base = lastMonth || 1;
    const pct = Math.round(((thisMonth - lastMonth) / base) * 100);
    return { pct, direction: pct >= 0 ? 'up' as const : 'down' as const };
  })();

  const totalPlatformFees = fullAnalyticsPayments
    .filter(p => p.status === 'paid' || p.status === 'completed')
    .reduce((s, p) => s + (p.amount || 0) * 0.10, 0);

  // ── Top 3 providers ────────────────────────────────────────────────
  const topProviders = (() => {
    // Completed bookings per provider
    const bookingCounts: Record<string, number> = {};
    const ratingSums: Record<string, { sum: number; count: number }> = {};
    for (const b of fullAnalyticsBookings) {
      if (b.status === 'completed' && b.providerId) {
        bookingCounts[b.providerId] = (bookingCounts[b.providerId] || 0) + 1;
      }
    }
    // Average rating per provider from allReviews
    for (const r of allReviews) {
      if (!r.providerId) continue;
      if (!ratingSums[r.providerId]) ratingSums[r.providerId] = { sum: 0, count: 0 };
      ratingSums[r.providerId].sum += r.rating;
      ratingSums[r.providerId].count += 1;
    }
    const providerIds = new Set([...Object.keys(bookingCounts), ...Object.keys(ratingSums)]);
    const ranked = Array.from(providerIds).map(id => {
      const pr = providers.find(p => p.id === id);
      const bc = bookingCounts[id] || 0;
      const rs = ratingSums[id];
      const avgRating = rs ? rs.sum / rs.count : 0;
      return { id, name: pr?.businessName || pr?.name || id.slice(0, 8), completedBookings: bc, avgRating, provider: pr };
    });
    ranked.sort((a, b) => b.completedBookings - a.completedBookings || b.avgRating - a.avgRating);
    return ranked.slice(0, 3);
  })();

  // Early returns while auth resolves or during redirect
  if (loading || !user || !admin) {
    return <div className="pt-[100px] min-h-screen flex items-center justify-center"><div className="w-10 h-10 border-3 border-[#F0E4D8] border-t-[#E86A33] rounded-full animate-spin" /></div>;
  }

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
      const result = await deleteUserAccountRest(userId, user?.id, user?.role);
      localAuth.deleteUser(userId);
      showToast(
        `✅ User "${userName}" deleted: ${result.deletedPets} pet(s), ${result.deletedBookings} booking(s), ` +
        `${result.deletedPayments} payment(s), ${result.deletedReviews} review(s), ` +
        `${result.deletedFavorites} favorite(s). ${result.recalculatedProviders} provider(s) updated.`,
        'success',
      );
      fetchAllUsers(); // Refresh the merged list
    } catch (err) {
      console.error('Failed to delete user:', err);
      showToast('❌ Failed to delete user.', 'error');
    }
  };

  /** Fetch user details from secure Admin API route and open modal. */
  const handleOpenUserModal = async (u: AppUser) => {
    setSelectedUser(u);
    setShowUserModal(true);
    setUserModalLoading(true);
    setUserDetailData(null);
    try {
      // Get Firebase ID token for auth
      const { auth } = getFirebaseAuth();
      if (!auth?.currentUser) throw new Error('Not authenticated');
      const token = await auth.currentUser.getIdToken();
      const res = await fetch(`/api/admin/users/${encodeURIComponent(u.id)}/details`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error((err as any).error || `HTTP ${res.status}`);
      }
      const data = await res.json();
      setUserDetailData(data);
    } catch (err) {
      console.error('Failed to fetch user details:', err);
      showToast('❌ Failed to load user details.', 'error');
      setShowUserModal(false);
      setSelectedUser(null);
    } finally {
      setUserModalLoading(false);
    }
  };

  const handleCloseUserModal = () => {
    setShowUserModal(false);
    setSelectedUser(null);
    setUserDetailData(null);
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
      const docId = provider._firestoreId || String(provider.id);

      // 1. Cascading delete: relational docs + provider doc
      const result = await deleteProviderAccountRest(docId, user?.id, user?.role);

      // 2. Delete provider logo from Firebase Storage if it exists
      const logoUrl = result.logoUrl || provider.logoUrl;
      if (logoUrl) {
        try {
          const storage = getStorageDb();
          if (storage) {
            // Parse the storage path from the download URL
            // Format: https://firebasestorage.googleapis.com/v0/b/{bucket}/o/{encoded_path}?alt=media&token=...
            const urlObj = new URL(logoUrl);
            const encodedPath = urlObj.pathname.split('/o/')[1];
            if (encodedPath) {
              const storagePath = decodeURIComponent(encodedPath);
              const storageRef = ref(storage, storagePath);
              await deleteObject(storageRef);
            }
          }
        } catch {
          // Non-critical — storage cleanup failure shouldn't block account deletion
        }
      }

      // 3. Downgrade the associated user to 'owner' role
      const email = result.userEmail || provider.email;
      if (email) {
        try {
          const users = await getAllUsersRest();
          const userDoc = users.find(
            (u) => u.email?.toLowerCase() === email.toLowerCase(),
          );
          if (userDoc) {
            await updateUserDocRest(userDoc.id, { role: 'owner' });
          }
        } catch {
          // Non-critical — user role downgrade shouldn't block account deletion
        }
      }

      // 4. Update local state
      setProviders(prev => prev.filter(p => p.id !== provider.id));

      const summary = [
        result.deletedBookings > 0 && `${result.deletedBookings} booking(s)`,
        result.deletedPayments > 0 && `${result.deletedPayments} payment(s)`,
        result.deletedReviews > 0 && `${result.deletedReviews} review(s)`,
        result.deletedFavorites > 0 && `${result.deletedFavorites} favorite(s)`,
      ].filter(Boolean).join(', ');

      showToast(
        `✅ Provider "${provider.name}" fully deleted. ${summary ? `Cleaned up: ${summary}.` : ''}`,
        'success',
      );
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
                  <tr key={u.id} className="border-b border-[#F0E4D8] hover:bg-[#FFF8F0] cursor-pointer" onClick={() => handleOpenUserModal(u)}>
                    <td className="px-5 py-4 text-sm font-semibold text-[#2C3E50]">{u.name || 'Unnamed'}</td>
                    <td className="px-5 py-4 text-sm text-gray-500">{u.email}</td>
                    <td className="px-5 py-4">
                      <span className={`text-xs px-3 py-1.5 rounded-full font-semibold ${u.role === 'provider' ? 'bg-blue-500/10 text-blue-500' : 'bg-emerald-500/10 text-emerald-600'}`}>
                        {u.role === 'provider' ? 'Provider' : 'Owner'}
                      </span>
                    </td>
                    <td className="px-5 py-4 text-sm text-gray-400">{u.authMethod || 'email'}</td>
                    <td className="px-5 py-4 text-sm text-gray-400">{u.createdAt ? new Date(u.createdAt).toLocaleDateString('en-GB') : 'N/A'}</td>
                    <td className="px-5 py-4">
                      <button
                        onClick={(e) => { e.stopPropagation(); handleDeleteUser(u.id, u.name || u.email); }}
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
                    <tr
                      key={p.id}
                      className="border-b border-[#F0E4D8] hover:bg-[#FFF8F0] cursor-pointer"
                      onClick={() => { setSelectedProvider(p); setShowProviderModal(true); }}
                    >
                      <td className="px-5 py-4 text-sm font-semibold text-[#2C3E50]">{p.emoji} {p.businessName || p.name}</td>
                      <td className="px-5 py-4 text-sm text-gray-500">{p.category}</td>
                      <td className="px-5 py-4 text-sm text-yellow-500">★ {p.rating} <span className="text-gray-400 font-normal">({p.reviews})</span></td>
                      <td className="px-5 py-4 text-sm text-gray-500">{p.price}</td>
                      <td className="px-5 py-4"><span className="text-xs px-3 py-1.5 rounded-full bg-emerald-500/10 text-emerald-600 font-semibold">Active</span></td>
                      <td className="px-5 py-4" onClick={(e) => e.stopPropagation()}>
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
            {/* ── Providers pagination ── */}
            <div className="flex items-center justify-between px-5 py-4 border-t border-[#F0E4D8]">
              <button
                onClick={() => goPrevPage('providers')}
                disabled={providersHistory.length === 0}
                className="text-sm px-4 py-2 rounded-xl border border-[#F0E4D8] hover:bg-[#FFF8F0] disabled:opacity-40 disabled:cursor-not-allowed transition-all"
              >
                ← Previous
              </button>
              <span className="text-xs text-gray-400">Page {providersHistory.length + 1}</span>
              <button
                onClick={() => goNextPage('providers')}
                disabled={!providersToken}
                className="text-sm px-4 py-2 rounded-xl border border-[#F0E4D8] hover:bg-[#FFF8F0] disabled:opacity-40 disabled:cursor-not-allowed transition-all"
              >
                Next →
              </button>
            </div>
          </div>
        )}

        {/* Bookings tab */}
        {activeTab === 'bookings' && (
          <>
            {selectedBooking ? (
              /* ── Booking Detail View ───────────────────────────── */
              <div className="bg-white border border-[#F0E4D8] rounded-2xl overflow-hidden">
                <div className="p-5 border-b border-[#F0E4D8] flex items-center justify-between">
                  <h4 className="text-sm font-semibold text-[#2C3E50]">📋 Booking Details</h4>
                  <button onClick={() => setSelectedBooking(null)} className="text-xs text-gray-400 hover:text-gray-600">← Back to all bookings</button>
                </div>
                <div className="p-6 space-y-5">
                  {/* Booking number & status */}
                  <div className="flex items-center justify-between">
                    <div>
                      <span className="text-xs text-gray-400 uppercase tracking-wider font-semibold">Booking #</span>
                      <p className="text-sm font-mono text-[#2C3E50] mt-0.5">{selectedBooking.id}</p>
                    </div>
                    <span className={`text-xs px-3 py-1.5 rounded-full font-semibold ${statusColors[selectedBooking.status] || 'bg-gray-500/10 text-gray-500'}`}>
                      {selectedBooking.status.charAt(0).toUpperCase() + selectedBooking.status.slice(1)}
                    </span>
                  </div>

                  {/* Client info */}
                  <div className="bg-[#FFF8F0] rounded-xl p-4">
                    <h5 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">👤 Client Information</h5>
                    <div className="grid sm:grid-cols-2 gap-3 text-sm">
                      <div><span className="text-gray-400">Name:</span> <span className="text-[#2C3E50] font-medium">{(() => { const u = allUsers.find(u2 => u2.id === selectedBooking.userId || (u2 as any).uid === selectedBooking.userId); return u ? (u.name || u.email) : selectedBooking.customerName; })()}</span></div>
                      {selectedBooking.customerEmail && <div><span className="text-gray-400">Email:</span> <span className="text-[#2C3E50]">{selectedBooking.customerEmail}</span></div>}
                      {selectedBooking.customerPhone && <div><span className="text-gray-400">Phone:</span> <span className="text-[#2C3E50]">{selectedBooking.customerPhone}</span></div>}
                      {selectedBooking.petName && <div><span className="text-gray-400">Pet:</span> <span className="text-[#2C3E50]">{selectedBooking.petName}</span></div>}
                    </div>
                  </div>

                  {/* Service & Provider */}
                  <div className="bg-[#FFF8F0] rounded-xl p-4">
                    <h5 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">📦 Service &amp; Provider</h5>
                    <div className="grid sm:grid-cols-2 gap-3 text-sm">
                      <div><span className="text-gray-400">Service:</span> <span className="text-[#2C3E50] font-medium">{serviceIcons[selectedBooking.serviceType] || '🐾'} {serviceLabels[selectedBooking.serviceType] || selectedBooking.serviceType}</span></div>
                      <div><span className="text-gray-400">Provider:</span> <span className="text-[#2C3E50] font-medium">{(() => { const mp = providers.find(p2 => p2.id === selectedBooking.providerId); return mp ? (mp.businessName || mp.name) : selectedBooking.providerName; })()}</span></div>
                      {(() => { const mp = providers.find(p2 => p2.id === selectedBooking.providerId); return mp?.phone ? <div className="sm:col-span-2"><span className="text-xs text-gray-400 block uppercase font-semibold">Provider Phone:</span><span className="text-sm text-gray-700 font-medium">{mp.phone}</span></div> : null; })()}
                      {(() => { const mp = providers.find(p2 => p2.id === selectedBooking.providerId); return mp?.location ? <div className="sm:col-span-2"><span className="text-gray-400">Location:</span> <span className="text-[#2C3E50]">{mp.location}</span></div> : null; })()}
                      <div><span className="text-gray-400">Booking Date:</span> <span className="text-[#2C3E50]">{selectedBooking.date?.split("-").reverse().join("/")}</span></div>
                      <div><span className="text-gray-400">Booking Time:</span> <span className="text-[#2C3E50]">{selectedBooking.time || selectedBooking.timeSlot || '—'}</span></div>
                      <div className="sm:col-span-2 pt-2 border-t border-[#F0E4D8]/60">
                        <span className="text-gray-400 text-xs">Order placed:</span>
                        <span className="text-[#2C3E50] text-xs ml-2">{selectedBooking.createdAt ? new Date(selectedBooking.createdAt).toLocaleString('en-GB') : 'N/A'}</span>
                      </div>
                      {selectedBooking.instructions && <div className="sm:col-span-2"><span className="text-gray-400">Instructions:</span> <span className="text-[#2C3E50]">{selectedBooking.instructions}</span></div>}
                    </div>
                  </div>

                  {/* Payment breakdown */}
                  <div className="bg-[#FFF8F0] rounded-xl p-4">
                    <h5 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">💳 Payment Information</h5>
                    <div className="space-y-2 text-sm">
                      <div className="flex justify-between"><span className="text-gray-400">Service Fee</span><span className="text-[#2C3E50]">${(selectedBooking.price || 0).toFixed(2)} {selectedBooking.currency || 'USD'}</span></div>
                      <div className="flex justify-between"><span className="text-gray-400">Platform Fee</span><span className="text-[#2C3E50]">${(selectedBooking.platformFee || 0).toFixed(2)} {selectedBooking.currency || 'USD'}</span></div>
                      <div className="flex justify-between pt-3 mt-2 border-t border-[#F0E4D8] font-semibold"><span className="text-[#2C3E50]">Total Paid</span><span className="text-[#E86A33]">${(selectedBooking.total || selectedBooking.price || 0).toFixed(2)} {selectedBooking.currency || 'USD'}</span></div>
                    </div>
                  </div>

                  {/* Actions */}
                  {selectedBooking.status !== 'cancelled' && selectedBooking.status !== 'completed' && (
                    <div className="flex gap-3 pt-2">
                      <button onClick={() => { handleCancelBooking(selectedBooking.id); setSelectedBooking(null); }} className="text-sm bg-yellow-50 text-yellow-700 border border-yellow-200 px-4 py-2 rounded-xl hover:bg-yellow-100 transition-all">⏸️ Cancel Booking</button>
                      <button onClick={() => { handleDeleteBooking(selectedBooking.id); setSelectedBooking(null); }} className="text-sm bg-red-50 text-red-700 border border-red-200 px-4 py-2 rounded-xl hover:bg-red-100 transition-all">🗑️ Delete Booking</button>
                    </div>
                  )}
                </div>
              </div>
            ) : (
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
                        const displayAmount = b.total || b.price || 0;
                        return (
                        <tr key={b.id} className="border-b border-[#F0E4D8] hover:bg-[#FFF8F0] cursor-pointer" onClick={() => setSelectedBooking(b)}>
                          <td className="px-5 py-4 text-sm text-gray-500">{displayCustomerName}</td>
                          <td className="px-5 py-4 text-sm font-semibold text-[#2C3E50]">
                            {serviceIcons[b.serviceType] || '🐾'} {serviceLabels[b.serviceType] || b.serviceType}
                          </td>
                          <td className="px-5 py-4 text-sm text-gray-500">{displayBusinessName}</td>
                          <td className="px-5 py-4 text-sm text-gray-500">{b.date?.split("-").reverse().join("/")}{b.time ? `, ${b.time}` : ''}</td>
                          <td className="px-5 py-4 text-sm font-semibold text-[#2C3E50]">${displayAmount.toFixed(2)} {b.currency || 'USD'}</td>
                          <td className="px-5 py-4">
                            <span className={`text-xs px-3 py-1.5 rounded-full font-semibold ${statusColors[b.status] || 'bg-gray-500/10 text-gray-500'}`}>
                              {b.status.charAt(0).toUpperCase() + b.status.slice(1)}
                            </span>
                          </td>
                          <td className="px-5 py-4">
                            <div className="flex gap-2" onClick={(e) => e.stopPropagation()}>
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
              {/* ── Bookings pagination ── */}
              <div className="flex items-center justify-between px-5 py-4 border-t border-[#F0E4D8]">
                <button
                  onClick={() => goPrevPage('bookings')}
                  disabled={bookingsHistory.length === 0}
                  className="text-sm px-4 py-2 rounded-xl border border-[#F0E4D8] hover:bg-[#FFF8F0] disabled:opacity-40 disabled:cursor-not-allowed transition-all"
                >
                  ← Previous
                </button>
                <span className="text-xs text-gray-400">Page {bookingsHistory.length + 1}</span>
                <button
                  onClick={() => goNextPage('bookings')}
                  disabled={!bookingsToken}
                  className="text-sm px-4 py-2 rounded-xl border border-[#F0E4D8] hover:bg-[#FFF8F0] disabled:opacity-40 disabled:cursor-not-allowed transition-all"
                >
                  Next →
                </button>
              </div>
            </div>
            )}
          </>
        )}

        {/* Payments Ledger tab */}
          {activeTab === 'payments' && (
            <div className="bg-white border border-[#F0E4D8] rounded-2xl overflow-hidden">
              {/* ── Filters bar ── */}
              <div className="p-5 border-b border-[#F0E4D8] flex items-center justify-between gap-4 flex-wrap">
                <h4 className="text-sm font-semibold text-[#2C3E50]">Payments Ledger ({payments.length})</h4>
                <div className="flex items-center gap-3">
                  {/* Provider filter */}
                  <select
                    value={paymentsProviderFilter}
                    onChange={e => setPaymentsProviderFilter(e.target.value)}
                    className="text-xs border border-[#F0E4D8] rounded-lg px-3 py-1.5 bg-white text-[#2C3E50] font-medium focus:outline-none focus:ring-2 focus:ring-[#E86A33]/20"
                  >
                    <option value="">All Providers</option>
                    {providers.map(pr => (
                      <option key={pr.id} value={pr.id}>{pr.businessName || pr.name}</option>
                    ))}
                  </select>
                  {/* Sort toggle */}
                  <button
                    onClick={() => setPaymentsSortOrder(o => o === 'newest' ? 'oldest' : 'newest')}
                    className="text-xs flex items-center gap-1.5 border border-[#F0E4D8] rounded-lg px-3 py-1.5 bg-white text-[#2C3E50] font-medium hover:bg-[#FFF8F0] transition-all"
                  >
                    {paymentsSortOrder === 'newest' ? '📅 Newest First' : '📅 Oldest First'}
                  </button>
                </div>
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
                      {['Booking', 'Customer', 'Provider', 'Category', 'Service Cost', 'Platform Fee', 'Total', 'Status', ''].map(h => (
                        <th key={h} className="text-left px-5 py-4 text-xs font-semibold text-gray-400 uppercase tracking-wider">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {(() => {
                      // Client-side filter + sort — no re-fetch
                      let filtered = [...payments];
                      if (paymentsProviderFilter) {
                        filtered = filtered.filter(p => p.providerId === paymentsProviderFilter);
                      }
                      filtered.sort((a, b) => {
                        const da = a.createdAt ? new Date(a.createdAt).getTime() : 0;
                        const db = b.createdAt ? new Date(b.createdAt).getTime() : 0;
                        return paymentsSortOrder === 'newest' ? db - da : da - db;
                      });
                      return filtered.map(p => {
                        const platformFee = p.amount * 0.10;
                        const serviceCost = p.amount - platformFee;
                        return (
                        <tr key={p.id} className="border-b border-[#F0E4D8] hover:bg-[#FFF8F0]">
                          <td className="px-5 py-4 text-sm text-gray-500 font-mono cursor-pointer" onClick={() => { setSelectedPayment(p); setShowPaymentModal(true); }}>{p.bookingId.slice(0, 8)}...</td>
                          <td className="px-5 py-4 text-sm text-gray-500 cursor-pointer" onClick={() => { setSelectedPayment(p); setShowPaymentModal(true); }}>{p.customerName}</td>
                          <td className="px-5 py-4 text-sm font-semibold text-[#2C3E50] cursor-pointer" onClick={() => { setSelectedPayment(p); setShowPaymentModal(true); }}>{(m => m ? (m.businessName || m.name) : p.providerName)(providers.find(pr => pr.id === p.providerId))}</td>
                          <td className="px-5 py-4 text-sm text-gray-500 cursor-pointer" onClick={() => { setSelectedPayment(p); setShowPaymentModal(true); }}>{p.category}</td>
                          <td className="px-5 py-4 text-sm text-gray-500 cursor-pointer" onClick={() => { setSelectedPayment(p); setShowPaymentModal(true); }}>${serviceCost.toFixed(2)}</td>
                          <td className="px-5 py-4 text-sm text-gray-500 cursor-pointer" onClick={() => { setSelectedPayment(p); setShowPaymentModal(true); }}>${platformFee.toFixed(2)}</td>
                          <td className="px-5 py-4 text-sm font-semibold text-[#2C3E50] cursor-pointer" onClick={() => { setSelectedPayment(p); setShowPaymentModal(true); }}>${p.amount.toFixed(2)}</td>
                          <td className="px-5 py-4 cursor-pointer" onClick={() => { setSelectedPayment(p); setShowPaymentModal(true); }}>
                            {editStatus?.id === p.id ? (
                              <div className="flex gap-1">
                                <select
                                  onClick={(e) => e.stopPropagation()}
                                  value={editStatus.value}
                                  onChange={e => setEditStatus({ id: p.id, value: e.target.value })}
                                  className="text-xs px-2 py-1 border border-[#F0E4D8] rounded-lg bg-white"
                                >
                                  {['paid', 'pending', 'refunded', 'cancelled'].map(s => (
                                    <option key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</option>
                                  ))}
                                </select>
                                <button onClick={(e) => { e.stopPropagation(); handlePaymentStatusEdit(p.id, editStatus.value); }} className="text-xs text-emerald-600 hover:text-emerald-800">Save</button>
                                <button onClick={(e) => { e.stopPropagation(); setEditStatus(null); }} className="text-xs text-gray-400 hover:text-gray-600">✕</button>
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
                      )});
                    })()}
                  </tbody>
                </table>
              )}
              {/* ── Payments pagination ── */}
              <div className="flex items-center justify-between px-5 py-4 border-t border-[#F0E4D8]">
                <button
                  onClick={() => goPrevPage('payments')}
                  disabled={paymentsHistory.length === 0}
                  className="text-sm px-4 py-2 rounded-xl border border-[#F0E4D8] hover:bg-[#FFF8F0] disabled:opacity-40 disabled:cursor-not-allowed transition-all"
                >
                  ← Previous
                </button>
                <span className="text-xs text-gray-400">Page {paymentsHistory.length + 1}</span>
                <button
                  onClick={() => goNextPage('payments')}
                  disabled={!paymentsToken}
                  className="text-sm px-4 py-2 rounded-xl border border-[#F0E4D8] hover:bg-[#FFF8F0] disabled:opacity-40 disabled:cursor-not-allowed transition-all"
                >
                  Next →
                </button>
              </div>
            </div>
          )}

          {/* ── Payment Detail Modal ── */}
          {showPaymentModal && selectedPayment && <PaymentDetailModal
            payment={selectedPayment}
            providers={providers}
            bookings={bookings}
            onClose={() => { setShowPaymentModal(false); setSelectedPayment(null); }}
          />}

          {/* ── Provider Detail Modal ── */}
          {showProviderModal && selectedProvider && (
            <ProviderDetailModal
              provider={selectedProvider}
              onClose={() => { setShowProviderModal(false); setSelectedProvider(null); }}
            />
          )}

          {/* ── User Detail Modal ── */}
          {showUserModal && selectedUser && (
            <UserDetailModal
              user={selectedUser}
              data={userDetailData}
              loading={userModalLoading}
              onClose={handleCloseUserModal}
            />
          )}

          {/* Reviews management tab */}
          {activeTab === 'reviews' && (
            <div className="bg-white border border-[#F0E4D8] rounded-2xl overflow-hidden">
              {/* ── Filters bar ── */}
              <div className="p-5 border-b border-[#F0E4D8] flex items-center justify-between gap-4 flex-wrap">
                <h4 className="text-sm font-semibold text-[#2C3E50]">⭐ Platform Reviews ({allReviews.length})</h4>
                <div className="flex items-center gap-3">
                  {/* Provider filter */}
                  <select
                    value={reviewsProviderFilter}
                    onChange={e => setReviewsProviderFilter(e.target.value)}
                    className="text-xs border border-[#F0E4D8] rounded-lg px-3 py-1.5 bg-white text-[#2C3E50] font-medium focus:outline-none focus:ring-2 focus:ring-[#E86A33]/20"
                  >
                    <option value="">All Providers</option>
                    {providers.map(pr => (
                      <option key={pr.id} value={pr.id}>{pr.businessName || pr.name}</option>
                    ))}
                  </select>
                  {/* Sort toggle */}
                  <button
                    onClick={() => setReviewsSortOrder(o => o === 'newest' ? 'oldest' : 'newest')}
                    className="text-xs flex items-center gap-1.5 border border-[#F0E4D8] rounded-lg px-3 py-1.5 bg-white text-[#2C3E50] font-medium hover:bg-[#FFF8F0] transition-all"
                  >
                    {reviewsSortOrder === 'newest' ? '📅 Newest First' : '📅 Oldest First'}
                  </button>
                </div>
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
                  {(() => {
                    let filtered = [...allReviews];
                    if (reviewsProviderFilter) {
                      filtered = filtered.filter(r => r.providerId === reviewsProviderFilter);
                    }
                    filtered.sort((a, b) => {
                      const da = a.createdAt ? new Date(a.createdAt).getTime() : 0;
                      const db = b.createdAt ? new Date(b.createdAt).getTime() : 0;
                      return reviewsSortOrder === 'newest' ? db - da : da - db;
                    });
                    return filtered.map(r => (
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
                                    {new Date(r.createdAt).toLocaleDateString('en-GB')}
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
                  ));
                })()}
                </div>
              )}
              {/* ── Reviews pagination ── */}
              <div className="flex items-center justify-between px-5 py-4 border-t border-[#F0E4D8]">
                <button
                  onClick={() => goPrevPage('reviews')}
                  disabled={reviewsHistory.length === 0}
                  className="text-sm px-4 py-2 rounded-xl border border-[#F0E4D8] hover:bg-[#FFF8F0] disabled:opacity-40 disabled:cursor-not-allowed transition-all"
                >
                  ← Previous
                </button>
                <span className="text-xs text-gray-400">Page {reviewsHistory.length + 1}</span>
                <button
                  onClick={() => goNextPage('reviews')}
                  disabled={!reviewsToken}
                  className="text-sm px-4 py-2 rounded-xl border border-[#F0E4D8] hover:bg-[#FFF8F0] disabled:opacity-40 disabled:cursor-not-allowed transition-all"
                >
                  Next →
                </button>
              </div>
            </div>
          )}

          {/* Analytics tab — all values computed from live Firestore data */}
        {activeTab === 'analytics' && (
          <div className="space-y-6">
            {analyticsLoading ? (
              <div className="animate-pulse grid lg:grid-cols-3 gap-6">
                {[1, 2, 3].map(i => <div key={i} className="h-28 bg-gray-100 rounded-2xl" />)}
              </div>
            ) : (
              <>
                {/* ── KPI Cards ── */}
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                  <div className="bg-white rounded-2xl border border-[#F0E4D8] p-5">
                    <div className="flex items-center gap-3 mb-3">
                      <span className="text-lg">👥</span>
                      <span className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider">Total Users</span>
                    </div>
                    <p className="text-2xl font-bold text-[#2C3E50]">{allUsers.length}</p>
                    <div className="flex items-center gap-1 mt-1">
                      <span className={`text-xs font-semibold ${userGrowth.direction === 'up' ? 'text-emerald-500' : userGrowth.direction === 'down' ? 'text-red-400' : 'text-gray-400'}`}>
                        {userGrowth.direction === 'up' ? '▲' : userGrowth.direction === 'down' ? '▼' : '—'} {Math.abs(userGrowth.pct)}%
                      </span>
                      <span className="text-[10px] text-gray-400">MoM</span>
                    </div>
                  </div>
                  <div className="bg-white rounded-2xl border border-[#F0E4D8] p-5">
                    <div className="flex items-center gap-3 mb-3">
                      <span className="text-lg">🏪</span>
                      <span className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider">Active Providers</span>
                    </div>
                    <p className="text-2xl font-bold text-[#2C3E50]">{providers.length}</p>
                    <span className="text-[10px] text-gray-400 mt-1 block">
                      {fullAnalyticsBookings.filter(b => b.status === 'completed').length > 0
                        ? `${new Set(fullAnalyticsBookings.filter(b => b.status === 'completed').map(b => b.providerId)).size} with completed bookings`
                        : 'No completed bookings yet'}
                    </span>
                  </div>
                  <div className="bg-white rounded-2xl border border-[#F0E4D8] p-5">
                    <div className="flex items-center gap-3 mb-3">
                      <span className="text-lg">💰</span>
                      <span className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider">Total Platform Fees</span>
                    </div>
                    <p className="text-2xl font-bold text-[#2C3E50]">${totalPlatformFees.toFixed(2)}</p>
                    <span className="text-[10px] text-gray-400 mt-1 block">All-time collected fees (10%)</span>
                  </div>
                  <div className="bg-white rounded-2xl border border-[#F0E4D8] p-5">
                    <div className="flex items-center gap-3 mb-3">
                      <span className="text-lg">📅</span>
                      <span className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider">Revenue MTD</span>
                    </div>
                    <p className="text-2xl font-bold text-[#2C3E50]">${revenueMtd.toFixed(2)}</p>
                    <span className="text-[10px] text-gray-400 mt-1 block">This month (paid bookings)</span>
                  </div>
                </div>

                {/* ── Row 2: Financial Health Chart + Top Providers ── */}
                <div className="grid lg:grid-cols-3 gap-6">
                  {/* Financial Health: Platform Revenue vs Provider Payouts */}
                  <div className="lg:col-span-2 bg-white border border-[#F0E4D8] rounded-2xl p-6">
                    <h4 className="text-sm font-semibold text-[#2C3E50] mb-5">📊 Platform Revenue vs. Provider Payouts</h4>
                    {monthlyRevenueData.every(m => m.total === 0) ? (
                      <p className="text-sm text-gray-400 text-center py-8">No payment data available for the last 12 months.</p>
                    ) : (
                      <div className="relative h-[200px] pt-4">
                        {/* Y-axis labels */}
                        <div className="absolute left-0 top-0 bottom-6 w-10 flex flex-col justify-between text-[10px] text-gray-400">
                          <span>${maxMonthlyTotal.toFixed(0)}</span>
                          <span>${(maxMonthlyTotal / 2).toFixed(0)}</span>
                          <span>$0</span>
                        </div>
                        {/* Bars */}
                        <div className="ml-12 h-full flex items-end gap-2">
                          {monthlyRevenueData.map((m, i) => {
                            const revPx = (m.revenue / maxMonthlyTotal) * 170;
                            const payoutPx = (m.payout / maxMonthlyTotal) * 170;
                            return (
                              <div key={i} className="flex-1 flex flex-col items-center gap-0.5 justify-end h-full">
                                {/* Tooltip on hover — stacked revenue (orange) on top */}
                                <div className="group relative w-full flex flex-col items-center justify-end" style={{ height: `${Math.max(revPx + payoutPx, 2)}px` }}>
                                  {/* Payout bar (teal) */}
                                  <div className="w-full bg-teal-400/80 rounded-t-sm transition-all group-hover:opacity-90" style={{ height: `${Math.max(payoutPx, 2)}px` }} />
                                  {/* Revenue bar (orange, stacked on top) */}
                                  <div className="w-full bg-[#E86A33] rounded-t-sm transition-all group-hover:opacity-90" style={{ height: `${Math.max(revPx, 1)}px` }} />
                                  {/* Hover tooltip */}
                                  <div className="absolute -top-8 left-1/2 -translate-x-1/2 hidden group-hover:flex flex-col items-center bg-[#2C3E50] text-white text-[9px] px-2 py-1 rounded-lg whitespace-nowrap z-10 shadow-lg">
                                    <span>Revenue: ${m.revenue.toFixed(2)}</span>
                                    <span>Payout: ${m.payout.toFixed(2)}</span>
                                  </div>
                                </div>
                                <span className="text-[9px] text-gray-400 mt-1">{m.label}</span>
                              </div>
                            );
                          })}
                        </div>
                        {/* Legend */}
                        <div className="flex items-center justify-center gap-5 mt-3 text-[10px] text-gray-500">
                          <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-sm bg-[#E86A33]" /> Platform Revenue (10%)</span>
                          <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-sm bg-teal-400/80" /> Provider Payout (90%)</span>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Top Performers Leaderboard */}
                  <div className="bg-white border border-[#F0E4D8] rounded-2xl p-6">
                    <h4 className="text-sm font-semibold text-[#2C3E50] mb-4">🏆 Top Providers</h4>
                    {topProviders.length === 0 ? (
                      <p className="text-sm text-gray-400 text-center py-8">No provider data yet.</p>
                    ) : (
                      <div className="space-y-3">
                        {topProviders.map((tp, i) => (
                          <div key={tp.id} className="flex items-center gap-3 p-3 rounded-xl bg-[#FFF8F0] border border-[#F0E4D8]">
                            <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold text-white ${i === 0 ? 'bg-amber-400' : i === 1 ? 'bg-gray-400' : 'bg-amber-700'}`}>
                              {['🥇', '🥈', '🥉'][i]}
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-semibold text-[#2C3E50] truncate">{tp.name}</p>
                              <div className="flex items-center gap-3 text-[10px] text-gray-400 mt-0.5">
                                <span>{tp.completedBookings} bookings</span>
                                <span>★ {tp.avgRating.toFixed(1)}</span>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>

                {/* ── Row 3: Original charts preserved ── */}
                <div className="grid lg:grid-cols-2 gap-6">
                  <div className="bg-white border border-[#F0E4D8] rounded-2xl p-8">
                    <h4 className="text-sm font-semibold text-[#2C3E50] mb-5">📈 Monthly Bookings</h4>
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
                    <h4 className="text-sm font-semibold text-[#2C3E50] mb-5">🎯 Service Distribution</h4>
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
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

/* ── Payment Detail Modal ──────────────────────────────────────────── */

function PaymentDetailModal({
  payment,
  providers,
  bookings,
  onClose,
}: {
  payment: PaymentDoc;
  providers: ServiceProvider[];
  bookings: BookingDoc[];
  onClose: () => void;
}) {
  const [fetchedUser, setFetchedUser] = useState<{ name?: string; email?: string; phone?: string; location?: string } | null>(null);
  const [fetchingUser, setFetchingUser] = useState(true);

  useEffect(() => {
    if (!payment.customerId) { setFetchingUser(false); return; }
    getUserByIdRest(payment.customerId)
      .then((u) => {
        if (u) setFetchedUser({ name: u.name, email: u.email, phone: u.phone });
        setFetchingUser(false);
      })
      .catch(() => setFetchingUser(false));
  }, [payment.customerId]);

  // Lookup relational data from already-loaded arrays
  const linkedBooking = bookings.find(b => b.id === payment.bookingId);
  const linkedProvider = providers.find(p => p.id === payment.providerId);

  const customerEmail = payment.customerName.includes('@') ? payment.customerName : (fetchedUser?.email || '—');
  const customerPhone = fetchedUser?.phone || '—';
  const bookingStatus = linkedBooking?.status || 'Unknown';

  /* ── Status pill styling ── */
  const statusStyle = (status: string) => {
    const s = status.toLowerCase();
    if (s === 'confirmed' || s === 'paid')    return 'bg-emerald-500/10 text-emerald-600 border-emerald-200';
    if (s === 'pending')                       return 'bg-amber-50 text-amber-600 border-amber-200';
    if (s === 'cancelled' || s === 'deleted' || s === 'refunded') return 'bg-red-500/10 text-red-500 border-red-200';
    return 'bg-gray-100 text-gray-500 border-gray-200';
  };

  const formatDate = (ts?: string) => {
    if (!ts) return '—';
    try { return new Date(ts).toLocaleString('en-GB'); } catch { return ts; }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4"
      onClick={onClose}
    >
      <div
        className="bg-[#FFF8F0] rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto border border-[#F0E4D8]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* ── Header ── */}
        <div className="sticky top-0 bg-[#FFF8F0] z-10 flex items-center justify-between px-6 py-5 border-b border-[#F0E4D8]">
          <h2 className="text-lg font-bold text-[#2C3E50]">💳 Payment Details</h2>
          <button
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center rounded-lg bg-white border border-[#F0E4D8] text-gray-400 hover:text-[#E86A33] hover:border-[#E86A33] transition-all text-lg"
          >
            ✕
          </button>
        </div>

        <div className="p-6 space-y-5">

          {/* ── Section A: Payment Metadata ── */}
          <div className="bg-white rounded-xl border border-[#F0E4D8] p-5">
            <h3 className="text-sm font-semibold text-[#2C3E50] mb-4 flex items-center gap-2">📋 Payment Metadata</h3>
            <div className="grid sm:grid-cols-2 gap-4 text-sm">
              <div>
                <span className="text-xs text-gray-400 block uppercase font-semibold tracking-wider">Transaction ID</span>
                <span className="text-[#2C3E50] font-mono text-xs break-all">{payment.id}</span>
              </div>
              <div>
                <span className="text-xs text-gray-400 block uppercase font-semibold tracking-wider">Booking ID</span>
                <span className="text-[#2C3E50] font-mono text-xs break-all">{payment.bookingId}</span>
              </div>
              <div>
                <span className="text-xs text-gray-400 block uppercase font-semibold tracking-wider">Total Amount</span>
                <span className="text-lg font-bold text-[#E86A33]">${payment.amount.toFixed(2)} USD</span>
              </div>
              <div>
                <span className="text-xs text-gray-400 block uppercase font-semibold tracking-wider">Payment Date</span>
                <span className="text-[#2C3E50]">{formatDate(payment.createdAt)}</span>
              </div>
              <div>
                <span className="text-xs text-gray-400 block uppercase font-semibold tracking-wider">Category</span>
                <span className="text-[#2C3E50]">{payment.category}</span>
              </div>
              <div>
                <span className="text-xs text-gray-400 block uppercase font-semibold tracking-wider">Status</span>
                <span className={`inline-block text-xs px-3 py-1 rounded-full font-semibold border ${statusStyle(payment.status)}`}>
                  {payment.status.charAt(0).toUpperCase() + payment.status.slice(1)}
                </span>
              </div>
            </div>
          </div>

          {/* ── Section B: Customer Identity Card ── */}
          <div className="bg-white rounded-xl border border-[#F0E4D8] p-5">
            <h3 className="text-sm font-semibold text-[#2C3E50] mb-4 flex items-center gap-2">👤 Customer Profile</h3>
            {fetchingUser ? (
              <div className="animate-pulse space-y-2">
                <div className="h-3 w-32 bg-gray-200 rounded" />
                <div className="h-3 w-48 bg-gray-100 rounded" />
                <div className="h-3 w-40 bg-gray-100 rounded" />
              </div>
            ) : (
              <div className="grid sm:grid-cols-2 gap-4 text-sm">
                <div>
                  <span className="text-xs text-gray-400 block uppercase font-semibold tracking-wider">Full Name</span>
                  <span className="text-[#2C3E50] font-medium">{payment.customerName || fetchedUser?.name || '—'}</span>
                </div>
                <div>
                  <span className="text-xs text-gray-400 block uppercase font-semibold tracking-wider">Email</span>
                  {customerEmail && customerEmail !== '—' ? (
                    <a href={`mailto:${customerEmail}`} className="text-[#E86A33] hover:underline">{customerEmail}</a>
                  ) : (
                    <span className="text-gray-400 italic">N/A</span>
                  )}
                </div>
                <div>
                  <span className="text-xs text-gray-400 block uppercase font-semibold tracking-wider">Phone</span>
                  {customerPhone && customerPhone !== '—' ? (
                    <a href={`tel:${customerPhone}`} className="text-[#2C3E50] hover:text-[#E86A33]">{customerPhone}</a>
                  ) : (
                    <span className="text-gray-400 italic">N/A</span>
                  )}
                </div>
                <div>
                  <span className="text-xs text-gray-400 block uppercase font-semibold tracking-wider">Customer ID</span>
                  <span className="text-[#2C3E50] font-mono text-xs">{payment.customerId}</span>
                </div>
              </div>
            )}
          </div>

          {/* ── Section C: Service Provider Context ── */}
          <div className="bg-white rounded-xl border border-[#F0E4D8] p-5">
            <h3 className="text-sm font-semibold text-[#2C3E50] mb-4 flex items-center gap-2">🏪 Service Provider</h3>
            <div className="grid sm:grid-cols-2 gap-4 text-sm">
              <div className="sm:col-span-2">
                <span className="text-xs text-gray-400 block uppercase font-semibold tracking-wider">Business Name</span>
                <span className="text-[#2C3E50] font-semibold text-base">{linkedProvider?.businessName || linkedProvider?.name || payment.providerName}</span>
              </div>
              <div>
                <span className="text-xs text-gray-400 block uppercase font-semibold tracking-wider">Category</span>
                <span className="inline-block text-xs px-3 py-1 rounded-full bg-[#FFF0E0] text-[#E86A33] font-semibold">{payment.category}</span>
              </div>
              <div>
                <span className="text-xs text-gray-400 block uppercase font-semibold tracking-wider">Provider ID</span>
                <span className="text-[#2C3E50] font-mono text-xs">{payment.providerId}</span>
              </div>
              {linkedProvider?.email && (
                <div>
                  <span className="text-xs text-gray-400 block uppercase font-semibold tracking-wider">Provider Email</span>
                  <a href={`mailto:${linkedProvider.email}`} className="text-[#E86A33] hover:underline">{linkedProvider.email}</a>
                </div>
              )}
              {linkedProvider?.phone && (
                <div>
                  <span className="text-xs text-gray-400 block uppercase font-semibold tracking-wider">Provider Phone</span>
                  <a href={`tel:${linkedProvider.phone}`} className="text-[#2C3E50] hover:text-[#E86A33]">{linkedProvider.phone}</a>
                </div>
              )}
            </div>
          </div>

          {/* ── Section D: Linked Booking Lifecycle ── */}
          <div className="bg-white rounded-xl border border-[#F0E4D8] p-5">
            <h3 className="text-sm font-semibold text-[#2C3E50] mb-4 flex items-center gap-2">🔗 Linked Booking</h3>
            <div className="grid sm:grid-cols-2 gap-4 text-sm">
              <div>
                <span className="text-xs text-gray-400 block uppercase font-semibold tracking-wider">Booking Status</span>
                <span className={`inline-block mt-1 text-xs px-3 py-1.5 rounded-full font-semibold border ${statusStyle(bookingStatus)}`}>
                  {bookingStatus.charAt(0).toUpperCase() + bookingStatus.slice(1)}
                </span>
              </div>
              <div>
                <span className="text-xs text-gray-400 block uppercase font-semibold tracking-wider">Service Type</span>
                <span className="text-[#2C3E50]">{linkedBooking?.serviceType || '—'}</span>
              </div>
              <div>
                <span className="text-xs text-gray-400 block uppercase font-semibold tracking-wider">Scheduled Date</span>
                <span className="text-[#2C3E50]">{linkedBooking?.date ? linkedBooking.date.split('-').reverse().join('/') : '—'}</span>
              </div>
              <div>
                <span className="text-xs text-gray-400 block uppercase font-semibold tracking-wider">Scheduled Time</span>
                <span className="text-[#2C3E50]">{linkedBooking?.time || linkedBooking?.timeSlot || '—'}</span>
              </div>
              <div className="sm:col-span-2">
                <span className="text-xs text-gray-400 block uppercase font-semibold tracking-wider">Customer Instructions</span>
                <span className="text-[#2C3E50]">{linkedBooking?.instructions || <span className="italic text-gray-400">None</span>}</span>
              </div>
            </div>
            {!linkedBooking && (
              <p className="mt-3 text-xs text-amber-600 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                ⚠️ The booking document associated with this payment (ID: {payment.bookingId}) was not found in the current dataset. It may have been deleted.
              </p>
            )}
          </div>

        </div>

        {/* ── Footer ── */}
        <div className="sticky bottom-0 bg-[#FFF8F0] border-t border-[#F0E4D8] px-6 py-4 flex justify-end">
          <button
            onClick={onClose}
            className="px-6 py-2.5 bg-[#E86A33] text-white text-sm font-semibold rounded-xl hover:bg-[#d55a24] transition-all"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

/* ── User Detail Modal ───────────────────────────────────────────── */

function UserDetailModal({
  user,
  data,
  loading,
  onClose,
}: {
  user: AppUser;
  data: {
    user: any;
    pets: any[];
    bookings: any[];
    payments: any[];
    reviews: any[];
  } | null;
  loading: boolean;
  onClose: () => void;
}) {
  const fmtDate = (ts?: string | number | null) => {
    if (!ts) return '—';
    try { return new Date(ts as string).toLocaleDateString('en-GB', { year: 'numeric', month: 'long', day: 'numeric' }); } catch { return String(ts); }
  };

  const statusBadge = (status?: string | null) => {
    const colors: Record<string, string> = {
      pending: 'bg-amber-50 text-amber-700 border-amber-200',
      confirmed: 'bg-emerald-50 text-emerald-700 border-emerald-200',
      completed: 'bg-emerald-500/10 text-emerald-600',
      cancelled: 'bg-rose-50 text-rose-700 border-rose-200',
    };
    if (!status) return null;
    return (
      <span className={`text-[10px] px-2 py-0.5 rounded-full font-semibold border ${colors[status] || 'bg-gray-500/10 text-gray-500'}`}>
        {status.charAt(0).toUpperCase() + status.slice(1)}
      </span>
    );
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4"
      onClick={onClose}
    >
      <div
        className="bg-[#FFF8F0] rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto border border-[#F0E4D8]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* ── Header ── */}
        <div className="sticky top-0 bg-[#FFF8F0] z-10 flex items-center justify-between px-6 py-5 border-b border-[#F0E4D8]">
          <h2 className="text-lg font-bold text-[#2C3E50] flex items-center gap-2">
            👤 {user.name || 'Unnamed'}
          </h2>
          <button onClick={onClose} className="text-sm text-gray-400 hover:text-gray-600">✕</button>
        </div>

        {loading ? (
          <div className="p-6 space-y-4 animate-pulse">
            {[1, 2, 3, 4].map(i => (
              <div key={i} className="h-16 bg-gray-200 rounded-xl" />
            ))}
          </div>
        ) : data ? (
          <div className="p-6 space-y-6">
            {/* ── Section A: Contact Details ── */}
            <div className="bg-white rounded-xl border border-[#F0E4D8] p-5">
              <h3 className="text-sm font-semibold text-[#2C3E50] mb-4 flex items-center gap-2">📞 Contact Details</h3>
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <span className="text-xs text-gray-400 block uppercase font-semibold tracking-wider">Email</span>
                  <span className="text-[#2C3E50] font-medium break-all">{data.user?.email || '—'}</span>
                </div>
                <div>
                  <span className="text-xs text-gray-400 block uppercase font-semibold tracking-wider">Phone</span>
                  <span className="text-[#2C3E50]">{data.user?.phone || '—'}</span>
                </div>
                <div>
                  <span className="text-xs text-gray-400 block uppercase font-semibold tracking-wider">Role</span>
                  <span className={`text-xs px-2 py-1 rounded-full font-semibold ${data.user?.role === 'provider' ? 'bg-blue-500/10 text-blue-500' : 'bg-emerald-500/10 text-emerald-600'}`}>
                    {(data.user?.role || 'owner').charAt(0).toUpperCase() + (data.user?.role || 'owner').slice(1)}
                  </span>
                </div>
                <div>
                  <span className="text-xs text-gray-400 block uppercase font-semibold tracking-wider">Auth Method</span>
                  <span className="text-[#2C3E50] capitalize">{data.user?.authMethod || 'email'}</span>
                </div>
                <div className="col-span-2">
                  <span className="text-xs text-gray-400 block uppercase font-semibold tracking-wider">Join Date</span>
                  <span className="text-[#2C3E50]">{fmtDate(data.user?.createdAt)}</span>
                </div>
              </div>
            </div>

            {/* ── Section B: Pets ── */}
            <div className="bg-white rounded-xl border border-[#F0E4D8] p-5">
              <h3 className="text-sm font-semibold text-[#2C3E50] mb-4 flex items-center gap-2">🐾 Pets ({data.pets.length})</h3>
              {data.pets.length === 0 ? (
                <p className="text-sm text-gray-400">No pets registered.</p>
              ) : (
                <div className="space-y-2">
                  {data.pets.map((pet: any) => (
                    <div key={pet.id} className="flex items-center justify-between border-b border-[#F0E4D8]/60 pb-2 last:border-0">
                      <div>
                        <span className="text-sm font-semibold text-[#2C3E50]">{pet.name || 'Unnamed Pet'}</span>
                        {pet.breed && <span className="text-xs text-gray-400 ml-2">{pet.breed}</span>}
                      </div>
                      <span className="text-xs text-gray-400 capitalize">{pet.type || '—'}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* ── Section C: Bookings ── */}
            <div className="bg-white rounded-xl border border-[#F0E4D8] p-5">
              <h3 className="text-sm font-semibold text-[#2C3E50] mb-4 flex items-center gap-2">📅 Bookings ({data.bookings.length})</h3>
              {data.bookings.length === 0 ? (
                <p className="text-sm text-gray-400">No bookings found.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b border-[#F0E4D8]">
                        <th className="text-left px-2 py-2 font-semibold text-gray-400 uppercase">Service</th>
                        <th className="text-left px-2 py-2 font-semibold text-gray-400 uppercase">Provider</th>
                        <th className="text-left px-2 py-2 font-semibold text-gray-400 uppercase">Date/Time</th>
                        <th className="text-left px-2 py-2 font-semibold text-gray-400 uppercase">Price</th>
                        <th className="text-left px-2 py-2 font-semibold text-gray-400 uppercase">Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.bookings.map((b: any) => (
                        <tr key={b.id} className="border-b border-[#F0E4D8]/60">
                          <td className="px-2 py-2.5 text-[#2C3E50] capitalize">{b.serviceType || '—'}</td>
                          <td className="px-2 py-2.5 text-gray-500">{b.providerName || '—'}</td>
                          <td className="px-2 py-2.5 text-gray-500">
                            {b.date ? new Date(b.date).toLocaleDateString('en-GB') : '—'}
                            {b.time ? ` ${b.time}` : ''}
                          </td>
                          <td className="px-2 py-2.5 text-[#2C3E50] font-medium">
                            {b.price ? `$${Number(b.price).toFixed(2)}` : '—'}
                          </td>
                          <td className="px-2 py-2.5">{statusBadge(b.status)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {/* ── Section D: Payments ── */}
            <div className="bg-white rounded-xl border border-[#F0E4D8] p-5">
              <h3 className="text-sm font-semibold text-[#2C3E50] mb-4 flex items-center gap-2">💳 Payments ({data.payments.length})</h3>
              {data.payments.length === 0 ? (
                <p className="text-sm text-gray-400">No payments found.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b border-[#F0E4D8]">
                        <th className="text-left px-2 py-2 font-semibold text-gray-400 uppercase">Amount</th>
                        <th className="text-left px-2 py-2 font-semibold text-gray-400 uppercase">Fee</th>
                        <th className="text-left px-2 py-2 font-semibold text-gray-400 uppercase">Status</th>
                        <th className="text-left px-2 py-2 font-semibold text-gray-400 uppercase">Date</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.payments.map((p: any) => (
                        <tr key={p.id} className="border-b border-[#F0E4D8]/60">
                          <td className="px-2 py-2.5 text-[#2C3E50] font-medium">
                            {p.amount ? `$${Number(p.amount).toFixed(2)}` : '—'}
                          </td>
                          <td className="px-2 py-2.5 text-gray-500">
                            {p.platformFee ? `$${Number(p.platformFee).toFixed(2)}` : '—'}
                          </td>
                          <td className="px-2 py-2.5">
                            <span className={`text-[10px] px-2 py-0.5 rounded-full font-semibold ${p.status === 'paid' ? 'bg-emerald-500/10 text-emerald-600' : 'bg-gray-500/10 text-gray-500'}`}>
                              {p.status ? p.status.charAt(0).toUpperCase() + p.status.slice(1) : '—'}
                            </span>
                          </td>
                          <td className="px-2 py-2.5 text-gray-500">{fmtDate(p.createdAt)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {/* ── Section E: Reviews ── */}
            <div className="bg-white rounded-xl border border-[#F0E4D8] p-5">
              <h3 className="text-sm font-semibold text-[#2C3E50] mb-4 flex items-center gap-2">⭐ Reviews ({data.reviews.length})</h3>
              {data.reviews.length === 0 ? (
                <p className="text-sm text-gray-400">No reviews left.</p>
              ) : (
                <div className="space-y-3">
                  {data.reviews.map((r: any) => (
                    <div key={r.id} className="border border-[#F0E4D8] rounded-xl p-4">
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-sm font-semibold text-[#2C3E50]">
                          {'★'.repeat(Math.min(5, Math.max(1, Number(r.rating) || 0)))}
                          {'☆'.repeat(Math.max(0, 5 - Math.min(5, Math.max(1, Number(r.rating) || 0))))}
                        </span>
                        <span className="text-[10px] text-gray-400">{fmtDate(r.createdAt)}</span>
                      </div>
                      {r.comment && <p className="text-xs text-gray-600 leading-relaxed">{r.comment}</p>}
                      <p className="text-[10px] text-gray-400 mt-1">Provider ID: {r.providerId || '—'}</p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        ) : (
          <div className="p-6 text-center text-sm text-gray-400">Failed to load user details.</div>
        )}

        {/* ── Footer ── */}
        <div className="sticky bottom-0 bg-[#FFF8F0] border-t border-[#F0E4D8] px-6 py-4 flex justify-end">
          <button
            onClick={onClose}
            className="px-6 py-2.5 bg-[#E86A33] text-white text-sm font-semibold rounded-xl hover:bg-[#d55a24] transition-all"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

/* ── Provider Detail Modal ─────────────────────────────────────────── */

function ProviderDetailModal({
  provider,
  onClose,
}: {
  provider: ServiceProvider;
  onClose: () => void;
}) {
  // ── Financial tracking state ────────────────────────────────
  const [payments, setPayments] = useState<PaymentDoc[]>([]);
  const [paymentsLoading, setPaymentsLoading] = useState(true);
  const [dateRange, setDateRange] = useState<'30d' | 'month' | 'custom'>('30d');
  const [customStart, setCustomStart] = useState('');
  const [customEnd, setCustomEnd] = useState('');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkUpdating, setBulkUpdating] = useState(false);
  const PLATFORM_FEE_PCT = 0.10;

  const formatDate = (ts?: string) => {
    if (!ts) return '—';
    try { return new Date(ts).toLocaleDateString('en-GB', { year: 'numeric', month: 'long', day: 'numeric' }); } catch { return ts; }
  };

  // Fetch payments for this provider on mount
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        setPaymentsLoading(true);
        const all = await getAllPaymentsRest();
        const filtered = all.filter(p => p.providerId === provider.id);
        if (!cancelled) setPayments(filtered);
      } catch (err) {
        console.error('Failed to fetch provider payments:', err);
      } finally {
        if (!cancelled) setPaymentsLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [provider.id]);

  // ── Date range helpers ───────────────────────────────────────
  const now = new Date();
  const rangeStart = () => {
    if (dateRange === 'month') return new Date(now.getFullYear(), now.getMonth(), 1);
    if (dateRange === 'custom') {
      const s = customStart ? new Date(customStart + 'T00:00:00') : new Date(0);
      return isNaN(s.getTime()) ? new Date(0) : s;
    }
    const d = new Date(now);
    d.setDate(d.getDate() - 30);
    return d;
  };
  const rangeEnd = () => {
    if (dateRange === 'custom') {
      if (!customEnd) return now;
      const e = new Date(customEnd + 'T23:59:59');
      return isNaN(e.getTime()) ? now : e;
    }
    return now;
  };

  // Filter payments by date range
  const filteredPayments = payments.filter(p => {
    if (!p.createdAt) return false;
    const d = new Date(p.createdAt);
    return d >= rangeStart() && d <= rangeEnd();
  });

  // Metrics
  const grossRevenue = filteredPayments
    .filter(p => p.status === 'paid' || p.status === 'completed')
    .reduce((sum, p) => sum + (p.amount || 0), 0);
  const platformFees = grossRevenue * PLATFORM_FEE_PCT;

  // ── Toggle single checkbox ───────────────────────────────────
  const toggleId = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  // ── Select all currently filtered & visible payments ──────────
  const toggleSelectAll = () => {
    const allVisible = filteredPayments.map(p => p.id);
    const allSelected = allVisible.every(id => selectedIds.has(id));
    if (allSelected) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(allVisible));
    }
  };

  // ── Bulk fee collection ──────────────────────────────────────
  const handleBulkFeeCollect = async (collected: boolean) => {
    const ids = Array.from(selectedIds);
    if (ids.length === 0) return;
    setBulkUpdating(true);
    try {
      const { auth } = getFirebaseAuth();
      if (!auth?.currentUser) throw new Error('Not authenticated');
      const token = await auth.currentUser.getIdToken();
      const res = await fetch('/api/admin/payments/batch-fee-collect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ paymentIds: ids, collected }),
      });
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(`Batch update failed: ${res.status} — ${(errData as any).message || ''}`);
      }
      setPayments(prev =>
        prev.map(p => (ids.includes(p.id) ? { ...p, feeCollected: collected } : p)),
      );
      setSelectedIds(new Set());
    } catch (err) {
      console.error('Batch fee collect failed:', err);
    } finally {
      setBulkUpdating(false);
    }
  };

  // ── Single fee collection (inline toggle) ────────────────────
  const handleToggleFeeCollected = async (paymentId: string, current: boolean) => {
    try {
      const { auth } = getFirebaseAuth();
      if (!auth?.currentUser) throw new Error('Not authenticated');
      const token = await auth.currentUser.getIdToken();
      const res = await fetch('/api/admin/payments/batch-fee-collect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ paymentIds: [paymentId], collected: !current }),
      });
      if (!res.ok) throw new Error(`Toggle failed: ${res.status}`);
      setPayments(prev =>
        prev.map(p => (p.id === paymentId ? { ...p, feeCollected: !current } : p)),
      );
    } catch (err) {
      console.error('Failed to toggle feeCollected:', err);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4"
      onClick={onClose}
    >
      <div
        className="bg-[#FFF8F0] rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto border border-[#F0E4D8]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* ── Header ── */}
        <div className="sticky top-0 bg-[#FFF8F0] z-10 flex items-center justify-between px-6 py-5 border-b border-[#F0E4D8]">
          <h2 className="text-lg font-bold text-[#2C3E50] flex items-center gap-2">
            {provider.emoji || '🏪'} {provider.businessName || provider.name}
          </h2>
          <button
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center rounded-lg bg-white border border-[#F0E4D8] text-gray-400 hover:text-[#E86A33] hover:border-[#E86A33] transition-all text-lg"
          >
            ✕
          </button>
        </div>

        <div className="p-6 space-y-5">

          {/* ── Section A: Identity & Contact ── */}
          <div className="bg-white rounded-xl border border-[#F0E4D8] p-5">
            <h3 className="text-sm font-semibold text-[#2C3E50] mb-4 flex items-center gap-2">📇 Identity & Contact</h3>
            <div className="grid sm:grid-cols-2 gap-4 text-sm">
              <div className="sm:col-span-2">
                <span className="text-xs text-gray-400 block uppercase font-semibold tracking-wider">Business Name</span>
                <span className="text-[#2C3E50] font-semibold text-base">{provider.businessName || provider.name}</span>
              </div>
              <div>
                <span className="text-xs text-gray-400 block uppercase font-semibold tracking-wider">Provider ID</span>
                <span className="text-[#2C3E50] font-mono text-xs break-all">{provider.id}</span>
              </div>
              {provider._firestoreId && (
                <div>
                  <span className="text-xs text-gray-400 block uppercase font-semibold tracking-wider">Firestore Doc ID</span>
                  <span className="text-[#2C3E50] font-mono text-xs break-all">{provider._firestoreId}</span>
                </div>
              )}
              <div>
                <span className="text-xs text-gray-400 block uppercase font-semibold tracking-wider">Category</span>
                <span className="inline-block text-xs px-3 py-1 rounded-full bg-[#FFF0E0] text-[#E86A33] font-semibold">{provider.category}</span>
              </div>
              <div>
                <span className="text-xs text-gray-400 block uppercase font-semibold tracking-wider">Type</span>
                <span className="text-[#2C3E50]">{provider.type}</span>
              </div>
              {provider.email && (
                <div>
                  <span className="text-xs text-gray-400 block uppercase font-semibold tracking-wider">Email</span>
                  <a href={`mailto:${provider.email}`} className="text-[#E86A33] hover:underline">{provider.email}</a>
                </div>
              )}
              {provider.contactEmail && (
                <div>
                  <span className="text-xs text-gray-400 block uppercase font-semibold tracking-wider">Contact Email</span>
                  <a href={`mailto:${provider.contactEmail}`} className="text-[#E86A33] hover:underline">{provider.contactEmail}</a>
                </div>
              )}
              {provider.phone && (
                <div>
                  <span className="text-xs text-gray-400 block uppercase font-semibold tracking-wider">Phone</span>
                  <a href={`tel:${provider.phone}`} className="text-[#2C3E50] hover:text-[#E86A33]">{provider.phone}</a>
                </div>
              )}
              {provider.contactPhone && (
                <div>
                  <span className="text-xs text-gray-400 block uppercase font-semibold tracking-wider">Contact Phone</span>
                  <a href={`tel:${provider.contactPhone}`} className="text-[#2C3E50] hover:text-[#E86A33]">{provider.contactPhone}</a>
                </div>
              )}
            </div>
          </div>

          {/* ── Section B: Location & Details ── */}
          <div className="bg-white rounded-xl border border-[#F0E4D8] p-5">
            <h3 className="text-sm font-semibold text-[#2C3E50] mb-4 flex items-center gap-2">📍 Location & Details</h3>
            <div className="grid sm:grid-cols-2 gap-4 text-sm">
              {provider.location && (
                <div>
                  <span className="text-xs text-gray-400 block uppercase font-semibold tracking-wider">Location</span>
                  <span className="text-[#2C3E50]">{provider.location}</span>
                </div>
              )}
              <div>
                <span className="text-xs text-gray-400 block uppercase font-semibold tracking-wider">Rating</span>
                <span className="text-yellow-500 font-semibold">★ {provider.rating} <span className="text-gray-400 font-normal">({provider.reviews} reviews)</span></span>
              </div>
              <div>
                <span className="text-xs text-gray-400 block uppercase font-semibold tracking-wider">Price</span>
                <span className="text-[#2C3E50]">{provider.price}</span>
              </div>
              {provider.since && (
                <div className="sm:col-span-2">
                  <span className="text-xs text-gray-400 block uppercase font-semibold tracking-wider">Member Since</span>
                  <span className="text-[#2C3E50]">{formatDate(provider.since)}</span>
                </div>
              )}
              {provider.desc && (
                <div className="sm:col-span-2">
                  <span className="text-xs text-gray-400 block uppercase font-semibold tracking-wider">Description</span>
                  <p className="text-[#2C3E50] text-sm leading-relaxed">{provider.desc}</p>
                </div>
              )}
              {provider.googleMapsUrl && (
                <div className="sm:col-span-2">
                  <span className="text-xs text-gray-400 block uppercase font-semibold tracking-wider">Google Maps</span>
                  <a href={provider.googleMapsUrl} target="_blank" rel="noopener noreferrer" className="text-[#E86A33] hover:underline text-sm">Open in Google Maps →</a>
                </div>
              )}
            </div>
          </div>

          {/* ── Section C: Tags ── */}
          {provider.tags && provider.tags.length > 0 && (
            <div className="bg-white rounded-xl border border-[#F0E4D8] p-5">
              <h3 className="text-sm font-semibold text-[#2C3E50] mb-4 flex items-center gap-2">🏷️ Tags</h3>
              <div className="flex flex-wrap gap-2">
                {provider.tags.map((tag, i) => (
                  <span key={i} className="text-xs px-3 py-1.5 rounded-full bg-[#FFF0E0] text-[#2C3E50] font-medium">{tag}</span>
                ))}
              </div>
            </div>
          )}

          {/* ── Section D: Services Offered ── */}
          {provider.services && provider.services.length > 0 && (
            <div className="bg-white rounded-xl border border-[#F0E4D8] p-5">
              <h3 className="text-sm font-semibold text-[#2C3E50] mb-4 flex items-center gap-2">🛠️ Services Offered</h3>
              <div className="space-y-3">
                {provider.services.map((svc, i) => (
                  <div key={i} className="flex items-center justify-between border-b border-[#F0E4D8]/60 pb-2 last:border-0">
                    <div>
                      <span className="text-sm font-semibold text-[#2C3E50]">{svc.name}</span>
                      {svc.description && <p className="text-xs text-gray-500 mt-0.5">{svc.description}</p>}
                    </div>
                    <div className="text-right flex-shrink-0 ml-4">
                      <span className="text-sm font-bold text-[#E86A33]">{svc.price} {svc.currency || 'USD'}</span>
                      {svc.duration && <p className="text-[10px] text-gray-400">{svc.duration} min</p>}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ── Section E: Products ── */}
          {provider.products && provider.products.length > 0 && (
            <div className="bg-white rounded-xl border border-[#F0E4D8] p-5">
              <h3 className="text-sm font-semibold text-[#2C3E50] mb-4 flex items-center gap-2">📦 Products</h3>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                {provider.products.map((prod) => (
                  <div key={prod.id} className="border border-[#F0E4D8] rounded-xl p-3">
                    <h4 className="text-sm font-semibold text-[#2C3E50] truncate">{prod.name}</h4>
                    {prod.description && <p className="text-[10px] text-gray-500 mt-1 line-clamp-2">{prod.description}</p>}
                    <div className="flex items-center justify-between mt-2">
                      <span className="text-xs font-bold text-[#E86A33]">${prod.price.toFixed(2)} {prod.currency || 'USD'}</span>
                      <span className={`text-[10px] px-2 py-0.5 rounded-full font-semibold ${prod.inStock ? 'bg-emerald-500/10 text-emerald-600' : 'bg-gray-500/10 text-gray-500'}`}>
                        {prod.inStock ? 'In Stock' : 'Out'}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ── Section F: Social Media ── */}
          {provider.socialMedia && (
            <div className="bg-white rounded-xl border border-[#F0E4D8] p-5">
              <h3 className="text-sm font-semibold text-[#2C3E50] mb-4 flex items-center gap-2">🌐 Social Media</h3>
              <div className="flex flex-wrap gap-3">
                {provider.socialMedia.website && (
                  <a href={provider.socialMedia.website} target="_blank" rel="noopener noreferrer" className="text-sm text-[#E86A33] hover:underline flex items-center gap-1">
                    🌍 Website
                  </a>
                )}
                {provider.socialMedia.instagram && (
                  <a href={provider.socialMedia.instagram} target="_blank" rel="noopener noreferrer" className="text-sm text-[#E86A33] hover:underline flex items-center gap-1">
                    📷 Instagram
                  </a>
                )}
                {provider.socialMedia.facebook && (
                  <a href={provider.socialMedia.facebook} target="_blank" rel="noopener noreferrer" className="text-sm text-[#E86A33] hover:underline flex items-center gap-1">
                    👍 Facebook
                  </a>
                )}
                {provider.socialMedia.twitter && (
                  <a href={provider.socialMedia.twitter} target="_blank" rel="noopener noreferrer" className="text-sm text-[#E86A33] hover:underline flex items-center gap-1">
                    🐦 Twitter
                  </a>
                )}
              </div>
            </div>
          )}

          {/* ── Section G: Logo ── */}
          {provider.logoUrl && (
            <div className="bg-white rounded-xl border border-[#F0E4D8] p-5">
              <h3 className="text-sm font-semibold text-[#2C3E50] mb-4 flex items-center gap-2">🖼️ Logo</h3>
              <div className="w-24 h-24 rounded-xl border border-[#F0E4D8] overflow-hidden">
                <img src={provider.logoUrl} alt={`${provider.businessName || provider.name} logo`} className="w-full h-full object-cover" />
              </div>
            </div>
          )}

          {/* ── Section H: Financial Tracking ───────────────────────── */}
          <div className="bg-white rounded-xl border border-[#F0E4D8] p-5">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-semibold text-[#2C3E50] flex items-center gap-2">💰 Financial Tracking</h3>

              {/* Date Range Selector */}
              <div className="flex items-center gap-2 text-xs">
                <select
                  value={dateRange}
                  onChange={(e) => setDateRange(e.target.value as '30d' | 'month' | 'custom')}
                  className="border border-[#F0E4D8] rounded-lg px-3 py-1.5 bg-white text-[#2C3E50] font-medium focus:outline-none focus:ring-2 focus:ring-[#E86A33]/20"
                >
                  <option value="30d">Last 30 Days</option>
                  <option value="month">This Month</option>
                  <option value="custom">Custom</option>
                </select>
                {dateRange === 'custom' && (
                  <>
                    <input type="date" value={customStart} onChange={(e) => setCustomStart(e.target.value)}
                      className="border border-[#F0E4D8] rounded-lg px-2 py-1.5 bg-white text-[#2C3E50] focus:outline-none focus:ring-2 focus:ring-[#E86A33]/20" />
                    <span className="text-gray-400">→</span>
                    <input type="date" value={customEnd} onChange={(e) => setCustomEnd(e.target.value)}
                      className="border border-[#F0E4D8] rounded-lg px-2 py-1.5 bg-white text-[#2C3E50] focus:outline-none focus:ring-2 focus:ring-[#E86A33]/20" />
                  </>
                )}
              </div>
            </div>

            {paymentsLoading ? (
              <div className="animate-pulse space-y-3">
                <div className="h-16 bg-gray-200 rounded-xl" />
                <div className="h-16 bg-gray-100 rounded-xl" />
              </div>
            ) : (
              <>
                {/* Metrics Cards */}
                <div className="grid grid-cols-2 gap-4 mb-5">
                  <div className="bg-emerald-50 rounded-xl p-4 border border-emerald-100">
                    <span className="text-xs text-emerald-600 font-semibold uppercase tracking-wider">Gross Revenue</span>
                    <p className="text-2xl font-bold text-[#2C3E50] mt-1">
                      ${grossRevenue.toFixed(2)}
                    </p>
                    <span className="text-[10px] text-gray-400">
                      {filteredPayments.filter(p => p.status === 'paid' || p.status === 'completed').length} paid/{filteredPayments.length} total
                    </span>
                  </div>
                  <div className="bg-amber-50 rounded-xl p-4 border border-amber-100">
                    <span className="text-xs text-amber-600 font-semibold uppercase tracking-wider">Platform Fees ({(PLATFORM_FEE_PCT * 100).toFixed(0)}%)</span>
                    <p className="text-2xl font-bold text-[#2C3E50] mt-1">
                      ${platformFees.toFixed(2)}
                    </p>
                    <span className="text-[10px] text-gray-400">
                      {filteredPayments.filter(p => p.feeCollected).length}/{filteredPayments.length} collected
                    </span>
                  </div>
                </div>

                {/* Payment Table with Checkboxes */}
                <div>
                  <div className="flex items-center justify-between mb-3">
                    <h4 className="text-xs font-semibold text-gray-400 uppercase tracking-wider">
                      Payments in Period ({filteredPayments.length})
                    </h4>
                    {selectedIds.size > 0 && (
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] text-gray-400">{selectedIds.size} selected</span>
                        <button
                          onClick={() => handleBulkFeeCollect(true)}
                          disabled={bulkUpdating}
                          className="text-xs px-3 py-1.5 rounded-lg bg-emerald-500 text-white font-semibold hover:bg-emerald-600 disabled:opacity-50 transition-all"
                        >
                          {bulkUpdating ? '⏳ Updating...' : '✅ Mark as Fee Collected'}
                        </button>
                        <button
                          onClick={() => handleBulkFeeCollect(false)}
                          disabled={bulkUpdating}
                          className="text-xs px-3 py-1.5 rounded-lg bg-gray-500 text-white font-semibold hover:bg-gray-600 disabled:opacity-50 transition-all"
                        >
                          Mark as Pending
                        </button>
                      </div>
                    )}
                  </div>

                  {filteredPayments.length === 0 ? (
                    <p className="text-sm text-gray-400 py-4 text-center">No payments found for this period.</p>
                  ) : (
                    <div className="overflow-x-auto border border-[#F0E4D8] rounded-xl">
                      <table className="w-full text-xs">
                        <thead>
                          <tr className="bg-[#FFF8F0] border-b border-[#F0E4D8]">
                            <th className="px-3 py-3 w-10">
                              <input
                                type="checkbox"
                                checked={filteredPayments.length > 0 && filteredPayments.every(p => selectedIds.has(p.id))}
                                onChange={toggleSelectAll}
                                className="accent-[#E86A33] rounded"
                              />
                            </th>
                            <th className="text-left px-3 py-3 font-semibold text-gray-400 uppercase">Amount</th>
                            <th className="text-left px-3 py-3 font-semibold text-gray-400 uppercase">Status</th>
                            <th className="text-left px-3 py-3 font-semibold text-gray-400 uppercase">Fee</th>
                            <th className="text-left px-3 py-3 font-semibold text-gray-400 uppercase">Date</th>
                            <th className="px-3 py-3"></th>
                          </tr>
                        </thead>
                        <tbody>
                          {filteredPayments.map(p => (
                            <tr key={p.id} className={`border-b border-[#F0E4D8]/60 ${p.feeCollected ? 'bg-emerald-50/40' : ''}`}>
                              <td className="px-3 py-3">
                                <input
                                  type="checkbox"
                                  checked={selectedIds.has(p.id)}
                                  onChange={() => toggleId(p.id)}
                                  className="accent-[#E86A33] rounded"
                                />
                              </td>
                              <td className="px-3 py-3 text-[#2C3E50] font-medium">${(p.amount || 0).toFixed(2)}</td>
                              <td className="px-3 py-3">
                                <span className={`text-[10px] px-2 py-0.5 rounded-full font-semibold ${
                                  p.status === 'paid' || p.status === 'completed'
                                    ? 'bg-emerald-500/10 text-emerald-600'
                                    : 'bg-gray-500/10 text-gray-500'
                                }`}>
                                  {p.status ? p.status.charAt(0).toUpperCase() + p.status.slice(1) : '—'}
                                </span>
                              </td>
                              <td className="px-3 py-3 whitespace-nowrap">
                                <span className="text-[#2C3E50] font-medium text-xs">${((p.amount || 0) * 0.10).toFixed(2)}</span>{' '}
                                <span className={`text-[10px] px-2 py-0.5 rounded-full font-semibold ${
                                  p.feeCollected
                                    ? 'bg-emerald-500/10 text-emerald-600'
                                    : 'bg-amber-100 text-amber-700'
                                }`}>
                                  {p.feeCollected ? '✓ Collected' : '⏳ Pending'}
                                </span>
                              </td>
                              <td className="px-3 py-3 text-gray-500">{formatDate(p.createdAt)}</td>
                              <td className="px-3 py-3">
                                <button
                                  onClick={() => handleToggleFeeCollected(p.id, !!p.feeCollected)}
                                  className="text-[10px] px-2 py-1 rounded-lg border border-[#F0E4D8] hover:bg-[#FFF8F0] transition-all"
                                >
                                  {p.feeCollected ? '⏳ Mark Pending' : '✅ Collect'}
                                </button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              </>
            )}
          </div>

        </div>

        {/* ── Footer ── */}
        <div className="sticky bottom-0 bg-[#FFF8F0] border-t border-[#F0E4D8] px-6 py-4 flex justify-end">
          <button
            onClick={onClose}
            className="px-6 py-2.5 bg-[#E86A33] text-white text-sm font-semibold rounded-xl hover:bg-[#d55a24] transition-all"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
