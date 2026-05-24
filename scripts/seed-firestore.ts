/**
 * One-time seed script: uploads hardcoded provider data from data.ts
 * into the Firestore `providers` collection.
 *
 * Usage: npx tsx scripts/seed-firestore.ts
 */
import { initializeApp, getApps } from 'firebase/app';
import { getFirestore, collection, doc, setDoc } from 'firebase/firestore';

// Load .env.local manually (dotenv isn't available, so inline)
const envVars = [
  'NEXT_PUBLIC_FIREBASE_API_KEY',
  'NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN',
  'NEXT_PUBLIC_FIREBASE_PROJECT_ID',
  'NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET',
  'NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID',
  'NEXT_PUBLIC_FIREBASE_APP_ID',
];

// Attempt to read env from process.env (npx tsx will inherit shell env)
const config = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY || '',
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN || '',
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || '',
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET || '',
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID || '',
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID || '',
};

const missing = envVars.filter(v => !process.env[v]);
if (missing.length) {
  console.error(
    `Missing env vars: ${missing.join(', ')}\n` +
    'Run this script from the project root after sourcing .env.local:\n' +
    '  export $(grep -v "^#" .env.local | xargs) && npx tsx scripts/seed-firestore.ts'
  );
  process.exit(1);
}

// Hardcoded provider data matching src/lib/data.ts
const providers = [
  { id: 1, name: 'Sarah W.', type: 'walkers', category: 'Dog Walker', rating: 0, reviews: 0, desc: 'Experienced dog walker with 5+ years. Loves all breeds!', tags: ['Dog Walking', 'Pet Sitting'], emoji: '🐕', price: '$25/hr', location: 'Brooklyn, NY', since: '2021' },
  { id: 2, name: 'Dr. Martinez', type: 'vets', category: 'Veterinarian', rating: 0, reviews: 0, desc: 'Small animal specialist with gentle approach.', tags: ['Vet', 'Vaccinations', 'Surgery'], emoji: '🏥', price: '$60/visit', location: 'Manhattan, NY', since: '2019' },
  { id: 3, name: 'Paws Paradise Hotel', type: 'hotels', category: 'Dog Hotel', rating: 0, reviews: 0, desc: 'Luxury boarding with indoor pool and play areas.', tags: ['Boarding', 'Daycare', 'Spa'], emoji: '🏨', price: '$45/night', location: 'Queens, NY', since: '2018' },
  { id: 4, name: 'PetCozy Shop', type: 'shops', category: 'Pet Shop', rating: 0, reviews: 0, desc: 'Premium pet supplies, food, and accessories.', tags: ['Food', 'Toys', 'Accessories'], emoji: '🛍️', price: '$$', location: 'Brooklyn, NY', since: '2020' },
  { id: 5, name: 'Fluffy Cuts', type: 'grooming', category: 'Groomer', rating: 0, reviews: 0, desc: 'Professional grooming for all breeds and sizes.', tags: ['Grooming', 'Bathing', 'Nail Trim'], emoji: '✂️', price: '$35/session', location: 'Manhattan, NY', since: '2022' },
  { id: 6, name: 'James Bond', type: 'walkers', category: 'Dog Walker', rating: 0, reviews: 0, desc: 'Adventurous walker. Your dog will explore new trails!', tags: ['Dog Walking', 'Hiking'], emoji: '🐕', price: '$30/hr', location: 'Brooklyn, NY', since: '2023' },
  { id: 7, name: 'Dr. Chen', type: 'vets', category: 'Veterinarian', rating: 0, reviews: 0, desc: 'Holistic vet. Specializes in integrative medicine.', tags: ['Vet', 'Holistic', 'Acupuncture'], emoji: '🏥', price: '$75/visit', location: 'Manhattan, NY', since: '2017' },
  { id: 8, name: 'Cozy Paws Sitting', type: 'sitters', category: 'Pet Sitter', rating: 0, reviews: 0, desc: 'In-home pet sitting. Your pet stays comfortable at home.', tags: ['Pet Sitting', 'Overnight'], emoji: '🛋️', price: '$40/night', location: 'Queens, NY', since: '2022' },
  { id: 9, name: 'Bark & Board Hotel', type: 'hotels', category: 'Dog Hotel', rating: 0, reviews: 0, desc: 'Spacious suites with 24/7 care and webcams.', tags: ['Boarding', 'Webcam', 'Playtime'], emoji: '🏨', price: '$35/night', location: 'Bronx, NY', since: '2020' },
  { id: 10, name: 'The Grooming Lounge', type: 'grooming', category: 'Groomer', rating: 0, reviews: 0, desc: 'Luxury grooming with organic products.', tags: ['Grooming', 'Spa', 'Organic'], emoji: '✂️', price: '$50/session', location: 'Brooklyn, NY', since: '2019' },
  { id: 11, name: 'Healthy Paws Shop', type: 'shops', category: 'Pet Shop', rating: 0, reviews: 0, desc: 'Natural pet food and eco-friendly accessories.', tags: ['Organic', 'Eco-friendly', 'Food'], emoji: '🛍️', price: '$$', location: 'Manhattan, NY', since: '2021' },
  { id: 12, name: "Anna's Pet Sitting", type: 'sitters', category: 'Pet Sitter', rating: 0, reviews: 0, desc: 'Certified pet sitter. CPR trained.', tags: ['Pet Sitting', 'CPR Certified'], emoji: '🛋️', price: '$35/night', location: 'Brooklyn, NY', since: '2020' },
];

async function seed() {
  if (!getApps().length) {
    initializeApp(config);
  }

  const db = getFirestore();
  const providersCol = collection(db, 'providers');

  console.log(`Uploading ${providers.length} providers to Firestore...`);

  for (const p of providers) {
    const docRef = doc(providersCol, String(p.id));
    await setDoc(docRef, p);
    console.log(`  ✅ ${p.id}: ${p.name} (${p.category})`);
  }

  console.log('\n✅ Seed complete! All providers uploaded.');
}

seed().catch((err) => {
  console.error('❌ Seed failed:', err);
  process.exit(1);
});
