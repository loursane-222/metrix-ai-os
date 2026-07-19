import { handleCustomFieldActionRoute } from "@/lib/field-authority/custom-field-action-route";
export async function POST(request: Request) { return handleCustomFieldActionRoute(request, "custom_field.create"); }
