import { after, before, describe, test } from "node:test";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { loadConfig } from "../src/config.ts";
import { deriveHookId } from "../src/hook-id.ts";
import { createRelay, type Relay } from "../src/server.ts";

const newSecret = () => randomBytes(32).toString("base64url");

function startRelay(env: Record<string, string> = {}): { relay: Relay; ready: Promise<string> } {
  const config = loadConfig({ PORT: "0", HOST: "127.0.0.1", DATA_DIR: ":memory:", ...env });
  const relay = createRelay(config);
  const ready = relay.listen().then((port) => `http://127.0.0.1:${port}`);
  return { relay, ready };
}

function poll(base: string, secret: string, params = "", headers: Record<string, string> = {}) {
  return fetch(`${base}/v1/events${params}`, { headers: { authorization: `Bearer ${secret}`, ...headers } });
}

function ingest(base: string, hookId: string, body: unknown) {
  return fetch(`${base}/v1/hooks/${hookId}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

describe("hook id", () => {
  test("matches the shared test vector", () => {
    // Same vector is asserted in bot/test/hook-id.test.mjs.
    assert.equal(deriveHookId("test-secret-0123456789abcdefghijklmnop"), "U7KxR6SHd6k3MJWFJ3W1CgfOxw8wv-AxIV_RPcUA2qU");
  });
});

describe("open relay", () => {
  const { relay, ready } = startRelay();
  let base = "";
  before(async () => {
    base = await ready;
  });
  after(() => relay.close());

  test("health check", async () => {
    const res = await fetch(`${base}/healthz`);
    assert.equal(res.status, 200);
    assert.equal(((await res.json()) as { status: string }).status, "ok");
  });

  test("rejects events for unclaimed hooks", async () => {
    const res = await ingest(base, deriveHookId(newSecret()), { event: "test", success: true, message: "x" });
    assert.equal(res.status, 404);
  });

  test("full round trip: claim, ingest, poll, acknowledge", async () => {
    const secret = newSecret();
    const hookId = deriveHookId(secret);

    const first = await poll(base, secret, "?after=0");
    assert.equal(first.status, 200);
    assert.deepEqual(await first.json(), { events: [], cursor: 0 });

    const accepted = await ingest(base, hookId, { event: "deployment_success", success: true, message: "ok" });
    assert.equal(accepted.status, 202);
    await ingest(base, hookId, { event: "backup_failed", success: false, message: "ko" });

    const res = await poll(base, secret, "?after=0");
    const body = (await res.json()) as { events: Array<{ id: number; payload: { event: string } }>; cursor: number };
    assert.deepEqual(
      body.events.map((e) => e.payload.event),
      ["deployment_success", "backup_failed"],
    );
    assert.equal(body.cursor, body.events[1]!.id);

    const next = await poll(base, secret, `?after=${body.cursor}`);
    assert.deepEqual(((await next.json()) as { events: unknown[] }).events, []);
    assert.equal(relay.store.stats().events, 0, "acknowledged events are deleted");
  });

  test("long poll wakes up when an event arrives", async () => {
    const secret = newSecret();
    await poll(base, secret);
    const started = Date.now();
    const pending = poll(base, secret, "?after=0&wait=10");
    setTimeout(() => void ingest(base, deriveHookId(secret), { event: "test", success: true, message: "hi" }), 200);
    const body = (await (await pending).json()) as { events: unknown[] };
    assert.equal(body.events.length, 1);
    assert.ok(Date.now() - started < 5000, "returned before the wait timeout");
  });

  test("validates payloads", async () => {
    const secret = newSecret();
    await poll(base, secret);
    const hookId = deriveHookId(secret);
    assert.equal((await ingest(base, hookId, "not json")).status, 400);
    assert.equal((await ingest(base, hookId, [1, 2])).status, 400);
    assert.equal((await ingest(base, hookId, { message: "no event" })).status, 400);
    assert.equal((await ingest(base, hookId, { event: "x", pad: "a".repeat(70_000) })).status, 413);
  });

  test("rejects malformed secrets", async () => {
    assert.equal((await poll(base, "short")).status, 401);
    assert.equal((await fetch(`${base}/v1/events`)).status, 401);
  });

  test("deleting a hook disables its webhook URL", async () => {
    const secret = newSecret();
    await poll(base, secret);
    const del = await fetch(`${base}/v1/hook`, { method: "DELETE", headers: { authorization: `Bearer ${secret}` } });
    assert.equal(del.status, 200);
    assert.equal((await ingest(base, deriveHookId(secret), { event: "test" })).status, 404);
  });
});

describe("limits", () => {
  const { relay, ready } = startRelay({ INGEST_PER_MINUTE: "2", MAX_EVENTS_PER_HOOK: "10", MAX_HOOKS: "2" });
  let base = "";
  before(async () => {
    base = await ready;
  });
  after(() => relay.close());

  test("rate limits ingestion per hook with 429 (Coolify retries)", async () => {
    const secret = newSecret();
    await poll(base, secret);
    const hookId = deriveHookId(secret);
    assert.equal((await ingest(base, hookId, { event: "a" })).status, 202);
    assert.equal((await ingest(base, hookId, { event: "b" })).status, 202);
    assert.equal((await ingest(base, hookId, { event: "c" })).status, 429);
  });

  test("caps the number of hooks", async () => {
    assert.equal((await poll(base, newSecret())).status, 200);
    assert.equal((await poll(base, newSecret())).status, 503);
  });
});

describe("private relay", () => {
  const key = "a-very-long-access-key-123";
  const { relay, ready } = startRelay({ RELAY_ACCESS_KEY: key });
  let base = "";
  before(async () => {
    base = await ready;
  });
  after(() => relay.close());

  test("requires the access key to poll", async () => {
    const secret = newSecret();
    assert.equal((await poll(base, secret)).status, 401);
    assert.equal((await poll(base, secret, "", { "x-relay-key": "wrong-key-wrong-key" })).status, 401);
    assert.equal((await poll(base, secret, "", { "x-relay-key": key })).status, 200);
  });

  test("Coolify can still post without the key", async () => {
    const secret = newSecret();
    await poll(base, secret, "", { "x-relay-key": key });
    assert.equal((await ingest(base, deriveHookId(secret), { event: "test" })).status, 202);
  });
});

describe("config", () => {
  test("rejects invalid values", () => {
    assert.throws(() => loadConfig({ PORT: "abc" }));
    assert.throws(() => loadConfig({ RELAY_ACCESS_KEY: "short" }));
    assert.throws(() => loadConfig({ TRUST_PROXY: "maybe" }));
  });
});
