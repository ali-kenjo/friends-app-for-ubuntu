# Telegram Bot Companion — Resilience Audit & Hardening Report

**Branch:** `release/0.7.0`  
**Date:** October 2026  
**Scope:** Workstream 4, Item B (Telegram hardening and audit)

---

## 1. Executive Summary

The Telegram Bot Companion (`server/telegram.js`) was subjected to an end-to-end resilience audit against a dedicated mock Bot API server (`test/helpers/fake-telegram.js`). The audit assessed 18 edge cases and failure modes, verifying that:
1. Long polling maintains state cleanly without open ports or webhooks.
2. Inbound and outbound rate limits are respected without crashing or spamming.
3. Network failures, token revocations, and 409 conflict errors recover gracefully or alert the user.
4. Messages never exceed Telegram's hard limit of 4096 characters per message.
5. MarkdownV2 and HTML special characters are escaped safely.
6. Group chat modes (`mention_only`, `command_only`, `all`) prevent bot chatter leakage.
7. Role-based pairing codes replace manual user ID entry, restricting mission approvals and admin actions.
8. Media (photos, voice notes, documents) is routed through appropriate transcribers and vision models or gracefully rejected.
9. All 18 automated audit test cases in `test/telegram-audit.test.js` pass with zero external network dependencies.

---

## 2. Audit Matrix & Test Results

| # | Edge Case / Scenario | Risk / Failure Mode | Hardening Implementation | Audit Test Result |
|---|----------------------|---------------------|--------------------------|-------------------|
| 1 | **Offset Persistence** | Re-processing processed messages upon reconnect or restart | `persistentOffset` tracks highest seen `update_id + 1`; updates deduplicated | **PASS** |
| 2 | **Duplicate Updates** | Network retries from Bot API re-triggering commands | 1000-entry rolling LRU deduplication set (`seenUpdateIds`) | **PASS** |
| 3 | **Long Polling Timeout** | Server drops connection or hangs | 25s timeout with client 40s abort signal; automatic re-polling loop | **PASS** |
| 4 | **Network Drops** | Flapping WiFi or offline server causes tight error loop | Exponential backoff from 2s up to 60s cap | **PASS** |
| 5 | **409 Conflict** | Another bot instance started getUpdates | Marked in `health().isConflict`; backs off 30s before retrying; alerts logged | **PASS** |
| 6 | **429 Rate Limit** | Bot sends too many messages too quickly | Intercepts `parameters.retry_after`; sleeps duration + 1s before retry | **PASS** |
| 7 | **401 Invalid Token** | Token revoked on BotFather or mistyped | Stops polling immediately, marks `health().isInvalidToken`, notifies UI | **PASS** |
| 8 | **Message Splitting > 4096** | Telegram HTTP 400 rejection on large notes/plans | Multi-stage chunking at paragraph, line, and sentence boundaries (<=4000 chars) | **PASS** |
| 9 | **Markdown / HTML Escaping** | Formatting injection or Telegram 400 Bad Request | `escapeMarkdownV2` escapes all 18 special chars; `escapeHtml` escapes entities | **PASS** |
| 10 | **Unsupported Message Types** | Dice, stickers, games cause JSON parser exceptions | Dispatcher safely checks existence of message properties and ignores unhandled | **PASS** |
| 11 | **Edited Messages** | Edited messages replay past commands | Ignored or filtered by `allowed_updates: ["message", "callback_query"]` | **PASS** |
| 12 | **Stale Buttons / Callbacks** | Clicking expired mission approve/stop buttons hangs UI | Answers callback query with descriptive toast ("This mission request is no longer active") | **PASS** |
| 13 | **Group Chat Modes** | Bot replies to every message in group chats | Configurable `groupMode`: `mention_only` (default), `command_only`, or `all` | **PASS** |
| 14 | **RTL Text Support** | Arabic text rendered corrupt or directionality reversed | UTF-8 unicode preservation without byte-slicing corruption | **PASS** |
| 15 | **Flood / Spam Throttling** | Rapid unauthorized messages flood log or CPU | Per-user rate-limiting ring buffer; silent drops for unauthenticated floods | **PASS** |
| 16 | **Pairing Enforcement** | Unauthorized users issue commands or read notes | Mandatory pairing code (`/pair <code>`); unauthorized messages rejected silently | **PASS** |
| 17 | **Streaming Message Edits** | Streaming companion replies hit Telegram 429 edit limit | Throttles `editMessageText` to >= 1200ms intervals, flushes final text upon completion | **PASS** |
| 18 | **Media Inbound Handling** | Users send photos, voice notes, documents | Inbound dispatching to `transcribe` and `vision` handlers with user guidance | **PASS** |

---

## 3. Architecture & Security Enhancements

### 3.1 Pairing Code Workflow
Instead of manually looking up Telegram user IDs and typing numbers into the settings page:
1. Owner opens **Settings → Telegram** in Friends app.
2. Clicking **"Generate pairing code"** issues a random 6-digit code valid for 10 minutes (`createPairingCode()`).
3. User opens Telegram, starts the bot, and types `/pair <code>`.
4. The bot validates the code, records user metadata (username, first name, ID), assigns role (`admin` for first user, `chat` for subsequent users), and confirms via Telegram.
5. Owner can promote, demote (`admin`, `chat`, `notify_only`), or revoke users at any time in the settings panel.

### 3.2 Role Hierarchy
- **`admin`**: Full access. Can start and stop missions, approve decisions, view all agenda items, notes, tasks, and change companion modes.
- **`chat`**: Can talk with companion, view agenda, tasks, reminders, and daily notes. Cannot start/stop missions or approve high-risk actions.
- **`notify_only`**: Receives forwarded notifications (reminders, mission progress, briefings, Reddit matches). Cannot chat or issue commands.

### 3.3 Message Splitting Strategy
Telegram API rejects any text message exceeding 4096 UTF-8 characters with HTTP 400 Bad Request. `server/telegram.js` implements `splitMessage(text, maxLen = 4000)`:
1. **Paragraph split**: Checks for `\n\n` within the window (> 40% of maxLen).
2. **Line break split**: Checks for `\n` (> 40% of maxLen).
3. **Sentence split**: Checks for sentence terminators `[.!?]\s+` (> 40% of maxLen).
4. **Word split**: Checks for whitespace `\s` (> 30% of maxLen).
5. **Hard cut**: As a last resort, cuts at exact character limit without splitting multi-byte UTF-8 sequences.
Inline button keyboards are attached strictly to the final chunk.

### 3.4 Rate Limit & Throttling
- Outbound streaming: Telegram limits message edits to ~1 edit per second per chat. `createStreamReply(chatId)` enforces a 1200ms debounce interval between edits.
- Outbound 429 response: When Telegram responds with HTTP 429, the error's `parameters.retry_after` is parsed, and the bot suspends operations for that duration.
- Inbound spam protection: Requests from unauthorized IDs are tracked in a 60-second sliding window. Repeated attempts (> 5 in 10s) are dropped silently without calling Bot API.

---

## 4. Verification & Testing

Tests are executed with Node's native test runner (`node:test`):
- `node test/telegram.test.js`: 14/14 tests pass (backward-compatible companion behavior, missions, i18n).
- `node test/telegram-audit.test.js`: 18/18 tests pass (comprehensive edge case, fault injection, and security suite).
- Total runtime: < 5 seconds.
- Zero external HTTP requests made (all use local `127.0.0.1` ephemeral servers).
