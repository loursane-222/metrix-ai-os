import {
  readFileSync
} from "node:fs";

import {
  describe,
  expect,
  it
} from "vitest";

const surfaceConstantPath =
  "src/components/metrix-view/presentation-surface.ts";

const viewSurfacePath =
  "src/components/metrix-view/MetrixViewSurface.tsx";

const calendarRendererPath =
  "src/components/metrix-view/CalendarPresentationView.tsx";

const conversationPath =
  "src/components/metrix-conversation/MetrixConversation.tsx";

const ecosystemFieldPath =
  "src/components/metrix-tab/MetrixEcosystemField.tsx";

const globalsCssPath = "src/app/globals.css";

function read(path: string): string {
  return readFileSync(path, "utf8");
}

describe(
  "presentation surface opacity — single shared boundary, conversation untouched",
  () => {
    it(
      "every business Presentation type shares one opacity boundary — LIST, ENTITY, METRICS, CHART, DOCUMENT, and CALENDAR all reference the same constant",
      () => {
        const surfaceSource = read(viewSurfacePath);
        const calendarSource = read(calendarRendererPath);

        expect(surfaceSource).toContain(
          'import { PRESENTATION_SURFACE_CLASS } from "./presentation-surface"'
        );

        expect(calendarSource).toContain(
          'import { PRESENTATION_SURFACE_CLASS } from "./presentation-surface"'
        );

        // One import plus five usages: LIST, ENTITY, METRICS, CHART, and
        // the DOCUMENT fallback each apply the same shared constant.
        const occurrenceCount =
          surfaceSource.split("PRESENTATION_SURFACE_CLASS").length - 1;

        expect(occurrenceCount).toBe(6);

        // No branch defines its own separate, one-off opaque/transparent
        // background — the shared constant is the only background source
        // for a Presentation surface's outer container.
        expect(surfaceSource).not.toMatch(
          /bg-white\/\[\.\d+\]|bg-black\/\d|bg-\[#[0-9a-fA-F]{3,6}\]/
        );

        expect(calendarSource).not.toMatch(
          /className="mx-auto mt-5 w-full max-w-3xl rounded-2xl border border-white\/10 bg-/
        );
      }
    );

    it(
      "the shared boundary is practically opaque, not the previous near-transparent tint",
      () => {
        const source = read(surfaceConstantPath);

        // The old, reported-broken value must never reappear.
        expect(source).not.toMatch(/bg-white\/\[\.035\]/);

        // A solid/near-solid dark fill — 90%+ opacity — replaces it.
        const opacityMatch = source.match(
          /bg-\[#[0-9a-fA-F]{3,6}\]\/(\d{2,3})/
        );

        expect(opacityMatch).not.toBeNull();
        expect(Number(opacityMatch![1])).toBeGreaterThanOrEqual(90);
      }
    );

    it(
      "the opacity fix never touches the conversation surface, the hub, or global theming",
      () => {
        // The shared constant module must not be imported by, or
        // referenced from, any conversation/hub file — the boundary is
        // presentation-only by construction.
        const conversationSource = read(conversationPath);
        const ecosystemFieldSource = read(ecosystemFieldPath);

        expect(conversationSource).not.toContain(
          "presentation-surface"
        );

        expect(ecosystemFieldSource).not.toContain(
          "presentation-surface"
        );

        // The hub's own stacking/opacity rules in globals.css are
        // untouched — still the original z-index 0 hub behind z-index 1
        // conversation content, no new opacity rule introduced there for
        // this fix (it lives entirely in the component-level constant).
        const globalsCss = read(globalsCssPath);

        expect(globalsCss).toContain(
          ".metrix-ecosystem-field { position:absolute; z-index:0;"
        );

        expect(globalsCss).not.toContain("presentation-surface");
      }
    );

    it(
      "no stray near-transparent Presentation-surface background remains anywhere in the metrix-view component directory",
      () => {
        for (const path of [
          viewSurfacePath,
          calendarRendererPath,
          surfaceConstantPath
        ]) {
          expect(read(path)).not.toMatch(/bg-white\/\[\.035\]/);
        }
      }
    );
  }
);
