# Changelog

All notable changes are documented here. Versions follow [Semantic Versioning](https://semver.org/).

## [1.0.0] - 2026-10-13

### Added

- Relay: webhook ingestion, per-hook SQLite queue, long-polling, acknowledgements, rate limits, TTLs, optional access key, Docker image and Coolify compose file.
- Bot: `/coolify setup | status | test | lang | rotate | remove | help`, admin role setting, English and French, layouts for every Coolify webhook event, health announcements when the relay is unreachable.

### Notes

- Configuration is open to the community owner and members with Manage Apps; the Bot admins setting is optional.
- The relay listens on port 8787 outside Docker (the Root devhost uses 8080).
- Notifications only link to HTTPS URLs on a domain name: Root cannot post messages containing `http://` URLs on a bare IP and port.
- `npm overrides` patch vulnerable transitive dependencies of `@rootsdk/server-bot` 0.21.3 (`tar`, `@tootallnate/once`, `uuid`).
