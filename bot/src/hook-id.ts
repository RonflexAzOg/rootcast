import { createHash, randomBytes } from "node:crypto";

/**
 * hookId = base64url(sha256("rootcast:hook:v1:" + secret))
 * Keep in sync with relay/src/hook-id.ts (both test suites check the same vector).
 */
export function deriveHookId(secret: string): string {
  return createHash("sha256").update(`rootcast:hook:v1:${secret}`).digest("base64url");
}

/** 256-bit random secret, base64url encoded (43 chars). */
export function newSecret(): string {
  return randomBytes(32).toString("base64url");
}
