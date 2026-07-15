import { CustomerDetailScreen } from "@/components/customers/CustomerDetailScreen";

export default async function CustomerDetailPage({
  params,
}: {
  params: Promise<{ customerId: string }>;
}) {
  const { customerId } = await params;
  return <CustomerDetailScreen customerId={customerId} />;
}
