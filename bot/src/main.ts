import { rootServer, ChannelMessageEvent, type RootBotStartState } from "@rootsdk/server-bot";
import { createMessageHandler } from "./handlers";
import { PollerRegistry } from "./poller";
import { listSubscriptions } from "./subscriptions";

const pollers = new PollerRegistry();

async function onStarting(_state: RootBotStartState): Promise<void> {
  rootServer.community.channelMessages.on(ChannelMessageEvent.ChannelMessageCreated, createMessageHandler(pollers));

  const subscriptions = await listSubscriptions();
  for (const sub of subscriptions) pollers.start(sub.channelId);
  console.log(`[bot] started, ${subscriptions.length} connected channel(s)`);
}

async function onStopping(): Promise<void> {
  pollers.stopAll();
  console.log("[bot] stopping");
}

(async () => {
  await rootServer.lifecycle.start(onStarting, onStopping);
})();
