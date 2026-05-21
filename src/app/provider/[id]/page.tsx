/**
 * Provider detail page – server component.
 * Fetches provider + reviews server-side via Firestore REST API.
 */
import { getProviderByIdRest, getReviewsByProviderRest } from '@/lib/provider-rest';
import ProviderClient from './ProviderClient';

interface Props {
  params: Promise<{ id: string }>;
}

export default async function ProviderProfilePage({ params }: Props) {
  const { id: idStr } = await params;
  const id = Number(idStr);

  const [provider, reviews] = await Promise.all([
    getProviderByIdRest(id).catch(() => null),
    getReviewsByProviderRest(id).catch(() => []),
  ]);

  return <ProviderClient provider={provider} reviews={reviews} providerId={id} />;
}
