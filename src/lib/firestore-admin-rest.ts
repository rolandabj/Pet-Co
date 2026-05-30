/**
 * Server-only Firestore REST API helpers.
 *
 * Uses the service-account credentials directly (via google-auth-library)
 * to make Firestore REST API calls — bypassing the Admin SDK's gRPC transport,
 * which can silently fail in sandboxed/container environments.
 *
 * All operations use `fetch` with standard HTTP timeouts.
 */
import { GoogleAuth } from 'google-auth-library';

const PROJECT_ID = process.env.FIREBASE_PROJECT_ID!;
const FIRESTORE_BASE = `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents`;

// Cache the token so we don't fetch one per request
let cachedToken: { value: string; expires: number } | null = null;

/** Get a Google OAuth2 access token for the Firestore service account.
 *  Token is cached and auto-refreshed before expiry. */
export async function getAccessToken(): Promise<string> {
  if (cachedToken && Date.now() < cachedToken.expires - 60000) {
    return cachedToken.value;
  }
  const auth = new GoogleAuth({
    credentials: {
      client_email: process.env.FIREBASE_CLIENT_EMAIL,
      private_key: (process.env.FIREBASE_PRIVATE_KEY ?? '')
        .replace(/^"|"$/g, '')
        .replace(/\\n/g, '\n'),
    },
    scopes: ['https://www.googleapis.com/auth/datastore'],
  });
  const client = await auth.getClient();
  const token = await client.getAccessToken();
  cachedToken = {
    value: token.token ?? '',
    expires: token.res?.data?.expires_in
      ? Date.now() + (token.res.data.expires_in as number) * 1000
      : Date.now() + 3600_000,
  };
  return cachedToken.value;
}

/** Delete a single Firestore document by collection and doc ID.
 *  Returns true if the doc existed and was deleted, false if it didn't exist. */
export async function deleteDocRest(collection: string, docId: string): Promise<boolean> {
  const token = await getAccessToken();
  const url = `${FIRESTORE_BASE}/${encodeURIComponent(collection)}/${encodeURIComponent(docId)}`;
  const res = await fetch(url, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${token}` },
  });
  if (res.status === 404) return false;
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`DELETE ${collection}/${docId} failed: ${res.status} ${body}`);
  }
  return true;
}

/** Get a single Firestore document by collection and doc ID.
 *  Returns the document fields, or null if it doesn't exist. */
export async function getDocRest(collection: string, docId: string): Promise<Record<string, any> | null> {
  const token = await getAccessToken();
  const url = `${FIRESTORE_BASE}/${encodeURIComponent(collection)}/${encodeURIComponent(docId)}`;
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (res.status === 404) return null;
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`GET ${collection}/${docId} failed: ${res.status} ${body}`);
  }
  const doc = await res.json();
  return doc.fields ?? null;
}

/** Delete a batch of documents in a single Firestore commit request.
 *  Each doc is identified by { collection, docId }. */
export async function deleteDocsBatch(docs: { collection: string; docId: string }[]): Promise<void> {
  if (docs.length === 0) return;

  const token = await getAccessToken();
  const url = `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents:commit`;

  const writes = docs.map(({ collection, docId }) => ({
    delete: `${FIRESTORE_BASE}/${encodeURIComponent(collection)}/${encodeURIComponent(docId)}`,
  }));

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ writes }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`Batch delete commit failed: ${res.status} ${body}`);
  }
}

/** Convert Firestore typed fields (e.g. { stringValue: "foo" }) to a plain JS object. */
function fieldsToPlainObject(fields: Record<string, any>): Record<string, any> {
  const result: Record<string, any> = {};
  for (const [key, value] of Object.entries(fields)) {
    if (value.stringValue !== undefined) result[key] = value.stringValue;
    else if (value.integerValue !== undefined) result[key] = Number(value.integerValue);
    else if (value.doubleValue !== undefined) result[key] = value.doubleValue;
    else if (value.booleanValue !== undefined) result[key] = value.booleanValue;
    else if (value.timestampValue !== undefined) result[key] = value.timestampValue;
    else if (value.arrayValue?.values !== undefined) {
      result[key] = value.arrayValue.values.map((v: any) => {
        if (v.mapValue?.fields) return fieldsToPlainObject(v.mapValue.fields);
        if (v.stringValue !== undefined) return v.stringValue;
        if (v.integerValue !== undefined) return Number(v.integerValue);
        if (v.doubleValue !== undefined) return v.doubleValue;
        return v;
      });
    } else if (value.mapValue?.fields !== undefined) {
      result[key] = fieldsToPlainObject(value.mapValue.fields);
    } else {
      result[key] = value;
    }
  }
  return result;
}

/** Update a Firestore document via REST PATCH with an update mask.
 *  Only the specified fieldPaths are updated; omitted fields are left untouched. */
export async function updateDocRest(
  collection: string,
  docId: string,
  fields: Record<string, any>,
  fieldPaths: string[],
): Promise<void> {
  const token = await getAccessToken();
  const params = new URLSearchParams();
  for (const fp of fieldPaths) {
    params.append('updateMask.fieldPaths', fp);
  }
  const url = `${FIRESTORE_BASE}/${encodeURIComponent(collection)}/${encodeURIComponent(docId)}?${params.toString()}`;

  const typedFields: Record<string, any> = {};
  for (const [key, value] of Object.entries(fields)) {
    if (typeof value === 'string') typedFields[key] = { stringValue: value };
    else if (typeof value === 'number') {
      typedFields[key] = Number.isInteger(value) ? { integerValue: value } : { doubleValue: value };
    } else if (typeof value === 'boolean') typedFields[key] = { booleanValue: value };
    else if (value !== null && value !== undefined) typedFields[key] = { stringValue: String(value) };
  }

  const res = await fetch(url, {
    method: 'PATCH',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ fields: typedFields }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`PATCH ${collection}/${docId} failed: ${res.status} ${body}`);
  }
}

/** Run a structured query via the REST :runQuery endpoint.
 *  Returns an array of document data with id. */
export async function runQueryRest<T = Record<string, unknown>>(
  collection: string,
  field: string,
  op: 'EQUAL' | 'NOT_EQUAL' | 'LESS_THAN' | 'LESS_THAN_OR_EQUAL' | 'GREATER_THAN' | 'GREATER_THAN_OR_EQUAL' | 'ARRAY_CONTAINS' | 'IN' | 'ARRAY_CONTAINS_ANY' | 'NOT_IN' = 'EQUAL',
  value: unknown,
): Promise<{ id: string; data: T }[]> {
  const token = await getAccessToken();
  const url = `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents:runQuery`;

  const body = {
    structuredQuery: {
      from: [{ collectionId: collection }],
      where: {
        fieldFilter: {
          field: { fieldPath: field },
          op,
          value: { stringValue: value },
        },
      },
    },
  };

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const bodyText = await res.text().catch(() => '');
    throw new Error(`runQuery ${collection} failed: ${res.status} ${bodyText}`);
  }

  const results = await res.json();
  return (results as Array<{ document?: { name: string; fields: Record<string, unknown> } }>)
    .filter(r => r.document)
    .map(r => ({
      id: r.document!.name.split('/').pop()!,
      data: r.document!.fields as T,
    }));
}
