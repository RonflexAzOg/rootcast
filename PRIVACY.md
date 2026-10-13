# Privacy policy

_Last updated: October 13, 2026_

Rootcast is an open-source bot that posts [Coolify](https://coolify.io) notifications to [Root](https://rootapp.com) channels. This policy explains what data it handles. The source code is public at <https://github.com/RonflexAzOg/rootcast>, so every statement below can be verified.

## Who is responsible

- **The Rootcast bot** is published on the Root store by Lucas Barray ("we"). It runs on Root's infrastructure.
- **The relay** (the server that receives Coolify webhooks) is deployed by each community on its own infrastructure. Whoever operates a relay is responsible for the data it holds. We do not operate a relay for other communities, and we do not receive data from relays operated by others.

## What the bot stores

For each Root channel connected with `/coolify setup`, the bot stores in Root's built-in storage for your community:

| Data | Why |
|---|---|
| Channel ID | Where to post notifications |
| Relay URL, and the relay access key if you provided one | Where to fetch notifications |
| A random secret | To authenticate with the relay |
| Language, last delivered event number, date of the last notification | To post in the right language, without duplicates, and show `/coolify status` |
| ID of the member who ran `/coolify setup`, and the date | Audit of who connected the channel |

The bot also reads, without storing them: the content of messages starting with `/coolify` (to run commands), and the roles and permissions of the member running a command (to check they are allowed to).

The bot does not read or store any other message, and does not collect personal data for analytics, advertising, or any other purpose.

## What the relay stores

A relay stores:

- a **hash** of each connected channel's secret, with the dates it was registered and last used;
- the **Coolify notifications** it receives (for example application, project, server or database names, and error output from failed deployments or backups), until the bot has posted them, for at most 72 hours by default.

Client IP addresses are kept in memory for a minute for rate limiting, and are not written to disk or logs. The relay logs only technical events (start, a shortened hook identifier, event type), never notification content or secrets.

## Sharing

We do not sell or share data. Notifications are posted to the Root channel you chose, where they are visible to members who can read that channel, and are then subject to [Root's privacy policy](https://rootapp.com).

## Retention and deletion

- `/coolify remove` deletes the channel's configuration from Root's storage and asks the relay to delete the channel's hook and any pending notifications.
- Uninstalling the bot deletes the data Root holds for it in your community, according to Root's policies.
- On the relay, delivered notifications are deleted immediately, undelivered ones after 72 hours, and hooks unused for 30 days are deleted with their data (default settings).

## Contact

Questions or requests: open an issue at <https://github.com/RonflexAzOg/rootcast/issues>. For security issues, see [SECURITY.md](SECURITY.md).

## Changes

Changes to this policy are published in this file; its history is available on GitHub.
