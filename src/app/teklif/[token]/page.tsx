import { PublicOfferView } from "./public-offer-view";
import { getPublicOfferByToken, serializePublicOffer } from "@/lib/core/offers/offer-public-link.service";
import { notFound } from "next/navigation";

export default async function PublicOfferPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const offer = await getPublicOfferByToken(token);
  if (!offer) notFound();
  return <PublicOfferView offer={serializePublicOffer(offer)} token={token} />;
}
