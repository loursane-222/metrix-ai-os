import { beforeEach, describe, expect, it, vi } from "vitest";

const { resolveTruthAuthorityMock, getSourceByIdMock, executeCanonicalOperationMock } = vi.hoisted(() => ({
  resolveTruthAuthorityMock: vi.fn(),
  getSourceByIdMock: vi.fn(),
  executeCanonicalOperationMock: vi.fn(),
}));

vi.mock("../truth-authority", () => ({ resolveTruthAuthority: resolveTruthAuthorityMock }));
vi.mock("../source-registry", () => ({ getSourceById: getSourceByIdMock }));
vi.mock("@/lib/canonical-operation/native-connector", () => ({ executeCanonicalOperation: executeCanonicalOperationMock }));

import { executeRoutedWrite, resolveWriteRoute } from "../write-routing";

describe("resolveWriteRoute", () => {
  beforeEach(() => {
    resolveTruthAuthorityMock.mockReset();
    getSourceByIdMock.mockReset();
  });

  it("routes to native when the resolved authoritative source's provider is METRIX", async () => {
    resolveTruthAuthorityMock.mockResolvedValue({ status: "RESOLVED", primarySourceId: "src-native", supportingSourceIds: [] });
    getSourceByIdMock.mockResolvedValue({ id: "src-native", provider: "METRIX" });
    const route = await resolveWriteRoute({ organizationId: "org-1", factScope: "customer.update" });
    expect(route).toEqual({ status: "ROUTE_NATIVE" });
  });

  it("returns ROUTE_UNSUPPORTED_CONNECTOR for a resolved non-native authority — never silently falls back to native", async () => {
    resolveTruthAuthorityMock.mockResolvedValue({ status: "UNCONFIGURED_SINGLE_SOURCE", sourceId: "src-erp" });
    getSourceByIdMock.mockResolvedValue({ id: "src-erp", provider: "ERP_FAKE_PROVIDER" });
    const route = await resolveWriteRoute({ organizationId: "org-1", factScope: "order.create" });
    expect(route).toEqual({ status: "ROUTE_UNSUPPORTED_CONNECTOR", sourceId: "src-erp", provider: "ERP_FAKE_PROVIDER" });
  });

  it("surfaces CONFLICT from truth authority as-is", async () => {
    resolveTruthAuthorityMock.mockResolvedValue({ status: "CONFLICT", candidateSourceIds: ["a", "b"] });
    const route = await resolveWriteRoute({ organizationId: "org-1", factScope: "customer.update" });
    expect(route).toEqual({ status: "CONFLICT", candidateSourceIds: ["a", "b"] });
  });

  it("is NO_AUTHORITY when truth authority has no source configured", async () => {
    resolveTruthAuthorityMock.mockResolvedValue({ status: "UNCONFIGURED_NO_SOURCE" });
    const route = await resolveWriteRoute({ organizationId: "org-1", factScope: "customer.update" });
    expect(route).toEqual({ status: "NO_AUTHORITY" });
  });

  it("is NO_AUTHORITY when the only capable source is unavailable", async () => {
    resolveTruthAuthorityMock.mockResolvedValue({ status: "SOURCE_UNAVAILABLE", sourceIds: ["src-erp"] });
    const route = await resolveWriteRoute({ organizationId: "org-1", factScope: "customer.update" });
    expect(route).toEqual({ status: "NO_AUTHORITY" });
  });
});

describe("executeRoutedWrite", () => {
  beforeEach(() => executeCanonicalOperationMock.mockReset());

  it("delegates a ROUTE_NATIVE route straight to executeCanonicalOperation — the one write authority, not a second runtime", async () => {
    executeCanonicalOperationMock.mockResolvedValue({ status: "EXECUTED" });
    const operation = { operationId: "op-1" } as never;
    const deps = {} as never;
    const result = await executeRoutedWrite(operation, deps, { status: "ROUTE_NATIVE" });
    expect(executeCanonicalOperationMock).toHaveBeenCalledWith(operation, deps);
    expect(result).toEqual({ status: "EXECUTED" });
  });

  it("refuses to execute a non-native route rather than silently dispatching anywhere", async () => {
    await expect(executeRoutedWrite({} as never, {} as never, { status: "ROUTE_UNSUPPORTED_CONNECTOR", sourceId: "s", provider: "ERP_FAKE" })).rejects.toThrow();
    expect(executeCanonicalOperationMock).not.toHaveBeenCalled();
  });
});
