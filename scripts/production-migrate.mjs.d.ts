export function runProductionMigration(options?: {
  env?: Record<string, string | undefined>;
  runMigration?: () => void;
  log?: (message: string) => void;
}): "skipped" | "applied";
