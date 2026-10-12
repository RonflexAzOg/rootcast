import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";

export interface StoredEvent {
  id: number;
  receivedAt: string;
  payload: unknown;
}

export type ClaimResult = "existing" | "created" | "full";

/** Persistent queue of webhook events, one queue per hook. */
export class EventStore {
  private readonly db: DatabaseSync;

  constructor(dataDir: string) {
    const inMemory = dataDir === ":memory:";
    if (!inMemory) mkdirSync(dataDir, { recursive: true });
    this.db = new DatabaseSync(inMemory ? ":memory:" : join(dataDir, "relay.sqlite"));
    this.db.exec(`
      PRAGMA journal_mode = WAL;
      PRAGMA busy_timeout = 5000;
      PRAGMA foreign_keys = ON;
      CREATE TABLE IF NOT EXISTS hooks (
        id           TEXT PRIMARY KEY,
        created_at   INTEGER NOT NULL,
        last_seen_at INTEGER NOT NULL
      );
      CREATE TABLE IF NOT EXISTS events (
        seq         INTEGER PRIMARY KEY AUTOINCREMENT,
        hook_id     TEXT NOT NULL REFERENCES hooks(id) ON DELETE CASCADE,
        received_at INTEGER NOT NULL,
        payload     TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS events_by_hook ON events (hook_id, seq);
    `);
  }

  /** Registers the hook (or refreshes it) when a bot polls. */
  claimHook(hookId: string, now: number, maxHooks: number): ClaimResult {
    const updated = this.db
      .prepare("UPDATE hooks SET last_seen_at = ? WHERE id = ?")
      .run(now, hookId);
    if (Number(updated.changes) > 0) return "existing";
    const { n } = this.db.prepare("SELECT COUNT(*) AS n FROM hooks").get() as { n: number };
    if (n >= maxHooks) return "full";
    this.db
      .prepare("INSERT INTO hooks (id, created_at, last_seen_at) VALUES (?, ?, ?)")
      .run(hookId, now, now);
    return "created";
  }

  hookExists(hookId: string): boolean {
    return this.db.prepare("SELECT 1 FROM hooks WHERE id = ?").get(hookId) !== undefined;
  }

  addEvent(hookId: string, payload: string, now: number, maxEventsPerHook: number): number {
    const result = this.db
      .prepare("INSERT INTO events (hook_id, received_at, payload) VALUES (?, ?, ?)")
      .run(hookId, now, payload);
    // Keep only the newest N events for this hook.
    this.db
      .prepare(
        `DELETE FROM events WHERE hook_id = ? AND seq <= (
           SELECT seq FROM events WHERE hook_id = ? ORDER BY seq DESC LIMIT 1 OFFSET ?
         )`,
      )
      .run(hookId, hookId, maxEventsPerHook);
    return Number(result.lastInsertRowid);
  }

  /** Deletes everything up to `upTo` (the bot has delivered it). */
  acknowledge(hookId: string, upTo: number): void {
    if (upTo <= 0) return;
    this.db.prepare("DELETE FROM events WHERE hook_id = ? AND seq <= ?").run(hookId, upTo);
  }

  listEvents(hookId: string, after: number, limit: number): StoredEvent[] {
    const rows = this.db
      .prepare(
        "SELECT seq, received_at, payload FROM events WHERE hook_id = ? AND seq > ? ORDER BY seq ASC LIMIT ?",
      )
      .all(hookId, after, limit) as Array<{ seq: number; received_at: number; payload: string }>;
    return rows.map((row) => ({
      id: Number(row.seq),
      receivedAt: new Date(Number(row.received_at)).toISOString(),
      payload: JSON.parse(row.payload) as unknown,
    }));
  }

  deleteHook(hookId: string): boolean {
    const result = this.db.prepare("DELETE FROM hooks WHERE id = ?").run(hookId);
    return Number(result.changes) > 0;
  }

  /** Drops expired events and abandoned hooks. Returns what was removed. */
  cleanup(now: number, eventTtlMs: number, hookTtlMs: number): { events: number; hooks: number } {
    const events = this.db.prepare("DELETE FROM events WHERE received_at < ?").run(now - eventTtlMs);
    const hooks = this.db.prepare("DELETE FROM hooks WHERE last_seen_at < ?").run(now - hookTtlMs);
    return { events: Number(events.changes), hooks: Number(hooks.changes) };
  }

  stats(): { hooks: number; events: number } {
    const { hooks } = this.db.prepare("SELECT COUNT(*) AS hooks FROM hooks").get() as { hooks: number };
    const { events } = this.db.prepare("SELECT COUNT(*) AS events FROM events").get() as { events: number };
    return { hooks: Number(hooks), events: Number(events) };
  }

  close(): void {
    this.db.close();
  }
}
