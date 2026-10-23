# Missions & Local AI Engine Audit & Hardening Report

**Release**: Friends 0.7.0  
**Branch**: `release/0.7.0`  
**Date**: October 2026  
**Auditor**: Friends Security & Architecture Team  
**Status**: All audits completed, hardened, and verified with 100% passing automated test coverage.

---

## Executive Summary

As part of Workstream 5 ("Missions and Local AI"), a complete end-to-end security and operational audit of the Missions subsystem and local-AI execution pipeline was conducted. The audit covered `server/missions/*`, `server/specialists*`, `server/models.js`, `server/vram.js`, `server/router.js`, and the frontend Missions interfaces.

A full **Scenario Test Matrix** (`test/missions-scenario-matrix.test.js`) was engineered against hermetic mocks (`fakeAi` for Gemini 3.8 and Ollama with simulated hardware VRAM profiles). All 12 threat models and edge-case lifecycle scenarios were exercised and verified.

---

## 1. Scenario Test Matrix Coverage

| Scenario # | Focus Area | Observed Behavior & Hardening | Status |
|:---:|:---|:---|:---:|
| **1** | Full Happy Path & Audit Chain | `clarify` → user answers → `plan` → user edits steps → approve once → execute steps → `report.md` in vault & SHA-256 hash-chained audit verification. | **PASS** |
| **2** | Step Failure & Manager Fallback | Local specialist fails (simulated crash / OOM); step automatically escalates to Gemini cloud manager with full context and completes successfully. | **PASS** |
| **3** | Review Check & Fix Hints | Manager second-pass verification evaluates step output. Incomplete outputs fail check, retry with manager's specific fix advice, and pass on round 2. | **PASS** |
| **4** | Quota Exhaustion (HTTP 429) | Gemini 429 backoff pauses mission with `pause.kind = "quota"`, calculates retry timestamp from Google `RetryInfo`, and resumes cleanly via `runner.resume(id)` or countdown. | **PASS** |
| **5** | Private Mode Isolation | `privacy.localOnly = true` or `mission.private = true` forces manager to local model; no cloud network requests emitted (`ai.hits.cloud.length === 0`). Cloud-bound steps pause with `pause.kind = "private"`. | **PASS** |
| **6** | Crash Recovery & Side Effects | Mid-step stop aborts running child process immediately. On restart / `recover()`, steps with unconfirmed external side effects (`effects[]`) pause for confirmation before re-running to prevent duplicate actions. | **PASS** |
| **7** | Dynamic Step-Level Controls | Real-time controls: `retryStep`, `skipStep`, `editStepInRun`, `duplicate`, `archive`, and `stopAll` function deterministically without corrupting plan DAG state. | **PASS** |
| **8** | Sandbox & Command Security | Strict realpath traversal defenses block `../` escapes; symlink escapes to `/etc` outside allowed roots are blocked; `sudo`, global package managers, and root modifications always force approval. | **PASS** |
| **9** | Tamper-Evident Audit Chains | Every event in `audit.jsonl` contains SHA-256 `prevHash` and `entryHash`. Single-byte tampering by rogue steps or external edits is immediately caught by `verifyAudit(id)`. | **PASS** |
| **10** | Template Gallery & Custom Import/Export | 14 built-in mission templates loaded. Custom templates exported with format `friends.mission-template.v1` and imported safely with schema validation. | **PASS** |
| **11** | Chat Priority & Model Preemption | Priority-based semaphore in `models.js`: interactive chat (`priority = 10`) immediately preempts background missions (`priority = 0`), yielding transparently with `waitingReason: "waiting for the model because you are chatting"`. | **PASS** |
| **12** | Master Kill Switch & Automations | Master `killSwitch` in `automations.js` instantly suspends all recurring/event-driven schedule ticks and watches with zero port openings. | **PASS** |

---

## 2. Vulnerability Findings & Hardening Measures

### 2.1 Path Traversal & Symlink Escapes (`server/missions/risk.js`)
- **Finding**: Relative paths (`../../`) or symlinks created inside the mission workspace could target arbitrary host filesystem locations (such as `/etc/shadow`, `/home/user/.ssh`, or external drive mounts).
- **Hardening**:
  - Implemented `safeRealpath(targetPath, allowedFolders)` using physical filesystem inspection (`fs.realpathSync`) where possible and lexical canonicalization.
  - Added detection of symlink creations (`ln -s /etc/... ./link`) pointing outside allowed root folders.
  - Enforced that reading outside the workspace is prohibited unless pointing to explicit user-whitelisted folders.
  - File deletions strictly route through the OS Trash (`trash` mechanism) rather than unrecoverable `rm -rf`.

### 2.2 Environment Hygiene & Secret Leaks (`server/missions/runner.js`)
- **Finding**: Spawning child shell processes could inherit sensitive API keys (`GEMINI_API_KEY`, Telegram tokens, auth tokens) into subshells accessible to user-crafted scripts or untrusted templates.
- **Hardening**:
  - Environment variables for executed shell steps are scrubbed down to a minimal deterministic set: `PATH`, `LANG`, `LC_ALL`, `USER`, `HOME`, `SHELL`, `TERM`, and `FRIENDS_MISSION_ID`.
  - Sensitive environment variables are never passed to tool subprocesses.
  - Workspace boundaries are isolated per mission ID in subdirectories (`~/friends-workspace/m_<id>`).

### 2.3 Always-Ask Commands
- **Finding**: Pre-approved missions could attempt privilege escalation or systemic mutations (e.g., `sudo`, `npm install -g`, `systemctl`, `chown`).
- **Hardening**:
  - `risk.classifyCommand()` enforces `always: true` on `sudo`, `su`, package manager global flags (`-g`, `--global`), disk formatting, and system-level systemd changes, irrespective of whether the plan was pre-approved.
  - Any such command halts execution and requests interactive explicit approval with a clear user prompt.

### 2.4 Tamper-Evident Hash Chaining (`server/missions/store.js`)
- **Finding**: If a rogue process compromised workspace file boundaries, it could attempt to redact or alter historical audit logs in `audit.jsonl` to conceal malicious activities.
- **Hardening**:
  - Implemented cryptographic hash chaining:
    `entryHash = SHA-256(seq + prevHash + canonicalJSON(entry))`
  - The genesis record starts with `prevHash: "0000000000000000000000000000000000000000000000000000000000000000"`.
  - Added `verifyAudit(missionId)` which walks and re-hashes every line in `audit.jsonl`, reporting any mismatch, deletion, insertion, or reordering.
  - Added verified JSON and CSV export endpoints (`/api/missions/:id/audit/export.json`, `/api/missions/:id/audit/export.csv`).

### 2.5 Mid-Step Interruptions & Crash Recovery (`server/missions/runner.js`)
- **Finding**: If the server crashed or was restarted while an external action (sending a Telegram notification, creating a remote asset) was in-flight, blindly restarting the step could cause duplicate side-effects.
- **Hardening**:
  - When an external tool runs, its effect is committed immediately to the step's `effects` log on disk.
  - On restart / `runner.recover()`, `recoverStep()` checks if `s.effects` has unconfirmed external actions.
  - If actions were completed, it asks the user: `"Friends was interrupted during '[step]', after it had already done: [actions]. Run the step again (it might repeat that)?"`.
  - If the user declines, the step is safely marked `skipped` and execution continues.

### 2.6 Local Model Safeguards & Small Model Defenses (`server/missions/manager.js`)
- **Finding**: Small local models (3B to 8B parameter weights such as Llama 3.2 3B, Qwen 2.5 3B/7B, Gemma 2 2B) frequently emit markdown-wrapped or malformed JSON (trailing commas, unescaped newlines in quotes, comments).
- **Hardening**:
  - Implemented multi-stage resilient JSON repair (`repairJsonText`):
    1. Strip markdown fences (```json ... ```).
    2. Extract outermost `{ ... }` or `[ ... ]`.
    3. Strip single-line (`//`) and multi-line (`/* */`) comments.
    4. Remove trailing commas before `}` and `]`.
    5. Escape unescaped control characters inside string literals.
  - Added step sizing heuristics and DAG validator to ensure dependencies are valid acyclic graphs and step counts respect hardware context limits.

### 2.7 Interactive Chat Priority & Anti-Thrashing (`server/models.js`)
- **Finding**: Running long multi-step background missions could starve user interactive chat or trigger rapid model thrashing in VRAM.
- **Hardening**:
  - Implemented priority queue in `models.use`:
    - `priority: 10` (Interactive Chat)
    - `priority: 5` (High priority UI requests)
    - `priority: 0` (Background missions)
    - `priority: -1` (Background pre-warming)
  - Interactive chat requests immediately jump ahead of queued mission steps.
  - UI displays informative non-technical explanations: `"waiting for the model because you are chatting"`.
  - Anti-thrashing swap cooldown timer prevents high-frequency VRAM unloads/reloads.

---

## 3. Specialist Roles and Prompt Engineering

10 specialized built-in roles were added (`server/specialist-roles.js`), bringing the built-in catalog to 16 roles:
1. `planner` — DAG plan construction, clarification, step structuring.
2. `checker` — Output verification, rubric grading, failure diagnosis.
3. `summarizer` — Long-text distillation, executive takeaways.
4. `translator` — Multilingual fidelity, nuance preservation.
5. `extraction` — Structured data parsing, JSON/table extraction.
6. `reasoning` — Chain-of-thought analysis, problem solving.
7. `tool_caller` — Strict function calling, tool argument formulation.
8. `social` — Community engagement, tone adaptation.
9. `email` — Professional correspondence, draft composition.
10. `organizer` — Task scheduling, list categorization, prioritization.

Each role features family-tailored prompt templates adapting to the underlying model architecture (`llama`, `qwen`, `gemma`, `mistral`, `phi`, `deepseek`).

---

## 4. Hardware Tier Matrix

`server/specialist-suggestions.js` provides dynamic hardware tier recommendations based on detected GPU VRAM and CPU:
- **CPU Only / < 4GB VRAM**: Quantized 1B–3B models (`qwen2.5:1.5b-instruct-q4_K_M`, `llama3.2:1b`, `gemma2:2b`).
- **4GB – 6GB VRAM**: 3B–4B models (`qwen2.5:3b`, `phi3.5:3.8b`).
- **8GB VRAM (Sweet spot)**: 7B–8B models (`qwen2.5:7b-instruct-q4_K_M`, `llama3.1:8b-instruct-q4_K_M`).
- **12GB – 16GB VRAM**: 14B models or unquantized 8B (`qwen2.5:14b`, `mistral-nemo:12b`).
- **24GB+ VRAM / Apple Unified**: 32B models (`qwen2.5:32b`, `deepseek-r1:32b`).

All suggestion sets are pinned with validation timestamp `CHECKED = "2026-10-23"` and support non-Ollama OpenAI-compatible local backends (vLLM, llama.cpp, Ollama).

---

## 5. Verification Commands

To reproduce the audit verification suite:

```bash
# Run the 12-scenario test matrix
node test/missions-scenario-matrix.test.js

# Run full mission test suite
node --test test/missions-engine.test.js test/missions-risk.test.js test/missions-plan.test.js test/missions-automations.test.js test/vram.test.js

# Run static syntax and import checks
npm run check
```

**Audit Verdict**: APPROVED FOR RELEASE 0.7.0.
