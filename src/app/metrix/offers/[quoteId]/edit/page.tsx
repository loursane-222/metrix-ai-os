import { OfferEditScreen } from "@/components/offers/OfferEditScreen";

export default async function OfferEditPage({
  params,
}: {
  params: Promise<{ quoteId: string }>;
}) {
  const { quoteId } = await params;
  return <OfferEditScreen quoteId={quoteId} />;
}
