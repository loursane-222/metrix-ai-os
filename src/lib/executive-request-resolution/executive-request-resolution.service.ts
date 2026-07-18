import { assertValidExecutiveRequestResolution } from "./executive-request-resolution.validation";
import type {
  ExecutiveRequestResolution,
  ExecutiveRequestResolver,
  ResolveExecutiveRequestInput,
} from "./executive-request-resolution.types";

/**
 * Explicit delegation boundary; it has no default capability, AI fallback, or
 * routing behavior. The returned resolution is validated before consumption.
 *
 * Architecture Note: Conversation Understanding -> Executive Request
 * Resolution -> Executive Operating Context. Downstream context and EOS do
 * not select capability, and Prompt Bridge does not produce resolution.
 */
export async function resolveExecutiveRequest<TUnderstanding>(
  input: ResolveExecutiveRequestInput<TUnderstanding>,
  resolver: ExecutiveRequestResolver<TUnderstanding>,
): Promise<ExecutiveRequestResolution<TUnderstanding>> {
  const resolution = await resolver.resolve(input);
  assertValidExecutiveRequestResolution(resolution, input.organizationId, input.understanding);
  return resolution;
}
