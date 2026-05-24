#!/usr/bin/env ts-node
/**
 * User ID Migration Script — migrate-user-id.ts
 * ===============================================
 *
 * Repairs old pets and favorites documents where the `userId` field contains
 * a localAuth-generated `user_<timestamp>` ID instead of the correct
 * Firebase Auth UID.
 *
 * Usage
 * -----
 *   npx tsx --env-file=.env.local scripts/migrate-user-id.ts <email> [password]
 *
 * Examples
 * --------
 *   npx tsx --env-file=.env.local scripts/migrate-user-id.ts user@example.com
 *   (will prompt you to enter the password securely)
 *
 *   npx tsx --env-file=.env.local scripts/migrate-user-id.ts user@example.com MyPassword123
 *
 * What it does
 * ------------
 * 1. Signs in with the provided email + password via the Firebase Auth REST API.
 * 2. Looks up the user's Firestore document by email to determine the correct doc ID.
 * 3. Finds all pets and favorites documents where `userId` does NOT match
 *    the correct Firebase Auth UID.
 * 4. Logs every document before updating it.
 * 5. Updates the `userId` field to the correct Firebase Auth UID.
 */

const API_KEY = process.env.NEXT_PUBLIC_FIREBASE_API_KEY;
const PROJECT_ID = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;

if (!API_KEY || !PROJECT_ID) {
  console.error('❌ Missing required env vars: NEXT_PUBLIC_FIREBASE_API_KEY, NEXT_PUBLIC_FIREBASE_PROJECT_ID');
  process.exit(1);
}

const FIRESTORE_BASE = `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents`;

async function main() {
  const args = process.argv.slice(2);
  const email = args[0];
  let password = args[1];

  if (!email) {
    console.error('Usage: npx tsx --env-file=.env.local scripts/migrate-user-id.ts <email> [password]');
    process.exit(1);
  }

  if (!password) {
    // Read password securely from stdin
    const { createInterface } = await import('readline/promises');
    const rl = createInterface({ input: process.stdin, output: process.stdout });
    password = await rl.question('🔑 Enter password: ');
    rl.close();
  }

  console.log(`\n🔐 Signing in as ${email}...`);

  // 1. Get Firebase Auth ID token
  const signInRes = await fetch(
    `https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${API_KEY}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password, returnSecureToken: true }),
    },
  );

  if (!signInRes.ok) {
    const err = await signInRes.text();
    console.error('❌ Sign-in failed:', err);
    process.exit(1);
  }

  const signInData = await signInRes.json() as { idToken: string; localId: string; email: string };
  const idToken = signInData.idToken;
  const correctUid = signInData.localId;
  console.log(`✅ Signed in. Firebase Auth UID: ${correctUid}`);

  // Helper: authenticated Firestore REST request
  async function authFetch(url: string, options?: RequestInit): Promise<Response> {
    const separator = url.includes('?') ? '&' : '?';
    return fetch(`${url}${separator}key=${API_KEY}`, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${idToken}`,
        ...options?.headers,
      },
    });
  }

  // 2. Find the user's Firestore document to confirm the correct doc ID
  console.log(`\n🔍 Looking up user in Firestore users collection...`);
  const usersRes = await authFetch(`${FIRESTORE_BASE}:runQuery`, {
    method: 'POST',
    body: JSON.stringify({
      structuredQuery: {
        from: [{ collectionId: 'users' }],
        where: {
          fieldFilter: {
            field: { fieldPath: 'email' },
            op: 'EQUAL',
            value: { stringValue: email },
          },
        },
      },
    }),
  });

  let userDocId: string | null = null;
  if (usersRes.ok) {
    const usersJson = await usersRes.json() as Array<{ document?: { name: string } }>;
    const docs = usersJson.filter((r) => r.document);
    if (docs.length > 0) {
      const name = docs[0].document!.name;
      userDocId = name.split('/').pop() ?? null;
      console.log(`✅ Found Firestore user doc ID: ${userDocId}`);
    }
  }

  if (!userDocId) {
    console.log('⚠️  No Firestore user document found for this email.');
    console.log('   The correct UID for Firestore writes is:', correctUid);
    console.log('   Proceeding with Firebase Auth UID as the canonical owner ID.\n');
    userDocId = correctUid;
  }

  // Helper: fix userId in a collection
  async function fixCollection(collectionId: string) {
    console.log(`\n── Scanning ${collectionId} ──`);

    const res = await authFetch(`${FIRESTORE_BASE}:runQuery`, {
      method: 'POST',
      body: JSON.stringify({
        structuredQuery: {
          from: [{ collectionId }],
        },
      }),
    });

    if (!res.ok) {
      console.warn(`  ⚠️  Could not query ${collectionId}: ${res.status}`);
      return;
    }

    const json = await res.json() as Array<{ document?: { name: string; fields?: Record<string, any> } }>;
    const docsToFix: Array<{ name: string; currentUserId: string }> = [];

    for (const item of json) {
      if (!item.document) continue;
      const name = item.document.name;
      const fields = item.document.fields || {};
      const docUserId = fields.userId?.stringValue ?? '';

      if (!docUserId) {
        console.log(`  ⏭️  ${name.split('/').pop()} — no userId field, skipping`);
        continue;
      }

      if (docUserId === correctUid) {
        console.log(`  ✅ ${name.split('/').pop()} — userId already correct (${docUserId})`);
        continue;
      }

      // Only fix documents that have a localAuth-generated ID or a wrong UID
      if (docUserId.startsWith('user_') || docUserId.startsWith('firebase_') || docUserId.startsWith('google_')) {
        docsToFix.push({ name, currentUserId: docUserId });
      } else if (docUserId !== correctUid) {
        // Different Firebase UID
        docsToFix.push({ name, currentUserId: docUserId });
      }
    }

    if (docsToFix.length === 0) {
      console.log(`  ✨ No ${collectionId} documents need fixing.`);
      return;
    }

    console.log(`\n  📋 ${docsToFix.length} document(s) to fix:\n`);
    for (const doc of docsToFix) {
      const docId = doc.name.split('/').pop();
      console.log(`    📄 ${docId}`);
      console.log(`       Path: ${doc.name}`);
      console.log(`       Current userId: "${doc.currentUserId}"`);
      console.log(`       New userId:     "${correctUid}"`);
    }

    // Confirm before updating
    const { createInterface } = await import('readline/promises');
    const rl2 = createInterface({ input: process.stdin, output: process.stdout });
    const answer = await rl2.question(`\n  ✏️  Update ${docsToFix.length} document(s)? (yes/no) `);
    rl2.close();

    if (answer.toLowerCase() !== 'yes') {
      console.log('  ⏭️  Skipping update.');
      return;
    }

    for (const doc of docsToFix) {
      const docId = doc.name.split('/').pop();
      console.log(`  🔄 Updating ${docId}...`);
      console.log(`     Old userId: "${doc.currentUserId}" → "${correctUid}"`);

      const updateRes = await authFetch(doc.name, {
        method: 'PATCH',
        body: JSON.stringify({
          fields: {
            userId: { stringValue: correctUid },
          },
        }),
      });

      if (updateRes.ok) {
        console.log(`     ✅ Updated`);
      } else {
        const err = await updateRes.text();
        console.error(`     ❌ Failed: ${err}`);
      }
    }
  }

  // 3. Scan and fix pets
  await fixCollection('pets');

  // 4. Scan and fix favorites
  await fixCollection('favorites');

  console.log('\n✅ Migration complete.');
  console.log('');
  console.log('Next steps:');
  console.log('  1. Log out and clear localStorage in your browser.');
  console.log('  2. Log in again with the same email/password.');
  console.log('  3. Open the dashboard and verify pets/favorites appear.');
  console.log('  4. Run this script for any additional affected users.');
}

main().catch((err) => {
  console.error('❌ Fatal error:', err);
  process.exit(1);
});
