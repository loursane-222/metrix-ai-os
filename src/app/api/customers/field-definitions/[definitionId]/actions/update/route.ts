import { handleCustomFieldActionRoute } from "@/lib/field-authority/custom-field-action-route";
export async function POST(request: Request, context: { params: Promise<{ definitionId: string }> }) { const { definitionId } = await context.params; return handleCustomFieldActionRoute(request, "custom_field.update_definition", definitionId); }
