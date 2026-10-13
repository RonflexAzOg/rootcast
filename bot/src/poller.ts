import { formatEvent } from "./format";
import { t } from "./i18n";
import { postMessage } from "./messenger";
import { poll, RelayAuthError, type RelayEvent } from "./relay-client";
import { deleteSubscription, getSubscription, patchSubscription, type Subscription } from "./subscriptions";

const WAIT_SECONDS = 25;
const MIN_BACKOFF_MS = 2_000;
const MAX_BACKOFF_MS = 5 * 60_000;
/** Consecutive failures before the channel is told the relay is down. */
const ANNOUNCE_AFTER_FAILURES = 3;
/** A notification that can't be posted after this many tries is skipped. */
const MAX_POST_ATTEMPTS = 5;

export interface Health {
  ok: boolean;
  since: Date;
  reason?: string;
}

const sleep = (ms: number, signal: AbortSignal) =>
  new Promise<void>((resolve) => {
    const timer = setTimeout(resolve, ms);
    signal.addEventListener("abort", () => {
      clearTimeout(timer);
      resolve();
    }, { once: true });
  });

/** Long-polls the relay for one channel and posts what arrives. */
export class ChannelPoller {
  readonly channelId: string;
  health: Health = { ok: true, since: new Date() };
  private readonly controller = new AbortController();
  private failures = 0;
  private announcedDown = false;
  private attempts = new Map<number, number>();

  constructor(channelId: string) {
    this.channelId = channelId;
  }

  start(): void {
    void this.loop().catch((error) => {
      console.error(`[poller ${this.channelId}] stopped unexpectedly:`, error);
    });
  }

  stop(): void {
    this.controller.abort();
  }

  private async loop(): Promise<void> {
    const signal = this.controller.signal;
    while (!signal.aborted) {
      // Re-read every round: lang, cursor or credentials may have changed.
      const sub = await getSubscription(this.channelId);
      if (!sub) return;
      try {
        const result = await poll(sub, sub.cursor, WAIT_SECONDS, signal);
        await this.markHealthy(sub);
        for (const event of result.events) {
          if (signal.aborted) return;
          const delivered = await this.deliver(sub, event);
          if (delivered === "gone") {
            console.log(`[poller ${this.channelId}] channel deleted, removing subscription`);
            await deleteSubscription(this.channelId);
            return;
          }
          if (delivered === "retry") break;
          sub.cursor = event.id;
          // Saved after each message: a restart never re-posts what was already delivered.
          await patchSubscription(this.channelId, { cursor: event.id, lastEventAt: new Date().toISOString() });
        }
      } catch (error) {
        if (signal.aborted) return;
        await this.markFailing(sub, error);
        const backoff = Math.min(MAX_BACKOFF_MS, MIN_BACKOFF_MS * 2 ** Math.min(this.failures - 1, 10));
        await sleep(backoff + Math.random() * 1000, signal);
      }
    }
  }

  private async deliver(sub: Subscription, event: RelayEvent): Promise<"sent" | "retry" | "gone" | "skipped"> {
    const tries = (this.attempts.get(event.id) ?? 0) + 1;
    if (tries > MAX_POST_ATTEMPTS) {
      console.error(`[poller ${this.channelId}] skipping event ${event.id} after ${MAX_POST_ATTEMPTS} attempts`);
      this.attempts.delete(event.id);
      return "skipped";
    }
    this.attempts.set(event.id, tries);
    // From the 3rd attempt, fall back to a link-free message in case a URL is what Root rejects.
    const content = formatEvent(event.payload, sub.lang, { links: tries < 3 });
    const outcome = await postMessage(this.channelId, content);
    if (outcome !== "retry") this.attempts.delete(event.id);
    if (outcome === "retry") {
      // Let the next round retry this event after a short pause.
      await sleep(MIN_BACKOFF_MS * tries, this.controller.signal);
    }
    return outcome;
  }

  private async markHealthy(sub: Subscription): Promise<void> {
    if (!this.health.ok) {
      this.health = { ok: true, since: new Date() };
      if (this.announcedDown) await postMessage(this.channelId, t(sub.lang).relayBack);
    }
    this.failures = 0;
    this.announcedDown = false;
  }

  private async markFailing(sub: Subscription, error: unknown): Promise<void> {
    this.failures += 1;
    const reason = error instanceof Error ? error.message : String(error);
    if (this.health.ok) this.health = { ok: false, since: new Date(), reason };
    else this.health.reason = reason;
    console.error(`[poller ${this.channelId}] relay error (${this.failures}): ${reason}`);

    const isAuth = error instanceof RelayAuthError;
    if (!this.announcedDown && (isAuth || this.failures >= ANNOUNCE_AFTER_FAILURES)) {
      this.announcedDown = true;
      await postMessage(this.channelId, isAuth ? t(sub.lang).relayAuthFailed : t(sub.lang).relayDown(reason));
    }
  }
}

/** All running pollers, one per connected channel. */
export class PollerRegistry {
  private readonly pollers = new Map<string, ChannelPoller>();

  start(channelId: string): void {
    this.stop(channelId);
    const poller = new ChannelPoller(channelId);
    this.pollers.set(channelId, poller);
    poller.start();
  }

  stop(channelId: string): void {
    this.pollers.get(channelId)?.stop();
    this.pollers.delete(channelId);
  }

  stopAll(): void {
    for (const poller of this.pollers.values()) poller.stop();
    this.pollers.clear();
  }

  health(channelId: string): Health | undefined {
    return this.pollers.get(channelId)?.health;
  }
}
