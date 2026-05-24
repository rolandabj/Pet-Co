export type UserRole = 'owner' | 'provider' | 'admin';

export interface AppUser {
  id: string;
  email: string;
  name: string;
  role: UserRole;
  photoURL: string | null;
  phone?: string;
  location?: string;
  bio?: string;
  createdAt: string;
  authMethod: 'email' | 'google';
}

export interface ServiceProvider {
  id: string;
  /** Actual Firestore document name — used for deletes/updates when the
   *  numeric `id` doesn't match the Firestore document key. */
  _firestoreId?: string;
  name: string;
  type: string;
  category: string;
  rating: number;
  reviews: number;
  desc: string;
  tags: string[];
  emoji: string;
  price: string;
  location?: string;
  googleMapsUrl?: string;
  since?: string;
  phone?: string;
  email?: string;
  services?: ServiceItem[];
  businessName?: string;
  contactEmail?: string;
  contactPhone?: string;
  logoUrl?: string;
  socialMedia?: {
    instagram?: string;
    facebook?: string;
    twitter?: string;
    website?: string;
  };
  products?: ProductItem[];
  availability?: Record<string, DaySchedule>;
}

export interface ServiceItem {
  name: string;
  price: string;
  duration?: number; // minutes, e.g. 30, 60, 90
  currency?: string; // ISO code e.g. "USD", "SAR", "AED"
  description?: string;
}

export interface ProductItem {
  id: string;
  name: string;
  price: number;
  image?: string;
  description?: string;
  inStock: boolean;
  currency?: string;
}

/** Per-day operational hours */
export interface DaySchedule {
  isOpen: boolean;
  start: string; // "09:00"
  end: string;   // "17:00"
}

/** Weekly availability block stored on the provider document */
export type ProviderAvailability = Record<string, DaySchedule>;

export interface Booking {
  id: string;
  serviceType: string;
  providerId: string;
  providerName: string;
  date: string;
  time: string;
  status: 'pending' | 'confirmed' | 'completed' | 'cancelled';
  price: number;
}
