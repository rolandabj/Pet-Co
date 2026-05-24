/**
 * Provider detail page – server component.
 * Fetches provider + reviews server-side via Firestore REST API.
 * force-dynamic bypasses Next.js route cache so profile updates appear instantly.
 */
export const dynamic = 'force-dynamic';

import { getProviderByIdRest, getReviewsByProviderRest } from '@/lib/provider-rest';
import ProviderClient from './ProviderClient';

interface Props {
  params: Promise<{ id: string }>;
}

export default async function ProviderProfilePage({ params }: Props) {
  const { id: idStr } = await params;

  const [provider, reviews] = await Promise.all([
    getProviderByIdRest(idStr).catch(() => null),
    getReviewsByProviderRest(idStr).catch(() => []),
  ]);

  return <ProviderClient provider={provider} reviews={reviews} providerId={idStr} />;
}
