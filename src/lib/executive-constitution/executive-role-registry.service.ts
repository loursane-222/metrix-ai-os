import { ccoConstitution } from "./cco.constitution";
import { cfoConstitution } from "./cfo.constitution";
import { chroConstitution } from "./chro.constitution";
import { cmoConstitution } from "./cmo.constitution";
import { cooConstitution } from "./coo.constitution";
import { executiveAssistantConstitution } from "./executive-assistant.constitution";
import { generalManagerConstitution } from "./general-manager.constitution";
import { salesConstitution } from "./sales.constitution";

import type {
  ExecutiveConstitution,
  ExecutiveRole,
} from "./executive-constitution.types";

const EXECUTIVE_CONSTITUTION_REGISTRY: Record<
  ExecutiveRole,
  ExecutiveConstitution
> = {
  "general-manager": generalManagerConstitution,
  cfo: cfoConstitution,
  sales: salesConstitution,
  coo: cooConstitution,
  chro: chroConstitution,
  cco: ccoConstitution,
  cmo: cmoConstitution,
  "executive-assistant": executiveAssistantConstitution,
};

export function listExecutiveConstitutions(): ExecutiveConstitution[] {
  return Object.values(EXECUTIVE_CONSTITUTION_REGISTRY);
}

export function getExecutiveConstitution(
  role: ExecutiveRole,
): ExecutiveConstitution {
  return EXECUTIVE_CONSTITUTION_REGISTRY[role];
}

export function getExecutiveConstitutions(
  roles: ExecutiveRole[],
): ExecutiveConstitution[] {
  return roles.map(getExecutiveConstitution);
}
