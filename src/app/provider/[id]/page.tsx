'use client';

import { useState, useEffect, useCallback } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { getProviderById } from '@/lib/providers';
import { ServiceProvider } from '@/lib/types';
import { useAuth } from '@/context/AuthContext';
import { findFavoriteId, addFavorite, removeFavorite } from '@/lib/favorites';
import { useToast } from '@/components/Toast';
import { getReviewsByProvider, addReview, ReviewDoc } from '@/lib/reviews';

export default function ProviderProfilePage() {
  const params = useParams();
  const id = Number(params.id);
  const { user, firebaseUser } = useAuth();
  const { showToast } = useToast();
  const [provider, setProvider] = useState<ServiceProvider | null>(null);
  const [loading, setLoading] = useState(true);
  const [isFavorited, setIsFavorited] = useState(false);
  const [favDocId, setFavDocId] = useState<string | null>(null);
  const [favToggling, setFavToggling] = useState(false);

  // Review state
  const [reviews, setReviews] = useState<ReviewDoc[]>([]);
  const [reviewsLoading, setReviewsLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [newRating, setNewRating] = useState(0);
  const [newComment, setNewComment] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const checkFavorite = useCallback(async () => {
    const uid = firebaseUser?.uid || user?.id;
    if (!uid) return;
    try {
      const docId = await findFavoriteId(uid, id);
      if (docId) {
        setIsFavorited(true);
        setFavDocId(docId);
      }
    } catch {
      // not critical
    }
  }, [firebaseUser, user, id]);

  useEffect(() => {
    getProviderById(id).then(data => {
      setProvider(data);
      setLoading(false);
    }).catch(err => {
      console.error('Failed to load provider:', err);
      setLoading(false);
    });
  }, [id]);

  useEffect(() => {
    if (!loading) checkFavorite();
  }, [loading, checkFavorite]);

  const handleFavorite = async () => {
    const uid = firebaseUser?.uid || user?.id;
    if (!uid) {
      showToast('Please log in to save favorites.', 'error');
      return;
    }
    if (!provider) return;

    setFavToggling(true);
    try {
      if (isFavorited && favDocId) {
        await removeFavorite(favDocId);
        setIsFavorited(false);
        setFavDocId(null);
        showToast('Removed from favorites.', 'success');
      } else {
        const newId = await addFavorite({
          userId: uid,
          providerId: id,
          providerName: provider.name,
          category: provider.category,
          emoji: provider.emoji,
          rating: provider.rating,
        });
        setIsFavorited(true);
        setFavDocId(newId);
        showToast('Added to favorites!', 'success');
      }
    } catch (err) {
      console.error('Favorite toggle failed:', err);
      showToast('Something went wrong. Try again.', 'error');
    } finally {
      setFavToggling(false);
    }
  };


  const fetchReviews = useCallback(async () => {
    try {
      const list = await getReviewsByProvider(id);
      setReviews(list);
    } catch (err) {
      console.error('Failed to fetch reviews:', err);
    } finally {
      setReviewsLoading(false);
    }
  }, [id]);

  useEffect(() => {
    if (!loading) fetchReviews();
  }, [loading, fetchReviews]);

  const handleSubmitReview = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newRating) {
      showToast('Please select a rating.', 'error');
      return;
    }
    const uid = firebaseUser?.uid || user?.id;
    if (!uid) {
      showToast('Please log in to submit a review.', 'error');
      return;
    }
    setSubmitting(true);
    try {
      await addReview({
        providerId: id,
        userId: uid,
        userName: user?.name || 'Anonymous',
        rating: newRating,
        comment: newComment.trim(),
      });
      showToast('✅ Review submitted!', 'success');
      setNewRating(0);
      setNewComment('');
      setShowForm(false);
      // Refresh the list
      const list = await getReviewsByProvider(id);
      setReviews(list);
    } catch (err) {
      console.error('Failed to submit review:', err);
      showToast('❌ Failed to submit review. Try again.', 'error');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="pt-[120px] min-h-screen flex items-center justify-center">
        <div className="w-10 h-10 border-3 border-[#F0E4D8] border-t-[#E86A33] rounded-full animate-spin" />
      </div>
    );
  }

  if (!provider) {
    return (
      <div className="pt-[120px] min-h-screen text-center">
        <div className="text-4xl mb-4 opacity-50">🔍</div>
        <h2 className="text-2xl font-heading text-[#2C3E50]">Provider not found</h2>
        <Link href="/services" className="text-[#E86A33] font-semibold text-sm">Browse all providers</Link>
      </div>
    );
  }

  return (
    <div className="pt-[120px] pb-20 min-h-screen">
      <div className="max-w-[900px] mx-auto px-6">
        <Link href="/services" className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-[#E86A33] mb-6">← Back to Services</Link>

        {/* Provider header */}
        <div className="bg-white rounded-2xl p-8 sm:p-10 border border-[#F0E4D8] mb-8 sm:grid sm:grid-cols-[auto_1fr] gap-8">
          <div className="w-[100px] h-[100px] rounded-full bg-[#FFF0E0] flex items-center justify-center text-3xl mx-auto sm:mx-0 flex-shrink-0 mb-4 sm:mb-0">
            {provider.emoji}
          </div>
          <div>
            <h2 className="text-2xl font-heading text-[#2C3E50]">{provider.name}</h2>
            <div className="text-yellow-500 text-sm mb-2">
              {'★'.repeat(Math.floor(provider.rating))}{provider.rating % 1 >= 0.5 ? '½' : ''} <span className="text-gray-500 font-medium">{provider.rating}</span> <span className="text-gray-400">({provider.reviews} reviews)</span>
            </div>
            <div className="flex flex-wrap gap-4 text-sm text-gray-500 mb-3">
              <span>📍 {provider.location || 'New York, NY'}</span>
              <span>📅 Member since {provider.since || '2022'}</span>
              <span>💼 {provider.category}</span>
            </div>
            <p className="text-sm text-gray-600 mb-4">{provider.desc}</p>
            <div className="flex flex-wrap gap-2 mb-5">
              {provider.tags.map(t => <span key={t} className="px-3 py-1 bg-[#FFF8F0] rounded-full text-xs font-medium text-gray-500">{t}</span>)}
            </div>
            <div className="flex gap-3 flex-wrap">
              <Link href={`/booking?provider=${provider.id}`} className="bg-[#E86A33] hover:bg-[#D4552A] text-white font-semibold px-6 py-3 rounded-full text-sm transition-all">
                Book Now — {provider.price}
              </Link>
              <button onClick={handleFavorite} disabled={favToggling} className={`border-2 font-semibold px-6 py-3 rounded-full text-sm transition-all ${isFavorited ? 'bg-red-50 border-red-300 text-red-500 hover:bg-red-100' : 'border-[#2C3E50] text-[#2C3E50] hover:bg-[#2C3E50] hover:text-white'}`}>
                {isFavorited ? '❤️ Favorited' : '🤍 Favorite'}
              </button>
            </div>
          </div>
        </div>

        {/* Reviews */}
        <div className="flex items-center justify-between mb-5">
          <h3 className="text-lg font-heading text-[#2C3E50]">⭐ Reviews <span className="text-sm font-normal text-gray-400">({reviews.length})</span></h3>
          <button
            onClick={() => {
              if (!user) { showToast('Please log in to write a review.', 'error'); return; }
              setShowForm(!showForm);
            }}
            className="text-sm font-semibold text-[#E86A33] hover:text-[#D4552A] transition-all"
          >
            + Write a Review
          </button>
        </div>

        {/* Review form */}
        {showForm && (
          <form onSubmit={handleSubmitReview} className="bg-white border border-[#F0E4D8] rounded-2xl p-6 mb-6">
            <h4 className="text-sm font-semibold text-[#2C3E50] mb-4">Share your experience</h4>
            {/* Star rating */}
            <div className="mb-4">
              <label className="block text-sm font-semibold text-[#2C3E50] mb-2">Rating</label>
              <div className="flex gap-1">
                {[1, 2, 3, 4, 5].map(star => (
                  <button
                    key={star}
                    type="button"
                    onClick={() => setNewRating(star)}
                    className={`w-9 h-9 rounded-lg text-lg transition-all ${star <= newRating ? 'text-yellow-500 scale-110' : 'text-gray-300'}`}
                  >
                    ★
                  </button>
                ))}
              </div>
            </div>
            {/* Comment */}
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
              <button type="submit" disabled={submitting} className="bg-[#E86A33] hover:bg-[#D4552A] text-white font-semibold px-6 py-2.5 rounded-full text-sm transition-all disabled:opacity-50">
                {submitting ? 'Submitting...' : 'Submit Review'}
              </button>
              <button type="button" onClick={() => setShowForm(false)} className="border border-[#F0E4D8] text-gray-500 font-semibold px-6 py-2.5 rounded-full text-sm hover:bg-gray-50 transition-all">
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
            <p className="text-sm text-gray-400">No reviews yet. Be the first to share your experience!</p>
          </div>
        ) : (
          <div className="flex flex-col gap-4">
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
                  <span className="text-xs text-gray-400">{r.createdAt ? 'Just now' : ''}</span>
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
