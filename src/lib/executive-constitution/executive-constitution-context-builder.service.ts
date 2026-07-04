import { executiveCouncilConstitution } from "./executive-council.constitution";
import { listExecutiveConstitutions } from "./executive-role-registry.service";

import type { ExecutiveConstitutionContext } from "./executive-constitution.types";

export function buildExecutiveConstitutionContext(): ExecutiveConstitutionContext {
  return {
    version: "v1",
    generatedAt: new Date().toISOString(),
    constitutions: listExecutiveConstitutions(),
    council: executiveCouncilConstitution,
  };
}
