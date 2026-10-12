import { loadConfig } from "./config.ts";
import { createRelay, log } from "./server.ts";
import { VERSION } from "./version.ts";

const config = loadConfig();
const relay = createRelay(config);
const port = await relay.listen();

log("info", "relay started", {
  version: VERSION,
  port,
  open: config.accessKey === "",
  trustProxy: config.trustProxy,
});

let stopping = false;
async function shutdown(signal: string): Promise<void> {
  if (stopping) return;
  stopping = true;
  log("info", "shutting down", { signal });
  const force = setTimeout(() => process.exit(1), 10_000);
  force.unref();
  await relay.close();
  process.exit(0);
}

process.on("SIGTERM", () => void shutdown("SIGTERM"));
process.on("SIGINT", () => void shutdown("SIGINT"));
