import type { CoolifyPayload } from "./format";

export interface RelayEvent {
  id: number;
  receivedAt: string;
  payload: CoolifyPayload;
}

export interface PollResult {
  events: RelayEvent[];
  cursor: number;
}

export interface RelayCredentials {
  relayUrl: string;
  secret: string;
  relayKey?: string;
}

/** The relay rejected our credentials: retrying won't help until an admin acts. */
export class RelayAuthError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RelayAuthError";
  }
}

/** Network failure, timeout or 5xx/429: worth retrying with backoff. */
export class RelayUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RelayUnavailableError";
  }
}

function headers(creds: RelayCredentials): Record<string, string> {
  const h: Record<string, string> = { authorization: `Bearer ${creds.secret}`, accept: "application/json" };
  if (creds.relayKey) h["x-relay-key"] = creds.relayKey;
  return h;
}

async function request(url: string, init: RequestInit, timeoutMs: number, outer?: AbortSignal): Promise<Response> {
  const controller = new AbortController();
  const onAbort = () => controller.abort();
  outer?.addEventListener("abort", onAbort, { once: true });
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { ...init, signal: controller.signal });
    // Read the body under the same deadline.
    const body = await res.text();
    return new Response(body, { status: res.status, headers: res.headers });
  } catch (error) {
    if (outer?.aborted) throw error;
    const reason = controller.signal.aborted ? "timeout" : error instanceof Error ? error.message : String(error);
    throw new RelayUnavailableError(reason);
  } finally {
    clearTimeout(timer);
    outer?.removeEventListener("abort", onAbort);
  }
}

async function errorMessage(res: Response): Promise<string> {
  try {
    const body = (await res.json()) as { message?: string };
    if (body.message) return `HTTP ${res.status}: ${body.message}`;
  } catch {
    // Not JSON: something other than a Rootcast relay answered (wrong URL or port).
    return `HTTP ${res.status}, this does not look like a Rootcast relay (check the URL and port)`;
  }
  return `HTTP ${res.status}`;
}

/** Long-polls the relay. Passing `after` acknowledges (and deletes) everything up to it. */
export async function poll(
  creds: RelayCredentials,
  after: number,
  waitSeconds: number,
  signal?: AbortSignal,
): Promise<PollResult> {
  const url = `${creds.relayUrl}/v1/events?after=${after}&wait=${waitSeconds}`;
  const res = await request(url, { headers: headers(creds) }, (waitSeconds + 15) * 1000, signal);
  if (res.status === 401) throw new RelayAuthError(await errorMessage(res));
  if (!res.ok) throw new RelayUnavailableError(await errorMessage(res));
  let body: unknown;
  try {
    body = await res.json();
  } catch {
    throw new RelayUnavailableError("invalid response (is this a relay URL?)");
  }
  const result = body as Partial<PollResult>;
  if (!Array.isArray(result.events) || typeof result.cursor !== "number") {
    throw new RelayUnavailableError("invalid response (is this a relay URL?)");
  }
  return { events: result.events, cursor: result.cursor };
}

/** Deletes the hook on the relay so its webhook URL stops accepting events. Best effort. */
export async function deleteHook(creds: RelayCredentials): Promise<void> {
  try {
    await request(`${creds.relayUrl}/v1/hook`, { method: "DELETE", headers: headers(creds) }, 10_000);
  } catch {
    // The relay forgets unused hooks on its own after HOOK_TTL_DAYS.
  }
}
