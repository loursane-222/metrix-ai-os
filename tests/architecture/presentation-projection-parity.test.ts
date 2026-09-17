import {
  readFileSync
} from "node:fs";

import {
  describe,
  expect,
  it
} from "vitest";

const projectionPath =
  "src/lib/presentation/project-result.ts";

const calendarRendererPath =
  "src/components/metrix-view/CalendarPresentationView.tsx";

const calendarLayoutPath =
  "src/components/metrix-view/calendar-layout.ts";

const textRoutePath =
  "src/app/api/metrix/route.ts";

const delegationBridgePath =
  "src/lib/live/live-delegation-bridge.ts";

function read(path: string): string {
  return readFileSync(path, "utf8");
}

describe(
  "presentation projection architecture guardrails",
  () => {
    it(
      "voice and text both call the exact same projectCapabilityResults — no second, voice-only or text-only projection rule set",
      () => {
        const textRouteSource = read(textRoutePath);
        const delegationBridgeSource = read(delegationBridgePath);

        expect(textRouteSource).toContain(
          'from "../../../lib/presentation/project-result"'
        );

        expect(delegationBridgeSource).toContain(
          'from "../presentation/project-result"'
        );

        expect(textRouteSource).toContain(
          "projectCapabilityResults"
        );

        expect(delegationBridgeSource).toContain(
          "projectCapabilityResults"
        );

        // Neither surface defines its own local projector.
        expect(textRouteSource).not.toMatch(
          /function\s+project\w*Result|function\s+project\w*Presentation/
        );

        expect(delegationBridgeSource).not.toMatch(
          /function\s+project\w*Result|function\s+project\w*Presentation/
        );
      }
    );

    it(
      "the projection layer never touches the database, never calls a canonical action, and is a pure read of its own input",
      () => {
        const source = read(projectionPath);

        expect(source).not.toMatch(
          /from ["'].*\/db["']|from ["'].*\/actions\//
        );

        expect(source).not.toMatch(
          /await |async /
        );
      }
    );

    it(
      "the calendar renderer never displays a raw ISO/UTC timestamp — only locale-formatted human time",
      () => {
        const source = read(calendarRendererPath);

        expect(source).toContain(
          "toLocaleTimeString"
        );

        // No path in this file ever renders an event's own timestamp via
        // .toISOString() or a raw string interpolation of it — .toISOString()
        // is only ever used for grid-day React keys, never for a value the
        // user actually reads.
        expect(source).not.toMatch(
          /event\.(startsAt|endsAt)\}/
        );

        expect(source).not.toMatch(
          /event\.(startsAt|endsAt)\.toISOString/
        );
      }
    );

    it(
      "internal identifier exclusion is a single, general, key-pattern rule — not a per-capability allowlist",
      () => {
        const source = read(projectionPath);

        expect(source).toContain(
          "INTERNAL_IDENTIFIER_KEY_PATTERN"
        );

        // Exactly one place applies it inside scalarFields — proving the
        // exclusion is centralized, not repeated per capability/component.
        const occurrences =
          source.split(
            "INTERNAL_IDENTIFIER_KEY_PATTERN"
          ).length - 1;

        expect(occurrences).toBe(2);
      }
    );

    it(
      "the schedule-anchor -> CalendarView rule is capability-name-agnostic — driven by data shape (dueAt/startsAt), never an if-capability-equals branch",
      () => {
        const source = read(projectionPath);

        expect(source).not.toMatch(
          /capability\s*===\s*["']task_create["']/
        );

        expect(source).not.toMatch(
          /capability\s*===\s*["']task_update["']/
        );

        expect(source).toContain(
          "scheduleAnchor"
        );
      }
    );

    it(
      "the calendar renderer and its layout logic operate on presentation data only — no DB, no canonical action, no business mutation",
      () => {
        const rendererSource = read(calendarRendererPath);
        const layoutSource = read(calendarLayoutPath);

        for (const source of [rendererSource, layoutSource]) {
          expect(source).not.toMatch(
            /from ["'].*\/db["']|from ["'].*\/actions\/|from ["'].*\/data\//
          );

          expect(source).not.toMatch(
            /executeMetrixBusinessTool|runMetrixExecutiveTurn/
          );
        }

        // The layout module is pure, synchronous geometry/date math —
        // no network, no async work of any kind.
        expect(layoutSource).not.toMatch(/await |async /);
      }
    );
  }
);
