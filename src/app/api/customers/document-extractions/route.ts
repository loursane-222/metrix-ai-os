import { extractCustomerDocument } from "@/lib/field-authority/customer-document-extraction-route-service";

export async function POST(request: Request) { return extractCustomerDocument(request); }
