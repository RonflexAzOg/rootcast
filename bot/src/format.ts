import { EVENT_TITLES, label, type Lang } from "./i18n";

/** Root messages are kept well below any platform limit. */
export const MAX_MESSAGE_LENGTH = 1900;
const MAX_INLINE = 200;
const MAX_BLOCK = 700;

const ICONS: Record<string, string> = {
  deployment_success: "✅",
  deployment_failed: "❌",
  status_changed: "⚠️",
  restart_limit_reached: "🔁",
  container_stopped: "⛔",
  container_restarted: "🔄",
  backup_success: "💾",
  backup_success_with_s3_warning: "⚠️",
  backup_failed: "❌",
  backup_missing: "⏰",
  volume_backup_success: "💾",
  volume_backup_failed: "❌",
  volume_backup_missing: "⏰",
  volume_backup_recovery_failed: "❌",
  task_success: "✅",
  task_failed: "❌",
  docker_cleanup_success: "🧹",
  docker_cleanup_failed: "❌",
  server_reachable: "🟢",
  server_unreachable: "🔴",
  high_disk_usage: "💽",
  server_patch_check: "📦",
  server_patch_check_error: "❌",
  traefik_version_outdated: "🧭",
  ssl_certificate_renewal: "🔐",
  api_token_expiring: "🔑",
  server_force_enabled: "🟢",
  server_force_disabled: "🔴",
  hetzner_deletion_failed: "❌",
  test: "🧪",
  general: "ℹ️",
};

/** Events whose Coolify `message` carries information the fields don't. */
const SHOW_MESSAGE = new Set(["ssl_certificate_renewal", "api_token_expiring", "server_force_disabled", "hetzner_deletion_failed", "general", "test"]);

export type CoolifyPayload = Record<string, unknown> & { event?: unknown; success?: unknown; message?: unknown };

function str(value: unknown): string | undefined {
  if (typeof value === "string") return value.trim() === "" ? undefined : value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  return undefined;
}

/** Single-line value, safe to put inline (no newlines, no markdown breakers, bounded). */
function inline(value: string): string {
  const flat = value.replace(/[\r\n]+/g, " ").replace(/`/g, "'").trim();
  return flat.length > MAX_INLINE ? `${flat.slice(0, MAX_INLINE - 1)}…` : flat;
}

/** Multi-line value rendered as a code block. Keeps the end of logs, where errors usually are. */
function block(value: string): string {
  let text = value.replace(/```/g, "'''").trim();
  if (text.length > MAX_BLOCK) text = `…${text.slice(-(MAX_BLOCK - 1))}`;
  return "```\n" + text + "\n```";
}

function safeUrl(value: unknown): string | undefined {
  const raw = str(value);
  if (!raw) return undefined;
  try {
    const url = new URL(raw.includes("://") ? raw : `https://${raw}`);
    if (url.protocol !== "https:" && url.protocol !== "http:") return undefined;
    return url.toString();
  } catch {
    return undefined;
  }
}

function firstFqdn(value: unknown): string | undefined {
  // Coolify may send several comma-separated domains.
  const raw = str(value);
  return raw ? safeUrl(raw.split(",")[0]!.trim()) : undefined;
}

function subjectOf(p: CoolifyPayload): string | undefined {
  return (
    str(p.application_name) ??
    str(p.resource_name) ??
    str(p.task_name) ??
    str(p.database_name) ??
    str(p.container_name) ??
    str(p.server_name)
  );
}

export function formatEvent(payload: CoolifyPayload, lang: Lang): string {
  const event = str(payload.event) ?? "unknown";
  const success = payload.success === true;
  const icon = ICONS[event] ?? (success ? "✅" : "⚠️");
  const title = EVENT_TITLES[event]?.[lang] ?? `${label(lang, "unknownEvent")} \`${inline(event)}\``;
  const subject = subjectOf(payload);

  // French typography puts a space before the colon.
  const colon = lang === "fr" ? " :" : ":";
  const lines: string[] = [`${icon} **${title}**${subject ? ` · ${inline(subject)}` : ""}`];
  const add = (key: Parameters<typeof label>[1], value: string | undefined) => {
    if (value) lines.push(`${label(lang, key)}${colon} ${inline(value)}`);
  };

  if (SHOW_MESSAGE.has(event) || !EVENT_TITLES[event]) {
    const message = str(payload.message);
    if (message) lines.push(inline(message));
  }

  const project = str(payload.project);
  const environment = str(payload.environment);
  if (project || environment) add("project", [project, environment].filter(Boolean).join(" / "));
  add("pullRequest", str(payload.pull_request_id) ? `#${str(payload.pull_request_id)}` : undefined);

  // Avoid repeating the subject line.
  if (str(payload.server_name) !== subject) add("server", str(payload.server_name));
  if (str(payload.container_name) !== subject) add("container", str(payload.container_name));
  if (str(payload.database_name) && str(payload.database_name) !== subject) add("database", str(payload.database_name));
  if (str(payload.database_type)) add("database", str(payload.database_type));
  add("storage", str(payload.storage));
  add("frequency", str(payload.frequency));

  const disk = str(payload.disk_usage);
  if (disk) {
    const threshold = str(payload.threshold);
    add("disk", `${disk}%${threshold ? ` (${label(lang, "threshold")} ${threshold}%)` : ""}`);
  }
  const restarts = str(payload.restart_count);
  if (restarts) add("restarts", `${restarts}${str(payload.max_restart_count) ? ` / ${str(payload.max_restart_count)}` : ""}`);

  const updates = str(payload.total_updates);
  if (updates) {
    const critical = Number(payload.critical_packages_count ?? 0);
    add("updates", `${updates}${critical > 0 ? ` (${critical} ${label(lang, "critical")})` : ""}`);
  }
  if (Array.isArray(payload.servers)) {
    const names = payload.servers
      .map((s) => (typeof s === "object" && s !== null ? str((s as Record<string, unknown>).name) : undefined))
      .filter(Boolean);
    if (names.length > 0) add("servers", names.join(", "));
  }
  if (Array.isArray(payload.resources)) {
    const names = payload.resources.map(str).filter(Boolean);
    if (names.length > 0) add("resources", names.join(", "));
  }
  add("token", str(payload.token_name));
  add("expires", str(payload.expires_at));

  const errorText = str(payload.error) ?? str(payload.error_output) ?? str(payload.error_message) ?? str(payload.reason);
  if (errorText) lines.push(`${label(lang, "error")}${colon}\n${block(errorText)}`);
  const output = str(payload.output);
  if (output && !success) lines.push(`${label(lang, "output")}${colon}\n${block(output)}`);
  const cleanup = str(payload.cleanup_message);
  if (cleanup) add("details", cleanup);

  const links: string[] = [];
  const appUrl = firstFqdn(payload.preview_fqdn) ?? firstFqdn(payload.fqdn);
  if (appUrl && success) links.push(`[${label(lang, "openApp")}](${appUrl})`);
  const coolifyUrl = safeUrl(payload.deployment_url) ?? safeUrl(payload.url);
  if (coolifyUrl) links.push(`[${label(lang, "openInCoolify")}](${coolifyUrl})`);
  if (links.length > 0) lines.push(`🔗 ${links.join(" · ")}`);

  let text = lines.join("\n");
  if (text.length > MAX_MESSAGE_LENGTH) text = `${text.slice(0, MAX_MESSAGE_LENGTH - 1)}…`;
  return text;
}

/** Sample used by `/coolify test`. */
export const SAMPLE_EVENT: CoolifyPayload = {
  success: true,
  event: "deployment_success",
  message: "New version successfully deployed",
  application_name: "my-app",
  project: "demo",
  environment: "production",
  fqdn: "https://my-app.example.com",
  deployment_url: "https://coolify.example.com/project/demo/deployment/abc123",
};
