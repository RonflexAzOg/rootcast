# Security policy

## Reporting a vulnerability

Please **do not open a public issue**. Use GitHub's private reporting instead: **Security → Report a vulnerability** on this repository.

Include what you found, how to reproduce it, and its impact. You'll get an answer within 7 days. Once fixed, you'll be credited in the release notes if you wish.

## Scope

- The relay (`relay/`): authentication, isolation between hooks, resource exhaustion, data retention.
- The bot (`bot/`): permission checks on `/coolify` commands, handling of untrusted webhook content.

## Supported versions

Only the latest release of the relay and of the bot receive security fixes. Self-hosters should update their relay when a release mentions a security fix.

## Hardening tips for relay operators

- Always serve the relay over HTTPS (Coolify does it for you).
- Set `TRUST_PROXY=true` only behind a proxy you control.
- Use `RELAY_ACCESS_KEY` if the relay is only for your own communities.
- Mount `/data` on a persistent volume and keep the host updated.
