import { env } from "cloudflare:workers";
import { drizzle } from "drizzle-orm/d1";
import * as schema from "./schema";

let sessionArchiveMigration: Promise<void> | null = null;

export function getDb() {
  if (!env.DB) {
    throw new Error(
      "Cloudflare D1 binding `DB` is unavailable. Set the `d1` field in .openai/hosting.json to `DB` or let your control plane inject the real binding values before using the database."
    );
  }

  return drizzle(env.DB, { schema });
}

export async function ensureSessionArchiveColumn() {
  if (!env.DB) {
    throw new Error("Cloudflare D1 binding `DB` is unavailable.");
  }
  if (!sessionArchiveMigration) {
    sessionArchiveMigration = env.DB.prepare("ALTER TABLE sessions ADD COLUMN archived_at TEXT").run()
      .then(() => undefined)
      .catch((error: unknown) => {
        if (String(error).toLowerCase().includes("duplicate column name")) return;
        sessionArchiveMigration = null;
        throw error;
      });
  }
  await sessionArchiveMigration;
}

let techniqueCalendarMigration: Promise<void> | null = null;

/** Remove the old prefilled schedule once as the app moves to request-first planning. */
export async function ensureTechniqueCalendar() {
  const database = env.DB;
  if (!database) throw new Error("Cloudflare D1 binding DB is unavailable.");
  if (!techniqueCalendarMigration) {
    techniqueCalendarMigration = (async () => {
      await ensureSessionArchiveColumn();
      await database.prepare("CREATE TABLE IF NOT EXISTS app_data_migrations (id TEXT PRIMARY KEY, applied_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)").run();
      const migrationId = "request-first-technique-calendar-2026-10-31-v1";
      await database.batch([
        database.prepare("DELETE FROM bookings WHERE NOT EXISTS (SELECT 1 FROM app_data_migrations WHERE id = ?)").bind(migrationId),
        database.prepare("DELETE FROM sessions WHERE NOT EXISTS (SELECT 1 FROM app_data_migrations WHERE id = ?)").bind(migrationId),
        database.prepare("INSERT OR IGNORE INTO app_data_migrations (id) VALUES (?)").bind(migrationId),
      ]);
    })().catch(error => { techniqueCalendarMigration = null; throw error; });
  }
  await techniqueCalendarMigration;
}
