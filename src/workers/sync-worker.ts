import cron from "node-cron";
import { syncAll } from "@/lib/sync-engine";

const INTERVAL_MINUTES = parseInt(process.env.SYNC_INTERVAL_MINUTES ?? "15", 10);

export async function runSync() {
  console.log(`[sync-worker] Starting sync at ${new Date().toISOString()}`);

  try {
    const results = await syncAll();
    const totalCreated = results.reduce((s, r) => s + r.created, 0);
    const totalUpdated = results.reduce((s, r) => s + r.updated, 0);
    const totalDeleted = results.reduce((s, r) => s + r.deleted, 0);
    const totalErrors = results.flatMap((r) => r.errors);

    console.log(
      `[sync-worker] Done. connections=${results.length} created=${totalCreated} updated=${totalUpdated} deleted=${totalDeleted}`
    );

    if (totalErrors.length > 0) {
      console.error(`[sync-worker] Errors:\n${totalErrors.join("\n")}`);
    }
  } catch (err) {
    console.error("[sync-worker] Fatal error:", err);
  }
}

export function startWorker() {
  const interval = Math.max(1, Math.min(60, INTERVAL_MINUTES));
  const cronExpression = `*/${interval} * * * *`;

  console.log(
    `[sync-worker] Starting. Sync interval: every ${interval} minutes (${cronExpression})`
  );

  // Run immediately on startup
  runSync();

  // Schedule recurring runs
  cron.schedule(cronExpression, runSync);
}

// Entry point when run directly: tsx src/workers/sync-worker.ts
startWorker();
