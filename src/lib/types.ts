export type UserRole = 'owner' | 'provider';

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
  id: number;
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
  since?: string;
  phone?: string;
  email?: string;
}

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
