# Publishing the bot on Root

For maintainers, or anyone publishing a fork under their own name. Users of the published bot don't need any of this.

## Once

1. Install the Root desktop client and create an account.
2. Open the [Root Developer Portal](https://dev.rootapp.com), select **New bot**, name it *Rootcast*.
3. Copy the bot ID into `bot/root-manifest.json` (`"id"`).

## Test locally

1. In the Developer Portal, generate a `DEV_TOKEN`. Root creates a test community for it.
2. `cp bot/.env.example bot/.env` and paste the token.
3. Run a relay: `cd relay && npm run dev` (listens on `http://127.0.0.1:8787`; port 8080 is taken by the Root devhost).
4. `cd bot && npm install && npm run build && npm run bot`.
5. In the test community, type `/coolify setup http://127.0.0.1:8787` and post an event:

   ```bash
   curl -X POST "<webhook URL from the bot>" \
     -H 'content-type: application/json' \
     -d '{"success":true,"event":"test","message":"Hello from curl"}'
   ```

   On Windows (PowerShell):

   ```powershell
   Invoke-RestMethod -Method Post -Uri "<webhook URL from the bot>" -ContentType "application/json" -Body '{"success":true,"event":"test","message":"Hello from PowerShell"}'
   ```

   You own the test community, so you are a bot admin there.

## Release

1. Bump `version` in `bot/root-manifest.json` and `bot/package.json`, update `CHANGELOG.md`.
2. `cd bot && npm run package`. This builds and packages with production dependencies only (Root rejects packages over 100 MiB). Output: `bot/rootcast.pkg`.
3. Upload: `npx rootsdk upload package -f rootcast.pkg -a <token from the Developer Portal>`.
4. Publish the new version to the Root store from the Developer Portal.
5. Tag the repository `bot-vX.Y.Z`.

Relay images are published to GHCR automatically when a `relay-vX.Y.Z` tag is pushed (see `.github/workflows/release-relay.yml`).

## Running a public relay (optional)

To let people use the bot without hosting anything, run a relay on a public domain and set `DEFAULT_RELAY_URL` in `bot/src/config.ts`: `/coolify setup` then works without arguments. Keep the default limits, monitor disk usage, and say clearly in the README who operates it.
