# Architecture and relay protocol

## Components

| Component | Runs on | Role |
|---|---|---|
| `relay/` | Your server (Docker, ideally on Coolify itself) | Receives Coolify webhooks, queues them per hook, serves them to the bot |
| `bot/` | Root cloud | Long-polls the relay, formats events, posts them in channels, handles `/coolify` commands |

Root bots can make outbound HTTP requests but have no public endpoint, hence the relay. Coolify only supports outbound webhooks, hence the queue.

## Identifiers

For each connected channel the bot generates a **secret**: 32 random bytes, base64url encoded (43 chars).

```
hookId = base64url( sha256( "rootcast:hook:v1:" + secret ) )      // 43 chars
webhook URL = <relay>/v1/hooks/<hookId>
```

- Coolify only knows the webhook URL: it can post events, not read them.
- The bot authenticates polls with the secret; the relay derives the hook ID from it, so the relay never stores secrets.
- Test vector: secret `test-secret-0123456789abcdefghijklmnop` → hookId `rHrtq5PJEe3lzSwjRVxyxwV-_FLVz3fxvITJLqU42xs`.

## HTTP API

All responses are JSON. Errors look like `{"error": "code", "message": "…"}`.

### `POST /v1/hooks/{hookId}` (called by Coolify)

Body: the Coolify webhook payload, a JSON object with at least a string `event`.

| Status | Meaning |
|---|---|
| `202` | Queued. Body: `{"ok": true, "id": 42}` |
| `400` | Not a JSON object, or no `event` field |
| `404` | Unknown hook: no bot registered it, or it was removed/rotated |
| `413` | Body larger than `MAX_BODY_BYTES` |
| `429` | Rate limited; Coolify retries automatically |

No authentication: possession of the URL is the credential.

### `GET /v1/events?after={cursor}&wait={seconds}` (called by the bot)

Headers: `Authorization: Bearer <secret>`, plus `X-Relay-Key: <key>` when the relay sets `RELAY_ACCESS_KEY`.

- **Registers** the hook on first call and refreshes its last-seen date (hooks not polled for `HOOK_TTL_DAYS` are deleted).
- **Acknowledges**: every event with `id <= after` is deleted.
- Returns up to 50 events with `id > after`. If there are none and `wait > 0`, holds the request until an event arrives or `wait` seconds pass (max `MAX_WAIT_SECONDS`).

```json
{
  "events": [
    { "id": 43, "receivedAt": "2026-10-12T21:14:41.337Z", "payload": { "event": "deployment_failed", "success": false, "…": "…" } }
  ],
  "cursor": 43
}
```

| Status | Meaning |
|---|---|
| `200` | See above |
| `401` | Missing/malformed secret, or wrong access key |
| `429` | Too many polls from this IP, or more than 5 concurrent long-polls for the hook |
| `503` | Relay reached `MAX_HOOKS` |

### `DELETE /v1/hook` (called by the bot)

Same headers as polling. Deletes the hook and its queued events; the webhook URL then answers `404`.

### `GET /healthz`

`{"status": "ok", "version": "1.0.0"}`, for Docker/Coolify health checks.

## Delivery guarantees

At-least-once. The bot saves its cursor in Root's key-value store after each posted message and acknowledges on the next poll. If the bot restarts between posting and saving, one notification can be posted twice. If the relay is down, Coolify retries (5 attempts, 10 s backoff). Undelivered events expire after `EVENT_TTL_HOURS`.

## Bot internals

| File | Role |
|---|---|
| `main.ts` | Lifecycle: subscribe to messages, start one poller per stored subscription |
| `handlers.ts` | `/coolify` commands and admin check (owner, Manage Apps roles, `general.admins` setting) |
| `poller.ts` | Per-channel long-poll loop, exponential backoff, health announcements |
| `relay-client.ts` | HTTP client with timeouts and typed errors |
| `messenger.ts` | Single paced queue for posting (Root allows ~5 commands/s) |
| `format.ts`, `i18n.ts` | Event layouts and translations |
| `subscriptions.ts` | Storage in `rootServer.dataStore.appData` under `sub:<channelId>` |

Configuration happens through chat commands because, as of SDK 0.21, Root clients only render the role/member picker among Global Settings types.

## Adding a language

1. Add the code to `LANGS` in `bot/src/i18n.ts`.
2. Add it to every entry of `EVENT_TITLES`, `STRINGS` and `REPLIES` (TypeScript will flag what's missing).
3. Add a test in `bot/test/format.test.mjs`.

## Supporting a new Coolify event

Add its title in `EVENT_TITLES` and icon in `ICONS`. If it carries new fields, render them in `formatEvent`. The payloads are defined in Coolify's `app/Notifications/**` (`toWebhook()` methods).
