'use client';

import React, { useEffect, useState, useCallback } from 'react';
import { onSnapshot, collection, query, where } from 'firebase/firestore';
import { deleteUser } from 'firebase/auth';
import { getFirestoreDb, getFirebaseAuth } from '@/lib/firebase';
import { useAuth } from '@/context/AuthContext';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useToast } from '@/components/Toast';
import {
  getUserPaymentsRest,
  getUserPetsRest,
  addPetRest,
  deletePetRest,
  getUserFavoritesRest,
  removeFavoriteRest,
  getUserReviewsRest,
  getAllProvidersRest,
  updateBookingRest,
  deleteUserAccountRest,
} from '@/lib/firestore-rest';
import type { BookingDoc, PaymentDoc, PetDoc, FavoriteDoc, ReviewDoc } from '@/lib/firestore-rest';
import type { ServiceProvider } from '@/lib/types';
import ProviderDashboard from './ProviderDashboard';

type Tab = 'overview' | 'bookings' | 'favorites' | 'profile' | 'reviews' | 'payments' | 'pets';

const statusColors: Record<string, string> = {
  pending: 'bg-amber-50 text-amber-700 border-amber-200',
  confirmed: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  completed: 'bg-emerald-500/10 text-emerald-600',
  cancelled: 'bg-rose-50 text-rose-700 border-rose-200',
  declined: 'bg-rose-50 text-rose-700 border-rose-200',
};

export default function DashboardPage() {
  const { user, firebaseUser, loading, updateProfile } = useAuth();
  const { showToast } = useToast();
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<Tab>('overview');
  const [profileName, setProfileName] = useState('');
  const [profilePhone, setProfilePhone] = useState('');
  const [profileLocation, setProfileLocation] = useState('');
  const [bookings, setBookings] = useState<BookingDoc[]>([]);
  const [bookingsLoading, setBookingsLoading] = useState(true);
  const [favorites, setFavorites] = useState<FavoriteDoc[]>([]);
  const [favoritesLoading, setFavoritesLoading] = useState(true);
  const [userReviews, setUserReviews] = useState<ReviewDoc[]>([]);
  const [reviewsLoading, setReviewsLoading] = useState(true);
  const [payments, setPayments] = useState<PaymentDoc[]>([]);
  const [paymentsLoading, setPaymentsLoading] = useState(true);
  const [pets, setPets] = useState<PetDoc[]>([]);
  const [petsLoading, setPetsLoading] = useState(true);
  // Providers list for cross-referencing IDs → business names
  const [providers, setProviders] = useState<ServiceProvider[]>([]);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleteConfirmText, setDeleteConfirmText] = useState('');
  const [deletingAccount, setDeletingAccount] = useState(false);
  const [petName, setPetName] = useState('');
  const [petType, setPetType] = useState('');
  const [petBreed, setPetBreed] = useState('');
  const [petAge, setPetAge] = useState('');
  const [petNotes, setPetNotes] = useState('');

  // ── Real-time bookings listener ──────────────────────────────────
  useEffect(() => {
    if (loading || !user) return;
    const uid = firebaseUser?.uid || user.id;
    setBookingsLoading(true);
    const db = getFirestoreDb();
    if (!db) {
      setBookingsLoading(false);
      return;
    }
    const q = query(collection(db, 'bookings'), where('userId', '==', uid));
    const unsub = onSnapshot(
      q,
      (snapshot) => {
        const list: BookingDoc[] = snapshot.docs.map((d) => ({
          id: d.id,
          ...d.data(),
        })) as unknown as BookingDoc[];
        setBookings(list);
        setBookingsLoading(false);
      },
      (err) => {
        console.error('Bookings onSnapshot error:', err);
        setBookingsLoading(false);
      },
    );
    return () => unsub();
  }, [user, firebaseUser, loading]);

  const fetchFavorites = useCallback(async () => {
    if (!user || user.role === 'provider') return;
    const uid = firebaseUser?.uid || user.id;
    setFavoritesLoading(true);
    try {
      const list = await getUserFavoritesRest(uid);
      setFavorites(list);
    } catch (err) {
      console.error('Failed to fetch favorites:', err);
    } finally {
      setFavoritesLoading(false);
    }
  }, [user, firebaseUser]);

  const fetchReviews = useCallback(async () => {
    if (!user || user.role === 'provider') return;
    const uid = firebaseUser?.uid || user.id;
    setReviewsLoading(true);
    try {
      const list = await getUserReviewsRest(uid);
      setUserReviews(list);
    } catch (err) {
      console.error('Failed to fetch reviews:', err);
    } finally {
      setReviewsLoading(false);
    }
  }, [user, firebaseUser]);

  const fetchPayments = useCallback(async () => {
    if (!user) return;
    const uid = firebaseUser?.uid || user.id;
    setPaymentsLoading(true);
    try {
      const role = user.role || 'owner';
      const list = await getUserPaymentsRest(uid, role);
      setPayments(list);
    } catch (err) {
      console.error('Failed to fetch payments:', err);
    } finally {
      setPaymentsLoading(false);
    }
  }, [user, firebaseUser]);

  const fetchPets = useCallback(async () => {
    if (!user || user.role === 'provider') return;
    const uid = firebaseUser?.uid || user.id;
    setPetsLoading(true);
    try {
      const list = await getUserPetsRest(uid);
      setPets(list);
    } catch (err) {
      console.error('Failed to fetch pets:', err);
    } finally {
      setPetsLoading(false);
    }
  }, [user, firebaseUser]);

  const fetchProviders = useCallback(async () => {
    try {
      const list = await getAllProvidersRest();
      setProviders(list);
    } catch (err) {
      console.error('Failed to fetch providers:', err);
    }
  }, []);

  // Derived helper: resolve providerId to a display name
  const getProviderDisplayName = useCallback((providerId: string, fallbackName?: string): string => {
    const prov = providers.find(p => p.id === providerId);
    return prov ? (prov.businessName || prov.name) : (fallbackName || providerId);
  }, [providers]);

  // Cancel a booking (owner-facing)
  const handleCancelBooking = async (bookingId: string) => {
    try {
      await updateBookingRest(bookingId, { status: 'cancelled' } as Partial<BookingDoc>);
      setBookings(prev => prev.map(b => b.id === bookingId ? { ...b, status: 'cancelled' } : b));
      showToast('✅ Booking cancelled.', 'success');
    } catch {
      showToast('❌ Failed to cancel booking.', 'error');
    }
  };

  useEffect(() => {
    if (!loading && !user) {
      router.push('/login');
    }
    if (user) {
      setProfileName(user.name || '');
      setProfilePhone(user.phone || '');
      setProfileLocation(user.location || '');
    }
  }, [user, loading, router]);

  useEffect(() => {
    if (loading || !user) return;
    if (user.role === 'provider') {
      // Providers only need their payments and the full provider listing
      fetchPayments();
      fetchProviders();
      return;
    }
    fetchFavorites();
    fetchReviews();
    fetchPayments();
    fetchPets();
    fetchProviders();
  }, [user, loading, fetchFavorites, fetchReviews, fetchPayments, fetchPets, fetchProviders]);

  if (loading || !user) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#FDFBF7]">
        <div className="h-12 w-12 animate-spin rounded-full border-4 border-[#E86A33] border-t-transparent" />
      </div>
    );
  }

  // ── Service Provider Dashboard ────────────────────────────────
  if (user.role === 'provider') {
    return (
      <div className="pt-[76px] min-h-screen bg-[#FFF8F0]">
        <div className="max-w-[1200px] mx-auto px-6 py-8">
          <ProviderDashboard userEmail={user.email} userId={user.id} userRole={user.role} />
        </div>
      </div>
    );
  }

  const tabs: { key: Tab; icon: string; label: string }[] = [
    { key: 'overview', icon: '📊', label: 'Overview' },
    { key: 'bookings', icon: '📅', label: 'My Bookings' },
    { key: 'favorites', icon: '❤️', label: 'Favorites' },
    { key: 'pets', icon: '🐾', label: 'My Pets' },
    { key: 'profile', icon: '👤', label: 'My Profile' },
    { key: 'reviews', icon: '⭐', label: 'Reviews' },
    { key: 'payments', icon: '💳', label: 'Payments' },
  ];

  const upcomingBookings = bookings.filter(b => b.status === 'pending' || b.status === 'confirmed');
  const completedBookingsCount = bookings.filter(b => b.status === 'completed').length;

  const handleProfileUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (profileName.trim()) {
      try {
        await updateProfile({ name: profileName.trim(), phone: profilePhone.trim(), location: profileLocation.trim() });
        showToast('✅ Profile updated successfully!', 'success');
      } catch {
        showToast('❌ Failed to save profile.', 'error');
      }
    }
  };

  // ── Delete account ──────────────────────────────────────────────
  const handleDeleteAccount = async () => {
    const uid = firebaseUser?.uid || user.id;
    setDeletingAccount(true);
    try {
      const result = await deleteUserAccountRest(uid, user.id, user.role);

      // 1. Destroy Firebase Auth user record (if signed in via Firebase)
      if (firebaseUser) {
        try {
          const { auth } = getFirebaseAuth();
          if (auth && auth.currentUser) {
            await deleteUser(auth.currentUser);
          }
        } catch {
          // Auth token may be stale or user already deleted — proceed with local cleanup
        }
      }

      // 2. Clear local auth session
      const { localAuth } = await import('@/lib/localAuth');
      localAuth.logout();

      showToast(
        `✅ Account deleted: ${result.deletedBookings} booking(s), ${result.deletedPayments} payment(s), ` +
        `${result.deletedReviews} review(s), ${result.deletedFavorites} favorite(s), ` +
        `${result.deletedPets} pet(s). ${result.recalculatedProviders} provider(s) updated.`,
        'success',
      );

      // 3. Redirect to home
      window.location.href = '/';
    } catch (error) {
      console.error('Failed to delete account:', error);
      showToast('❌ Failed to delete account. Please try again or contact support.', 'error');
      setDeletingAccount(false);
    }
  };

  const handleAddPet = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!petName.trim() || !petType) {
      showToast('⚠️ Please enter a name and select a type for your pet.', 'error');
      return;
    }
    const uid = firebaseUser?.uid || user.id;
    try {
      await addPetRest({
        userId: uid,
        name: petName.trim(),
        type: petType,
        breed: petBreed.trim(),
        age: petAge.trim(),
        notes: petNotes.trim(),
      });
      showToast('🐾 Pet added successfully!', 'success');
      setPetName('');
      setPetType('');
      setPetBreed('');
      setPetAge('');
      setPetNotes('');
      fetchPets();
    } catch (err) {
      console.error('Failed to add pet:', err);
      showToast(`❌ ${err instanceof Error ? err.message : 'Failed to add pet.'}`, 'error');
    }
  };

  const handleRemovePet = async (petId: string, petName: string) => {
    try {
      const uid = firebaseUser?.uid || user.id;
      await deletePetRest(petId, uid);
      setPets(prev => prev.filter(p => p.id !== petId));
      showToast(`🗑️ "${petName}" removed.`, 'success');
    } catch (err) {
      console.error('Failed to remove pet:', err);
      showToast(`❌ ${err instanceof Error ? err.message : 'Failed to remove pet.'}`, 'error');
    }
  };

  const serviceIcons: Record<string, string> = {
    walking: '🐕',
    vet: '🏥',
    hotel: '🏨',
    sitting: '🛋️',
    grooming: '✂️',
    shop: '🛍️',
  };

  const serviceLabels: Record<string, string> = {
    walking: 'Dog Walking',
    vet: 'Vet Visit',
    hotel: 'Dog Hotel',
    sitting: 'Pet Sitting',
    grooming: 'Grooming',
    shop: 'Pet Shop',
  };

  return (
    <div className="pt-[76px] min-h-screen bg-[#FFF8F0]">
      <div className="max-w-[1200px] mx-auto flex">
        {/* Sidebar */}
        <aside className="hidden md:block w-[260px] bg-white border-r border-[#F0E4D8] p-8 sticky top-[76px] h-[calc(100vh-76px)] overflow-y-auto">
          <div className="text-center pb-6 border-b border-[#F0E4D8] mb-6">
            <div className="w-16 h-16 rounded-full bg-[#FFF0E0] flex items-center justify-center text-2xl mx-auto mb-3">
              {'🐾'}
            </div>
            <h4 className="text-sm font-semibold text-[#2C3E50]">{user.name}</h4>
            <p className="text-xs text-gray-400">{'Pet Owner'}</p>
          </div>
          <nav className="flex flex-col gap-1">
            {tabs.map(tab => (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                className={`flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-all text-left ${
                  activeTab === tab.key ? 'bg-orange-500/10 text-[#E86A33]' : 'text-gray-500 hover:bg-[#FFF8F0] hover:text-gray-700'
                }`}
              >
                <span className="w-5 text-center">{tab.icon}</span>
                {tab.label}
              </button>
            ))}
            {user?.role === 'admin' && (
              <Link href="/admin" className="flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium text-gray-500 hover:bg-[#FFF8F0] hover:text-gray-700 mt-5">
                <span className="w-5 text-center">⚙️</span>
                Admin Panel
              </Link>
            )}
          </nav>
        </aside>

        {/* Main */}
        <main className="flex-1 p-8">
          {activeTab === 'overview' && (
            <>
              <div className="flex justify-between items-center mb-8 flex-wrap gap-4">
                <div>
                  <h2 className="text-2xl font-heading text-[#2C3E50]">Welcome back, {user.name?.split(' ')[0] || 'there'}! 👋</h2>
                  <p className="text-sm text-gray-500">Here&apos;s what&apos;s happening with your pets.</p>
                </div>
                <Link href="/services" className="bg-[#E86A33] hover:bg-[#D4552A] text-white text-sm font-semibold px-5 py-2.5 rounded-full transition-all">
                  Book a Service
                </Link>
              </div>

              {/* Stat cards skeleton */}
              {bookingsLoading && favoritesLoading ? (
                <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-5 mb-10">
                  {[1, 2, 3, 4].map(i => (
                    <div key={i} className="bg-white border border-[#F0E4D8] rounded-2xl p-6 animate-pulse">
                      <div className="w-12 h-12 bg-gray-200 rounded-xl mb-4" />
                      <div className="h-8 w-16 bg-gray-200 rounded-lg mb-2" />
                      <div className="h-4 w-32 bg-gray-100 rounded-lg" />
                    </div>
                  ))}
                </div>
              ) : (
                <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-5 mb-10">
                  {[
                    { icon: '📅', bg: 'bg-orange-500/12', value: String(upcomingBookings.length), label: 'Upcoming Bookings' },
                    { icon: '✅', bg: 'bg-emerald-500/12', value: String(completedBookingsCount), label: 'Completed Services' },
                    { icon: '❤️', bg: 'bg-yellow-500/12', value: String(favorites.length), label: 'Saved Favorites' },
                    { icon: '⭐', bg: 'bg-purple-500/12', value: '4.9', label: 'Average Rating' },
                  ].map((s, i) => (
                    <div key={i} className="bg-white border border-[#F0E4D8] rounded-2xl p-6 hover:shadow-md hover:-translate-y-1 transition-all">
                      <div className={`w-12 h-12 ${s.bg} rounded-xl flex items-center justify-center text-lg mb-4`}>{s.icon}</div>
                      <h3 className="text-2xl font-heading text-[#2C3E50]">{s.value}</h3>
                      <p className="text-sm text-gray-400">{s.label}</p>
                    </div>
                  ))}
                </div>
              )}

              <div className="bg-white border border-[#F0E4D8] rounded-2xl p-8">
                <h3 className="text-base font-heading text-[#2C3E50] mb-5">📅 Upcoming Bookings</h3>
                {bookingsLoading ? (
                  <div className="flex flex-col gap-4">
                    {[1, 2].map(i => (
                      <div key={i} className="flex justify-between items-center p-4 bg-[#FFF8F0] rounded-xl animate-pulse">
                        <div className="h-4 w-48 bg-gray-200 rounded-lg" />
                        <div className="h-4 w-32 bg-gray-100 rounded-lg" />
                        <div className="h-6 w-20 bg-gray-200 rounded-full" />
                      </div>
                    ))}
                  </div>
                ) : upcomingBookings.length === 0 ? (
                  <div className="text-center py-10 text-gray-400 text-sm">No upcoming bookings. <Link href="/services" className="text-[#E86A33] font-semibold">Book a service</Link></div>
                ) : (
                  <div className="flex flex-col gap-4">
                    {upcomingBookings.map(b => (
                      <div key={b.id} className="flex justify-between items-center p-4 bg-[#FFF8F0] rounded-xl">
                        <span className="text-sm font-semibold text-[#2C3E50]">{serviceIcons[b.serviceType] || '🐾'} {serviceLabels[b.serviceType] || b.serviceType} with {getProviderDisplayName(b.providerId, b.providerBusinessName || b.providerName)}</span>
                        <span className="text-sm text-gray-500">{b.date?.split("-").reverse().join("/")}{b.time ? `, ${b.time}` : ''}</span>
                        <span className={`text-xs px-3 py-1.5 rounded-full font-semibold ${statusColors[b.status] || 'bg-gray-500/10 text-gray-500'}`}>{b.status.charAt(0).toUpperCase() + b.status.slice(1)}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </>
          )}

          {activeTab === 'bookings' && (
            <>
              <div className="flex justify-between items-center mb-8">
                <h2 className="text-2xl font-heading text-[#2C3E50]">📅 My Bookings</h2>
                <Link href="/services" className="bg-[#E86A33] hover:bg-[#D4552A] text-white text-sm font-semibold px-5 py-2.5 rounded-full transition-all">+ New Booking</Link>
              </div>
              {bookingsLoading ? (
                <div className="bg-white border border-[#F0E4D8] rounded-2xl overflow-hidden animate-pulse">
                  <div className="p-5 border-b border-[#F0E4D8]">
                    <div className="h-4 w-32 bg-gray-200 rounded-lg" />
                  </div>
                  {[1, 2, 3, 4].map(i => (
                    <div key={i} className="flex gap-4 px-5 py-4 border-b border-[#F0E4D8]">
                      <div className="h-4 w-36 bg-gray-200 rounded-lg" />
                      <div className="h-4 w-28 bg-gray-100 rounded-lg" />
                      <div className="h-4 w-28 bg-gray-100 rounded-lg" />
                      <div className="h-6 w-20 bg-gray-200 rounded-full" />
                      <div className="h-4 w-12 bg-gray-100 rounded-lg" />
                    </div>
                  ))}
                </div>
              ) : bookings.length === 0 ? (
                <div className="bg-white border border-[#F0E4D8] rounded-2xl p-10 text-center">
                  <div className="text-4xl mb-4 opacity-50">📅</div>
                  <h3 className="text-lg font-heading text-[#2C3E50] mb-2">No bookings yet</h3>
                  <p className="text-sm text-gray-400 mb-5">Start by booking a service from our trusted providers.</p>
                  <Link href="/services" className="bg-[#E86A33] hover:bg-[#D4552A] text-white text-sm font-semibold px-6 py-3 rounded-full transition-all">Browse Services</Link>
                </div>
              ) : (
                <div className="bg-white border border-[#F0E4D8] rounded-2xl overflow-hidden">
                  <table className="w-full">
                    <thead>
                      <tr className="border-b border-[#F0E4D8]">
                        {['Service', 'Provider', 'Date', 'Status', 'Price', ''].map(h => (
                          <th key={h} className="text-left px-5 py-4 text-xs font-semibold text-gray-400 uppercase tracking-wider">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {bookings.map(b => (
                        <tr key={b.id} className="border-b border-[#F0E4D8] hover:bg-[#FFF8F0]">
                          <td className="px-5 py-4 text-sm"><strong className="text-[#2C3E50]">{serviceIcons[b.serviceType] || '🐾'} {serviceLabels[b.serviceType] || b.serviceType}</strong></td>
                          <td className="px-5 py-4 text-sm text-gray-500">{getProviderDisplayName(b.providerId, b.providerBusinessName || b.providerName)}</td>
                          <td className="px-5 py-4 text-sm text-gray-500">
                            <div>{b.date?.split("-").reverse().join("/")}{b.time ? `, ${b.time}` : ''}</div>
                            <div className="text-[10px] text-gray-400 mt-0.5">Ordered: {b.createdAt ? new Date(b.createdAt).toLocaleString('en-GB') : 'N/A'}</div>
                          </td>
                          <td className="px-5 py-4 text-sm">
                            <span className={`text-xs px-3 py-1.5 rounded-full font-semibold ${statusColors[b.status] || 'bg-gray-500/10 text-gray-500'}`}>
                              {b.status.charAt(0).toUpperCase() + b.status.slice(1)}
                            </span>
                          </td>
                          <td className="px-5 py-4 text-sm text-gray-500">${b.total || b.price || 0}</td>
                          <td className="px-5 py-4 text-sm">
                            {(b.status === 'pending' || b.status === 'confirmed') && (
                              <button onClick={() => handleCancelBooking(b.id)} className="text-xs px-3 py-1.5 rounded-full font-semibold bg-rose-50 text-rose-700 border border-rose-200 hover:bg-rose-100 transition-all">
                                Cancel
                              </button>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </>
          )}

          {activeTab === 'favorites' && (
            <>
              <div className="flex justify-between items-center mb-8">
                <h2 className="text-2xl font-heading text-[#2C3E50]">❤️ Favorite Providers</h2>
              </div>
              {favoritesLoading ? (
                <div className="grid sm:grid-cols-2 gap-6">
                  {[1, 2, 3, 4].map(i => (
                    <div key={i} className="bg-white rounded-2xl p-6 border border-[#F0E4D8] animate-pulse flex gap-4 items-start">
                      <div className="w-14 h-14 rounded-full bg-gray-200 flex-shrink-0" />
                      <div className="flex-1">
                        <div className="h-4 w-32 bg-gray-200 rounded-lg mb-2" />
                        <div className="h-3 w-20 bg-gray-100 rounded-lg mb-3" />
                        <div className="flex gap-2">
                          <div className="h-7 w-20 bg-gray-200 rounded-full" />
                          <div className="h-7 w-16 bg-gray-100 rounded-full" />
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : favorites.length === 0 ? (
                <div className="bg-white border border-[#F0E4D8] rounded-2xl p-10 text-center">
                  <div className="text-4xl mb-4 opacity-50">❤️</div>
                  <h3 className="text-lg font-heading text-[#2C3E50] mb-2">No favorites yet</h3>
                  <p className="text-sm text-gray-400 mb-5">Save your favorite providers for quick access.</p>
                  <Link href="/services" className="bg-[#E86A33] hover:bg-[#D4552A] text-white text-sm font-semibold px-6 py-3 rounded-full transition-all">Browse Providers</Link>
                </div>
              ) : (
                <div className="grid sm:grid-cols-2 gap-6">
                  {favorites.map(fav => (
                    <div key={fav.id} className="bg-white rounded-2xl p-6 border border-[#F0E4D8] hover:shadow-md transition-all flex gap-4 items-start">
                      <div className="w-14 h-14 rounded-full bg-[#FFF0E0] flex items-center justify-center text-lg flex-shrink-0">{fav.emoji}</div>
                      <div className="flex-1 min-w-0">
                        <h3 className="text-sm font-semibold text-[#2C3E50]">{getProviderDisplayName(fav.providerId, fav.providerName)}</h3>
                        <div className="text-yellow-500 text-xs mb-1">{'★'.repeat(Math.floor(fav.rating))} {fav.rating}</div>
                        <p className="text-xs text-gray-500 mb-3">{fav.category}</p>
                        <div className="flex gap-2">
                          <Link
                            href={`/provider/${fav.providerId}`}
                            className="text-xs px-3 py-1.5 bg-[#E86A33] text-white rounded-full font-semibold hover:bg-[#D4552A] transition-all"
                          >
                            View Profile
                          </Link>
                          <button
                            onClick={async () => {
                              try {
                                const uid = firebaseUser?.uid || user.id;
                                await removeFavoriteRest(fav.id, uid);
                                setFavorites(prev => prev.filter(f => f.id !== fav.id));
                                showToast('⭐ Removed from favorites.', 'success');
                              } catch (err) {
                                console.error('Failed to remove favorite:', err);
                                showToast(`❌ ${err instanceof Error ? err.message : 'Failed to remove favorite.'}`, 'error');
                              }
                            }}
                            className="text-xs px-3 py-1.5 border border-red-200 text-red-400 rounded-full font-semibold hover:bg-red-50 transition-all"
                          >
                            Remove
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}

          {activeTab === 'pets' && (
            <>
              <div className="flex justify-between items-center mb-8">
                <h2 className="text-2xl font-heading text-[#2C3E50]">🐾 My Pets</h2>
                <span className="text-sm text-gray-400">{pets.length} pet{pets.length !== 1 ? 's' : ''}</span>
              </div>

              {/* Add Pet Form */}
              <div className="bg-white border border-[#F0E4D8] rounded-2xl p-8 mb-8 max-w-[600px]">
                <h3 className="text-base font-semibold text-[#2C3E50] mb-5">➕ Add a New Pet</h3>
                <form onSubmit={handleAddPet}>
                  <div className="grid sm:grid-cols-2 gap-4 mb-4">
                    <div>
                      <label className="block text-sm font-semibold text-[#2C3E50] mb-2">Pet Name *</label>
                      <input type="text" value={petName} onChange={e => setPetName(e.target.value)} placeholder="Max" className="w-full px-4 py-3 border-2 border-[#F0E4D8] rounded-xl bg-[#FFF8F0] focus:border-[#E86A33] focus:bg-white focus:outline-none focus:ring-4 focus:ring-orange-500/10 transition-all text-sm" />
                    </div>
                    <div>
                      <label className="block text-sm font-semibold text-[#2C3E50] mb-2">Type *</label>
                      <select value={petType} onChange={e => setPetType(e.target.value)} className="w-full px-4 py-3 border-2 border-[#F0E4D8] rounded-xl bg-[#FFF8F0] focus:border-[#E86A33] focus:bg-white focus:outline-none focus:ring-4 focus:ring-orange-500/10 transition-all text-sm">
                        <option value="">Select...</option>
                        <option value="Dog">🐕 Dog</option>
                        <option value="Cat">🐈 Cat</option>
                        <option value="Bird">🐦 Bird</option>
                        <option value="Rabbit">🐇 Rabbit</option>
                        <option value="Fish">🐟 Fish</option>
                        <option value="Other">🐾 Other</option>
                      </select>
                    </div>
                  </div>
                  <div className="grid sm:grid-cols-2 gap-4 mb-4">
                    <div>
                      <label className="block text-sm font-semibold text-[#2C3E50] mb-2">Breed</label>
                      <input type="text" value={petBreed} onChange={e => setPetBreed(e.target.value)} placeholder="Golden Retriever" className="w-full px-4 py-3 border-2 border-[#F0E4D8] rounded-xl bg-[#FFF8F0] focus:border-[#E86A33] focus:bg-white focus:outline-none focus:ring-4 focus:ring-orange-500/10 transition-all text-sm" />
                    </div>
                    <div>
                      <label className="block text-sm font-semibold text-[#2C3E50] mb-2">Age</label>
                      <input type="text" value={petAge} onChange={e => setPetAge(e.target.value)} placeholder="2 years" className="w-full px-4 py-3 border-2 border-[#F0E4D8] rounded-xl bg-[#FFF8F0] focus:border-[#E86A33] focus:bg-white focus:outline-none focus:ring-4 focus:ring-orange-500/10 transition-all text-sm" />
                    </div>
                  </div>
                  <div className="mb-5">
                    <label className="block text-sm font-semibold text-[#2C3E50] mb-2">Dietary &amp; Medical Notes</label>
                    <textarea value={petNotes} onChange={e => setPetNotes(e.target.value)} rows={3} placeholder="Any allergies, medications, or special instructions..." className="w-full px-4 py-3 border-2 border-[#F0E4D8] rounded-xl bg-[#FFF8F0] focus:border-[#E86A33] focus:bg-white focus:outline-none focus:ring-4 focus:ring-orange-500/10 transition-all text-sm resize-vertical" />
                  </div>
                  <button type="submit" className="bg-[#E86A33] hover:bg-[#D4552A] text-white font-semibold px-6 py-3 rounded-full text-sm transition-all">Add Pet</button>
                </form>
              </div>

              {/* Pet Cards Grid */}
              {petsLoading ? (
                <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
                  {[1, 2, 3].map(i => (
                    <div key={i} className="bg-white border border-[#F0E4D8] rounded-2xl p-6 animate-pulse">
                      <div className="flex justify-between items-start mb-4">
                        <div className="w-12 h-12 rounded-full bg-gray-200" />
                        <div className="h-4 w-14 bg-gray-100 rounded-lg" />
                      </div>
                      <div className="h-5 w-24 bg-gray-200 rounded-lg mb-3" />
                      <div className="flex gap-2 mb-3">
                        <div className="h-5 w-14 bg-gray-100 rounded-full" />
                        <div className="h-5 w-20 bg-gray-100 rounded-full" />
                      </div>
                      <div className="h-3 w-full bg-gray-100 rounded-lg" />
                    </div>
                  ))}
                </div>
              ) : pets.length === 0 ? (
                <div className="bg-white border border-[#F0E4D8] rounded-2xl p-10 text-center">
                  <div className="text-4xl mb-4 opacity-50">🐾</div>
                  <h3 className="text-lg font-heading text-[#2C3E50] mb-2">No pets yet</h3>
                  <p className="text-sm text-gray-400">Add your furry (or not-so-furry) friends above.</p>
                </div>
              ) : (
                <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
                  {pets.map(pet => (
                    <div key={pet.id} className="bg-white border border-[#F0E4D8] rounded-2xl p-6 hover:shadow-md transition-all">
                      <div className="flex justify-between items-start mb-4">
                        <div className="w-12 h-12 rounded-full bg-[#FFF0E0] flex items-center justify-center text-lg">
                          {pet.type === 'Dog' ? '🐕' : pet.type === 'Cat' ? '🐈' : pet.type === 'Bird' ? '🐦' : pet.type === 'Rabbit' ? '🐇' : pet.type === 'Fish' ? '🐟' : '🐾'}
                        </div>
                        <button onClick={() => handleRemovePet(pet.id, pet.name)} className="text-xs text-red-400 hover:text-red-600 hover:bg-red-50 px-2 py-1 rounded-lg transition-all">✕ Remove</button>
                      </div>
                      <h3 className="text-base font-semibold text-[#2C3E50]">{pet.name}</h3>
                      <div className="flex flex-wrap gap-2 mt-2 mb-3">
                        <span className="text-xs px-2.5 py-1 bg-orange-500/10 text-[#E86A33] rounded-full font-medium">{pet.type}</span>
                        {pet.breed && <span className="text-xs px-2.5 py-1 bg-blue-500/10 text-blue-500 rounded-full font-medium">{pet.breed}</span>}
                        {pet.age && <span className="text-xs px-2.5 py-1 bg-purple-500/10 text-purple-500 rounded-full font-medium">{pet.age}</span>}
                      </div>
                      {pet.notes && <p className="text-xs text-gray-400 mt-2 line-clamp-2">{pet.notes}</p>}
                    </div>
                  ))}
                </div>
              )}
            </>
          )}

          {activeTab === 'profile' && (
            <>
              <h2 className="text-2xl font-heading text-[#2C3E50] mb-8">👤 My Profile</h2>
              <div className="bg-white border border-[#F0E4D8] rounded-2xl p-10 max-w-[600px]">
                <form onSubmit={handleProfileUpdate}>
                  <div className="mb-5">
                    <label className="block text-sm font-semibold text-[#2C3E50] mb-2">Full Name</label>
                    <input type="text" value={profileName} onChange={(e) => setProfileName(e.target.value)}
                      className="w-full px-4 py-3 border-2 border-[#F0E4D8] rounded-xl bg-[#FFF8F0] focus:border-[#E86A33] focus:bg-white focus:outline-none focus:ring-4 focus:ring-orange-500/10 transition-all text-sm" />
                  </div>
                  <div className="mb-5">
                    <label className="block text-sm font-semibold text-[#2C3E50] mb-2">Email</label>
                    <input type="email" value={user.email} disabled className="w-full px-4 py-3 border-2 border-[#F0E4D8] rounded-xl bg-gray-50 text-sm opacity-60 cursor-not-allowed" />
                  </div>
                  <div className="mb-5">
                    <label className="block text-sm font-semibold text-[#2C3E50] mb-2">Phone Number</label>
                    <input type="tel" value={profilePhone} onChange={(e) => setProfilePhone(e.target.value)} placeholder="+1 (555) 000-0000" className="w-full px-4 py-3 border-2 border-[#F0E4D8] rounded-xl bg-[#FFF8F0] focus:border-[#E86A33] focus:bg-white focus:outline-none focus:ring-4 focus:ring-orange-500/10 transition-all text-sm" />
                  </div>
                  <div className="mb-5">
                    <label className="block text-sm font-semibold text-[#2C3E50] mb-2">Location</label>
                    <input type="text" value={profileLocation} onChange={(e) => setProfileLocation(e.target.value)} placeholder="City, State" className="w-full px-4 py-3 border-2 border-[#F0E4D8] rounded-xl bg-[#FFF8F0] focus:border-[#E86A33] focus:bg-white focus:outline-none focus:ring-4 focus:ring-orange-500/10 transition-all text-sm" />
                  </div>
                  <button type="submit" className="bg-[#E86A33] hover:bg-[#D4552A] text-white font-semibold px-6 py-3 rounded-full text-sm transition-all">Save Changes</button>
                </form>

                {/* ── Danger Zone: Delete Account ────────────────────── */}
                <div className="mt-12 pt-8 border-t-2 border-rose-100">
                  <h3 className="text-lg font-heading text-rose-600 mb-2">⚠️ Danger Zone</h3>
                  <p className="text-sm text-gray-500 mb-4">
                    Permanently delete your account and all associated data. This action
                    cannot be undone.
                  </p>
                  <button
                    onClick={() => setShowDeleteConfirm(true)}
                    disabled={deletingAccount}
                    className="bg-white hover:bg-rose-50 text-rose-600 font-semibold px-6 py-3 rounded-full border-2 border-rose-200 text-sm transition-all disabled:opacity-50"
                  >
                    Delete My Account
                  </button>
                </div>

                {/* ── Confirmation Modal ──────────────────────────────── */}
                {showDeleteConfirm && (
                  <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
                    <div className="bg-white rounded-2xl p-8 max-w-md w-full mx-4 shadow-2xl">
                      <h3 className="text-xl font-heading text-rose-600 mb-3">Delete Your Account?</h3>
                      <p className="text-sm text-gray-600 mb-4">
                        This will permanently remove your profile, pets, bookings, payments,
                        reviews, and favorites. Your data cannot be recovered.
                      </p>
                      <p className="text-sm font-semibold text-[#2C3E50] mb-2">
                        Type <span className="font-mono text-rose-600">DELETE</span> to confirm:
                      </p>
                      <input
                        type="text"
                        value={deleteConfirmText}
                        onChange={(e) => setDeleteConfirmText(e.target.value)}
                        placeholder="Type DELETE"
                        className="w-full px-4 py-3 border-2 border-[#F0E4D8] rounded-xl bg-[#FFF8F0] focus:border-rose-400 focus:bg-white focus:outline-none focus:ring-4 focus:ring-rose-500/10 transition-all text-sm mb-4"
                      />
                      <div className="flex gap-3">
                        <button
                          onClick={() => {
                            setShowDeleteConfirm(false);
                            setDeleteConfirmText('');
                          }}
                          disabled={deletingAccount}
                          className="flex-1 bg-gray-100 hover:bg-gray-200 text-gray-700 font-semibold px-4 py-3 rounded-full text-sm transition-all disabled:opacity-50"
                        >
                          Cancel
                        </button>
                        <button
                          onClick={() => {
                            setShowDeleteConfirm(false);
                            setDeleteConfirmText('');
                            handleDeleteAccount();
                          }}
                          disabled={deleteConfirmText !== 'DELETE' || deletingAccount}
                          className="flex-1 bg-rose-600 hover:bg-rose-700 text-white font-semibold px-4 py-3 rounded-full text-sm transition-all disabled:opacity-50"
                        >
                          {deletingAccount ? 'Deleting…' : 'Delete My Account'}
                        </button>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </>
          )}

          {activeTab === 'reviews' && (
            <>
              <div className="flex justify-between items-center mb-8">
                <h2 className="text-2xl font-heading text-[#2C3E50]">⭐ My Reviews</h2>
              </div>
              {reviewsLoading ? (
                <div className="flex flex-col gap-4">
                  {[1, 2, 3].map(i => (
                    <div key={i} className="bg-white border border-[#F0E4D8] rounded-2xl p-6 animate-pulse">
                      <div className="flex justify-between items-center mb-3">
                        <div className="h-4 w-24 bg-gray-200 rounded-lg" />
                        <div className="h-3 w-16 bg-gray-100 rounded-lg" />
                      </div>
                      <div className="h-3 w-full bg-gray-100 rounded-lg mb-1" />
                      <div className="h-3 w-3/4 bg-gray-100 rounded-lg" />
                    </div>
                  ))}
                </div>
              ) : userReviews.length === 0 ? (
                <div className="bg-white border border-[#F0E4D8] rounded-2xl p-10 text-center">
                  <div className="text-4xl mb-4 opacity-50">⭐</div>
                  <h3 className="text-lg font-heading text-[#2C3E50] mb-2">No reviews yet</h3>
                  <p className="text-sm text-gray-400 mb-5">Book a service and leave a review for the provider.</p>
                  <Link href="/services" className="bg-[#E86A33] hover:bg-[#D4552A] text-white text-sm font-semibold px-6 py-3 rounded-full transition-all">Browse Services</Link>
                </div>
              ) : (
                <div className="flex flex-col gap-4">
                  {userReviews.map(r => (
                    <div key={r.id} className="bg-white border border-[#F0E4D8] rounded-2xl p-6">
                      <div className="flex justify-between items-center mb-3">
                        <div>
                          <div className="text-yellow-500 text-sm">{'★'.repeat(r.rating)}</div>
                          <span className="text-xs text-gray-400">{getProviderDisplayName(r.providerId)}</span>
                        </div>
                      </div>
                      <p className="text-sm text-[#2C3E50]">{r.comment}</p>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}

          {activeTab === 'payments' && (
            <>
              <div className="flex justify-between items-center mb-8">
                <h2 className="text-2xl font-heading text-[#2C3E50]">💳 My Receipts</h2>
                <span className="text-sm text-gray-400">{payments.length} transaction{payments.length !== 1 ? 's' : ''}</span>
              </div>
              {paymentsLoading ? (
                <div className="flex flex-col gap-4">
                  {[1, 2, 3].map(i => (
                    <div key={i} className="bg-white border border-[#F0E4D8] rounded-2xl p-6 animate-pulse">
                      <div className="flex justify-between items-start mb-3">
                        <div>
                          <div className="h-3 w-24 bg-gray-200 rounded-lg mb-2" />
                          <div className="h-4 w-32 bg-gray-100 rounded-lg" />
                        </div>
                        <div className="text-right">
                          <div className="h-6 w-16 bg-gray-200 rounded-lg mb-1" />
                          <div className="h-4 w-14 bg-gray-100 rounded-full" />
                        </div>
                      </div>
                      <div className="h-3 w-40 bg-gray-100 rounded-lg" />
                    </div>
                  ))}
                </div>
              ) : payments.length === 0 ? (
                <div className="bg-white border border-[#F0E4D8] rounded-2xl p-10 text-center">
                  <div className="text-4xl mb-4 opacity-50">💳</div>
                  <h3 className="text-lg font-heading text-[#2C3E50] mb-2">No payments yet</h3>
                  <p className="text-sm text-gray-400 mb-5">Your receipts will appear here after booking a service.</p>
                  <Link href={'/services'} className="bg-[#E86A33] hover:bg-[#D4552A] text-white text-sm font-semibold px-6 py-3 rounded-full transition-all">Browse Services</Link>
                </div>
              ) : (
                <div className="flex flex-col gap-4">
                  {payments.map(p => (
                    <div key={p.id} className="bg-white border border-[#F0E4D8] rounded-2xl p-6">
                      <div className="flex justify-between items-start mb-3">
                        <div>
                          <span className="text-xs font-semibold text-gray-400 uppercase tracking-wider">{p.category}</span>
                          <h4 className="font-semibold text-[#2C3E50] text-sm">{getProviderDisplayName(p.providerId, p.providerName)}</h4>
                          <p className="text-xs text-gray-400">Provider: {getProviderDisplayName(p.providerId, p.providerName)}</p>
                        </div>
                        <div className="text-right">
                          <p className="text-lg font-heading text-emerald-600">${p.amount.toFixed(2)}</p>
                          <span className={`inline-block text-[10px] px-2 py-0.5 rounded-full font-semibold mt-1 ${p.status === 'paid' ? 'bg-emerald-500/10 text-emerald-600' : p.status === 'refunded' ? 'bg-red-500/10 text-red-500' : 'bg-gray-500/10 text-gray-500'}`}>
                            {p.status.charAt(0).toUpperCase() + p.status.slice(1)}
                          </span>
                        </div>
                      </div>
                      <div className="flex justify-between text-xs text-gray-400">
                        <span>Booking: {p.bookingId.slice(0, 8)}...</span>
                        <span>{p.createdAt ? 'Just now' : ''}</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
        </main>
      </div>

      {/* Mobile tab bar */}
      <div className="md:hidden fixed bottom-0 left-0 right-0 bg-white border-t border-[#F0E4D8] flex justify-around py-2 px-2 z-50">
        {tabs.map(tab => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`flex flex-col items-center px-3 py-1.5 rounded-xl text-xs transition-all ${
              activeTab === tab.key ? 'text-[#E86A33]' : 'text-gray-400'
            }`}
          >
            <span className="text-lg">{tab.icon}</span>
            <span className="text-[10px]">{tab.label}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
