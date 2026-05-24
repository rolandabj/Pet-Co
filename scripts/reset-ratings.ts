/**
 * One-time reset script: sets rating → 0, reviews → 0 on all existing
 * provider documents in Firestore, so stale seed data doesn't show fake
 * review counts on the public browse pages.
 *
 * Usage:
 *   export $(grep -v "^#" .env.local | xargs) && npx tsx scripts/reset-ratings.ts
 */

const PROJECT_ID = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || '';
const API_KEY = process.env.NEXT_PUBLIC_FIREBASE_API_KEY || '';

if (!PROJECT_ID || !API_KEY) {
  console.error('Missing NEXT_PUBLIC_FIREBASE_PROJECT_ID or NEXT_PUBLIC_FIREBASE_API_KEY');
  process.exit(1);
}

const BASE = `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents`;

async function main() {
  // 1. Fetch all provider documents
  const listRes = await fetch(`${BASE}/providers?key=${API_KEY}`);
  if (!listRes.ok) {
    console.error(`Failed to list providers: ${listRes.status}`);
    process.exit(1);
  }
  const listJson = await listRes.json();
  const docs = listJson.documents || [];
  console.log(`Found ${docs.length} provider document(s).`);

  // 2. Reset rating → 0, reviews → 0 on each
  for (const doc of docs) {
    const docId = doc.name.split('/').pop();
    const fields = {
      rating: { integerValue: '0' },
      reviews: { integerValue: '0' },
    };
    const masks = 'updateMask.fieldPaths=rating&updateMask.fieldPaths=reviews';
    const patchRes = await fetch(
      `${BASE}/providers/${docId}?key=${API_KEY}&${masks}`,
      {
        method: 'PATCH',
        body: JSON.stringify({ fields }),
        headers: { 'Content-Type': 'application/json' },
      },
    );
    if (patchRes.ok) {
      console.log(`  ✅ ${docId}: rating=0, reviews=0`);
    } else {
      console.error(`  ❌ ${docId}: ${patchRes.status}`);
    }
  }

  console.log('\n✅ Reset complete.');
}

main().catch((err) => {
  console.error('❌ Script failed:', err);
  process.exit(1);
});
