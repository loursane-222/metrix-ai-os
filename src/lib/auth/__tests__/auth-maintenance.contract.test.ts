import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("auth maintenance critical-path contract", () => {
  it("keeps validation reads blocking and schedules touch writes", () => {
    const session = readFileSync(
      resolve(process.cwd(), "src/lib/auth/sessions/session.service.ts"),
      "utf8",
    );
    const trustedDevice = readFileSync(
      resolve(process.cwd(), "src/lib/auth/trusted-devices/trusted-device.service.ts"),
      "utf8",
    );
    const guard = readFileSync(
      resolve(process.cwd(), "src/lib/auth/guards/api-auth-guard.ts"),
      "utf8",
    );
    const context = readFileSync(
      resolve(process.cwd(), "src/lib/auth/context/auth-context.service.ts"),
      "utf8",
    );

    expect(session).toContain("const record = await findSessionByTokenHash");
    expect(session).toContain("scheduleMaintenance(async () =>");
    expect(trustedDevice).toContain(
      "const trustedDevice = await findTrustedDeviceByTokenHash",
    );
    expect(trustedDevice).toContain("scheduleMaintenance(async () =>");
    expect(guard).toContain("after(async () =>");
    expect(guard).toContain('"auth_touch_write_done"');
    expect(context).toContain(
      "const [validatedSession, trustedDeviceValid] = await Promise.all([",
    );
  });
});
