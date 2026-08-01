import { OfferCreateRedirect } from "@/components/offers/OfferCreateRedirect";

export default async function OfferCreatePage({
  params,
}: {
  params: Promise<{ customerId: string }>;
}) {
  const { customerId } = await params;
  return <OfferCreateRedirect customerId={customerId} />;
}
