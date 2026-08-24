import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import { businessNavigationRouteType, emitBusinessNavigationTelemetry } from "../business-navigation-telemetry";

describe("business navigation telemetry safety", () => {
  it("classifies dynamic routes without exposing entity ids", () => {
    expect(businessNavigationRouteType("/metrix/customers/private-customer-id/edit")).toBe("CUSTOMER_EDIT");
    expect(businessNavigationRouteType("/metrix/customers/private-customer-id")).toBe("CUSTOMER_DETAIL");
  });
  it("classifies the canonical Calendar route", () => {
    expect(businessNavigationRouteType("/metrix/calendar")).toBe("CALENDAR_ROOT");
  });
  it("emits only explicitly supplied structural fields", () => {
    const info = vi.spyOn(console, "info").mockImplementation(() => undefined);
    emitBusinessNavigationTelemetry("BusinessNavigation", { event: "understanding_observed", correlationId: "safe-correlation", businessNavigationPresent: false });
    const serialized = JSON.stringify(info.mock.calls);
    expect(serialized).toContain("safe-correlation");
    expect(serialized).not.toMatch(/Atlas|private-customer-id|userMessage|assistant|entityReference"/u);
    info.mockRestore();
  });
  it("keeps navigation projection classifier-, regex- and extra-LLM-free", () => {
    const route = readFileSync(new URL("../../../app/api/ai/chat/route.ts", import.meta.url), "utf8");
    const resolver = readFileSync(new URL("../../executive-request-resolution/business-navigation.ts", import.meta.url), "utf8");
    expect(route).toContain("resolveConversationRuntime({");
    expect(route.match(/classifyConversation\(\{ message \}\)/g)).toHaveLength(1);
    expect(resolver).not.toMatch(/OpenAI|responses\.create|entityReference\.match/);
  });
  it("records client lifecycle without logging full routes or command payloads", () => {
    const runtime = readFileSync(new URL("../conversation-navigation-runtime.ts", import.meta.url), "utf8");
    const host = readFileSync(new URL("../../../components/input-authority/ExecutiveNavigationCommandHost.tsx", import.meta.url), "utf8");
    expect(runtime).toContain("routeType(command.route)");
    expect(host).not.toContain("requestedRoute:");
    expect(host).not.toContain("currentPathname:");
  });
});
