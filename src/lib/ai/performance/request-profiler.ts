import { randomUUID } from "crypto";

export type RequestProfiler = {
  markStart: (name: string) => void;
  markEnd: (name: string) => void;
  measure: <T>(name: string, fn: () => Promise<T>) => Promise<T>;
  finish: () => void;
};

export function createRequestProfiler(label: string, requestId?: string): RequestProfiler {
  const id = requestId ?? randomUUID().slice(0, 8);
  const starts = new Map<string, number>();
  const records: Array<{ name: string; ms: number }> = [];

  function push(name: string, start: number): void {
    records.push({ name, ms: Math.round(performance.now() - start) });
  }

  return {
    markStart(name) {
      starts.set(name, performance.now());
    },

    markEnd(name) {
      const start = starts.get(name);
      if (start == null) return;
      push(name, start);
      starts.delete(name);
    },

    async measure(name, fn) {
      const start = performance.now();
      try {
        return await fn();
      } finally {
        push(name, start);
      }
    },

    finish() {
      if (process.env.NODE_ENV === "production" && !process.env.PERF_PROFILING_ENABLED) return;

      const total = records.find((r) => r.name === "route_total")?.ms;
      const header =
        total != null
          ? `[PERF:${label}] req=${id} route_total=${total}ms`
          : `[PERF:${label}] req=${id}`;

      console.info(`\n${header}`);
      console.table(
        records.map((r) => ({
          label: r.name,
          ms: r.ms,
          ...(total != null ? { "% of total": `${Math.round((r.ms / total) * 100)}%` } : {}),
        })),
      );
    },
  };
}
