#!/usr/bin/env ts-node
/**
 * Role Migration Script — make-admin.ts
 * ========================================
 *
 * Promotes a user to the 'admin' role in the Firestore `users` collection.
 * Authenticates via Firebase Auth REST API (email + password) so the
 * resulting ID token satisfies Firestore security rules.
 *
 * Usage
 * -----
 *   npx tsx --env-file=.env.local scripts/make-admin.ts <email> [password]
 *
 * Examples
 * --------
 *   npx tsx --env-file=.env.local scripts/make-admin.ts rolandabj@gmail.com
 *   (will prompt you to enter the password securely)
 *
 *   npx tsx --env-file=.env.local scripts/make-admin.ts rolandabj@gmail.com MyPassword123
 *
 * What it does
 * ------------
 * 1. Signs in with the provided email + password via the Firebase Auth REST API.
 * 2. Uses the returned ID token to find or create the user's Firestore document.
 * 3. Sets the `role` field to `'admin'`.
 */

const API_KEY = process.env.NEXT_PUBLIC_FIREBASE_API_KEY;
const PROJECT_ID = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;

if (!API_KEY || !PROJECT_ID) {
  console.error(
    '❌ Missing Firebase configuration. Ensure NEXT_PUBLIC_FIREBASE_API_KEY\n' +
      '   and NEXT_PUBLIC_FIREBASE_PROJECT_ID are set in .env.local\n\n' +
      '   npx tsx --env-file=.env.local scripts/make-admin.ts <email> [password]',
  );
  process.exit(1);
}

const email = process.argv[2];
let password = process.argv[3];

if (!email) {
  console.error('❌ Usage: npx tsx --env-file=.env.local scripts/make-admin.ts <email> [password]');
  process.exit(1);
}

const FB_AUTH = `https://identitytoolkit.googleapis.com/v1`;
const FB_FIRESTORE = `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents`;

async function getIdToken(): Promise<string> {
  if (!password) {
    const readline = await import('readline');
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    password = await new Promise<string>((resolve) => {
      rl.question('🔑 Enter password: ', (answer) => {
        rl.close();
        resolve(answer);
      });
    });
  }

  const res = await fetch(`${FB_AUTH}/accounts:signInWithPassword?key=${API_KEY}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password, returnSecureToken: true }),
  });

  if (!res.ok) {
    const err = await res.json();
    const msg = err?.error?.message ?? res.statusText;

    if (msg === 'EMAIL_NOT_FOUND') {
      console.error(`❌ No Firebase Auth account found for "${email}".`);
      console.error('   Have you registered via the app yet?');
    } else if (msg === 'INVALID_LOGIN_CREDENTIALS' || msg === 'INVALID_PASSWORD') {
      console.error(`❌ Wrong password for "${email}".`);
      console.error('   Use the password reset link sent to your email, or pass the password as an argument:');
      console.error(`   npx tsx scripts/make-admin.ts ${email} <your-password>`);
    } else {
      console.error(`❌ Auth failed: ${msg}`);
    }
    process.exit(1);
  }

  const data = await res.json();
  return data.idToken as string;
}

async function findOrCreateUserDoc(uid: string, idToken: string) {
  // 1. Try to fetch the existing user doc
  const getRes = await fetch(`${FB_FIRESTORE}/users/${uid}`, {
    headers: { Authorization: `Bearer ${idToken}` },
  });

  if (getRes.ok) {
    const json = await getRes.json();
    return json; // existing doc
  }

  // 2. Not found — create a minimal user document
  console.log(`📝 User doc not found in Firestore — creating it now...`);
  const createRes = await fetch(`${FB_FIRESTORE}/users/${uid}`, {
    method: 'PATCH',
    headers: {
      Authorization: `Bearer ${idToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      fields: {
        email: { stringValue: email },
        name: { stringValue: email.split('@')[0] },
        role: { stringValue: 'admin' },
        authMethod: { stringValue: 'email' },
        createdAt: { stringValue: new Date().toISOString() },
      },
    }),
  });

  if (!createRes.ok) {
    const body = await createRes.text();
    console.error(`❌ Failed to create user doc (${createRes.status}): ${body}`);
    process.exit(1);
  }

  console.log('✅ User document created with admin role.');
  return createRes.json();
}

async function run() {
  console.log(`🔑 Signing in as "${email}"...`);
  const idToken = await getIdToken();

  // Decode the ID token (JWT) to extract the UID without verification
  const payload = JSON.parse(atob(idToken.split('.')[1]));
  const uid = payload.user_id || payload.sub;
  console.log(`✅ Signed in — UID: ${uid}`);

  // Find or create the Firestore user document
  const doc = await findOrCreateUserDoc(uid, idToken);

  // Update the role to 'admin'
  const docName = doc.name; // e.g. projects/.../documents/users/ABC123
  console.log(`📝 Updating role to "admin"...`);

  const updateRes = await fetch(
    `${FB_FIRESTORE}/users/${uid}?updateMask.fieldPaths=role`,
    {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${idToken}`,
        'Content-Type': 'application/json',
      },
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

  console.log(`✅ Role set to "admin" for ${email}`);
  console.log('🔐 The user will have admin access on next page reload.');
}

run().catch((err) => {
  console.error('❌ Unexpected error:', err);
  process.exit(1);
});
