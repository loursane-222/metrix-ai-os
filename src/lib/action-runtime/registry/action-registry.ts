import { collectActionDefinitionValidationErrors } from "./action-definition-validation";
import { ActionNotFoundError, DuplicateActionDefinitionError, InvalidActionDefinitionError } from "./action-registry.errors";
import type { ActionClass, ActionDefinition } from "./action-registry.types";

/**
 * Executive Action Registry. Fiziksel olarak federatif kullanım için
 * tasarlanmıştır: her modül kendi ActionDefinition listesini kendi
 * manifest dosyasında tutar, bu sınıf yalnızca birleştirme/sorgulama
 * yüzeyidir. Yürütme, yetki ve handler çağrısı bu sınıfın sorumluluğu
 * değildir.
 */
export class ActionRegistry {
  private readonly definitions = new Map<string, ActionDefinition>();

  register(definition: ActionDefinition): void {
    const reasons = collectActionDefinitionValidationErrors(definition);
    if (reasons.length > 0) {
      throw new InvalidActionDefinitionError(definition.actionName, reasons);
    }

    if (this.definitions.has(definition.actionName)) {
      throw new DuplicateActionDefinitionError(definition.actionName);
    }

    this.definitions.set(definition.actionName, definition);
  }

  registerMany(definitions: readonly ActionDefinition[]): void {
    for (const definition of definitions) {
      this.register(definition);
    }
  }

  hasAction(actionName: string): boolean {
    return this.definitions.has(actionName);
  }

  getActionDefinition(actionName: string): ActionDefinition {
    const definition = this.definitions.get(actionName);

    if (!definition) {
      throw new ActionNotFoundError(actionName);
    }

    return definition;
  }

  listActionsByModule(ownerModule: string): ActionDefinition[] {
    return this.listAllActions().filter((definition) => definition.ownerModule === ownerModule);
  }

  listActionsByClass(actionClass: ActionClass): ActionDefinition[] {
    return this.listAllActions().filter((definition) => definition.actionClass === actionClass);
  }

  listAllActions(): ActionDefinition[] {
    return Array.from(this.definitions.values());
  }
}

export function createActionRegistry(): ActionRegistry {
  return new ActionRegistry();
}
