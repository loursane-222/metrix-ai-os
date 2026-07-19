import { describe, expect, it } from "vitest";
import { CUSTOMER_BUILT_IN_FIELDS, customerCustomDefinitionToField } from "../customer-field-registry";
import { customerAuthorityKey, customerFieldDescriptor, customerTargetId } from "../customer-universal-input-adapter";

describe("Customers universal input descriptors", () => {
  it("discovers create fields with semantic authority keys", () => { const descriptor = customerFieldDescriptor(CUSTOMER_BUILT_IN_FIELDS[0], "create"); expect(descriptor.executiveTargetId).toContain("field.customers.create.customer.displayName"); expect(descriptor.authorityKey).toBe("customers.customer.displayName"); expect(descriptor.entityId).toBeUndefined(); });
  it("scopes edit target IDs by entity without changing authority keys", () => { const descriptor = customerFieldDescriptor(CUSTOMER_BUILT_IN_FIELDS[4], "edit", "cus_42"); expect(descriptor.executiveTargetId).toContain("cus_42"); expect(descriptor.entityId).toBe("cus_42"); expect(descriptor.authorityKey).toBe("customers.customer.email"); });
  it("projects custom fields without teaching the generic host their IDs", () => { const custom = customerCustomDefinitionToField({ id: "custom_1", organizationId: "org", key: "sector", label: "Sektör", description: null, valueType: "string", required: false, options: [], active: true }); const descriptor = customerFieldDescriptor(custom, "create"); expect(descriptor.fieldId).toBe("customer.custom.custom_1"); expect(descriptor.authorityKey).toBe("customers.customer.custom.custom_1"); });
  it("keeps action authority semantic and instance IDs stable", () => { expect(customerTargetId("edit", "action", "commit", "cus_42")).toBe("action.customers.cus_42.commit"); expect(customerAuthorityKey("commit")).toBe("customers.customer.commit"); });
});
