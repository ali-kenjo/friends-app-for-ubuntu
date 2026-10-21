# Baseline Results for Release 0.7.0

Recorded on `2026-10-21` on branch `release/0.7.0` (branched from `main` at `0.6.0`).

## Summary

| Check / Suite | Command | Exit Code | Result |
|---|---|---|---|
| Clean install | `npm ci` | `0` | Passed (`added 166 packages, and audited 167 packages in 3s`) |
| Static syntax & offline check | `npm run check` | `0` | Passed (`✓ 290 scripts parse, JSON files are valid, the page needs no internet to start`) |
| Unit & HTTP integration tests | `npm test` | `0` | Passed (`593 pass, 0 fail, 120 suites`, `7687.97ms`; 1 optional real-voice subtest skipped unless `FRIENDS_TEST_VOICE=1`) |
| Translation completeness | `npm run i18n` | `0` | Passed (`de: 2437/2437 translated`, `ar: 2437/2437 translated`, 0 missing, 0 unused) |
| Accessibility (axe-core) | `npm run test:a11y` | `0` | Passed (`164/164 surface × theme × language scans clean`, `✓ No serious or critical accessibility violations`) |
| End-to-end browser tests | `npm run test:e2e` | `0` | Passed (`99 pass, 0 fail, 16 suites`, `119361.46ms`, Chrome at `/usr/bin/google-chrome`) |
| Dependency vulnerability audit | `npm audit` | `1` | 2 low-severity vulnerabilities reported in `mermaid` → nested `katex` (details below) |

---

## Detailed Outputs

### 1. `npm ci`
```text
added 166 packages, and audited 167 packages in 3s
2 low severity vulnerabilities
```

### 2. `npm run check`
```text
> friends@0.6.0 check
> node scripts/check.js

✓ 290 scripts parse, JSON files are valid, the page needs no internet to start
```

### 3. `npm test`
```text
> friends@0.6.0 test
> node --test test/*.test.js

ℹ tests 593
ℹ suites 120
ℹ pass 593
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 7687.973181
```

### 4. `npm run i18n`
```text
> friends@0.6.0 i18n
> node scripts/i18n.js

de: 2437/2437 translated
ar: 2437/2437 translated
```

### 5. `npm run test:a11y`
Scanned 41 surfaces across 2 languages (`en`, `ar`) × 2 themes (`dark`, `light`) = 164 scans:
- `first-run`, `start-no-ai`, `start`, `chat`, `model-menu`, `search`, `plus-menu`, `today`, `today-tasks`, `today-reminders`, `today-calendar`, `today-habits`, `today-journal`, `missions`
- `settings-appearance`, `settings-personality`, `settings-memory`, `settings-robot`, `settings-ai-control`, `settings-ai-answers`, `settings-ai-privacy`, `settings-ai-device`, `settings-ai-add-pick`, `settings-ai-add-form`, `settings-specialists`, `settings-missions`, `settings-integrations`, `settings-telegram`, `settings-notes`, `settings-life`, `settings-data`
- `studio-colors`, `studio-shape`, `studio-face`, `studio-outfit`, `studio-room`, `studio-looks`, `studio-outfit-worn`, `studio-room-podcast`
- `voice`, `filming-setup`

```text
✓ No serious or critical accessibility violations
```

### 6. `npm run test:e2e`
```text
> friends@0.6.0 test:e2e
> node --test --test-concurrency=1 test/e2e/*.test.js

✔ AI & privacy in the page (4238.796185ms)
✔ The page in Chrome (2585.971648ms)
✔ The page, designed (24416.664006ms)
✔ Missions in the page (5428.380784ms)
✔ Choosing the AI in the page (3091.031034ms)
✔ Specialists in Settings (2196.341331ms)
✔ The Robot Studio (33973.217688ms)
✔ Touch screens and zoom (11579.283495ms)
✔ Updates in Settings (1613.833176ms)
✔ Talk, Missions and Today (6606.765176ms)
✔ Voice conversation (23041.849606ms)
ℹ tests 99
ℹ suites 16
ℹ pass 99
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 119361.456163
```

### 7. `npm audit` (Failure Output)
```text
# npm audit report

katex  0.11.0 - 0.18.1
KaTeX: Existing prototype pollution can bypass trust restrictions - https://github.com/advisories/GHSA-238p-pmpm-9mq7
fix available via `npm audit fix`
node_modules/mermaid/node_modules/katex
  mermaid  10.9.0-rc.1 - 12.1.0
  Depends on vulnerable versions of katex
  node_modules/mermaid

2 low severity vulnerabilities
```
*(Note: top-level `katex` is `^0.19.0`, while `mermaid@12.0.0` pulls an older nested `katex` unless overridden in `package.json` `overrides`.)*
