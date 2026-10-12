import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { normalizeRelayUrl, parseCommand, webhookUrl } from "../dist/commands.js";
import { deriveHookId, newSecret } from "../dist/hook-id.js";

describe("parseCommand", () => {
  test("ignores unrelated messages", () => {
    assert.equal(parseCommand("hello"), null);
    assert.equal(parseCommand("/coolifyx setup"), null);
    assert.equal(parseCommand(undefined), null);
  });

  test("defaults to help", () => {
    assert.equal(parseCommand("/coolify")?.name, "help");
  });

  test("parses setup with a plain URL and a key", () => {
    const cmd = parseCommand("/coolify setup https://relay.example.com/ my-relay-key-123456");
    assert.equal(cmd?.name, "setup");
    assert.deepEqual(cmd?.urls, ["https://relay.example.com/"]);
    assert.ok(cmd?.args.includes("my-relay-key-123456"));
  });

  test("parses setup when Root turned the URL into a Markdown link", () => {
    const cmd = parseCommand("/coolify setup [https://relay.example.com](https://relay.example.com)");
    assert.equal(cmd?.urls[0], "https://relay.example.com");
    assert.deepEqual(cmd?.args, ["https://relay.example.com"]);
  });

  test("supports French aliases and unknown commands", () => {
    assert.equal(parseCommand("/coolify aide")?.name, "help");
    assert.equal(parseCommand("/coolify langue fr")?.name, "lang");
    assert.equal(parseCommand("/coolify nope")?.name, "unknown");
  });
});

describe("normalizeRelayUrl", () => {
  test("accepts https and strips trailing slashes", () => {
    assert.equal(normalizeRelayUrl("https://relay.example.com/"), "https://relay.example.com");
    assert.equal(normalizeRelayUrl("https://example.com/relay//"), "https://example.com/relay");
  });
  test("allows http only for localhost", () => {
    assert.equal(normalizeRelayUrl("http://localhost:8080"), "http://localhost:8080");
    assert.equal(normalizeRelayUrl("http://relay.example.com"), null);
  });
  test("rejects credentials, queries and garbage", () => {
    assert.equal(normalizeRelayUrl("https://user:pass@relay.example.com"), null);
    assert.equal(normalizeRelayUrl("https://relay.example.com/?a=1"), null);
    assert.equal(normalizeRelayUrl("not a url"), null);
  });
});

describe("hook id", () => {
  test("matches the relay's test vector", () => {
    // Same vector is asserted in relay/test/relay.test.ts.
    assert.equal(deriveHookId("test-secret-0123456789abcdefghijklmnop"), "U7KxR6SHd6k3MJWFJ3W1CgfOxw8wv-AxIV_RPcUA2qU");
  });
  test("secrets are 43 url-safe characters and unique", () => {
    const a = newSecret();
    assert.match(a, /^[A-Za-z0-9_-]{43}$/);
    assert.notEqual(a, newSecret());
  });
  test("builds the webhook URL", () => {
    assert.equal(webhookUrl("https://r.example.com", "abc"), "https://r.example.com/v1/hooks/abc");
  });
});
