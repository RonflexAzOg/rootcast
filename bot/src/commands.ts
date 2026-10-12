export const COMMAND_PREFIX = "/coolify";

export type CommandName = "help" | "setup" | "status" | "test" | "lang" | "rotate" | "remove";

export interface ParsedCommand {
  name: CommandName | "unknown";
  args: string[];
  /** URLs found in the message (Root may turn typed URLs into Markdown links). */
  urls: string[];
}

const COMMANDS: readonly CommandName[] = ["help", "setup", "status", "test", "lang", "rotate", "remove"];
const ALIASES: Record<string, CommandName> = { aide: "help", config: "setup", etat: "status", état: "status", langue: "lang", delete: "remove", stop: "remove" };

/** Returns null when the message isn't addressed to the bot. */
export function parseCommand(content: string | undefined): ParsedCommand | null {
  if (!content) return null;
  const text = content.trim();
  if (text !== COMMAND_PREFIX && !text.toLowerCase().startsWith(`${COMMAND_PREFIX} `)) return null;

  const urls = [...text.matchAll(/https?:\/\/[^\s<>()\[\]`"']+/gi)].map((m) => m[0].replace(/[.,;:!?]+$/, ""));
  // Remove Markdown link syntax so "[url](url)" counts as one argument.
  const flat = text.replace(/\[([^\]]*)\]\(([^)]*)\)/g, "$2");
  const [, rawName = "help", ...args] = flat.split(/\s+/);
  const lowered = rawName.toLowerCase();
  const name = (COMMANDS as readonly string[]).includes(lowered) ? (lowered as CommandName) : ALIASES[lowered] ?? "unknown";
  return { name, args, urls };
}

/** Normalizes and validates a relay base URL. Returns null if invalid. */
export function normalizeRelayUrl(raw: string | undefined): string | null {
  if (!raw) return null;
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return null;
  }
  const local = ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
  if (url.protocol !== "https:" && !(url.protocol === "http:" && local)) return null;
  if (url.username || url.password || url.search || url.hash) return null;
  return `${url.origin}${url.pathname.replace(/\/+$/, "")}`;
}

export function webhookUrl(relayUrl: string, hookId: string): string {
  return `${relayUrl}/v1/hooks/${hookId}`;
}
