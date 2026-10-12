# Changelog

All notable changes are documented here. Versions follow [Semantic Versioning](https://semver.org/).

## [1.0.0] - 2026-10-12

### Added

- Relay: webhook ingestion, per-hook SQLite queue, long-polling, acknowledgements, rate limits, TTLs, optional access key, Docker image and Coolify compose file.
- Bot: `/coolify setup | status | test | lang | rotate | remove | help`, admin role setting, English and French, layouts for every Coolify webhook event, health announcements when the relay is unreachable.
