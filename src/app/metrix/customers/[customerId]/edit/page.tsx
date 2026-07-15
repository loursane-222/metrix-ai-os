import { CustomerEditScreen } from "@/components/customers/CustomerEditScreen";

export default async function CustomerEditPage({
  params,
}: {
  params: Promise<{ customerId: string }>;
}) {
  const { customerId } = await params;
  return <CustomerEditScreen customerId={customerId} />;
}
