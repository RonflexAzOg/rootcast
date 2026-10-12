# Contributing

Thanks for helping! Issues and pull requests are welcome, in English or French.

## Good first contributions

- A new language for notifications (see [docs/architecture.md](docs/architecture.md#adding-a-language))
- Better layouts for a Coolify event, or support for a new one
- Documentation, screenshots, deployment guides for other hosts

## Workflow

1. Open an issue first for anything bigger than a small fix, so we can agree on the approach.
2. Fork, create a branch, make your change with tests.
3. Make sure everything passes:

   ```bash
   cd relay && npm ci && npm run typecheck && npm test
   cd ../bot && npm ci && npm test
   ```

4. Open a pull request describing what changed and how you tested it.

## Guidelines

- **The relay stays dependency-free** (Node built-ins only). It is meant to be audited in a few minutes.
- Keep the relay API backward compatible; if it must change, version it (`/v2/...`).
- Never log secrets, hook IDs in full, or webhook payloads.
- Keep `relay/src/hook-id.ts` and `bot/src/hook-id.ts` in sync; both test suites check the same vector.
- User-facing text goes through `bot/src/i18n.ts`, in every supported language.

## Code of conduct

This project follows the [Contributor Covenant](CODE_OF_CONDUCT.md). Be kind.
