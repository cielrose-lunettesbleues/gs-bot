# GS Stream Deck Plugin (Private)

Windows-only private Stream Deck plugin with one action: **Emergency Stop**.

## What it does

- Adds a key action that sends `POST /actions/emergency-stop` to your local GS bot control API.
- Requires bearer token authentication.

## Prerequisites

- GS bot running with control API enabled.
- Stream Deck software installed.
- Node.js 18+ on build machine.

## Build plugin

```bash
npm install
npm run package:win
```

This creates `com.gsbot.emergencystop.sdPlugin/gs-stop-plugin.exe`.

## Create install package

```bash
npm run zip
```

This creates `dist/com.gsbot.emergencystop.streamDeckPlugin`.

## Install privately on Windows

1. Double-click `dist/com.gsbot.emergencystop.streamDeckPlugin`.
2. In Stream Deck, drag **GS Emergency Stop** action onto a key.
3. Open action settings and set:
   - Host: `127.0.0.1`
   - Port: `4317`
   - Token: your `CONTROL_HTTP_TOKEN`

## Bot config needed

```env
CONTROL_HTTP_ENABLED=true
CONTROL_HTTP_HOST=127.0.0.1
CONTROL_HTTP_PORT=4317
CONTROL_HTTP_TOKEN=replace_with_secret
```
