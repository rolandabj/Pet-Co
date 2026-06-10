export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getAccessToken } from '@/lib/firestore-admin-rest';
import { readBoundedBodyJSON } from '@/lib/validation';
import { checkRateLimit, clientIp, makeKey } from '@/lib/rate-limit';

const FIRESTORE_BASE = `https://firestore.googleapis.com/v1/projects/${process.env.FIREBASE_PROJECT_ID}/databases/(default)/documents`;

/**
 * Schema for contact form submissions.
 * Includes a honeypot field (`_hp`) that must be empty — bots
 * often auto-fill hidden fields, while real users never see them.
 */
const contactSchema = z.object({
  name: z.string().min(1).max(100),
  email: z.string().email().max(320),
  subject: z.enum(['general', 'support', 'partner', 'provider', 'feedback']),
  message: z.string().min(1).max(2000),
  // Honeypot — must be empty (falsy)
  _hp: z.union([z.literal(''), z.literal(undefined)]).optional().default(''),
});

/**
 * POST /api/messages
 *
 * Accepts a contact form submission, validates it server-side
 * (honeypot filter + zod schema), and writes to Firestore
 * via the Admin SDK service account — bypassing client-side
 * security rules entirely.
 */
export async function POST(request: NextRequest) {
  try {
    // Inline rate limit (defence-in-depth; middleware also enforces this)
    const rl = checkRateLimit(makeKey('messages', clientIp(request)), {
      windowMs: 15 * 60 * 1000,
      maxRequests: 10,
    });
    if (!rl.allowed) {
      return NextResponse.json(
        { error: 'Too many requests, please try again later.' },
        { status: 429 },
      );
    }

    const body = contactSchema.parse(await readBoundedBodyJSON(request));

    // Write to Firestore via Admin REST (bypasses client rules)
    const token = await getAccessToken();
    const res = await fetch(
      `${FIRESTORE_BASE}/messages?alt=json`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          fields: {
            name: { stringValue: body.name },
            email: { stringValue: body.email },
            subject: { stringValue: body.subject },
            message: { stringValue: body.message },
            userId: { stringValue: 'anonymous' },
            createdAt: { stringValue: new Date().toISOString() },
          },
        }),
      },
    );

    if (!res.ok) {
      if (process.env.NODE_ENV === 'development') {
        const errBody = await res.text().catch(() => '');
        console.error('POST /api/messages Firestore write failed:', res.status, errBody);
      }
      throw new Error('Firestore write failed');
    }

    return NextResponse.json({ success: true });
  } catch (error: any) {
    if (error instanceof z.ZodError || error.message === 'Request body too large') {
      return NextResponse.json({ error: 'Invalid form data.' }, { status: 400 });
    }
    if (process.env.NODE_ENV === 'development') {
      console.error('POST /api/messages failed:', error?.message);
    }
    // Return a generic message to avoid leaking internal details
    return NextResponse.json(
      { error: 'Failed to send message. Please try again later.' },
      { status: 500 },
    );
  }
}
