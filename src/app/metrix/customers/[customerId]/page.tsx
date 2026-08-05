import { CustomerDetailRouteExperience } from "@/components/product-experience/CustomerDetailRouteExperience";

export default async function CustomerDetailPage({
  params,
}: {
  params: Promise<{ customerId: string }>;
}) {
  const { customerId } = await params;
  return <CustomerDetailRouteExperience customerId={customerId} />;
}
