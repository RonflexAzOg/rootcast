export interface RelayConfig {
  /** TCP port to listen on. */
  port: number;
  /** Interface to bind. */
  host: string;
  /** Directory holding the SQLite database. */
  dataDir: string;
  /** Maximum accepted webhook body, in bytes. */
  maxBodyBytes: number;
  /** Undelivered events older than this are dropped. */
  eventTtlHours: number;
  /** Hooks not polled by any bot for this long are deleted with their events. */
  hookTtlDays: number;
  /** Oldest events are dropped beyond this queue size per hook. */
  maxEventsPerHook: number;
  /** Maximum number of registered hooks on this relay (abuse guard). */
  maxHooks: number;
  /** Incoming webhooks allowed per hook and per minute. */
  ingestPerMinute: number;
  /** Poll/claim requests allowed per client IP and per minute. */
  pollPerMinute: number;
  /** Longest long-poll wait, in seconds. */
  maxWaitSeconds: number;
  /** Optional shared key required to claim/poll (for private relays). Empty = open relay. */
  accessKey: string;
  /** Trust X-Forwarded-For (set when running behind Coolify/Traefik or another proxy). */
  trustProxy: boolean;
}

function int(env: NodeJS.ProcessEnv, name: string, fallback: number, min: number, max: number): number {
  const raw = env[name];
  if (raw === undefined || raw.trim() === "") return fallback;
  const value = Number(raw);
  if (!Number.isInteger(value) || value < min || value > max) {
    throw new Error(`Invalid ${name}="${raw}": expected an integer between ${min} and ${max}`);
  }
  return value;
}

function bool(env: NodeJS.ProcessEnv, name: string, fallback: boolean): boolean {
  const raw = env[name]?.trim().toLowerCase();
  if (raw === undefined || raw === "") return fallback;
  if (["1", "true", "yes", "on"].includes(raw)) return true;
  if (["0", "false", "no", "off"].includes(raw)) return false;
  throw new Error(`Invalid ${name}="${env[name]}": expected true or false`);
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): RelayConfig {
  const accessKey = env.RELAY_ACCESS_KEY?.trim() ?? "";
  if (accessKey !== "" && accessKey.length < 16) {
    throw new Error("RELAY_ACCESS_KEY must be at least 16 characters long (or empty for an open relay)");
  }
  return {
    port: int(env, "PORT", 8787, 0, 65535),
    host: env.HOST?.trim() || "0.0.0.0",
    dataDir: env.DATA_DIR?.trim() || "./data",
    maxBodyBytes: int(env, "MAX_BODY_BYTES", 64 * 1024, 1024, 1024 * 1024),
    eventTtlHours: int(env, "EVENT_TTL_HOURS", 72, 1, 24 * 30),
    hookTtlDays: int(env, "HOOK_TTL_DAYS", 30, 1, 365),
    maxEventsPerHook: int(env, "MAX_EVENTS_PER_HOOK", 500, 10, 100_000),
    maxHooks: int(env, "MAX_HOOKS", 10_000, 1, 10_000_000),
    ingestPerMinute: int(env, "INGEST_PER_MINUTE", 120, 1, 100_000),
    pollPerMinute: int(env, "POLL_PER_MINUTE", 120, 1, 100_000),
    maxWaitSeconds: int(env, "MAX_WAIT_SECONDS", 25, 0, 55),
    accessKey,
    trustProxy: bool(env, "TRUST_PROXY", false),
  };
}
