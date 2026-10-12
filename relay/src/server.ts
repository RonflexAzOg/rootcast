import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";
import { timingSafeEqual } from "node:crypto";
import type { RelayConfig } from "./config.ts";
import { deriveHookId, HOOK_ID_PATTERN, SECRET_PATTERN } from "./hook-id.ts";
import { RateLimiter } from "./rate-limit.ts";
import { EventStore } from "./store.ts";
import { VERSION } from "./version.ts";

const POLL_BATCH_SIZE = 50;
const MAX_POLLERS_PER_HOOK = 5;
const MAINTENANCE_INTERVAL_MS = 15 * 60_000;

class HttpError extends Error {
  readonly status: number;
  readonly code: string;

  constructor(status: number, code: string, message: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

export interface Relay {
  server: Server;
  store: EventStore;
  /** Resolves with the bound port once listening. */
  listen(): Promise<number>;
  close(): Promise<void>;
}

function log(level: "info" | "warn" | "error", msg: string, extra: Record<string, unknown> = {}): void {
  // One JSON line per entry. Never log secrets, hook IDs in full, or payloads.
  const line = JSON.stringify({ time: new Date().toISOString(), level, msg, ...extra });
  (level === "error" ? console.error : console.log)(line);
}

function shortId(hookId: string): string {
  return `${hookId.slice(0, 6)}…`;
}

function send(res: ServerResponse, status: number, body: unknown): void {
  if (res.writableEnded || res.destroyed) return;
  const json = JSON.stringify(body);
  res.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "content-length": Buffer.byteLength(json),
    "cache-control": "no-store",
    "x-content-type-options": "nosniff",
  });
  res.end(json);
}

function readBody(req: IncomingMessage, maxBytes: number): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const declared = Number(req.headers["content-length"] ?? "0");
    if (declared > maxBytes) {
      reject(new HttpError(413, "payload_too_large", `Body exceeds ${maxBytes} bytes`));
      req.resume();
      return;
    }
    const chunks: Buffer[] = [];
    let size = 0;
    req.on("data", (chunk: Buffer) => {
      size += chunk.length;
      if (size > maxBytes) {
        reject(new HttpError(413, "payload_too_large", `Body exceeds ${maxBytes} bytes`));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => resolve(Buffer.concat(chunks)));
    req.on("error", reject);
  });
}

function safeEqual(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}

export function createRelay(config: RelayConfig): Relay {
  const store = new EventStore(config.dataDir);
  const ingestLimiter = new RateLimiter(config.ingestPerMinute);
  const pollLimiter = new RateLimiter(config.pollPerMinute);
  /** Long-poll waiters per hook; called when a new event arrives. */
  const waiters = new Map<string, Set<() => void>>();

  function clientIp(req: IncomingMessage): string {
    if (config.trustProxy) {
      const forwarded = req.headers["x-forwarded-for"];
      const first = (Array.isArray(forwarded) ? forwarded[0] : forwarded)?.split(",")[0]?.trim();
      if (first) return first;
    }
    return req.socket.remoteAddress ?? "unknown";
  }

  function wake(hookId: string): void {
    const set = waiters.get(hookId);
    if (!set) return;
    waiters.delete(hookId);
    for (const resolve of set) resolve();
  }

  /** Validates the bearer secret (and access key) and returns the hook ID. */
  function authenticate(req: IncomingMessage): string {
    if (config.accessKey !== "") {
      const provided = req.headers["x-relay-key"];
      if (typeof provided !== "string" || !safeEqual(provided, config.accessKey)) {
        throw new HttpError(401, "invalid_access_key", "This relay requires a valid X-Relay-Key header");
      }
    }
    const auth = req.headers.authorization ?? "";
    const match = /^Bearer\s+(\S+)$/i.exec(auth);
    if (!match || !SECRET_PATTERN.test(match[1]!)) {
      throw new HttpError(401, "invalid_secret", "Missing or malformed bearer secret");
    }
    return deriveHookId(match[1]!);
  }

  async function handleIngest(req: IncomingMessage, res: ServerResponse, hookId: string): Promise<void> {
    if (!HOOK_ID_PATTERN.test(hookId) || !store.hookExists(hookId)) {
      // 404 tells Coolify the URL is wrong (it records a delivery failure).
      throw new HttpError(404, "unknown_hook", "Unknown hook. Run /coolify setup again in Root.");
    }
    if (!ingestLimiter.hit(hookId)) {
      // 429 makes Coolify retry later instead of dropping the notification.
      throw new HttpError(429, "rate_limited", "Too many events for this hook, retry later");
    }
    const body = await readBody(req, config.maxBodyBytes);
    let payload: unknown;
    try {
      payload = JSON.parse(body.toString("utf8"));
    } catch {
      throw new HttpError(400, "invalid_json", "Body must be a JSON object");
    }
    if (typeof payload !== "object" || payload === null || Array.isArray(payload)) {
      throw new HttpError(400, "invalid_json", "Body must be a JSON object");
    }
    if (typeof (payload as { event?: unknown }).event !== "string") {
      throw new HttpError(400, "missing_event", 'Body must contain a string "event" field');
    }
    const id = store.addEvent(hookId, JSON.stringify(payload), Date.now(), config.maxEventsPerHook);
    wake(hookId);
    log("info", "event received", { hook: shortId(hookId), event: (payload as { event: string }).event });
    send(res, 202, { ok: true, id });
  }

  async function handlePoll(req: IncomingMessage, res: ServerResponse, url: URL): Promise<void> {
    if (!pollLimiter.hit(clientIp(req))) {
      throw new HttpError(429, "rate_limited", "Too many requests, slow down");
    }
    const hookId = authenticate(req);
    const claim = store.claimHook(hookId, Date.now(), config.maxHooks);
    if (claim === "full") {
      throw new HttpError(503, "relay_full", "This relay has reached its maximum number of hooks");
    }
    if (claim === "created") log("info", "hook registered", { hook: shortId(hookId) });

    const after = Math.max(0, Number.parseInt(url.searchParams.get("after") ?? "0", 10) || 0);
    const wait = Math.min(
      config.maxWaitSeconds,
      Math.max(0, Number.parseInt(url.searchParams.get("wait") ?? "0", 10) || 0),
    );

    // Everything up to `after` has been delivered by the bot: drop it.
    store.acknowledge(hookId, after);

    let events = store.listEvents(hookId, after, POLL_BATCH_SIZE);
    if (events.length === 0 && wait > 0) {
      const set = waiters.get(hookId) ?? new Set<() => void>();
      if (set.size >= MAX_POLLERS_PER_HOOK) {
        throw new HttpError(429, "too_many_pollers", "Too many concurrent polls for this hook");
      }
      await new Promise<void>((resolve) => {
        const done = () => {
          clearTimeout(timer);
          set.delete(done);
          resolve();
        };
        const timer = setTimeout(done, wait * 1000);
        set.add(done);
        waiters.set(hookId, set);
        res.on("close", done);
      });
      if (res.destroyed || res.writableEnded) return;
      events = store.listEvents(hookId, after, POLL_BATCH_SIZE);
    }
    const cursor = events.length > 0 ? events[events.length - 1]!.id : after;
    send(res, 200, { events, cursor });
  }

  function handleDelete(req: IncomingMessage, res: ServerResponse): void {
    const hookId = authenticate(req);
    const deleted = store.deleteHook(hookId);
    wake(hookId);
    if (deleted) log("info", "hook deleted", { hook: shortId(hookId) });
    send(res, deleted ? 200 : 404, { ok: deleted });
  }

  async function route(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const url = new URL(req.url ?? "/", "http://relay.local");
    const path = url.pathname.replace(/\/+$/, "") || "/";
    const method = req.method ?? "GET";

    if (path === "/healthz" && method === "GET") {
      return send(res, 200, { status: "ok", version: VERSION });
    }
    if (path === "/" && method === "GET") {
      return send(res, 200, {
        name: "root-coolify-notifier relay",
        version: VERSION,
        open: config.accessKey === "",
        docs: "https://github.com/RonflexAzOg/root-coolify-notifier",
      });
    }
    const hookMatch = /^\/v1\/hooks\/([^/]+)$/.exec(path);
    if (hookMatch) {
      if (method !== "POST") throw new HttpError(405, "method_not_allowed", "Use POST");
      return handleIngest(req, res, hookMatch[1]!);
    }
    if (path === "/v1/events") {
      if (method !== "GET") throw new HttpError(405, "method_not_allowed", "Use GET");
      return handlePoll(req, res, url);
    }
    if (path === "/v1/hook") {
      if (method !== "DELETE") throw new HttpError(405, "method_not_allowed", "Use DELETE");
      return handleDelete(req, res);
    }
    throw new HttpError(404, "not_found", "Not found");
  }

  const server = createServer((req, res) => {
    route(req, res).catch((error: unknown) => {
      if (error instanceof HttpError) {
        send(res, error.status, { error: error.code, message: error.message });
        return;
      }
      log("error", "unhandled error", { error: error instanceof Error ? error.message : String(error) });
      send(res, 500, { error: "internal_error", message: "Internal error" });
    });
  });
  server.headersTimeout = 15_000;
  server.requestTimeout = (config.maxWaitSeconds + 30) * 1000;
  server.keepAliveTimeout = 65_000;

  const maintenance = setInterval(() => {
    try {
      const removed = store.cleanup(Date.now(), config.eventTtlHours * 3_600_000, config.hookTtlDays * 86_400_000);
      ingestLimiter.prune();
      pollLimiter.prune();
      if (removed.events > 0 || removed.hooks > 0) log("info", "cleanup", removed);
    } catch (error) {
      log("error", "cleanup failed", { error: error instanceof Error ? error.message : String(error) });
    }
  }, MAINTENANCE_INTERVAL_MS);
  maintenance.unref();

  return {
    server,
    store,
    listen: () =>
      new Promise((resolve, reject) => {
        server.once("error", reject);
        server.listen(config.port, config.host, () => {
          const { port } = server.address() as AddressInfo;
          resolve(port);
        });
      }),
    close: () =>
      new Promise((resolve) => {
        clearInterval(maintenance);
        for (const hookId of [...waiters.keys()]) wake(hookId);
        server.close(() => {
          store.close();
          resolve();
        });
        server.closeIdleConnections();
      }),
  };
}

export { log };
