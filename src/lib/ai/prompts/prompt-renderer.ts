import { getPromptTemplate } from "./prompt-registry";

import type {
  PromptRenderInput,
  PromptTemplateId,
  RenderedPrompt,
} from "./prompt.types";

export type RenderPromptTemplateInput = PromptRenderInput & {
  templateId: PromptTemplateId;
};

export function renderPromptTemplate(
  input: RenderPromptTemplateInput,
): RenderedPrompt {
  const template = getPromptTemplate(input.templateId);

  return {
    templateId: template.id,
    templateVersion: template.version,
    systemPrompt: template.render(input),
  };
}

