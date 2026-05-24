import { getFirebaseAuth } from './firebase';

async function getAuthHeaders() {
  const { auth } = getFirebaseAuth();

  if (!auth?.currentUser) {
    throw new Error('No Firebase user is currently signed in');
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
    throw new Error(`Failed to fetch pets: ${res.status}`);
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
    throw new Error(`Failed to add pet: ${res.status}`);
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
    throw new Error(`Failed to fetch favorites: ${res.status}`);
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
    throw new Error(`Failed to add favorite: ${res.status}`);
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
    throw new Error(`Failed to remove favorite: ${res.status}`);
  }

  return true;
}
