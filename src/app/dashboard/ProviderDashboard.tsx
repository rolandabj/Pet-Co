'use client';

import React, { useEffect, useState, useCallback, useRef } from 'react';
import { doc, updateDoc, onSnapshot, collection, query, where } from 'firebase/firestore';
import { getFirestoreDb } from '@/lib/firebase';
import { ref, uploadBytes, getDownloadURL, deleteObject } from 'firebase/storage';
import { useToast } from '@/components/Toast';
import { useAuth } from '@/context/AuthContext';
import {
  getProviderByEmailRest,
  updateProviderDocRest,
  createProviderRest,
  updateProviderByIdRest,
  getReviewsByProviderRest,
  updateBookingRest,
  getUserByIdRest,
} from '@/lib/firestore-rest';
import {
  fetchMyPayments,
  updatePaymentStatus,
  deletePaymentByBookingId,
} from '@/lib/me-api';
import type { BookingDoc, PaymentDoc, ReviewDoc, UserDoc } from '@/lib/firestore-rest';
import type { ServiceProvider, ServiceItem, ProductItem } from '@/lib/types';
import { formatProductPrice } from '@/lib/formatProductPrice';
import { getStorageDb } from '@/lib/firebase';

type ProviderTab =
  | 'overview'
  | 'services'
  | 'products'
  | 'bookings'
  | 'reviews'
  | 'profile';

const statusColors: Record<string, string> = {
  pending: 'bg-amber-50 text-amber-700 border-amber-200',
  confirmed: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  completed: 'bg-emerald-500/10 text-emerald-600',
  cancelled: 'bg-rose-50 text-rose-700 border-rose-200',
  declined: 'bg-rose-50 text-rose-700 border-rose-200',
  // Payment-specific colors
  paid: 'bg-emerald-500/10 text-emerald-600',
  unpaid: 'bg-rose-500/10 text-rose-600',
};

const tabConfig: { key: ProviderTab; icon: string; label: string }[] = [
  { key: 'overview', icon: '📊', label: 'Overview' },
  { key: 'services', icon: '🔧', label: 'Services' },
  { key: 'products', icon: '📦', label: 'Products' },
  { key: 'bookings', icon: '📅', label: 'Bookings' },
  { key: 'reviews', icon: '⭐', label: 'Reviews' },
  { key: 'profile', icon: '👤', label: 'Business Profile' },
];

const categoryLabels: Record<string, string> = {
  walkers: 'Dog Walker',
  vets: 'Veterinarian',
  hotels: 'Dog Hotel',
  sitters: 'Pet Sitter',
  grooming: 'Groomer',
  shops: 'Pet Shop',
};

const categoryEmojis: Record<string, string> = {
  walkers: '🐕',
  vets: '🏥',
  hotels: '🏨',
  sitters: '🛋️',
  grooming: '✂️',
  shops: '🛍️',
};

const categoryOptions = Object.entries(categoryLabels).map(([value, label]) => ({
  value,
  label: `${categoryEmojis[value] ?? ''} ${label}`,
}));

function StarRating({ rating }: { rating: number }) {
  return (
    <span className="text-yellow-500 text-sm">
      {Array.from({ length: 5 }, (_, i) => (i < Math.round(rating) ? '★' : '☆')).join('')}
    </span>
  );
}

const CURRENCIES = [
  { code: 'USD', name: 'US Dollar ($)' },
  { code: 'EUR', name: 'Euro (€)' },
  { code: 'AED', name: 'UAE Dirham (AED)' },
  { code: 'LBP', name: 'Lebanese Pound (LBP)' },
  { code: 'GBP', name: 'British Pound (£)' },
  { code: 'SAR', name: 'Saudi Riyal (SAR)' },
  { code: 'EGP', name: 'Egyptian Pound (EGP)' },
  { code: 'JPY', name: 'Japanese Yen (¥)' },
  { code: 'CNY', name: 'Chinese Yuan (¥)' },
  { code: 'AUD', name: 'Australian Dollar (A$)' },
  { code: 'CAD', name: 'Canadian Dollar (C$)' },
  { code: 'CHF', name: 'Swiss Franc (CHF)' },
  { code: 'INR', name: 'Indian Rupee (₹)' },
];

interface Props {
  userEmail: string;
  userId: string;
  userRole: string;
}

export default function ProviderDashboard({ userEmail, userId, userRole }: Props) {
  const { showToast } = useToast();
  const { user: authUser } = useAuth();
  const [activeTab, setActiveTab] = useState<ProviderTab>('overview');

  // ── Provider data ──────────────────────────────────────────────
  const [provider, setProvider] = useState<ServiceProvider | null>(null);
  const [providerLoading, setProviderLoading] = useState(true);
  /** Firestore document ID for this provider (used for updates when id is not numeric). */
  const [providerDocId, setProviderDocId] = useState<string | null>(null);

  // ── Onboarding form state ──────────────────────────────────────
  const [onboardingBizName, setOnboardingBizName] = useState('');
  const [onboardingLocation, setOnboardingLocation] = useState('');
  const [onboardingCategory, setOnboardingCategory] = useState('walkers');
  const [onboardingSaving, setOnboardingSaving] = useState(false);

  // ── Bookings ───────────────────────────────────────────────────
  const [bookings, setBookings] = useState<BookingDoc[]>([]);
  const [bookingsLoading, setBookingsLoading] = useState(true);

  // ── Live user profiles (for cross-referencing phone numbers) ──
  const [usersMap, setUsersMap] = useState<Record<string, string>>({});

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
  const [svcDuration, setSvcDuration] = useState<number>(60);
  const [svcCurrency, setSvcCurrency] = useState('USD');
  const [svcCurrencySearch, setSvcCurrencySearch] = useState('USD');
  const [showCurrencyDropdown, setShowCurrencyDropdown] = useState(false);

  const currencies = [
    { code: 'USD', name: 'US Dollar ($)' },
    { code: 'SAR', name: 'Saudi Riyal (SR)' },
    { code: 'AED', name: 'UAE Dirham (د.إ)' },
    { code: 'LBP', name: 'Lebanese Pound (ل.ل)' },
    { code: 'EUR', name: 'Euro (€)' },
    { code: 'GBP', name: 'British Pound (£)' },
  ];
  const currencyRef = useRef<HTMLDivElement>(null);

  // Click outside to close currency dropdown
  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (currencyRef.current && !currencyRef.current.contains(e.target as Node)) {
        setShowCurrencyDropdown(false);
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);
  const [editingSvcIdx, setEditingSvcIdx] = useState<number | null>(null);

  // ── Product form state ─────────────────────────────────────────
  const [showProductForm, setShowProductForm] = useState(false);
  const [prodName, setProdName] = useState('');
  const [prodPrice, setProdPrice] = useState('');
  const [prodDesc, setProdDesc] = useState('');
  const [prodInStock, setProdInStock] = useState(true);
  const [prodCurrency, setProdCurrency] = useState('USD');
  const [prodImageFile, setProdImageFile] = useState<File | null>(null);
  const [prodImagePreview, setProdImagePreview] = useState<string | null>(null);
  const [prodImageUploading, setProdImageUploading] = useState(false);
  const [currencySearch, setCurrencySearch] = useState('');
  const [isCurrencyDropdownOpen, setIsCurrencyDropdownOpen] = useState(false);
  const [editingProdIdx, setEditingProdIdx] = useState<number | null>(null);
  const [deletingAccount, setDeletingAccount] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  // ── Business profile form state ────────────────────────────────
  const [bizName, setBizName] = useState('');
  const [bizEmail, setBizEmail] = useState('');
  const [bizPhone, setBizPhone] = useState('');
  const [bizLocation, setBizLocation] = useState('');
  const [bizGoogleMapsUrl, setBizGoogleMapsUrl] = useState('');
  const [bizInsta, setBizInsta] = useState('');
  const [bizFacebook, setBizFacebook] = useState('');
  const [bizWebsite, setBizWebsite] = useState('');
  const [uploadingLogo, setUploadingLogo] = useState(false);

  // ── Availability / Operational Hours state ──────────────────────
  const weekdays = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];
  const defaultDaySchedule = { isOpen: true, start: '09:00', end: '17:00' };
  const [availability, setAvailability] = useState<Record<string, { isOpen: boolean; start: string; end: string }>>(
    Object.fromEntries(weekdays.map(d => [d, { ...defaultDaySchedule }])),
  );
  // Explicit day toggle — forces a non-mutating boolean flip
  const handleDayToggle = (day: string, currentVal: boolean) => {
    setAvailability(prev => ({
      ...prev,
      [day]: {
        ...prev[day],
        isOpen: !currentVal,
      },
    }));
  };

  // ── Fetch provider ─────────────────────────────────────────────
  const fetchProvider = useCallback(async () => {
    setProviderLoading(true);
    try {
      const p = await getProviderByEmailRest(userEmail);
      setProvider(p);
      if (p) {
        setProviderDocId(p._firestoreId ?? null);
        setBizName(p.businessName ?? p.name ?? '');
        setBizEmail(p.contactEmail ?? p.email ?? '');
        setBizPhone(p.contactPhone ?? p.phone ?? '');
        setBizLocation(p.location ?? '');
        setBizGoogleMapsUrl(p.googleMapsUrl ?? '');
        setBizInsta(p.socialMedia?.instagram ?? '');
        setBizFacebook(p.socialMedia?.facebook ?? '');
        setBizWebsite(p.socialMedia?.website ?? '');
        if (p.availability) {
          setAvailability(prev => ({ ...prev, ...p.availability }));
        } else {
          // Fallback: restore from localStorage backup
          try {
            const localKey = `availability_${p._firestoreId || p.id}`;
            const cached = localStorage.getItem(localKey);
            if (cached) {
              const parsed = JSON.parse(cached);
              setAvailability(prev => ({ ...prev, ...parsed }));
            }
          } catch { /* ignore parse errors */ }
        }
      }
    } catch (err) {
      console.error('Failed to fetch provider:', err);
    } finally {
      setProviderLoading(false);
    }
  }, [userEmail]);

  // ── Real-time bookings listener ──────────────────────────────────
  useEffect(() => {
    // Guard: tear down immediately if the user is no longer authenticated (D5)
    if (!userId || !authUser) return;
    setBookingsLoading(true);
    const db = getFirestoreDb();
    if (!db) {
      setBookingsLoading(false);
      return;
    }
    const q = query(collection(db, 'bookings'), where('providerId', '==', userId));
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
  }, [userId, authUser]);

  // ── Fetch live user profiles for phone number cross-reference ──
  useEffect(() => {
    if (bookings.length === 0) return;
    const ids = [...new Set(bookings.map((b) => b.userId).filter(Boolean))];
    ids.forEach(async (uid) => {
      if (usersMap[uid]) return; // already cached
      const u = await getUserByIdRest(uid);
      if (u?.phone) {
        setUsersMap((prev) => ({ ...prev, [uid]: u.phone! }));
      }
    });
  }, [bookings]);

  // ── Fetch payments ─────────────────────────────────────────────
  const fetchPayments = useCallback(async () => {
    setPaymentsLoading(true);
    try {
      const list = await fetchMyPayments('provider');
      setPayments(list);
    } catch (err) {
      console.error('Failed to fetch payments:', err);
    } finally {
      setPaymentsLoading(false);
    }
  }, []);

  // ── Fetch reviews ──────────────────────────────────────────────
  const fetchReviews = useCallback(async () => {
    setReviewsLoading(true);
    try {
      const list = await getReviewsByProviderRest(provider?.id ?? '');
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
    fetchPayments();
  }, [fetchProvider, fetchPayments]);

  useEffect(() => {
    if (provider) fetchReviews();
  }, [provider, fetchReviews]);

  // ── Derived stats ──────────────────────────────────────────────
  // Only count payments linked to confirmed or completed bookings
  const totalEarnings = payments
    .filter((p) => {
      if (p.status !== 'paid') return false;
      const booking = bookings.find((b) => b.id === p.bookingId);
      return booking && (booking.status === 'confirmed' || booking.status === 'completed');
    })
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

  // ── Booking status transition + cascade payment delete ──────────
  const handleBookingStatus = async (bookingId: string, status: string) => {
    try {
      // If cancelling or declining, delete the associated payment first
      // to prevent orphaned payment records.
      if (status === 'cancelled' || status === 'declined') {
        await deletePaymentByBookingId(bookingId);
        setPayments((prev) => prev.filter((p) => p.bookingId !== bookingId));
      }

      await updateBookingRest(bookingId, { status } as Partial<BookingDoc>);
      setBookings((prev) =>
        prev.map((b) => (b.id === bookingId ? { ...b, status } : b)),
      );
      showToast(`✅ Booking ${status}!`, 'success');
    } catch {
      showToast('❌ Failed to update booking.', 'error');
    }
  };

  // ── Payment status toggle (provider) ───────────────────────────
  const handlePaymentStatus = async (bookingId: string, status: string) => {
    try {
      const result = await updatePaymentStatus(bookingId, status);
      // Update local state
      setPayments((prev) =>
        prev.map((p) =>
          p.bookingId === bookingId ? { ...p, status: result.status } : p,
        ),
      );
      showToast(`💰 Payment marked as ${status}!`, 'success');
    } catch {
      showToast('❌ Failed to update payment status.', 'error');
    }
  };

  // ── Provider document update helper ────────────────────────────
  const updateProvider = useCallback(
    async (data: Record<string, unknown>) => {
      if (providerDocId) {
        await updateProviderByIdRest(providerDocId, data);
      } else {
        await updateProviderDocRest(provider?.id ?? '', data);
      }
    },
    [provider, providerDocId],
  );

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
      duration: svcDuration,
      currency: svcCurrency,
      description: svcDesc.trim() || undefined,
    };
    let updated: ServiceItem[];
    if (editingSvcIdx !== null) {
      updated = current.map((s, i) => (i === editingSvcIdx ? service : s));
    } else {
      updated = [...current, service];
    }
    try {
      await updateProvider({ services: updated });
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
    setSvcDesc(s.description || '');
    setSvcPrice(s.price);
    setSvcDuration(s.duration ?? 60);
    setSvcCurrency(s.currency || 'USD');
    setSvcCurrencySearch(s.currency || 'USD');
    setEditingSvcIdx(idx);
    setShowServiceForm(true);
  };

  const deleteService = async (idx: number) => {
    if (!provider?.services) return;
    const updated = provider.services.filter((_, i) => i !== idx);
    try {
      await updateProvider({ services: updated });
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
    setSvcCurrency('USD');
    setSvcCurrencySearch('USD');
    setShowCurrencyDropdown(false);
    setSvcDuration(60);
    setEditingSvcIdx(null);
    setShowServiceForm(false);
  };

  // ── Product image upload ────────────────────────────────────────
  const uploadProductImage = async (
    file: File,
    docId: string,
    productId: string,
  ): Promise<string> => {
    setProdImageUploading(true);
    try {
      const storage = getStorageDb();
      if (!storage) throw new Error('Firebase Storage is not configured');
      const storageRef = ref(
        storage,
        `providers/${docId}/products/${productId}_image.png`,
      );
      const snapshot = await uploadBytes(storageRef, file);
      return await getDownloadURL(snapshot.ref);
    } catch (error) {
      console.error('Firebase Storage Upload Error:', error);
      showToast('❌ Image upload failed — check your connection and try again.', 'error');
      throw error;
    } finally {
      setProdImageUploading(false);
    }
  };

  // ── Outside-click to close currency dropdown ───────────────────
  useEffect(() => {
    if (!isCurrencyDropdownOpen) return;
    const handler = () => setIsCurrencyDropdownOpen(false);
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [isCurrencyDropdownOpen]);

  // ── Product CRUD ───────────────────────────────────────────────
  const saveProduct = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!prodName.trim() || !prodPrice) {
      showToast('⚠️ Name and price are required.', 'error');
      return;
    }
    if (!provider) return;

    if (prodImageFile && prodImageFile.size > 2 * 1024 * 1024) {
      showToast('⚠️ Image must be smaller than 2 MB.', 'error');
      return;
    }

    const current = provider.products ?? [];
    const productId = editingProdIdx !== null
      ? (current[editingProdIdx]?.id ?? String(Date.now()))
      : String(Date.now());

    let imageUrl = editingProdIdx !== null
      ? (current[editingProdIdx]?.image ?? undefined)
      : undefined;

    // Upload image first (if one was selected)
    if (prodImageFile) {
      try {
        const docId = providerDocId ?? provider.id;
        imageUrl = await uploadProductImage(prodImageFile, docId, productId);
      } catch {
        // uploadProductImage shows its own toast and resets loading state
        return;
      }
    }

    const product: ProductItem = {
      id: productId,
      name: prodName.trim(),
      price: Number(prodPrice),
      description: prodDesc.trim() || undefined,
      inStock: prodInStock,
      image: imageUrl,
      currency: prodCurrency || 'USD',
    };
    let updated: ProductItem[];
    if (editingProdIdx !== null) {
      updated = current.map((p, i) => (i === editingProdIdx ? product : p));
    } else {
      updated = [...current, product];
    }
    try {
      await updateProvider({ products: updated });
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
    setProdCurrency(p.currency ?? 'USD');
    setProdDesc(p.description ?? '');
    setProdInStock(p.inStock);
    setProdImagePreview(p.image ?? null);
    setProdImageFile(null);
    setEditingProdIdx(idx);
    setShowProductForm(true);
  };

  const deleteProduct = async (idx: number) => {
    if (!provider?.products) return;
    const updated = provider.products.filter((_, i) => i !== idx);
    try {
      await updateProvider({ products: updated });
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
    setProdCurrency('USD');
    setProdImageFile(null);
    setProdImagePreview(null);
    setProdImageUploading(false);
    setEditingProdIdx(null);
    setShowProductForm(false);
  };

  // ── Save business profile ──────────────────────────────────────
  /* ── Business logo upload to Firebase Storage ── */
  const handleLogoChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      setUploadingLogo(true);
      const storage = getStorageDb();
      if (!storage) {
        showToast('Firebase is not configured.', 'error');
        setUploadingLogo(false);
        return;
      }
      const targetDocId = provider?._firestoreId || providerDocId || provider?.id || Date.now().toString();
      const storageRef = ref(storage, `provider_logos/${targetDocId}`);
      await uploadBytes(storageRef, file);
      const downloadURL = await getDownloadURL(storageRef);
      setProvider((prev) => prev ? { ...prev, logoUrl: downloadURL } : prev);
      showToast('✅ Logo uploaded successfully! Save the profile to persist.', 'success');
    } catch (error) {
      console.error('Logo upload failed:', error);
      showToast('❌ Logo upload failed. Check console.', 'error');
    } finally {
      setUploadingLogo(false);
    }
  };

  /* ── Cascading account deletion (via server-side API) ── */
  const handleDeleteAccount = async () => {
    const targetDocId = provider?._firestoreId || providerDocId || provider?.id;
    if (!targetDocId) {
      showToast('Cannot delete: Missing account profile context ID.', 'error');
      return;
    }

    setDeletingAccount(true);
    try {
      // 1. Call server-side API route (uses Admin SDK — no 403 risk)
      const res = await fetch('/api/me/account', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ providerId: targetDocId }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: res.statusText }));
        throw new Error(err.error || `Server returned ${res.status}`);
      }

      const result = await res.json();

      // 2. Delete provider logo from Firebase Storage if it exists
      const logoUrl = result.logoUrl || provider?.logoUrl;
      if (logoUrl) {
        try {
          const storage = getStorageDb();
          if (storage) {
            const urlObj = new URL(logoUrl);
            const encodedPath = urlObj.pathname.split('/o/')[1];
            if (encodedPath) {
              const storagePath = decodeURIComponent(encodedPath);
              const storageRef = ref(storage, storagePath);
              await deleteObject(storageRef);
            }
          }
        } catch {
          // Non-critical
        }
      }

      const summary = [
        result.deletedBookings > 0 && `${result.deletedBookings} booking(s)`,
        result.deletedPayments > 0 && `${result.deletedPayments} payment(s)`,
        result.deletedReviews > 0 && `${result.deletedReviews} review(s)`,
        result.deletedFavorites > 0 && `${result.deletedFavorites} favorite(s)`,
      ].filter(Boolean).join(', ');

      showToast(
        `✅ Account deleted. ${summary ? `Cleaned up: ${summary}.` : ''}`,
        'success',
      );

      // 3. Redirect to home after deletion
      window.location.href = '/';
    } catch (err) {
      console.error('Failed to delete account:', err);
      showToast('❌ Failed to delete account. Please try again or contact support.', 'error');
    } finally {
      setDeletingAccount(false);
      setShowDeleteConfirm(false);
    }
  };

  const saveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    // 1. Resolve target provider ID safely
    const targetDocId = provider?._firestoreId || providerDocId || provider?.id;
    if (!targetDocId) {
      console.error('[ProviderDashboard] CRITICAL: No valid provider ID found for database write.');
      showToast('Could not save: Missing account profile context ID.', 'error');
      return;
    }

    // 2. Format availability payload rigidly to strict primitives
    const freshAvailabilityMap = {
      monday: { isOpen: Boolean(availability.monday?.isOpen), start: availability.monday?.start || '09:00', end: availability.monday?.end || '17:00' },
      tuesday: { isOpen: Boolean(availability.tuesday?.isOpen), start: availability.tuesday?.start || '09:00', end: availability.tuesday?.end || '17:00' },
      wednesday: { isOpen: Boolean(availability.wednesday?.isOpen), start: availability.wednesday?.start || '09:00', end: availability.wednesday?.end || '17:00' },
      thursday: { isOpen: Boolean(availability.thursday?.isOpen), start: availability.thursday?.start || '09:00', end: availability.thursday?.end || '17:00' },
      friday: { isOpen: Boolean(availability.friday?.isOpen), start: availability.friday?.start || '09:00', end: availability.friday?.end || '17:00' },
      saturday: { isOpen: Boolean(availability.saturday?.isOpen), start: availability.saturday?.start || '09:00', end: availability.saturday?.end || '17:00' },
      sunday: { isOpen: Boolean(availability.sunday?.isOpen), start: availability.sunday?.start || '09:00', end: availability.sunday?.end || '17:00' },
    };
    const updates: Record<string, unknown> = {
      businessName: bizName.trim(),
      desc: provider?.desc?.trim() || '',
      contactEmail: bizEmail.trim(),
      contactPhone: bizPhone.trim(),
      location: bizLocation.trim(),
      googleMapsUrl: bizGoogleMapsUrl.trim(),
      logoUrl: provider?.logoUrl || '',
      socialMedia: {
        instagram: bizInsta.trim(),
        facebook: bizFacebook.trim(),
        website: bizWebsite.trim(),
      },
      availability: freshAvailabilityMap,
    };

    try {
      const db = getFirestoreDb();
      if (!db) {
        showToast('Firebase is not configured.', 'error');
        return;
      }
      const providerDocRef = doc(db, 'providers', targetDocId);
      await updateDoc(providerDocRef, updates);
      setProvider({ ...provider!, ...updates } as ServiceProvider);
      showToast('✅ Business profile updated!', 'success');
    } catch (error) {
      console.error('[ProviderDashboard] FIRESTORE WRITE CRASHED:', error);
      showToast('Save failed. Check browser console for details.', 'error');
    }
  };

  // ── Standalone operating-hours-only direct write ────────────────
  const forceSaveOperatingHours = async () => {
    try {
      const activeId = provider?._firestoreId || providerDocId || provider?.id || userId;
      if (!activeId) {
        showToast('Error: Cannot find active Provider ID account context!', 'error');
        return;
      }

      const manualSchedulePayload = {
        monday: { isOpen: availability.monday?.isOpen ?? true, start: availability.monday?.start || '09:00', end: availability.monday?.end || '17:00' },
        tuesday: { isOpen: availability.tuesday?.isOpen ?? true, start: availability.tuesday?.start || '09:00', end: availability.tuesday?.end || '17:00' },
        wednesday: { isOpen: availability.wednesday?.isOpen ?? true, start: availability.wednesday?.start || '09:00', end: availability.wednesday?.end || '17:00' },
        thursday: { isOpen: availability.thursday?.isOpen ?? true, start: availability.thursday?.start || '09:00', end: availability.thursday?.end || '17:00' },
        friday: { isOpen: availability.friday?.isOpen ?? true, start: availability.friday?.start || '09:00', end: availability.friday?.end || '17:00' },
        saturday: { isOpen: availability.saturday?.isOpen ?? true, start: availability.saturday?.start || '09:00', end: availability.saturday?.end || '17:00' },
        sunday: { isOpen: availability.sunday?.isOpen ?? true, start: availability.sunday?.start || '09:00', end: availability.sunday?.end || '17:00' },
      };

      const db = getFirestoreDb();
      if (!db) {
        showToast('Firebase is not configured.', 'error');
        return;
      }
      const docRef = doc(db, 'providers', activeId);
      await updateDoc(docRef, { availability: manualSchedulePayload });

      showToast('✅ Operating hours saved securely via direct write!', 'success');

      // Backup to localStorage so availability loads instantly on refresh
      localStorage.setItem(`availability_${activeId}`, JSON.stringify(manualSchedulePayload));
    } catch (error) {
      console.error('[ProviderDashboard] DIRECT WRITE OPERATIONAL HOURS CRASHED:', error);
      showToast('❌ Database rejected direct update path.', 'error');
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
      <div className="max-w-lg mx-auto">
        <div className="bg-white border border-[#F0E4D8] rounded-2xl p-10 text-center mb-8">
          <div className="text-5xl mb-4">👋</div>
          <h2 className="text-2xl font-heading text-[#2C3E50] mb-2">
            Welcome! Let&apos;s Set Up Your Business
          </h2>
          <p className="text-sm text-gray-400 mb-1">
            Your provider profile is almost ready. Fill in the basics to
            get started, and you can customise everything later.
          </p>
        </div>

        <form
          onSubmit={async (e) => {
            e.preventDefault();
            if (!onboardingBizName.trim()) {
              showToast('⚠️ Business name is required.', 'error');
              return;
            }
            setOnboardingSaving(true);
            try {
              // Upsert the provider document at providers/{userId}.
              // During registration, AuthContext creates a placeholder at this
              // path — this call updates it with real business details.
              // If the placeholder was missed (e.g. Firestore outage), fall
              // back to creating the document with the same fixed ID.
              try {
                await updateProviderByIdRest(userId, {
                  email: userEmail,
                  name: userEmail.split('@')[0],
                  businessName: onboardingBizName.trim(),
                  contactEmail: userEmail,
                  type: onboardingCategory,
                  category: categoryLabels[onboardingCategory] || 'Dog Walker',
                  emoji: categoryEmojis[onboardingCategory] || '🏪',
                  desc: 'New pet service provider',
                  location: onboardingLocation.trim(),
                  price: 'Contact for Pricing',
                });
              } catch {
                await createProviderRest({
                  email: userEmail,
                  name: userEmail.split('@')[0],
                  businessName: onboardingBizName.trim(),
                  contactEmail: userEmail,
                  type: onboardingCategory,
                  category: categoryLabels[onboardingCategory] || 'Dog Walker',
                  emoji: categoryEmojis[onboardingCategory] || '🏪',
                  desc: 'New pet service provider',
                  location: onboardingLocation.trim(),
                  price: 'Contact for Pricing',
                  documentId: userId,
                });
              }
              setProviderDocId(userId);

              // Build a local provider object so the dashboard renders immediately
              const localProvider: ServiceProvider = {
                id: userId,
                name: userEmail.split('@')[0],
                type: onboardingCategory,
                category: categoryLabels[onboardingCategory] || 'Dog Walker',
                rating: 0,
                reviews: 0,
                desc: 'New pet service provider',
                tags: [],
                emoji: categoryEmojis[onboardingCategory] || '🏪',
                price: 'Contact for Pricing',
                location: onboardingLocation.trim() || undefined,
                email: userEmail,
                businessName: onboardingBizName.trim(),
                contactEmail: userEmail,
                services: [],
                products: [],
              };
              setProvider(localProvider);
              showToast('🎉 Business profile created! Welcome aboard.', 'success');
            } catch {
              showToast('❌ Failed to create profile. Please try again.', 'error');
            } finally {
              setOnboardingSaving(false);
            }
          }}
          className="bg-white border border-[#F0E4D8] rounded-2xl p-8 space-y-5"
        >
          <div>
            <label className="block text-sm font-semibold text-[#2C3E50] mb-1.5">
              Business Name *
            </label>
            <input
              type="text"
              value={onboardingBizName}
              onChange={(e) => setOnboardingBizName(e.target.value)}
              placeholder="e.g. Pawsome Pet Care"
              required
              className="w-full px-4 py-3 border-2 border-[#F0E4D8] rounded-xl bg-[#FFF8F0] focus:border-[#E86A33] focus:outline-none focus:ring-4 focus:ring-orange-500/10 transition-all text-sm"
            />
          </div>

          <div>
            <label className="block text-sm font-semibold text-[#2C3E50] mb-1.5">
              Service Category
            </label>
            <select
              value={onboardingCategory}
              onChange={(e) => setOnboardingCategory(e.target.value)}
              className="w-full px-4 py-3 border-2 border-[#F0E4D8] rounded-xl bg-[#FFF8F0] focus:border-[#E86A33] focus:outline-none focus:ring-4 focus:ring-orange-500/10 transition-all text-sm"
            >
              {categoryOptions.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-semibold text-[#2C3E50] mb-1.5">
              Location
            </label>
            <input
              type="text"
              value={onboardingLocation}
              onChange={(e) => setOnboardingLocation(e.target.value)}
              placeholder="City, State"
              className="w-full px-4 py-3 border-2 border-[#F0E4D8] rounded-xl bg-[#FFF8F0] focus:border-[#E86A33] focus:outline-none focus:ring-4 focus:ring-orange-500/10 transition-all text-sm"
            />
          </div>

          <button
            type="submit"
            disabled={onboardingSaving}
            className="w-full bg-[#E86A33] hover:bg-[#D4552A] text-white font-semibold py-3.5 rounded-full text-sm transition-all disabled:opacity-60"
          >
            {onboardingSaving ? 'Creating Profile...' : 'Get Started 🚀'}
          </button>
        </form>
      </div>
    );
  }

  // ══════════════════════════════════════════════════════════════
  // RENDER
  // ══════════════════════════════════════════════════════════════
  return (
    <div className="flex gap-8">
      {/* ── Desktop Sidebar ── */}
      <aside className="hidden md:block w-[220px] shrink-0">
        <div className="sticky top-[100px] space-y-1">
          {tabConfig.map((t) => {
            return (
              <button
                key={t.key}
                onClick={() => setActiveTab(t.key)}
                className={`w-full flex items-center gap-3 px-4 py-2.5 rounded-xl text-sm font-medium text-left transition-all ${
                  activeTab === t.key
                    ? 'bg-primary text-white shadow-sm'
                    : 'text-gray-500 hover:bg-[#FFF0E0] hover:text-primary'
                }`}
              >
                <span className="text-lg leading-none">{t.icon}</span>
                {t.label}
              </button>
            );
          })}
        </div>
      </aside>

      {/* ── Workspace ── */}
      <main className="flex-1 min-w-0 pb-24 md:pb-0">

        {/* ──────────────── A. OVERVIEW ──────────────── */}
        {activeTab === 'overview' && (
          <div>
            {/* Provider header */}
            <div className="mb-8">
              <div className="flex items-center gap-3">
                <span className="text-3xl">{provider.emoji || '🏪'}</span>
                <div>
                  <h1 className="text-2xl font-heading text-secondary">
                    {provider.businessName || provider.name}
                  </h1>
                  <p className="text-sm text-gray-400">
                    {provider.category} &middot; {provider.type}
                  </p>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
              <div className="bg-white rounded-2xl p-6 border border-[#F0E4D8]">
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1">
                  Total Earnings
                </p>
                <p className="text-2xl font-heading text-accent">
                  ${totalEarnings.toFixed(2)}
                </p>
              </div>
              <div className="bg-white rounded-2xl p-6 border border-[#F0E4D8]">
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1">
                  Active Bookings
                </p>
                <p className="text-2xl font-heading text-primary">
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
              {/* Recent bookings — 3 most recent */}
              <div className="bg-white rounded-2xl p-6 border border-[#F0E4D8]">
                <h3 className="text-lg font-heading text-secondary mb-4">
                  Recent Bookings
                </h3>
                {bookingsLoading ? (
                  skeleton(3)
                ) : bookings.length === 0 ? (
                  <p className="text-sm text-gray-400">No bookings yet.</p>
                ) : (
                  <div className="space-y-3">
                    {[...bookings]
                      .sort((a, b) => (b.createdAt ?? '').localeCompare(a.createdAt ?? ''))
                      .slice(0, 3)
                      .map((b) => (
                        <div
                          key={b.id}
                          className="flex items-center justify-between py-2 border-b border-[#F0E4D8] last:border-0"
                        >
                          <div>
                            <p className="text-sm font-medium text-secondary">
                              {b.serviceType}
                            </p>
                            <p className="text-xs text-gray-400">
                              {b.date?.split("-").reverse().join("/")} &middot; {b.time}
                            </p>
                            <p className="text-[10px] text-gray-400/70 mt-0.5">
                              Ordered: {b.createdAt ? new Date(b.createdAt).toLocaleString('en-GB') : 'N/A'}
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

              {/* Recent reviews — 3 most recent */}
              <div className="bg-white rounded-2xl p-6 border border-[#F0E4D8]">
                <h3 className="text-lg font-heading text-secondary mb-4">
                  Recent Reviews
                </h3>
                {reviewsLoading ? (
                  skeleton(3)
                ) : reviews.length === 0 ? (
                  <p className="text-sm text-gray-400">No reviews yet.</p>
                ) : (
                  <div className="space-y-3">
                    {[...reviews]
                      .sort((a, b) => (b.createdAt ?? '').localeCompare(a.createdAt ?? ''))
                      .slice(0, 3)
                      .map((r) => (
                        <div
                          key={r.id}
                          className="py-2 border-b border-[#F0E4D8] last:border-0"
                        >
                          <div className="flex items-center justify-between mb-1">
                            <span className="text-sm font-medium text-secondary">
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
              <h2 className="text-xl font-heading text-secondary">
                🔧 Service &amp; Pricing
              </h2>
              <button
                onClick={() => {
                  resetServiceForm();
                  setShowServiceForm(true);
                }}
                className="bg-primary hover:bg-primary-dark text-white text-sm font-semibold px-5 py-2.5 rounded-full transition-all"
              >
                + Add Service
              </button>
            </div>

            {!provider.services || provider.services.length === 0 ? (
              <div className="bg-white border border-[#F0E4D8] rounded-2xl p-10 text-center">
                <div className="text-4xl mb-4 opacity-50">🔧</div>
                <h3 className="text-lg font-heading text-secondary mb-2">
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
                      <h4 className="font-semibold text-secondary">{s.name}</h4>
                      <p className="text-sm font-medium text-accent">
                        {s.price} {s.currency || 'USD'}
                      </p>
                      {s.description ? (
                        <p className="text-sm text-gray-500 mt-1 max-w-xl font-normal leading-normal">
                          {s.description}
                        </p>
                      ) : (
                        <span className="text-xs text-gray-400 italic mt-1 block">No description provided for this service.</span>
                      )}
                    </div>
                    <div className="flex gap-2">
                      <button
                        onClick={() => editService(idx)}
                        className="text-sm text-gray-400 hover:text-primary px-3 py-1.5 rounded-lg hover:bg-[#FFF0E0] transition-all"
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
                  <h3 className="text-xl font-heading text-secondary mb-6">
                    {editingSvcIdx !== null ? 'Edit Service' : 'Add New Service'}
                  </h3>
                  <form onSubmit={saveService} className="space-y-4">
                    <div>
                      <label className="block text-sm font-semibold text-secondary mb-1.5">
                        Service Name *
                      </label>
                      <input
                        type="text"
                        value={svcName}
                        onChange={(e) => setSvcName(e.target.value)}
                        placeholder="e.g. Dog Walking"
                        required
                        className="w-full px-4 py-3 border-2 border-[#F0E4D8] rounded-xl bg-[#FFF8F0] focus:border-primary focus:outline-none focus:ring-4 focus:ring-orange-500/10 transition-all text-sm"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-semibold text-secondary mb-1.5">
                        Category
                      </label>
                      <select
                        value={svcCategory || onboardingCategory}
                        onChange={(e) => setSvcCategory(e.target.value)}
                        className="w-full px-4 py-3 border-2 border-[#F0E4D8] rounded-xl bg-[#FFF8F0] focus:border-primary focus:outline-none focus:ring-4 focus:ring-orange-500/10 transition-all text-sm"
                      >
                        <option value="">Select a category</option>
                        {categoryOptions.map((opt) => (
                          <option key={opt.value} value={opt.value}>
                            {opt.label}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="block text-sm font-semibold text-secondary mb-1.5">
                        Description
                      </label>
                      <textarea
                        value={svcDesc}
                        onChange={(e) => setSvcDesc(e.target.value)}
                        placeholder="Brief description of the service..."
                        rows={2}
                        className="w-full px-4 py-3 border-2 border-[#F0E4D8] rounded-xl bg-[#FFF8F0] focus:border-primary focus:outline-none focus:ring-4 focus:ring-orange-500/10 transition-all text-sm resize-none"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-semibold text-secondary mb-1.5">
                        Price *
                      </label>
                      <div className="flex gap-4 items-end">
                        <div className="w-1/3 relative" ref={currencyRef}>
                          <input
                            type="text"
                            value={showCurrencyDropdown ? svcCurrencySearch : svcCurrency}
                            onChange={(e) => {
                              setSvcCurrencySearch(e.target.value);
                              setShowCurrencyDropdown(true);
                            }}
                            onFocus={() => { setSvcCurrencySearch(''); setShowCurrencyDropdown(true); }}
                            onClick={(e) => { e.stopPropagation(); setSvcCurrencySearch(''); setShowCurrencyDropdown(true); }}
                            placeholder="Currency"
                            required
                            className="w-full px-3 py-3 border-2 border-[#F0E4D8] rounded-xl bg-[#FFF8F0] focus:border-primary focus:outline-none focus:ring-4 focus:ring-orange-500/10 transition-all text-sm cursor-pointer"
                          />
                          {showCurrencyDropdown && (
                            <div className="absolute z-50 max-h-48 overflow-y-auto w-full bg-white border border-[#F0E4D8] rounded-xl shadow-lg mt-1">
                              {currencies
                                .filter(
                                  (c) =>
                                    c.name.toLowerCase().includes(svcCurrencySearch.toLowerCase()) ||
                                    c.code.toLowerCase().includes(svcCurrencySearch.toLowerCase()),
                                )
                                .map((c) => (
                                  <button
                                    key={c.code}
                                    type="button"
                                    onMouseDown={(e) => {
                                      e.preventDefault();
                                      e.stopPropagation();
                                      setSvcCurrency(c.code);
                                      setSvcCurrencySearch(c.code);
                                      setShowCurrencyDropdown(false);
                                    }}
                                    className={`w-full text-left px-3 py-2 text-sm hover:bg-[#FFF8F0] transition-all ${
                                      svcCurrency === c.code ? 'bg-[#FFF0E0] font-semibold text-primary' : 'text-[#2C3E50]'
                                    }`}
                                  >
                                    {c.code} — {c.name}
                                  </button>
                                ))}
                              {currencies.filter(
                                (c) =>
                                  c.name.toLowerCase().includes(svcCurrencySearch.toLowerCase()) ||
                                  c.code.toLowerCase().includes(svcCurrencySearch.toLowerCase()),
                              ).length === 0 && (
                                <div className="px-3 py-2 text-sm text-gray-400">No matches</div>
                              )}
                            </div>
                          )}
                        </div>
                        <div className="w-2/3">
                          <input
                            type="text"
                            value={svcPrice}
                            onChange={(e) => setSvcPrice(e.target.value)}
                            placeholder="e.g. 25.00"
                            required
                            className="w-full px-4 py-3 border-2 border-[#F0E4D8] rounded-xl bg-[#FFF8F0] focus:border-primary focus:outline-none focus:ring-4 focus:ring-orange-500/10 transition-all text-sm"
                          />
                        </div>
                      </div>
                    </div>
                    <div>
                      <label className="block text-sm font-semibold text-secondary mb-1.5">
                        Booking Duration / Frequency
                      </label>
                      <select
                        value={svcDuration}
                        onChange={(e) => setSvcDuration(Number(e.target.value))}
                        className="w-full px-4 py-3 border-2 border-[#F0E4D8] rounded-xl bg-[#FFF8F0] focus:border-primary focus:outline-none focus:ring-4 focus:ring-orange-500/10 transition-all text-sm"
                      >
                        <option value={15}>15 mins</option>
                        <option value={30}>30 mins</option>
                        <option value={45}>45 mins</option>
                        <option value={60}>1 hour</option>
                        <option value={90}>1.5 hours</option>
                        <option value={120}>2 hours</option>
                      </select>
                    </div>
                    <div className="flex gap-3 pt-2">
                      <button
                        type="submit"
                        className="flex-1 bg-primary hover:bg-primary-dark text-white font-semibold py-3 rounded-full text-sm transition-all"
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

        {/* ──────────────── C. PRODUCTS (table layout) ──────────────── */}
        {activeTab === 'products' && (
          <div>
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-xl font-heading text-secondary">
                📦 Product Catalog
              </h2>
              <button
                onClick={() => {
                  resetProductForm();
                  setShowProductForm(true);
                }}
                className="bg-primary hover:bg-primary-dark text-white text-sm font-semibold px-5 py-2.5 rounded-full transition-all"
              >
                + Add Product
              </button>
            </div>

            {!provider.products || provider.products.length === 0 ? (
              <div className="bg-white border border-[#F0E4D8] rounded-2xl p-10 text-center">
                <div className="text-4xl mb-4 opacity-50">📦</div>
                <h3 className="text-lg font-heading text-secondary mb-2">
                  No products yet
                </h3>
                <p className="text-sm text-gray-400">
                  List retail items for your customers to browse.
                </p>
              </div>
            ) : (
              <div className="bg-white border border-[#F0E4D8] rounded-2xl overflow-hidden">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-[#F0E4D8] bg-[#FFF8F0]">
                      <th className="text-left px-5 py-3 font-semibold text-secondary">Product</th>
                      <th className="text-left px-5 py-3 font-semibold text-secondary hidden sm:table-cell">Description</th>
                      <th className="text-right px-5 py-3 font-semibold text-secondary">Price</th>
                      <th className="text-center px-5 py-3 font-semibold text-secondary">Status</th>
                      <th className="text-right px-5 py-3 font-semibold text-secondary">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {provider.products.map((p, idx) => (
                      <tr key={p.id} className="border-b border-[#F0E4D8] last:border-0 hover:bg-[#FFF8F0]/50 transition-colors">
                        <td className="px-5 py-4">
                          <div className="flex items-center gap-4">
                            <div className="relative w-12 h-12 flex-shrink-0 bg-[#F5A07A]/10 rounded-xl overflow-hidden border border-[#F0E4D8]">
                              {p.image ? (
                                <img
                                  src={p.image}
                                  alt={p.name}
                                  className="w-full h-full object-cover"
                                />
                              ) : (
                                <div className="w-full h-full flex items-center justify-center text-xl bg-gray-100">
                                  📦
                                </div>
                              )}
                            </div>
                            <span className="font-medium text-secondary">{p.name}</span>
                          </div>
                        </td>
                        <td className="px-5 py-4 text-gray-500 hidden sm:table-cell max-w-[200px] truncate">
                          {p.description || '—'}
                        </td>
                        <td className="px-5 py-4 text-right font-medium text-accent">
                          {formatProductPrice(p.price, p.currency)}
                        </td>
                        <td className="px-5 py-4 text-center">
                          <span
                            className={`inline-block text-[10px] px-2 py-0.5 rounded-full font-semibold ${
                              p.inStock
                                ? 'bg-accent/10 text-accent'
                                : 'bg-red-500/10 text-red-500'
                            }`}
                          >
                            {p.inStock ? 'In Stock' : 'Out of Stock'}
                          </span>
                        </td>
                        <td className="px-5 py-4 text-right">
                          <div className="flex gap-2 justify-end">
                            <button
                              onClick={() => editProduct(idx)}
                              className="text-xs text-gray-400 hover:text-primary transition-all"
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
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {/* Product form modal */}
            {showProductForm &&
              modalOverlay(resetProductForm, (
                <>
                  <h3 className="text-xl font-heading text-secondary mb-6">
                    {editingProdIdx !== null ? 'Edit Product' : 'Add New Product'}
                  </h3>
                  <form onSubmit={saveProduct} className="space-y-4">
                    <div>
                      <label className="block text-sm font-semibold text-secondary mb-1.5">
                        Product Name *
                      </label>
                      <input
                        type="text"
                        value={prodName}
                        onChange={(e) => setProdName(e.target.value)}
                        placeholder="e.g. Premium Dog Food"
                        required
                        className="w-full px-4 py-3 border-2 border-[#F0E4D8] rounded-xl bg-[#FFF8F0] focus:border-primary focus:outline-none focus:ring-4 focus:ring-orange-500/10 transition-all text-sm"
                      />
                    </div>
                    {/* Price + Currency side-by-side */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div className="flex flex-col gap-1.5">
                        <label className="text-sm font-semibold text-[#2C3E50]">Price *</label>
                        <input
                          type="number"
                          step="0.01"
                          min="0"
                          value={prodPrice}
                          onChange={(e) => setProdPrice(e.target.value)}
                          placeholder="e.g. 30"
                          required
                          className="w-full px-4 py-3 border-2 border-[#F0E4D8] rounded-xl bg-[#FFF8F0] focus:border-primary focus:outline-none focus:ring-4 focus:ring-orange-500/10 transition-all text-sm"
                        />
                      </div>
                      {/* Perfected Searchable Currency Selector Dropdown */}
                      <div className="flex flex-col gap-1.5 relative">
                        <label className="text-sm font-semibold text-[#2C3E50]">Currency *</label>
                        <div className="relative">
                          <input
                            type="text"
                            className="w-full px-4 py-3 border-2 border-[#F0E4D8] rounded-xl bg-[#FFF8F0] focus:border-primary focus:outline-none focus:ring-4 focus:ring-orange-500/10 transition-all text-sm placeholder-gray-400 cursor-pointer"
                            placeholder="Search Currency (e.g. USD, EUR, LBP)..."
                            value={isCurrencyDropdownOpen ? currencySearch : prodCurrency}
                            onClick={(e) => {
                              e.stopPropagation();
                              setCurrencySearch('');
                              setIsCurrencyDropdownOpen(true);
                            }}
                            onFocus={() => {
                              setCurrencySearch('');
                              setIsCurrencyDropdownOpen(true);
                            }}
                            onChange={(e) => setCurrencySearch(e.target.value)}
                          />
                          {isCurrencyDropdownOpen && (
                            <button
                              type="button"
                              className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 text-xs hover:text-gray-600"
                              onMouseDown={(e) => {
                                e.preventDefault();
                                setIsCurrencyDropdownOpen(false);
                              }}
                            >
                              ✕
                            </button>
                          )}
                        </div>
                        {isCurrencyDropdownOpen && (
                          <div className="absolute z-50 left-0 right-0 top-[105%] max-h-48 overflow-y-auto bg-white border border-gray-200 rounded-xl shadow-lg mt-1">
                            {(() => {
                              const filtered = CURRENCIES.filter(c =>
                                c.code.toLowerCase().includes(currencySearch.toLowerCase()) ||
                                c.name.toLowerCase().includes(currencySearch.toLowerCase())
                              );
                              return filtered.length > 0 ? (
                                filtered.map((curr) => (
                                  <button
                                    key={curr.code}
                                    type="button"
                                    onMouseDown={(e) => {
                                      e.preventDefault();
                                      e.stopPropagation();
                                      setProdCurrency(curr.code);
                                      setCurrencySearch('');
                                      setIsCurrencyDropdownOpen(false);
                                    }}
                                    className="w-full text-left px-4 py-2.5 text-sm hover:bg-[#FFF8F0] transition-colors text-[#2C3E50] font-medium flex justify-between items-center"
                                  >
                                    <span>{curr.name}</span>
                                    <span className="text-[#E86A33] font-bold bg-[#FFF3E5] px-2 py-0.5 rounded text-xs">{curr.code}</span>
                                  </button>
                                ))
                              ) : (
                                <div className="p-3 text-xs text-gray-400 italic text-center">No matching currency found</div>
                              );
                            })()}
                          </div>
                        )}
                      </div>
                    </div>
                    <div>
                      <label className="block text-sm font-semibold text-secondary mb-1.5">
                        Description
                      </label>
                      <textarea
                        value={prodDesc}
                        onChange={(e) => setProdDesc(e.target.value)}
                        placeholder="Short description..."
                        rows={2}
                        className="w-full px-4 py-3 border-2 border-[#F0E4D8] rounded-xl bg-[#FFF8F0] focus:border-primary focus:outline-none focus:ring-4 focus:ring-orange-500/10 transition-all text-sm resize-none"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-semibold text-secondary mb-1.5">
                        Product Image
                      </label>
                      <label className="flex items-center gap-3 cursor-pointer px-4 py-3 border-2 border-dashed border-[#F0E4D8] rounded-xl bg-[#FFF8F0] hover:border-primary transition-all">
                        <span className="text-lg">📷</span>
                        <span className="text-sm text-gray-500">
                          {prodImageFile ? prodImageFile.name : 'Upload image (PNG, JPG — max 2 MB)'}
                        </span>
                        <input
                          type="file"
                          accept="image/png,image/jpeg"
                          onChange={(e) => {
                            const file = e.target.files?.[0] ?? null;
                            setProdImageFile(file);
                            if (file) {
                              const reader = new FileReader();
                              reader.onload = () => setProdImagePreview(reader.result as string);
                              reader.readAsDataURL(file);
                            }
                          }}
                          className="hidden"
                        />
                      </label>
                      {prodImagePreview && (
                        <div className="mt-3 relative">
                          <img
                            src={prodImagePreview}
                            alt="Product preview"
                            className="w-full h-40 object-cover rounded-xl border border-[#F0E4D8]"
                          />
                          <button
                            type="button"
                            onClick={() => {
                              setProdImageFile(null);
                              setProdImagePreview(null);
                            }}
                            className="absolute top-2 right-2 w-7 h-7 bg-white/90 rounded-full flex items-center justify-center text-xs font-bold text-gray-500 hover:bg-white hover:text-red-500 shadow transition-all"
                          >
                            ✕
                          </button>
                        </div>
                      )}
                    </div>
                    <label className="flex items-center gap-3 cursor-pointer">
                      <button
                        type="button"
                        onClick={() => setProdInStock(!prodInStock)}
                        className={`relative w-11 h-6 rounded-full transition-all ${
                          prodInStock ? 'bg-accent' : 'bg-gray-300'
                        }`}
                      >
                        <span
                          className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-all ${
                            prodInStock ? 'translate-x-5' : ''
                          }`}
                        />
                      </button>
                      <span className="text-sm font-medium text-secondary">
                        In Stock
                      </span>
                    </label>
                    <div className="flex gap-3 pt-2">
                      <button
                        type="submit"
                        disabled={prodImageUploading}
                        className="flex-1 bg-primary hover:bg-primary-dark text-white font-semibold py-3 rounded-full text-sm transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        {prodImageUploading
                          ? '⏳ Uploading image…'
                          : editingProdIdx !== null
                            ? 'Update'
                            : 'Add Product'}
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
              <h2 className="text-xl font-heading text-secondary">
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
                <h3 className="text-lg font-heading text-secondary mb-2">
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
                          <h4 className="font-semibold text-secondary">
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

                        {/* Client & Pet badges */}
                        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm my-1.5 font-medium text-[#2C3E50]">
                          <span className="flex items-center gap-1.5 bg-[#F0E4D8]/40 px-2.5 py-1 rounded-lg">
                            👤 <span className="text-gray-500 font-normal">Owner:</span> {b.customerName || 'Valued Client'}
                          </span>
                          <span className="flex items-center gap-1.5 bg-[#F5A07A]/10 px-2.5 py-1 rounded-lg text-[#E86A33]">
                            🐾 <span className="text-gray-500 font-normal">Pet:</span> {b.petName || 'Pet'}
                          </span>
                          <span className="flex items-center gap-1.5 bg-blue-50/50 px-2.5 py-1 rounded-lg text-blue-700 border border-blue-100">
                            📞 <span className="text-gray-500 font-normal">Phone:</span> {usersMap[b.userId] || b.customerPhone || 'No Phone Provided'}
                          </span>
                        </div>

                        <p className="text-sm text-gray-500">
                          {b.date?.split("-").reverse().join("/")} &middot; {b.time}
                          {b.total || b.price ? ` · $${(b.total || b.price || 0).toFixed(2)} ${b.currency || 'USD'}` : ''}
                        </p>
                        <p className="text-[11px] text-gray-400 mt-0.5">
                          Order placed: {b.createdAt ? new Date(b.createdAt).toLocaleString('en-GB') : 'N/A'}
                        </p>
                        <p className="text-xs text-gray-400">
                          Booking #{b.id.slice(0, 8)}
                        </p>
                      </div>

                      <div className="flex gap-2 flex-wrap">
                        <select
                          value={b.status}
                          onChange={(e) => handleBookingStatus(b.id, e.target.value)}
                          className="bg-white border border-[#F0E4D8] rounded-xl px-3 py-1.5 text-sm font-medium text-[#2C3E50] focus:outline-none focus:border-[#E86A33] focus:ring-4 focus:ring-orange-500/10 transition-all cursor-pointer"
                        >
                          <option value="pending">⏳ Pending</option>
                          <option value="confirmed">✅ Confirmed</option>
                          <option value="cancelled">❌ Cancelled</option>
                          <option value="declined">🚫 Declined</option>
                          <option value="completed">🎉 Completed</option>
                        </select>

                        {/* Payment status toggle */}
                        {(() => {
                          const payment = payments.find((p) => p.bookingId === b.id);
                          if (!payment) {
                            return (
                              <span className="inline-flex items-center px-3 py-1.5 text-xs font-medium text-gray-400 bg-gray-50 border border-gray-100 rounded-xl">
                                💳 No Active Payment
                              </span>
                            );
                          }
                          return (
                            <select
                              value={payment.status}
                              onChange={(e) => handlePaymentStatus(b.id, e.target.value)}
                              className={`bg-white border rounded-xl px-3 py-1.5 text-sm font-medium focus:outline-none focus:ring-4 focus:ring-orange-500/10 transition-all cursor-pointer ${
                                payment.status === 'paid'
                                  ? 'text-emerald-600 border-emerald-200'
                                  : payment.status === 'unpaid'
                                    ? 'text-rose-600 border-rose-200'
                                    : 'text-amber-600 border-amber-200'
                              }`}
                            >
                              <option value="pending">💳 Pending</option>
                              <option value="paid">✅ Paid</option>
                              <option value="unpaid">❌ Unpaid</option>
                            </select>
                          );
                        })()}
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
              <h2 className="text-xl font-heading text-secondary">
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
                <h3 className="text-lg font-heading text-secondary mb-2">
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
                        <span className="font-semibold text-secondary text-sm">
                          {r.userName}
                        </span>
                        <StarRating rating={r.rating} />
                      </div>
                      {r.createdAt && (
                        <span className="text-xs text-gray-400">
                          {new Date(r.createdAt).toLocaleDateString('en-GB')}
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
            <h2 className="text-xl font-heading text-secondary mb-6">
              👤 Business Profile &amp; Contact Settings
            </h2>

            <form
              onSubmit={saveProfile}
              className="bg-white border border-[#F0E4D8] rounded-2xl p-8 max-w-2xl"
            >
              {/* ── Logo Upload ── */}
              <div className="flex items-center gap-4 mb-6 p-4 bg-[#FFFDFB] border border-[#F0E4D8] rounded-2xl">
                <div className="w-20 h-20 rounded-full border border-gray-200 bg-gray-50 flex items-center justify-center overflow-hidden relative group">
                  {provider?.logoUrl ? (
                    <img src={provider.logoUrl} alt="Store Logo Preview" className="w-full h-full object-cover" />
                  ) : (
                    <span className="text-2xl">🏪</span>
                  )}
                  {uploadingLogo && (
                    <div className="absolute inset-0 bg-black/40 flex items-center justify-center text-xs text-white font-medium">Uploading...</div>
                  )}
                </div>
                <div className="flex flex-col gap-1.5">
                  <label className="text-xs font-bold text-[#E86A33] uppercase tracking-wider cursor-pointer bg-white border border-[#E86A33]/40 hover:bg-[#FFF8F0] px-3 py-1.5 rounded-lg transition-colors">
                    Upload Business Logo
                    <input type="file" accept="image/*" className="hidden" onChange={handleLogoChange} disabled={uploadingLogo} />
                  </label>
                  <span className="text-[11px] text-gray-400">Recommended: Square format PNG or JPG (Max 2MB)</span>
                </div>
              </div>

              <div className="grid sm:grid-cols-2 gap-5 mb-5">
                <div className="sm:col-span-2">
                  <label className="block text-sm font-semibold text-secondary mb-1.5">
                    Business Name
                  </label>
                  <input
                    type="text"
                    value={bizName}
                    onChange={(e) => setBizName(e.target.value)}
                    placeholder="Your business name"
                    className="w-full px-4 py-3 border-2 border-[#F0E4D8] rounded-xl bg-[#FFF8F0] focus:border-primary focus:outline-none focus:ring-4 focus:ring-orange-500/10 transition-all text-sm"
                  />
                </div>
                <div className="sm:col-span-2">
                  <label className="block text-sm font-semibold text-secondary mb-1.5">
                    Bio / Description
                  </label>
                  <textarea
                    value={provider.desc || ''}
                    onChange={(e) => setProvider({ ...provider, desc: e.target.value })}
                    placeholder="Tell pet owners about your business..."
                    rows={3}
                    className="w-full px-4 py-3 border-2 border-[#F0E4D8] rounded-xl bg-[#FFF8F0] focus:border-primary focus:outline-none focus:ring-4 focus:ring-orange-500/10 transition-all text-sm resize-none"
                  />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-secondary mb-1.5">
                    Contact Email
                  </label>
                  <input
                    type="email"
                    value={bizEmail}
                    onChange={(e) => setBizEmail(e.target.value)}
                    placeholder="public@email.com"
                    className="w-full px-4 py-3 border-2 border-[#F0E4D8] rounded-xl bg-[#FFF8F0] focus:border-primary focus:outline-none focus:ring-4 focus:ring-orange-500/10 transition-all text-sm"
                  />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-secondary mb-1.5">
                    Contact Phone
                  </label>
                  <input
                    type="tel"
                    value={bizPhone}
                    onChange={(e) => setBizPhone(e.target.value)}
                    placeholder="+1 555-0123"
                    className="w-full px-4 py-3 border-2 border-[#F0E4D8] rounded-xl bg-[#FFF8F0] focus:border-primary focus:outline-none focus:ring-4 focus:ring-orange-500/10 transition-all text-sm"
                  />
                </div>
              </div>

              <div className="mb-5">
                <label className="block text-sm font-semibold text-secondary mb-1.5">
                  Location
                </label>
                <input
                  type="text"
                  value={bizLocation}
                  onChange={(e) => setBizLocation(e.target.value)}
                  placeholder="City, State"
                  className="w-full px-4 py-3 border-2 border-[#F0E4D8] rounded-xl bg-[#FFF8F0] focus:border-primary focus:outline-none focus:ring-4 focus:ring-orange-500/10 transition-all text-sm"
                />
                <div className="flex flex-col gap-1 mt-3">
                  <label className="text-xs font-semibold text-gray-500 uppercase">Google Maps Navigation Target</label>
                  <input
                    type="text"
                    value={bizGoogleMapsUrl}
                    onChange={(e) => setBizGoogleMapsUrl(e.target.value)}
                    placeholder="Paste Google Maps URL, share link, or specific coordinates"
                    className="w-full px-4 py-3 border-2 border-[#F0E4D8] rounded-xl bg-[#FFF8F0] focus:border-primary focus:outline-none focus:ring-4 focus:ring-orange-500/10 transition-all text-sm"
                  />
                  <p className="text-[11px] text-gray-400 italic">Paste your business share map string link to provide immediate customer GPS navigation routing.</p>
                </div>
              </div>

              {/* ── Operational Hours ─────────────────────────── */}
              <h4 className="font-semibold text-secondary text-sm mb-3 mt-8 border-t border-[#F0E4D8] pt-6">
                🕐 Operational Hours
              </h4>
              <div className="space-y-3 mb-6">
                {weekdays.map((day) => {
                  const sched = availability[day] ?? defaultDaySchedule;
                  return (
                    <div key={day} className="flex items-center gap-3">
                      <label className="w-28 text-sm font-medium text-secondary capitalize flex items-center gap-2">
                        <input
                          type="checkbox"
                          checked={!!sched.isOpen}
                          onChange={() => handleDayToggle(day, sched.isOpen)}
                          className="rounded border-[#D4C8B8] text-primary focus:ring-primary/30"
                        />
                        {day}
                      </label>
                      {sched.isOpen && (
                        <>
                          <input
                            type="time"
                            value={sched.start}
                            onChange={(e) =>
                              setAvailability((prev) => ({
                                ...prev,
                                [day]: { ...prev[day], start: e.target.value },
                              }))
                            }
                            className="px-3 py-2 border-2 border-[#F0E4D8] rounded-xl bg-[#FFF8F0] focus:border-primary focus:outline-none focus:ring-4 focus:ring-orange-500/10 transition-all text-sm"
                          />
                          <span className="text-gray-400 text-sm">to</span>
                          <input
                            type="time"
                            value={sched.end}
                            onChange={(e) =>
                              setAvailability((prev) => ({
                                ...prev,
                                [day]: { ...prev[day], end: e.target.value },
                              }))
                            }
                            className="px-3 py-2 border-2 border-[#F0E4D8] rounded-xl bg-[#FFF8F0] focus:border-primary focus:outline-none focus:ring-4 focus:ring-orange-500/10 transition-all text-sm"
                          />
                        </>
                      )}
                      {!sched.isOpen && (
                        <span className="text-sm text-gray-400 italic">Closed</span>
                      )}
                    </div>
                  );
                })}
              </div>

              <button
                type="button"
                onClick={forceSaveOperatingHours}
                className="mt-2 mb-6 bg-[#E86A33] hover:bg-[#d05928] text-white font-medium py-2 px-5 rounded-xl transition-all text-sm shadow-sm"
              >
                💾 Save Operating Hours Only
              </button>

              <h4 className="font-semibold text-secondary text-sm mb-3">
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
                    className="w-full px-4 py-3 border-2 border-[#F0E4D8] rounded-xl bg-[#FFF8F0] focus:border-primary focus:outline-none focus:ring-4 focus:ring-orange-500/10 transition-all text-sm"
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
                    className="w-full px-4 py-3 border-2 border-[#F0E4D8] rounded-xl bg-[#FFF8F0] focus:border-primary focus:outline-none focus:ring-4 focus:ring-orange-500/10 transition-all text-sm"
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
                    className="w-full px-4 py-3 border-2 border-[#F0E4D8] rounded-xl bg-[#FFF8F0] focus:border-primary focus:outline-none focus:ring-4 focus:ring-orange-500/10 transition-all text-sm"
                  />
                </div>
              </div>

              <button
                type="submit"
                className="bg-primary hover:bg-primary-dark text-white font-semibold px-8 py-3 rounded-full text-sm transition-all"
              >
                Save Changes
              </button>
            </form>

            {/* ── Danger Zone: Delete Account ── */}
            <div className="mt-10 max-w-2xl border-t border-red-200 pt-6">
              <h3 className="text-base font-heading text-red-600 mb-2">⚠️ Danger Zone</h3>
              <p className="text-sm text-gray-500 mb-4">
                Permanently delete your provider account and all associated data
                (bookings, payments, reviews, favorites). This action cannot be undone.
              </p>
              <button
                type="button"
                onClick={() => setShowDeleteConfirm(true)}
                disabled={deletingAccount}
                className="bg-white border-2 border-red-500 text-red-600 hover:bg-red-50 font-semibold px-6 py-2.5 rounded-full text-sm transition-all disabled:opacity-50"
              >
                {deletingAccount ? 'Deleting...' : 'Delete Account'}
              </button>
            </div>

            {/* ── Delete Confirmation Modal ── */}
            {showDeleteConfirm && (
              <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/50 px-4">
                <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-6 animate-modal-in">
                  <h3 className="text-lg font-heading text-red-600 mb-3">Delete Provider Account?</h3>
                  <p className="text-sm text-gray-600 mb-6">
                    This will permanently remove your provider profile, all services, products,
                    bookings, payments, reviews, and favorites. Your user account will be
                    downgraded to a regular pet owner account.
                    <br /><br />
                    <strong>This action cannot be undone.</strong>
                  </p>
                  <div className="flex gap-3 justify-end">
                    <button
                      type="button"
                      onClick={() => setShowDeleteConfirm(false)}
                      disabled={deletingAccount}
                      className="px-5 py-2.5 rounded-xl border border-gray-300 text-sm font-medium text-gray-600 hover:bg-gray-50 transition-all"
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      onClick={handleDeleteAccount}
                      disabled={deletingAccount}
                      className="px-5 py-2.5 rounded-xl bg-red-600 text-sm font-semibold text-white hover:bg-red-700 transition-all disabled:opacity-50"
                    >
                      {deletingAccount ? 'Deleting...' : 'Yes, Delete Everything'}
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
      </main>

      {/* Mobile bottom nav */}
      <div className="md:hidden fixed bottom-0 left-0 right-0 bg-white border-t border-[#F0E4D8] flex justify-around py-2 px-2 z-50">
        {tabConfig.map((t) => (
          <button
            key={t.key}
            onClick={() => setActiveTab(t.key)}
            className={`flex flex-col items-center px-2 py-1.5 rounded-xl text-xs transition-all ${
              activeTab === t.key ? 'text-primary' : 'text-gray-400'
            }`}
          >
            <span className="text-lg">{t.icon}</span>
            <span className="text-[10px]">{t.label}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
