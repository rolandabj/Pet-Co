import { NextResponse } from 'next/server';

/**
 * GET /api/providers
 *
 * Proxies the Firestore REST API to return all providers.
 */
export async function GET() {
  const projectId = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;
  const apiKey   = process.env.NEXT_PUBLIC_FIREBASE_API_KEY;

  if (!projectId || !apiKey) {
    return NextResponse.json({ error: 'Firebase config missing' }, { status: 500 });
  }

  const url =
    `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/providers?key=${apiKey}`;

  try {
    const res = await fetch(url);
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      return NextResponse.json({ error: `Firestore API error ${res.status}`, detail: body.substring(0, 500) }, { status: 502 });
    }
    const json = await res.json();
    return NextResponse.json(json);
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || 'Proxy fetch failed' }, { status: 502 });
  }
}
