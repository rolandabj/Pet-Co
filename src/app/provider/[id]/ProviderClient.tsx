'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { ServiceProvider, ServiceItem, ProductItem } from '@/lib/types';
import { formatProductPrice } from '@/lib/formatProductPrice';
import { useAuth } from '@/context/AuthContext';
import { useToast } from '@/components/Toast';
import {
  addReviewRest,
  findFavoriteIdRest,
  addFavoriteRest,
  removeFavoriteRest,
  getReviewsByProviderRest,
  updateProviderDocRest,
} from '@/lib/firestore-rest';
import type { ReviewDoc } from '@/lib/firestore-rest';

interface Props {
  provider: ServiceProvider | null;
  reviews: ReviewDoc[];
  providerId: string;
}

export default function ProviderClient({ provider: initialProvider, reviews: initialReviews, providerId }: Props) {
  const { user, firebaseUser } = useAuth();
  const isAdmin = user?.role === 'admin';
  const { showToast } = useToast();
  const router = useRouter();

  // ---------- provider state (mutable for review sync) ----------
  const [provider, setProvider] = useState<ServiceProvider | null>(initialProvider);
  const providerPhoneNumber = provider?.phone || provider?.contactPhone;

  // ---------- favorite state ----------
  const [isFavorited, setIsFavorited] = useState(false);
  const [favDocId, setFavDocId] = useState<string | null>(null);
  const [favToggling, setFavToggling] = useState(false);

  // ---------- review state ----------
  const [reviews, setReviews] = useState<ReviewDoc[]>(initialReviews);
  const [reviewsLoading, setReviewsLoading] = useState(false);

  // Fetch live reviews from Firestore on mount and after each submission
  const fetchLiveReviews = useCallback(async () => {
    if (!providerId) return;
    setReviewsLoading(true);
    try {
      const docs = await getReviewsByProviderRest(providerId);
      setReviews(docs);
    } catch (err) {
      console.error('Failed to fetch reviews:', err);
    } finally {
      setReviewsLoading(false);
    }
  }, [providerId]);

  useEffect(() => {
    fetchLiveReviews();
  }, [fetchLiveReviews]);

  const [showForm, setShowForm] = useState(false);
  const [newRating, setNewRating] = useState(0);
  const [newComment, setNewComment] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const uid = firebaseUser?.uid || user?.id;

  /* ── check if already favorited ── */
  const checkFavorite = useCallback(async () => {
    if (!uid || !provider) return;
    try {
      const docId = await findFavoriteIdRest(uid, providerId);
      if (docId) {
        setIsFavorited(true);
        setFavDocId(docId);
      }
    } catch {
      // not critical
    }
  }, [uid, provider, providerId]);

  useEffect(() => {
    checkFavorite();
  }, [checkFavorite]);

  /* ── favorite toggle ── */
  const handleFavorite = async () => {
    if (!uid) {
      showToast('⚠️ Please log in to favorite businesses', 'error');
      router.push('/login');
      return;
    }
    if (!provider) return;

    setFavToggling(true);
    try {
      if (isFavorited && favDocId) {
        await removeFavoriteRest(favDocId);
        setIsFavorited(false);
        setFavDocId(null);
        showToast('Removed from favorites.', 'success');
      } else {
        const newId = await addFavoriteRest({
          userId: uid,
          providerId,
          providerName: provider.name,
          category: provider.category,
          emoji: provider.emoji,
          rating: provider.rating,
        });
        setIsFavorited(true);
        setFavDocId(newId);
        showToast('Added to favorites!', 'success');
      }
    } catch {
      showToast('Something went wrong. Try again.', 'error');
    } finally {
      setFavToggling(false);
    }
  };

  /* ── review submission ── */
  const handleSubmitReview = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newRating) {
      showToast('Please select a rating.', 'error');
      return;
    }
    if (!uid) {
      showToast('⚠️ You must be logged in to leave a review', 'error');
      router.push('/login');
      return;
    }
    setSubmitting(true);
    try {
      const reviewPayload = {
        providerId,
        userId: uid,
        userName: user?.name || user?.email?.split('@')[0] || 'Anonymous',
        rating: newRating,
        comment: newComment.trim(),
        userRole: user?.role,
      };
      await addReviewRest(reviewPayload);

      // Sync provider rating/reviewCount aggregates
      try {
        const allReviews = await getReviewsByProviderRest(providerId);
        const totalReviews = allReviews.length;
        const totalStars = allReviews.reduce((sum, r) => sum + r.rating, 0);
        const computedAvg = totalReviews > 0 ? totalStars / totalReviews : 0;
        const roundedAvg = parseFloat(computedAvg.toFixed(1));

        await updateProviderDocRest(providerId, {
          rating: roundedAvg,
          reviews: totalReviews,
        });

        // Update local state so header reflects instantly
        setProvider(prev => prev ? { ...prev, rating: roundedAvg, reviews: totalReviews } : prev);
      } catch (syncErr) {
        console.error('Failed to sync review aggregates:', syncErr);
        // Non-fatal — review itself was saved
      }

      showToast('✅ Review submitted!', 'success');
      setNewRating(0);
      setNewComment('');
      setShowForm(false);
      // Re-fetch live reviews so the list shows the new entry immediately
      fetchLiveReviews();
    } catch {
      showToast('❌ Failed to submit review. Try again.', 'error');
    } finally {
      setSubmitting(false);
    }
  };

  /* ── not found ── */
  if (!provider) {
    return (
      <div className="pt-[120px] min-h-screen text-center">
        <div className="text-4xl mb-4 opacity-50">🔍</div>
        <h2 className="text-2xl font-heading text-[#2C3E50]">Provider not found</h2>
        <Link href="/services" className="text-[#E86A33] font-semibold text-sm">Browse all providers</Link>
      </div>
    );
  }

  /* ── star renderer ── */
  const renderStars = (rating: number) => {
    const full = Math.floor(rating);
    const half = rating % 1 >= 0.5;
    return (
      <>
        {'★'.repeat(full)}
        {half && '½'}
      </>
    );
  };

  return (
    <div className="pt-[120px] pb-20 min-h-screen">
      <div className="max-w-[1000px] mx-auto px-6">
        {/* Back link */}
        <Link
          href="/services"
          className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-[#E86A33] mb-6 transition-all"
        >
          ← Back to Services
        </Link>

        {/* ── Hero card ── */}
        <div className="bg-white rounded-2xl p-8 sm:p-10 border border-[#F0E4D8] mb-8">
          <div className="sm:flex sm:items-start sm:gap-8">
            {/* Avatar */}
            <div className="w-[100px] h-[100px] rounded-full bg-[#FFF8F0] border border-[#F0E4D8] flex items-center justify-center overflow-hidden mx-auto sm:mx-0 flex-shrink-0 mb-4 sm:mb-0 shadow-sm relative">
              {provider.logoUrl ? (
                <Image src={provider.logoUrl} alt={`${provider.name || 'Business'} Logo`} fill className="object-cover" sizes="100px" />
              ) : (
                <div className="w-12 h-12 bg-[#FFF3E5] rounded-full flex items-center justify-center text-2xl">
                  🛍️
                </div>
              )}
            </div>

            {/* Identity & meta */}
            <div className="flex-1 min-w-0 text-center sm:text-left">
              <h1 className="text-2xl font-heading text-[#2C3E50]">{provider.businessName || provider.name}</h1>

              {/* Rating */}
              <div className="text-yellow-500 text-sm mb-1.5">
                {provider.reviews > 0 ? (
                  <>{renderStars(provider.rating)}
                    <span className="text-gray-500 font-medium ml-1">{provider.rating}</span>
                    <span className="text-gray-400 ml-1">({provider.reviews} {provider.reviews === 1 ? 'review' : 'reviews'})</span>
                  </>
                ) : (
                  <span className="text-gray-400">No reviews yet</span>
                )}
              </div>

              {/* Quick info row */}
              <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-gray-500 mb-3 justify-center sm:justify-start">
                <span className="flex items-center gap-1">💼 {provider.category}</span>

                {/* High-Visibility Interactive Google Maps Link Wrap */}
                {(provider?.googleMapsUrl || provider?.location) && (
                  <div className="flex items-center gap-1 mt-1">
                    <span className="text-sm">📍</span>
                    <a
                      href={provider.googleMapsUrl?.startsWith('http')
                        ? provider.googleMapsUrl
                        : `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(provider.location || provider.googleMapsUrl || '')}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-sm font-bold text-[#E86A33] underline hover:text-[#d05928] cursor-pointer transition-all duration-150 inline-flex items-center"
                      title="Click to navigate via Google Maps"
                    >
                      {provider.location && !provider.location.startsWith('http')
                        ? `${provider.location} (Click for Maps)`
                        : 'Open in Google Maps (Click for Maps)'}
                    </a>
                  </div>
                )}

                <span className="flex items-center gap-1">📅 Member since {new Date(provider.since || Date.now()).getFullYear()}</span>
              </div>

              <p className="text-sm text-gray-600 mb-4 max-w-[600px] mx-auto sm:mx-0">
                {provider.desc}
              </p>

              {/* Trust badges (tags) */}
              {provider.tags.length > 0 && (
                <div className="flex flex-wrap gap-2 mb-5 justify-center sm:justify-start">
                  {provider.tags.map(t => (
                    <span
                      key={t}
                      className="px-3 py-1 bg-[#FFF8F0] rounded-full text-xs font-medium text-gray-500 border border-[#F0E4D8]"
                    >
                      ✓ {t}
                    </span>
                  ))}
                </div>
              )}

              {/* Action buttons — only visible to owners and guests */}
              {user?.role !== 'provider' && (
                <div className="flex gap-3 flex-wrap justify-center sm:justify-start">
                  <Link
                    href={`/booking?providerId=${provider.id}`}
                    className="bg-[#E86A33] hover:bg-[#D4552A] text-white font-semibold px-6 py-3 rounded-full text-sm transition-all"
                  >
                    Book Now
                  </Link>
                  <button
                    onClick={handleFavorite}
                    disabled={favToggling}
                    className={`border-2 font-semibold px-6 py-3 rounded-full text-sm transition-all ${
                      isFavorited
                        ? 'bg-orange-50 border-orange-300 text-[#E86A33] hover:bg-orange-100'
                        : 'border-[#2C3E50] text-[#2C3E50] hover:bg-[#2C3E50] hover:text-white'
                    }`}
                  >
                    {isFavorited ? '❤️ Favorited' : '🤍 Favorite'}
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* ── Two-column layout: Contact (admin-only) + Services ── */}
        <div className={`grid ${isAdmin ? 'md:grid-cols-2' : 'md:grid-cols-1'} gap-6 mb-8`}>
          {/* Conditionally reveal direct contact nodes strictly to the main administrator */}
          {isAdmin && (
            <div className="bg-white border border-[#F0E4D8]/60 p-6 rounded-2xl shadow-sm">
              <h3 className="font-semibold text-[#2C3E50] text-lg mb-4 flex items-center gap-2">
                📞 Contact Information (Admin Only)
              </h3>
              <div className="flex flex-col gap-3">
                {providerPhoneNumber ? (
                  <div>
                    <span className="text-xs text-gray-400 block uppercase font-semibold">Phone</span>
                    <span className="text-sm font-medium text-gray-700">{providerPhoneNumber}</span>
                  </div>
                ) : (
                  <div>
                    <span className="text-xs text-gray-400 block uppercase font-semibold">Phone</span>
                    <span className="text-sm italic text-gray-400">No phone number provided</span>
                  </div>
                )}
                {provider.email && (
                  <div>
                    <span className="text-xs text-gray-400 block uppercase font-semibold">Email</span>
                    <span className="text-sm font-medium text-gray-700">{provider.email}</span>
                  </div>
                )}
                {provider.location && (
                  <div>
                    <span className="text-xs text-gray-400 block uppercase font-semibold">Address</span>
                    <span className="text-sm font-medium text-gray-700">{provider.location}</span>
                  </div>
                )}
                {(!providerPhoneNumber && !provider.email) && (
                  <p className="text-gray-400 italic text-sm">No contact details listed.</p>
                )}
              </div>
            </div>
          )}

          {/* Services & Pricing grid */}
          <div className="bg-white rounded-2xl p-7 border border-[#F0E4D8]">
            <h3 className="text-base font-heading text-[#2C3E50] mb-4 flex items-center gap-2">
              💰 Services & Pricing
            </h3>
            {provider.services && provider.services.length > 0 ? (
              <div className="space-y-2">
                {provider.services.map((svc: ServiceItem, idx: number) => (
                  <div
                    key={idx}
                    className="w-full bg-white border border-[#F0E4D8]/60 p-3.5 rounded-xl flex flex-col gap-1 my-2"
                  >
                    <div className="flex justify-between items-center w-full">
                      <span className="font-semibold text-[#2C3E50] text-sm md:text-base">
                        {svc.name}
                      </span>
                      <span className="font-bold text-[#E86A33]">
                        {svc.price} {svc.currency || 'USD'}
                      </span>
                    </div>
                    {svc.description && (
                      <p className="text-xs md:text-sm text-gray-500 mt-0.5 max-w-[90%] leading-relaxed">
                        {svc.description}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-gray-400 italic">
                {provider.price} — Contact for full pricing details.
              </p>
            )}
          </div>
        </div>

        {/* ── Products / Retail horizontal scroll showcase ── */}
        {provider.products && provider.products.length > 0 && (
          <div className="bg-white rounded-2xl p-7 border border-[#F0E4D8] mb-8">
            <h3 className="text-base font-heading text-[#2C3E50] mb-4 flex items-center gap-2">
              🛒 Shop Products &amp; Retail
            </h3>
            <div className="flex gap-5 overflow-x-auto scroll-smooth snap-x snap-mandatory pb-4 -mx-1 px-1 scrollbar-none">
              {provider.products.map((product: ProductItem) => (
                <div
                  key={product.id}
                  className="flex-none w-72 h-auto snap-center bg-white rounded-3xl border border-[#F0E4D8] overflow-hidden group hover:border-[#E86A33] transition-all duration-300"
                >
                  {/* Image container — 1:1 aspect ratio */}
                  <div className="relative aspect-square bg-gradient-to-br from-orange-50 to-amber-100 overflow-hidden">
                    <Image
                      src={product.image || '/placeholder.svg'}
                      alt={product.name}
                      fill
                      sizes="288px"
                      className="object-cover group-hover:scale-105 transition-transform duration-500"
                      loading="lazy"
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-black/10 to-transparent pointer-events-none" />
                  </div>
                  {/* Details below image */}
                  <div className="p-4 flex flex-col gap-2">
                    <h4 className="text-sm font-bold text-[#2C3E50] truncate">{product.name}</h4>
                    {product.description && (
                      <p className="text-xs text-gray-500 leading-relaxed line-clamp-2">
                        {product.description}
                      </p>
                    )}
                    <div className="flex items-center gap-2 mt-1">
                      <span className="text-xs font-bold text-[#0D9488] bg-teal-50 px-2.5 py-1 rounded-full">
                        {formatProductPrice(product.price, product.currency)}
                      </span>
                      <span
                        className={`text-[10px] px-2 py-1 rounded-full font-semibold ${
                          product.inStock
                            ? 'bg-emerald-500/10 text-emerald-600'
                            : 'bg-gray-500/10 text-gray-500'
                        }`}
                      >
                        {product.inStock ? '✓ In Stock' : 'Out of Stock'}
                      </span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── Trust badges row ── */}
        {provider.since && (
          <div className="bg-white rounded-2xl p-5 border border-[#F0E4D8] mb-8 flex flex-wrap items-center gap-6 text-sm">
            <div className="flex items-center gap-2">
              <span className="text-lg">🏆</span>
              <div>
                <p className="text-xs text-gray-400">Member Since</p>
                <p className="font-semibold text-[#2C3E50]">{provider.since}</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-lg">⭐</span>
              <div>
                <p className="text-xs text-gray-400">Rating</p>
                <p className="font-semibold text-[#2C3E50]">{provider.rating} / 5</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-lg">💬</span>
              <div>
                <p className="text-xs text-gray-400">Total Reviews</p>
                <p className="font-semibold text-[#2C3E50]">{provider.reviews}</p>
              </div>
            </div>
          </div>
        )}

        {/* ── Reviews section ── */}
        <div className="flex items-center justify-between mb-5">
          <h3 className="text-lg font-heading text-[#2C3E50]">
            ⭐ Reviews{' '}
            <span className="text-sm font-normal text-gray-400">({reviews.length})</span>
          </h3>
          {user?.role === 'owner' && (
            <button
              onClick={() => {
                if (!user) {
                  showToast('⚠️ You must be logged in to leave a review', 'error');
                  router.push('/login');
                  return;
                }
                setShowForm(!showForm);
              }}
              className="text-sm font-semibold text-[#E86A33] hover:text-[#D4552A] transition-all"
            >
              + Write a Review
            </button>
          )}
        </div>

        {/* Review form */}
        {showForm && (
          <form onSubmit={handleSubmitReview} className="bg-white border border-[#F0E4D8] rounded-2xl p-6 mb-6">
            <h4 className="text-sm font-semibold text-[#2C3E50] mb-4">Share your experience</h4>
            <div className="mb-4">
              <label className="block text-sm font-semibold text-[#2C3E50] mb-2">Rating</label>
              <div className="flex gap-1">
                {[1, 2, 3, 4, 5].map(star => (
                  <button
                    key={star}
                    type="button"
                    onClick={() => setNewRating(star)}
                    className={`w-9 h-9 rounded-lg text-lg transition-all ${
                      star <= newRating ? 'text-yellow-500 scale-110' : 'text-gray-300'
                    }`}
                  >
                    ★
                  </button>
                ))}
              </div>
            </div>
            <div className="mb-4">
              <label className="block text-sm font-semibold text-[#2C3E50] mb-2">Comment</label>
              <textarea
                value={newComment}
                onChange={e => setNewComment(e.target.value)}
                rows={4}
                placeholder="Tell others about your experience..."
                className="w-full px-4 py-3 border-2 border-[#F0E4D8] rounded-xl bg-[#FFF8F0] focus:border-[#E86A33] focus:bg-white focus:outline-none focus:ring-4 focus:ring-orange-500/10 transition-all text-sm resize-vertical"
              />
            </div>
            <div className="flex gap-3">
              <button
                type="submit"
                disabled={submitting}
                className="bg-[#E86A33] hover:bg-[#D4552A] text-white font-semibold px-6 py-2.5 rounded-full text-sm transition-all disabled:opacity-50"
              >
                {submitting ? 'Submitting...' : 'Submit Review'}
              </button>
              <button
                type="button"
                onClick={() => setShowForm(false)}
                className="border border-[#F0E4D8] text-gray-500 font-semibold px-6 py-2.5 rounded-full text-sm hover:bg-gray-50 transition-all"
              >
                Cancel
              </button>
            </div>
          </form>
        )}

        {/* Review list */}
        {reviewsLoading ? (
          <div className="flex justify-center py-10">
            <div className="w-8 h-8 border-3 border-[#F0E4D8] border-t-[#E86A33] rounded-full animate-spin" />
          </div>
        ) : reviews.length === 0 ? (
          <div className="bg-white border border-[#F0E4D8] rounded-2xl p-10 text-center">
            <div className="text-4xl mb-3 opacity-50">💬</div>
            <p className="text-sm text-gray-400">
              No reviews yet. Be the first to share your experience!
            </p>
          </div>
        ) : (
          <div className="flex flex-col gap-4 max-h-[600px] overflow-y-auto pr-1">
            {reviews.map(r => (
              <div key={r.id} className="bg-white border border-[#F0E4D8] rounded-2xl p-6">
                <div className="flex justify-between items-center mb-3">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-[#FFF0E0] flex items-center justify-center text-sm font-bold text-[#E86A33]">
                      {r.userName.charAt(0).toUpperCase()}
                    </div>
                    <div>
                      <strong className="text-sm text-[#2C3E50]">{r.userName}</strong>
                      <div className="text-yellow-500 text-xs">{'★'.repeat(r.rating)}</div>
                    </div>
                  </div>
                </div>
                <p className="text-sm text-[#2C3E50]">{r.comment}</p>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
