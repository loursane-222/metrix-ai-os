import { beforeEach, describe, expect, it } from "vitest";
import { getConnectorAdapter, listConnectorAdapters, registerConnectorAdapter, resetConnectorGatewayForTests } from "../connector-gateway";
import type { ConnectorAdapter } from "../types";

function fakeAdapter(provider: string): ConnectorAdapter {
  return {
    provider,
    displayName: `Fake ${provider}`,
    supportedCapabilities: ["customer.accountingBalance"],
    health: async () => ({ status: "HEALTHY", checkedAt: new Date().toISOString() }),
    read: async () => ({ status: "OK", value: 1, observedAt: new Date().toISOString() }),
  };
}

describe("connector gateway", () => {
  beforeEach(() => resetConnectorGatewayForTests());

  it("registers and looks up an adapter by provider", () => {
    const adapter = fakeAdapter("ACCOUNTING_FAKE");
    registerConnectorAdapter(adapter);
    expect(getConnectorAdapter("ACCOUNTING_FAKE")).toBe(adapter);
  });

  it("returns undefined for an unregistered provider", () => {
    expect(getConnectorAdapter("NOT_REGISTERED")).toBeUndefined();
  });

  it("lists every registered adapter", () => {
    registerConnectorAdapter(fakeAdapter("ACCOUNTING_FAKE"));
    registerConnectorAdapter(fakeAdapter("CRM_FAKE"));
    expect(listConnectorAdapters().map((a) => a.provider).sort()).toEqual(["ACCOUNTING_FAKE", "CRM_FAKE"]);
  });

  it("throws on a duplicate provider registration rather than silently overwriting it", () => {
    registerConnectorAdapter(fakeAdapter("ACCOUNTING_FAKE"));
    expect(() => registerConnectorAdapter(fakeAdapter("ACCOUNTING_FAKE"))).toThrow();
  });
});
