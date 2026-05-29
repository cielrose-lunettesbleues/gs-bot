# AGENTS.md

## Project Overview

This project is a scalable Twitch-to-OBS automation tool.

The goal is to let Twitch chat users trigger a live video source inside OBS through a chat command such as `!gs <url>`. The video source should remain hidden by default and only appear temporarily when an authorized command is triggered.

The project must be designed as a clean, extensible, and maintainable application. It should be easy to run locally, easy to configure, and easy to evolve into a more advanced streaming tool later.

Core idea:

```txt
Twitch Chat Command → Bot Validation → OBS WebSocket Action → Source Appears → Timeout → Source Hides
```

---

## Product Goals

The application should:

* Listen to Twitch chat commands.
* Detect a command like `!gs <video_url>`.
* Validate user permissions.
* Validate URL safety.
* Apply optional cooldown logic.
* Send commands to OBS through OBS WebSocket.
* Update a dedicated video/browser source.
* Show the source for a configured duration.
* Hide the source automatically.
* Provide emergency stop commands.
* Be easy to configure without editing core code.

---

## Core Features

### Twitch Command

Default command:

```txt
!gs <url>
```

Example:

```txt
!gs https://example.com/video.mp4
```

The command name must be configurable.

---

### OBS Source Behavior

The OBS source must:

* Be hidden by default.
* Become visible when a valid command is triggered.
* Load or update the provided video URL.
* Stay visible for a configured duration.
* Automatically hide after the duration ends.
* Be hideable instantly with an emergency command.

Default emergency command:

```txt
!gstop
```

---

## Access Control

The bot must support the following configurable access rules:

```json
{
  "subOnly": true,
  "modOnly": false,
  "cooldownEnabled": true,
  "cooldownSeconds": 60
}
```

Rules:

```txt
If modOnly = true, only moderators can use the command.
If subOnly = true, only subscribers can use the command.
If both are false, everyone can use the command.

If cooldownEnabled = true, cooldown rules are applied.
If cooldownEnabled = false, commands can be triggered without cooldown.
```

These options must be easy to disable or enable.

Admin/mod commands should eventually allow live configuration:

```txt
!gs subonly on
!gs subonly off
!gs modonly on
!gs modonly off
!gs cooldown on
!gs cooldown off
!gs cooldown 60
!gstop
```

For the MVP, configuration can be handled through a config file or environment variables.

---

## Scalability Requirements

This project must be built with scalability in mind from the beginning.

Scalability does not only mean handling many users. It also means:

* Clean architecture.
* Clear separation of responsibilities.
* Easy addition of new commands.
* Easy addition of new platforms later.
* Easy replacement of OBS actions.
* Easy testing.
* Easy deployment.
* Minimal coupling between Twitch, OBS, validation, and configuration.

Avoid writing one large bot file that handles everything.

The codebase must be modular.

---

## Recommended Tech Stack

Preferred stack:

```txt
Node.js
TypeScript
tmi.js or Twitch EventSub/IRC client
obs-websocket-js
dotenv
zod
pino or winston
```

TypeScript is preferred for maintainability and long-term scalability.

---

## Suggested Folder Structure

```txt
src/
  app.ts
  config/
    config.ts
    schema.ts
  twitch/
    twitchClient.ts
    twitchMessageHandler.ts
    twitchTypes.ts
  obs/
    obsClient.ts
    obsSourceController.ts
  commands/
    commandRouter.ts
    greenScreenCommand.ts
    emergencyStopCommand.ts
    adminCommands.ts
  permissions/
    permissionService.ts
  cooldown/
    cooldownService.ts
  validation/
    urlValidator.ts
    domainWhitelist.ts
  queue/
    playbackQueue.ts
  state/
    runtimeState.ts
  logger/
    logger.ts
  utils/
    timers.ts
    errors.ts
tests/
  permissions/
  cooldown/
  validation/
  commands/
.env.example
README.md
AGENTS.md
package.json
tsconfig.json
```

---

## Architecture Principles

### 1. Separate Twitch from OBS

Twitch code should never directly manipulate OBS.

Bad:

```txt
Twitch message handler directly calls OBS source update.
```

Good:

```txt
Twitch message handler → command router → command service → OBS controller
```

---

### 2. Commands Should Be Modular

Each command should be its own module.

Example:

```txt
greenScreenCommand.ts
emergencyStopCommand.ts
adminCommands.ts
```

Each command should expose:

```ts
name
aliases
permission requirements
handler function
```

---

### 3. Configuration Should Be Centralized

All configuration must come from a central config system.

Do not hardcode:

* Twitch channel name.
* Bot username.
* OBS WebSocket URL.
* OBS password.
* Source name.
* Scene name.
* Cooldown duration.
* Command name.
* Allowed domains.
* Video duration.

Use:

```txt
.env
config file
validated config schema
```

Use `zod` or a similar schema validator to prevent invalid runtime configuration.

---

### 4. Permission Logic Must Be Isolated

Permission checks must live in a dedicated service.

Example:

```ts
permissionService.canUseGreenScreen(user, config)
```

The command should not directly contain complex permission logic.

---

### 5. Cooldown Logic Must Be Isolated

Cooldown must be handled by a dedicated service.

It should support:

* Global cooldown.
* Per-user cooldown later.
* Disabling cooldown entirely.
* Resetting cooldown manually.

---

### 6. OBS Logic Must Be Abstracted

The OBS layer should expose simple methods:

```ts
showSource()
hideSource()
setSourceUrl(url)
playTemporarySource(url, duration)
```

Command modules should not know the raw OBS WebSocket request names unless necessary.

---

### 7. URL Validation Is Critical

Never blindly display user-submitted URLs.

The validator should check:

* URL format.
* Protocol: only `https`.
* Allowed domains.
* File extension if direct media file.
* Optional max duration later.
* Optional NSFW/spam filtering later.

Default allowed domains can include:

```txt
youtube.com
youtu.be
streamable.com
tenor.com
giphy.com
```

Direct files may be allowed only if explicitly configured:

```txt
.mp4
.webm
.mov
```

---

## MVP Behavior

The MVP should support:

```txt
!gs <url>
```

Flow:

```txt
1. Bot receives a Twitch chat message.
2. Bot checks whether the message starts with the configured command.
3. Bot extracts the URL.
4. Bot checks permissions.
5. Bot checks cooldown if enabled.
6. Bot validates the URL.
7. Bot sends URL to OBS source.
8. Bot enables the OBS source.
9. Bot waits for configured duration.
10. Bot disables the OBS source.
11. Bot sends an optional confirmation message in chat.
```

---

## Configuration Example

```env
TWITCH_CHANNEL=mychannel
TWITCH_BOT_USERNAME=mybot
TWITCH_OAUTH_TOKEN=oauth:xxxxxxxxxxxx

OBS_WEBSOCKET_URL=ws://127.0.0.1:4455
OBS_WEBSOCKET_PASSWORD=your_password

OBS_SCENE_NAME=Main
OBS_SOURCE_NAME=GreenScreenSource

GS_COMMAND=!gs
GS_STOP_COMMAND=!gstop

GS_SUB_ONLY=true
GS_MOD_ONLY=false

GS_COOLDOWN_ENABLED=true
GS_COOLDOWN_SECONDS=60

GS_DURATION_SECONDS=15

GS_ALLOWED_DOMAINS=youtube.com,youtu.be,streamable.com,tenor.com,giphy.com
GS_ALLOW_DIRECT_FILES=true
GS_ALLOWED_FILE_EXTENSIONS=.mp4,.webm,.mov

LOG_LEVEL=info
```

---

## Runtime Safety

The app must include safety mechanisms:

* Emergency stop command.
* Automatic source hiding.
* Cooldown.
* Permission checks.
* URL validation.
* Error handling if OBS disconnects.
* Error handling if Twitch disconnects.
* Logs for every command attempt.
* Logs for denied commands.

The bot should never crash because of a bad chat command.

---

## Error Handling Rules

The app should handle:

* Missing URL.
* Invalid URL.
* Unauthorized user.
* Cooldown active.
* OBS unavailable.
* Twitch disconnected.
* Invalid configuration.
* Unsupported domain.
* Source not found.
* Scene not found.

Errors should be logged clearly.

Chat responses should be short and user-friendly.

Example:

```txt
@user URL non autorisée.
@user Commande en cooldown.
@user Seuls les subs peuvent utiliser cette commande.
```

---

## Logging

Use structured logs.

Each command attempt should log:

```txt
timestamp
username
command
url
permission result
cooldown result
validation result
OBS action result
```

Avoid logging sensitive secrets such as OAuth tokens or OBS passwords.

---

## Testing Strategy

The project should include unit tests for:

```txt
permissionService
cooldownService
urlValidator
commandRouter
greenScreenCommand
```

Priority test cases:

* Sub-only enabled.
* Mod-only enabled.
* Both disabled.
* Cooldown enabled.
* Cooldown disabled.
* Invalid URL.
* Unsupported domain.
* Missing URL.
* OBS failure.

````

---

## Future Features

The architecture should make these future features easy to add:

- Queue system for multiple video requests.
- Vote system.
- Channel point redemption support.
- Web dashboard.
- Per-user cooldown.
- Per-role cooldown.
- Blacklist users.
- URL history.
- Clip support.
- YouTube duration check.
- Moderation approval queue.
- Stream Deck control.
- Multiple OBS scenes.
- Multiple source profiles.
- Sound effect triggers.
- Browser overlay frontend.
- Docker deployment.
- Cloud-hosted configuration panel.

---

## Development Guidelines for AI Coding Agents

When modifying this project:

1. Keep the architecture modular.
2. Do not place all logic in one file.
3. Prefer TypeScript types over loose objects.
4. Validate all environment variables.
5. Keep Twitch-specific code inside `src/twitch`.
6. Keep OBS-specific code inside `src/obs`.
7. Keep command behavior inside `src/commands`.
8. Keep permission checks inside `src/permissions`.
9. Keep cooldown logic inside `src/cooldown`.
10. Keep URL checks inside `src/validation`.
11. Add tests for every new service.
12. Do not hardcode secrets.
13. Do not expose OBS password or Twitch OAuth token in logs.
14. Prefer small, composable functions.
15. Prefer explicit error handling over silent failures.
16. Keep the MVP simple but extensible.
17. Make configuration easy to understand.
18. Document any new command in the README.
19. Ensure the app can start with one command.
20. Ensure the app fails clearly if configuration is invalid.

---

## Coding Style

Use:

```txt
TypeScript
async/await
strict mode
clear service boundaries
descriptive function names
small files
explicit return types for public functions
````

Avoid:

```txt
large god files
hardcoded config
global mutable state when avoidable
silent catch blocks
business logic inside Twitch event listeners
raw OBS WebSocket calls spread everywhere
```

---

## Definition of Done

A feature is done when:

* It is implemented in the correct module.
* It has basic tests.
* It is configurable if relevant.
* It does not break existing commands.
* It logs useful information.
* It handles errors gracefully.
* It is documented if user-facing.
* It keeps the app easy to run locally.

---

## MVP Definition of Done

The MVP is complete when:

* The bot connects to Twitch.
* The bot connects to OBS.
* `!gs <url>` works.
* The OBS source is hidden by default.
* The OBS source appears when triggered.
* The OBS source disappears automatically.
* `subOnly`, `modOnly`, and `cooldownEnabled` are configurable.
* Cooldown can be disabled.
* Permission checks work.
* URL validation works.
* `!gstop` hides the source immediately.
* The project can be started with a simple command:

```txt
npm install
npm run dev
```

---

## Project Philosophy

This project should feel like a serious streaming tool, not a quick bot script.

The MVP should be simple, but the foundation must be clean enough to support future features without rewriting everything.

Build for:

```txt
stability
clarity
safety
scalability
developer experience
streamer control
```
