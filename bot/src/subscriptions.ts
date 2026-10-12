import { rootServer } from "@rootsdk/server-bot";
import type { Lang } from "./i18n";

/** One Coolify webhook delivered to one Root channel. */
export interface Subscription {
  channelId: string;
  relayUrl: string;
  /** Bearer secret; the webhook URL only contains its hash. */
  secret: string;
  relayKey?: string;
  lang: Lang;
  /** ID of the last event posted to the channel. */
  cursor: number;
  createdBy: string;
  createdAt: string;
  lastEventAt?: string;
}

const PREFIX = "sub:";
const key = (channelId: string) => `${PREFIX}${channelId}`;

export async function listSubscriptions(): Promise<Subscription[]> {
  const rows = await rootServer.dataStore.appData.select<Subscription>(`${PREFIX}%`);
  return rows.map((row) => row.value);
}

export function getSubscription(channelId: string): Promise<Subscription | undefined> {
  return rootServer.dataStore.appData.get<Subscription>(key(channelId));
}

export async function saveSubscription(sub: Subscription): Promise<void> {
  await rootServer.dataStore.appData.set<Subscription>({ key: key(sub.channelId), value: sub });
}

/** Partial update that never resurrects a deleted subscription. */
export async function patchSubscription(channelId: string, patch: Partial<Subscription>): Promise<void> {
  const current = await getSubscription(channelId);
  if (!current) return;
  await saveSubscription({ ...current, ...patch, channelId });
}

export async function deleteSubscription(channelId: string): Promise<void> {
  await rootServer.dataStore.appData.delete(key(channelId));
}
