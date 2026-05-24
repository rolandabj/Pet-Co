#!/usr/bin/env ts-node
/**
 * Role Migration Script — make-admin.ts
 * ========================================
 *
 * Promotes a user to the 'admin' role in the Firestore `users` collection.
 *
 * Usage
 * -----
 *   npx ts-node --esm scripts/make-admin.ts <email>
 *
 * Example
 * -------
 *   npx ts-node --esm scripts/make-admin.ts rolandabj@gmail.com
 *
 * Requirements
 * ------------
 * - Your Firebase Web API key must be set in `NEXT_PUBLIC_FIREBASE_API_KEY`
 *   (loaded from .env.local via dotenv).
 * - The target user must already exist in the `users` collection.
 *
 * What it does
 * ------------
 * 1. Queries the Firestore REST API for a user document whose `email` field
 *    matches the provided email address.
 * 2. Updates that document's `role` field to `'admin'`.
 * 3. Prints the result — look for a 200 status.
 *
 * After running
 * -------------
 * The user's next page reload (or re-login) will pick up `role: 'admin'`
 * from Firestore, and the RBAC checks in the UI will grant admin access
 * without relying on the hardcoded email fallback.
 *
 * Environment variables are loaded from .env.local via ts-node's --env-file
 * flag (Node 20+):
 *   npx ts-node --esm --env-file=.env.local scripts/make-admin.ts <email>
 * Or with dotenv preloaded:
 *   node -r dotenv/config -r ts-node/register scripts/make-admin.ts <email>
 */

const API_KEY = process.env.NEXT_PUBLIC_FIREBASE_API_KEY;
const PROJECT_ID = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;

if (!API_KEY || !PROJECT_ID) {
  console.error(
    '❌ Missing Firebase configuration. Ensure NEXT_PUBLIC_FIREBASE_API_KEY\n' +
      '   and NEXT_PUBLIC_FIREBASE_PROJECT_ID are set in .env.local\n\n' +
      '   npx ts-node --esm --env-file=.env.local scripts/make-admin.ts <email>',
  );
  process.exit(1);
}

const query = process.argv[2];
if (!query) {
  console.error('❌ Usage: npx ts-node --esm scripts/make-admin.ts <email-or-name>');
  process.exit(1);
}

const FB_DOCS = `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents`;
const FB_V1 = `https://firestore.googleapis.com/v1`;

async function findUserByEmail(email: string) {
  const res = await fetch(`${FB_DOCS}:runQuery?key=${API_KEY}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
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
        limit: 1,
      },
    }),
  });
  if (!res.ok) return null;
  const json = await res.json();
  return json?.[0]?.document ?? null;
}

async function findUserByName(name: string) {
  const res = await fetch(`${FB_DOCS}:runQuery?key=${API_KEY}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      structuredQuery: {
        from: [{ collectionId: 'users' }],
        where: {
          fieldFilter: {
            field: { fieldPath: 'name' },
            op: 'EQUAL',
            value: { stringValue: name },
          },
        },
        limit: 1,
      },
    }),
  });
  if (!res.ok) return null;
  const json = await res.json();
  return json?.[0]?.document ?? null;
}

async function listAllUsers() {
  const res = await fetch(`${FB_DOCS}/users?key=${API_KEY}`);
  if (!res.ok) return [];
  const json = await res.json();
  return (json.documents || []).map((d: any) => ({
    id: d.name.split('/').pop(),
    name: d.fields?.name?.stringValue ?? '(no name)',
    role: d.fields?.role?.stringValue ?? '(no role)',
  }));
}

async function run() {
  // Try email first, then name
  let doc = await findUserByEmail(query);

  if (!doc) {
    console.log(`⚠️  No user found with email "${query}". Trying name lookup…`);
    doc = await findUserByName(query);
  }

  if (!doc) {
    console.log(`❌ No user found with email or name "${query}".`);
    console.log('\nExisting users in Firestore:');
    const users = await listAllUsers();
    if (users.length === 0) {
      console.log('  (no users in Firestore collection)');
    } else {
      for (const u of users) {
        console.log(`  • ${u.name} — role: ${u.role} — id: ${u.id}`);
      }
      console.log('\nRun again with a name from the list above, or with the exact email if stored.');
    }
    process.exit(1);
  }

  const docName = doc.name; // e.g. projects/.../documents/users/ABC123
  const docId = docName.split('/').pop();
  const docEmail = doc.fields?.email?.stringValue ?? '(not stored)';
  const docNameField = doc.fields?.name?.stringValue ?? '(not stored)';
  console.log(`✅ Found user: ${docNameField} (email: ${docEmail}, id: ${docId})`);

  // 2. Update the role to 'admin'
  const updateRes = await fetch(
    `${FB_V1}/${docName}?key=${API_KEY}&updateMask.fieldPaths=role`,
    {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        fields: {
          role: { stringValue: 'admin' },
        },
      }),
    },
  );

  if (!updateRes.ok) {
    const body = await updateRes.text();
    console.error(`❌ Update failed (${updateRes.status}): ${body}`);
    process.exit(1);
  }

  const updated = await updateRes.json();
  const newRole = updated?.fields?.role?.stringValue;
  console.log(`✅ Role updated to "${newRole}" for ${docNameField}`);
  console.log('🔐 The user will have admin access on next page reload.');
}

run().catch((err) => {
  console.error('❌ Unexpected error:', err);
  process.exit(1);
});
