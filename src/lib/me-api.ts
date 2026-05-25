import { getFirebaseAuth } from './firebase';

async function getAuthHeaders() {
  const { auth } = getFirebaseAuth();

  if (!auth?.currentUser) {
    // Firebase Auth user does not exist (deleted, expired, etc.).
    // The app may have a stale localAuth session, but no Firebase
    // ID token is available — API routes require one.
    throw new Error(
      'No Firebase currentUser. User is probably logged in through localAuth only, not Firebase Auth.',
    );
  }

  const token = await auth.currentUser.getIdToken(true);

  return {
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
  };
}

// ─── Pets ──────────────────────────────────────────────────────

export async function fetchMyPets() {
  const res = await fetch('/api/me/pets', {
    headers: await getAuthHeaders(),
    cache: 'no-store',
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    console.error('🐛 API ERROR BODY', {
      url: res.url,
      status: res.status,
      text,
    });
    throw new Error(`API failed ${res.status}: ${text}`);
  }

  const data = await res.json();
  return data.pets || [];
}

export async function addMyPet(pet: {
  name: string;
  type: string;
  breed?: string;
  age?: string;
  notes?: string;
}) {
  const res = await fetch('/api/me/pets', {
    method: 'POST',
    headers: await getAuthHeaders(),
    body: JSON.stringify(pet),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    console.error('🐛 API ERROR BODY', {
      url: res.url,
      status: res.status,
      text,
    });
    throw new Error(`API failed ${res.status}: ${text}`);
  }

  const data = await res.json();
  return data.pet;
}

// ─── Favorites ─────────────────────────────────────────────────

export async function fetchMyFavorites(providerId?: string) {
  const url = providerId
    ? `/api/me/favorites?providerId=${encodeURIComponent(providerId)}`
    : '/api/me/favorites';

  const res = await fetch(url, {
    headers: await getAuthHeaders(),
    cache: 'no-store',
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    console.error('🐛 API ERROR BODY', {
      url: res.url,
      status: res.status,
      text,
    });
    throw new Error(`API failed ${res.status}: ${text}`);
  }

  const data = await res.json();
  return data.favorites || [];
}

export async function addMyFavorite(favorite: {
  providerId: string;
  providerName?: string;
  category?: string;
  emoji?: string;
  rating?: number;
}) {
  const res = await fetch('/api/me/favorites', {
    method: 'POST',
    headers: await getAuthHeaders(),
    body: JSON.stringify(favorite),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    console.error('🐛 API ERROR BODY', {
      url: res.url,
      status: res.status,
      text,
    });
    throw new Error(`API failed ${res.status}: ${text}`);
  }

  const data = await res.json();
  return data.favorite;
}

export async function removeMyFavoriteByProvider(providerId: string) {
  const res = await fetch(
    `/api/me/favorites?providerId=${encodeURIComponent(providerId)}`,
    {
      method: 'DELETE',
      headers: await getAuthHeaders(),
    },
  );

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    console.error('🐛 API ERROR BODY', {
      url: res.url,
      status: res.status,
      text,
    });
    throw new Error(`API failed ${res.status}: ${text}`);
  }

  return true;
}

// ─── Payments ──────────────────────────────────────────────────

/** Fetch payments for the current user (role: 'provider' | 'customer'). */
export async function fetchMyPayments(role: 'provider' | 'customer' = 'customer') {
  const res = await fetch(`/api/payments?role=${role}`, {
    headers: await getAuthHeaders(),
    cache: 'no-store',
  });
  if (!res.ok) throw new Error(`Failed to fetch payments: ${res.status}`);
  const data = await res.json();
  return data.payments || [];
}

/** Update a payment's status by bookingId. */
export async function updatePaymentStatus(bookingId: string, status: string) {
  const res = await fetch('/api/payments', {
    method: 'PATCH',
    headers: await getAuthHeaders(),
    body: JSON.stringify({ bookingId, status }),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Failed to update payment: ${res.status}${text ? ` — ${text}` : ''}`);
  }
  return res.json();
}

/** Delete a payment by bookingId (cascade). */
export async function deletePaymentByBookingId(bookingId: string) {
  const res = await fetch(`/api/payments?bookingId=${encodeURIComponent(bookingId)}`, {
    method: 'DELETE',
    headers: await getAuthHeaders(),
  });
  if (!res.ok && res.status !== 404) {
    const text = await res.text().catch(() => '');
    throw new Error(`Failed to delete payment: ${res.status}${text ? ` — ${text}` : ''}`);
  }
  return true;
}

// ─── Bookings ──────────────────────────────────────────────────

export async function fetchBookedSlots(providerId: string, date: string): Promise<string[]> {
  const res = await fetch(
    `/api/bookings?providerId=${encodeURIComponent(providerId)}&date=${encodeURIComponent(date)}`,
    { headers: await getAuthHeaders(), cache: 'no-store' },
  );
  if (!res.ok) {
    console.error('Failed to fetch booked slots:', res.status);
    return [];
  }
  const data = await res.json();
  return data.bookedSlots || [];
}

export async function addBooking(data: Record<string, unknown>) {
  const res = await fetch('/api/bookings', {
    method: 'POST',
    headers: await getAuthHeaders(),
    body: JSON.stringify(data),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    console.error('🐛 API ERROR BODY', {
      url: res.url,
      status: res.status,
      text,
    });
    throw new Error(`Failed to create booking: ${res.status}${text ? ` — ${text}` : ''}`);
  }

  const result = await res.json();
  return result.bookingId;
}

// ─── Reviews ───────────────────────────────────────────────────

export async function addMyReview(review: {
  providerId: string;
  rating: number;
  comment: string;
  userRole?: string;
}) {
  const res = await fetch('/api/reviews', {
    method: 'POST',
    headers: await getAuthHeaders(),
    body: JSON.stringify(review),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    console.error('🐛 API ERROR BODY', {
      url: res.url,
      status: res.status,
      text,
    });
    throw new Error(`Failed to add review: ${res.status}${text ? ` — ${text}` : ''}`);
  }

  const data = await res.json();
  return {
    id: data.review.id,
    ...data.review,
    providerRating: data.providerRating,
    providerReviews: data.providerReviews,
  };
}

// ─── Account deletion ──────────────────────────────────────────

export async function deleteMyAccount(providerId: string) {
  const res = await fetch('/api/me/account', {
    method: 'DELETE',
    headers: await getAuthHeaders(),
    body: JSON.stringify({ providerId }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error || `Server returned ${res.status}`);
  }

  return res.json() as Promise<{
    deleted: boolean;
    deletedBookings: number;
    deletedPayments: number;
    deletedReviews: number;
    deletedFavorites: number;
    logoUrl: string | null;
    userEmail: string | null;
    userName: string | null;
  }>;
}
