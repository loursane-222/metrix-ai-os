import { notFound } from "next/navigation";
import { getPublicStatementByToken } from "@/lib/accounting/customer-statement-public-link.service";
import { PublicStatementView } from "./public-statement-view";

export default async function PublicStatementPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const statement = await getPublicStatementByToken(token);
  if (!statement) notFound();
  return <PublicStatementView statement={statement} />;
}
