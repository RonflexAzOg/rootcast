import { createHash } from "node:crypto";

/**
 * A hook ID is derived from the secret the bot generates.
 *
 *   hookId = base64url(sha256("rootcast:hook:v1:" + secret))
 *
 * Coolify posts to /v1/hooks/<hookId>; the bot polls with the secret.
 * Knowing the webhook URL lets you *send* events, never *read* them.
 *
 * Keep in sync with bot/src/hook-id.ts (both test suites check the same vector).
 */
export const HOOK_ID_PATTERN = /^[A-Za-z0-9_-]{43}$/;
export const SECRET_PATTERN = /^[A-Za-z0-9_-]{32,128}$/;

export function deriveHookId(secret: string): string {
  return createHash("sha256").update(`rootcast:hook:v1:${secret}`).digest("base64url");
}
