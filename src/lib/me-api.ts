import { getFirebaseAuth } from './firebase';

async function getAuthHeaders() {
  const { auth } = getFirebaseAuth();

  console.log('🐛 CLIENT AUTH DEBUG', {
    hasAuth: Boolean(auth),
    hasCurrentUser: Boolean(auth?.currentUser),
    uid: auth?.currentUser?.uid,
    email: auth?.currentUser?.email,
  });

  if (!auth?.currentUser) {
    throw new Error(
      'No Firebase currentUser. User is probably logged in through localAuth only, not Firebase Auth.',
    );
  }

  const token = await auth.currentUser.getIdToken(true);

  console.log('🐛 CLIENT TOKEN DEBUG', {
    tokenExists: Boolean(token),
    tokenStart: token ? token.slice(0, 20) : null,
  });

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
