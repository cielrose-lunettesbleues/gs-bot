# GS Bot

Scalable Twitch-to-OBS automation bot.

## Quick Start

1. Copy `.env.example` to `.env` and fill values.
2. Install dependencies:

```bash
npm install
```

3. Start in development:

```bash
npm run dev
```

## Commands

- `!gs <url>`: validates and displays configured OBS source temporarily.
- `!gstop`: hides source immediately.

## Local Control API (Stream Deck plugin)

- Endpoint: `POST /actions/emergency-stop`
- Host binding: `127.0.0.1` only
- Auth: `Authorization: Bearer <CONTROL_HTTP_TOKEN>`

Example request:

```bash
curl -X POST "http://127.0.0.1:4317/actions/emergency-stop" -H "Authorization: Bearer change_me_local_secret"
```

Control API environment variables:

- `CONTROL_HTTP_ENABLED`
- `CONTROL_HTTP_HOST`
- `CONTROL_HTTP_PORT`
- `CONTROL_HTTP_TOKEN`

## Stream Deck Private Plugin (Windows)

- Plugin source is in `streamdeck-plugin`.
- It provides one key action: **Emergency Stop**.
- Build and package instructions: `streamdeck-plugin/README.md`.

## Architecture

- `src/twitch`: Twitch connection and message normalization.
- `src/commands`: command routing and command handlers.
- `src/permissions`: access control logic.
- `src/cooldown`: cooldown logic.
- `src/validation`: URL/domain validation.
- `src/obs`: OBS client and source controller.
- `src/config`: centralized validated configuration.

## Tests

```bash
npm test
```
