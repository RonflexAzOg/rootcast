import {
  rootServer,
  RootApiException,
  ErrorCodeType,
  type ChannelGuid,
  type MessageGuid,
} from "@rootsdk/server-bot";

/** Root allows ~5 commands/s per bot; 250 ms between messages keeps us at 4/s. */
const GAP_MS = 250;

export type SendOutcome = "sent" | "retry" | "gone";

let queue: Promise<unknown> = Promise.resolve();
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function createOnce(channelId: string, content: string, replyTo?: string): Promise<SendOutcome> {
  try {
    await rootServer.community.channelMessages.create({
      channelId: channelId as ChannelGuid,
      content,
      ...(replyTo ? { parentMessageIds: [replyTo as MessageGuid] } : {}),
    });
    return "sent";
  } catch (error) {
    if (error instanceof RootApiException) {
      switch (error.errorCode) {
        case ErrorCodeType.NotFound:
          // The channel was deleted.
          return "gone";
        case ErrorCodeType.NoPermissionToCreate:
          console.error(`[messenger] no permission to post in channel ${channelId}`);
          return "retry";
        case ErrorCodeType.TooManyRequests:
          await sleep(2000);
          return "retry";
        default:
          console.error(`[messenger] RootApiException ${ErrorCodeType[error.errorCode] ?? error.errorCode}`);
          return "retry";
      }
    }
    console.error("[messenger] unexpected error:", error instanceof Error ? error.message : error);
    return "retry";
  }
}

/** Posts a message through a single paced queue shared by every channel. */
export function postMessage(channelId: string, content: string, replyTo?: string): Promise<SendOutcome> {
  const run = queue.then(async () => {
    const outcome = await createOnce(channelId, content, replyTo);
    await sleep(GAP_MS);
    return outcome;
  });
  queue = run.catch(() => undefined);
  return run;
}
