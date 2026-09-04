import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

const adapterSource = readFileSync(new URL("../icloud-connector-adapter.ts", import.meta.url), "utf8");
const serviceSource = readFileSync(new URL("../../integrations/icloud-calendar/icloud-calendar.service.ts", import.meta.url), "utf8");

/**
 * K) Read-only guarantee: this operation implements iCloud Calendar READ
 * only. Neither the ConnectorAdapter nor the underlying service exposes a
 * create/update/delete-event function — connectIcloudCalendar/
 * disconnectIcloudCalendar manage the CONNECTION (credential) lifecycle
 * only, never a calendar event.
 */
describe("icloudConnectorAdapter — no write capability exists", () => {
  it("declares no `write` method on the ConnectorAdapter contract (only health/read)", () => {
    expect(adapterSource).not.toMatch(/\basync write\(/);
    expect(adapterSource).not.toContain("write(");
  });

  it("the underlying service exposes no calendar event mutation function — only connection lifecycle (connect/status/disconnect) and range reads", () => {
    expect(serviceSource).not.toMatch(/export async function (create|update|delete|remove)Icloud(Calendar)?Event/i);
    expect(serviceSource).not.toContain("REPORT");
    expect(serviceSource).not.toMatch(/method:\s*["'](PUT|POST|DELETE)["']/);
  });
});
