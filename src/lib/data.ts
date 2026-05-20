import { ServiceProvider } from './types';

export const providers: ServiceProvider[] = [
  { id: 1, name: 'Sarah W.', type: 'walkers', category: 'Dog Walker', rating: 4.9, reviews: 127, desc: 'Experienced dog walker with 5+ years. Loves all breeds!', tags: ['Dog Walking', 'Pet Sitting'], emoji: '🐕', price: '$25/hr', location: 'Brooklyn, NY', since: '2021' },
  { id: 2, name: 'Dr. Martinez', type: 'vets', category: 'Veterinarian', rating: 4.8, reviews: 93, desc: 'Small animal specialist with gentle approach.', tags: ['Vet', 'Vaccinations', 'Surgery'], emoji: '🏥', price: '$60/visit', location: 'Manhattan, NY', since: '2019' },
  { id: 3, name: 'Paws Paradise Hotel', type: 'hotels', category: 'Dog Hotel', rating: 4.9, reviews: 210, desc: 'Luxury boarding with indoor pool and play areas.', tags: ['Boarding', 'Daycare', 'Spa'], emoji: '🏨', price: '$45/night', location: 'Queens, NY', since: '2018' },
  { id: 4, name: 'PetCozy Shop', type: 'shops', category: 'Pet Shop', rating: 4.7, reviews: 341, desc: 'Premium pet supplies, food, and accessories.', tags: ['Food', 'Toys', 'Accessories'], emoji: '🛍️', price: '$$', location: 'Brooklyn, NY', since: '2020' },
  { id: 5, name: 'Fluffy Cuts', type: 'grooming', category: 'Groomer', rating: 4.8, reviews: 156, desc: 'Professional grooming for all breeds and sizes.', tags: ['Grooming', 'Bathing', 'Nail Trim'], emoji: '✂️', price: '$35/session', location: 'Manhattan, NY', since: '2022' },
  { id: 6, name: 'James Bond', type: 'walkers', category: 'Dog Walker', rating: 4.7, reviews: 88, desc: 'Adventurous walker. Your dog will explore new trails!', tags: ['Dog Walking', 'Hiking'], emoji: '🐕', price: '$30/hr', location: 'Brooklyn, NY', since: '2023' },
  { id: 7, name: 'Dr. Chen', type: 'vets', category: 'Veterinarian', rating: 4.9, reviews: 204, desc: 'Holistic vet. Specializes in integrative medicine.', tags: ['Vet', 'Holistic', 'Acupuncture'], emoji: '🏥', price: '$75/visit', location: 'Manhattan, NY', since: '2017' },
  { id: 8, name: 'Cozy Paws Sitting', type: 'sitters', category: 'Pet Sitter', rating: 4.8, reviews: 67, desc: 'In-home pet sitting. Your pet stays comfortable at home.', tags: ['Pet Sitting', 'Overnight'], emoji: '🛋️', price: '$40/night', location: 'Queens, NY', since: '2022' },
  { id: 9, name: 'Bark & Board Hotel', type: 'hotels', category: 'Dog Hotel', rating: 4.6, reviews: 178, desc: 'Spacious suites with 24/7 care and webcams.', tags: ['Boarding', 'Webcam', 'Playtime'], emoji: '🏨', price: '$35/night', location: 'Bronx, NY', since: '2020' },
  { id: 10, name: 'The Grooming Lounge', type: 'grooming', category: 'Groomer', rating: 4.9, reviews: 223, desc: 'Luxury grooming with organic products.', tags: ['Grooming', 'Spa', 'Organic'], emoji: '✂️', price: '$50/session', location: 'Brooklyn, NY', since: '2019' },
  { id: 11, name: 'Healthy Paws Shop', type: 'shops', category: 'Pet Shop', rating: 4.6, reviews: 98, desc: 'Natural pet food and eco-friendly accessories.', tags: ['Organic', 'Eco-friendly', 'Food'], emoji: '🛍️', price: '$$', location: 'Manhattan, NY', since: '2021' },
  { id: 12, name: "Anna's Pet Sitting", type: 'sitters', category: 'Pet Sitter', rating: 4.9, reviews: 145, desc: 'Certified pet sitter. CPR trained.', tags: ['Pet Sitting', 'CPR Certified'], emoji: '🛋️', price: '$35/night', location: 'Brooklyn, NY', since: '2020' },
];

export const serviceTypes = [
  { value: 'walking', label: '🐕 Dog Walking', price: 25 },
  { value: 'vet', label: '🏥 Vet Visit', price: 60 },
  { value: 'hotel', label: '🏨 Dog Hotel', price: 45 },
  { value: 'sitting', label: '🛋️ Pet Sitting', price: 40 },
  { value: 'grooming', label: '✂️ Grooming', price: 35 },
  { value: 'shop', label: '🛍️ Pet Shop', price: 0 },
];
