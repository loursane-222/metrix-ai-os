import { promptTemplates } from "./prompt-templates";

import type { PromptTemplate, PromptTemplateId } from "./prompt.types";

const templatesById = new Map<PromptTemplateId, PromptTemplate>(
  promptTemplates.map((template) => [template.id, template]),
);

export function getPromptTemplate(templateId: PromptTemplateId): PromptTemplate {
  const template = templatesById.get(templateId);

  if (!template) {
    throw new Error(`Prompt template not found: ${templateId}`);
  }

  if (!template.version) {
    throw new Error(`Prompt template version is required: ${templateId}`);
  }

  return template;
}

