import { extractCustomerDocument } from "@/lib/field-authority/customer-document-extraction-route-service";
export const maxDuration = 60;
export async function POST(request: Request) { return extractCustomerDocument(request); }
