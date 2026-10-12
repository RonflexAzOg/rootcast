import {
  rootServer,
  MessageType,
  RootGuidType,
  RootGuidUtils,
  type ChannelMessageCreatedEvent,
  type ReadOnlyMemberGroup,
  type UserGuid,
} from "@rootsdk/server-bot";
import { COMMAND_PREFIX, normalizeRelayUrl, parseCommand, webhookUrl, type ParsedCommand } from "./commands";
import { DEFAULT_RELAY_URL } from "./config";
import { formatEvent, SAMPLE_EVENT } from "./format";
import { deriveHookId, newSecret } from "./hook-id";
import { isLang, t, type Lang } from "./i18n";
import { postMessage } from "./messenger";
import type { PollerRegistry } from "./poller";
import { deleteHook, poll } from "./relay-client";
import { deleteSubscription, getSubscription, patchSubscription, saveSubscription, type Subscription } from "./subscriptions";

const DEFAULT_LANG: Lang = "en";

type AdminCheck = "yes" | "no" | "unconfigured";

async function checkAdmin(userId: UserGuid): Promise<AdminCheck> {
  const group = rootServer.globalSettings?.["general"]?.["admins"] as ReadOnlyMemberGroup | undefined;
  if (!group || typeof group.isMember !== "function") return "unconfigured";
  if (group.userIds.length === 0 && group.communityRoleIds.length === 0) return "unconfigured";
  return (await group.isMember({ userId })) ? "yes" : "no";
}

function formatDate(iso: string | undefined | Date, lang: Lang): string {
  if (!iso) return t(lang).never;
  const date = iso instanceof Date ? iso : new Date(iso);
  return `${date.toISOString().replace("T", " ").slice(0, 16)} UTC`;
}

export function createMessageHandler(pollers: PollerRegistry) {
  return async function onMessage(evt: ChannelMessageCreatedEvent): Promise<void> {
    try {
      if (evt.messageType === MessageType.System) return;
      // Only humans can run commands (ignores this bot and other bots/apps).
      if (RootGuidUtils.toRootGuidType(evt.userId) !== RootGuidType.Person) return;
      const command = parseCommand(evt.messageContent);
      if (!command) return;
      await handle(command, evt, pollers);
    } catch (error) {
      // Never let an exception escape: Root restarts the bot on unhandled errors.
      console.error("[commands] failed:", error instanceof Error ? error.message : error);
    }
  };
}

async function handle(command: ParsedCommand, evt: ChannelMessageCreatedEvent, pollers: PollerRegistry): Promise<void> {
  const channelId = evt.channelId as string;
  const existing = await getSubscription(channelId);
  const lang: Lang = existing?.lang ?? DEFAULT_LANG;
  const reply = (text: string) => postMessage(channelId, text, evt.id);
  const r = t(lang);

  if (command.name === "help") {
    await reply(r.help(COMMAND_PREFIX));
    return;
  }
  if (command.name === "unknown") {
    await reply(r.unknownCommand(COMMAND_PREFIX));
    return;
  }

  // Every other command changes or reveals configuration: admins only.
  const admin = await checkAdmin(evt.userId);
  if (admin !== "yes") {
    await reply(admin === "unconfigured" ? r.noAdminsConfigured : r.notAdmin);
    return;
  }

  switch (command.name) {
    case "setup":
      return setup(command, evt, existing, lang, reply, pollers);
    case "status": {
      if (!existing) return void (await reply(r.notConfigured(COMMAND_PREFIX)));
      const health = pollers.health(channelId);
      await reply(
        r.status({
          relay: existing.relayUrl,
          webhookUrl: webhookUrl(existing.relayUrl, deriveHookId(existing.secret)),
          state: !health || health.ok ? r.stateOk : r.stateFailing(formatDate(health.since, lang), health.reason ?? "?"),
          lastEvent: formatDate(existing.lastEventAt, lang),
          lang: existing.lang,
        }),
      );
      return;
    }
    case "test":
      await postMessage(channelId, formatEvent(SAMPLE_EVENT, lang));
      return;
    case "lang": {
      const value = command.args[0]?.toLowerCase() ?? "";
      if (!isLang(value)) return void (await reply(r.langUsage(COMMAND_PREFIX)));
      if (!existing) return void (await reply(t(value).notConfigured(COMMAND_PREFIX)));
      await patchSubscription(channelId, { lang: value });
      await reply(t(value).langSet);
      return;
    }
    case "rotate": {
      if (!existing) return void (await reply(r.notConfigured(COMMAND_PREFIX)));
      const secret = newSecret();
      const next: Subscription = { ...existing, secret, cursor: 0 };
      try {
        await poll(next, 0, 0); // registers the new hook on the relay
      } catch (error) {
        return void (await reply(r.relayError(error instanceof Error ? error.message : String(error))));
      }
      await saveSubscription(next);
      await deleteHook(existing);
      pollers.start(channelId);
      await reply(r.rotated(webhookUrl(existing.relayUrl, deriveHookId(secret))));
      return;
    }
    case "remove": {
      if (!existing) return void (await reply(r.notConfigured(COMMAND_PREFIX)));
      pollers.stop(channelId);
      await deleteSubscription(channelId);
      await deleteHook(existing);
      await reply(r.removed);
      return;
    }
  }
}

async function setup(
  command: ParsedCommand,
  evt: ChannelMessageCreatedEvent,
  existing: Subscription | undefined,
  lang: Lang,
  reply: (text: string) => Promise<unknown>,
  pollers: PollerRegistry,
): Promise<void> {
  const r = t(lang);
  if (existing) return void (await reply(r.alreadyConfigured(COMMAND_PREFIX)));

  const rawUrl = command.urls[0] ?? DEFAULT_RELAY_URL;
  if (!rawUrl) return void (await reply(r.missingUrl(COMMAND_PREFIX)));
  const relayUrl = normalizeRelayUrl(rawUrl);
  if (!relayUrl) return void (await reply(r.invalidUrl));

  // Optional relay key: the first argument that isn't the URL.
  const relayKey = command.args.find((arg) => !/^https?:\/\//i.test(arg) && !arg.startsWith("[")) || undefined;
  const sub: Subscription = {
    channelId: evt.channelId as string,
    relayUrl,
    secret: newSecret(),
    ...(relayKey ? { relayKey } : {}),
    lang,
    cursor: 0,
    createdBy: evt.userId as string,
    createdAt: new Date().toISOString(),
  };

  try {
    // First poll registers the hook, so the URL works as soon as it's pasted in Coolify.
    await poll(sub, 0, 0);
  } catch (error) {
    return void (await reply(r.relayError(error instanceof Error ? error.message : String(error))));
  }
  await saveSubscription(sub);
  pollers.start(sub.channelId);
  await reply(r.setupDone(webhookUrl(relayUrl, deriveHookId(sub.secret))));
}
