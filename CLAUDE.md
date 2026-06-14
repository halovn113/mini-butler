# CLAUDE.md — operational reference for bantzv2

Persistent notes for Claude Code sessions working on this repo. Read this first.

## Architecture
- **bantzv2** — main repo (this directory, `/home/misa/bantzv2`). Origin: `github.com/miclaldogan/bantzv2`.
- **bantz-web** — git submodule at `vendor/bantz-web` (origin `github.com/miclaldogan/bantz-web`). A standalone search/research/news pipeline, wired into the tool layer in-process (no HTTP, no subprocess) via `src/bantz/tools/web_search.py`.
- **bantz-ui** — Tauri v2 + React desktop app at `bantz-ui/` ("Operations Center"). 6 pages: Broadcast Channel, Vitals, Kernel Log, Directives, Anomaly Watch, Settings. Talks to the daemon over WebSocket.

## Runtime / deployment
- **Daemon**: systemd **user** unit `bantz-daemon.service` (`~/.config/systemd/user/bantz-daemon.service`). Manage with `systemctl --user {restart,status,stop} bantz-daemon`. Enabled for boot; `Restart=on-failure`. Runs `python -m bantz --daemon`, foreground (Type=simple), `WorkingDirectory=~/.local/share/bantz/src`.
  - Do NOT hand-launch the daemon with `setsid`/`nohup` — it races the systemd unit and `bantz --ui`'s auto-spawn and crash-loops on the port. Use systemd.
- **Install clone**: `~/.local/share/bantz/src` — this is the editable install the venv (`~/.local/share/bantz/venv`) and daemon actually import (NOT this dev repo). It does **not** auto-pull. **After every push, sync it:**
  ```
  git -C ~/.local/share/bantz/src pull --recurse-submodules
  git -C ~/.local/share/bantz/src submodule update --init --recursive   # if vendor/ changed
  systemctl --user restart bantz-daemon                                  # for backend changes
  ```
  Submodule gotcha: a fresh pull may leave `vendor/bantz-web` uninitialized (`git submodule status` shows a leading `-`) → run the `submodule update` above.
- **WS server**: `ws://localhost:8765` (`src/bantz/interface/ws_server.py`). The UI dev server is Tauri + vite (separate ports); vite HMR picks up `bantz-ui/` changes from the install clone after a pull.
- **OAuth redirect**: port **8766** (`src/bantz/auth/google_oauth.py`, changed from 8765 to avoid the WS-server conflict). User must add `http://localhost:8766` as an authorized redirect URI in Google Cloud Console.
- **LLM providers**: ollama (local, default) | claude | gemini | openai. Selected via `BANTZ_LLM_PROVIDER`, switchable live in Settings → routed by `src/bantz/llm/router.py`. Provider clients read config **live** (model changes apply without restart); long-lived subsystems (voice, wake word) still need a restart.
- **Tokens**: `~/.local/share/bantz/tokens/` (calendar_token.json, gmail_token.json, credentials.json). Telegram bot `@bantzclaw_bot`, creds in parent `bantzv2/.env` (`TELEGRAM_BOT_TOKEN`, `TELEGRAM_ALLOWED_USERS`).

## Key files changed in recent sessions
- `core/finalizer.py` — FACTS grounding block, `<thinking>` strip, `[CONTEXT:...]` strip (in `strip_markdown`).
- `tools/gmail.py` — `build_query` default capped to `label:unread newer_than:7d`; `_summary` groups by `categorize()` (personal/institutional/services/payments/notifications) with emoji headers; `briefing=True` filter.
- `tools/calendar.py` — `_create_sync` logs+raises instead of swallowing to `""`; `_create` surfaces the real error as a ToolResult.
- `tools/web_search.py` — bantz-web integration: `web_search` (quick), `web_research` (deep, async, progress streamed to chat via `chat_token` bus event + cancel), `web_news`. Appends `vendor/bantz-web` to `sys.path` (append, NOT insert(0) — avoids shadowing `telegram` pkg); neutralizes bantz-web `git_commit`.
- `core/intent.py` — routing hints/examples for web tools; `investigate:` → chat pre-route; autonomy `requires_confirm` flag.
- `interface/ws_server.py` — anomaly detection in `_compute_anomalies` (CPU/RAM/disk/**swap** + log errors), config bridge (`_CONFIG_KEY_MAP` + `_collect_config`, incl. provider/model/personality/ollama_base_url), `_handle_new_task` directive NLP parsing (`_parse_directive` + `_extract_directive_json`), `chat_token`→token bridge, `cancel_research`.
- `core/brain.py` — `_mood_suffix()` (mood_bias dial) appended to chat system prompt.
- `bantz-ui/src/store/useAppStore.ts` — anomalies array, dismiss/snooze (localStorage-persisted, 1h auto-expire), `activePage` for navigation, provider/personality ConfigValues.
- `bantz-ui/src/pages/AlertsPage.tsx` — Anomaly Watch: Investigate (→ chat) + Snooze.
- `bantz-ui/src/pages/SettingsPage.tsx` — provider selector + Claude key/model, appearance prefs (localStorage + CSS), personality dials, restart-required notice, live Ollama model list.

## Known issues (open)
- **`[CONTEXT:...]` may still leak**: `strip_markdown` strips it, but `finalize()` returns short tool output (<800 chars) **verbatim** without `strip_markdown`, and the streaming chat path emits tokens directly — so CONTEXT can reach the UI through those paths. The App.tsx-side `stripThinking` does not strip CONTEXT. Fix would be to also strip in the verbatim/short path and/or frontend.
- **Calendar events reportedly not appearing on Google Calendar** despite the tool returning `success=True` with an `event_id` (POST returns 200). Likely an account/calendar mismatch (OAuth account vs. the user's primary calendar). Needs investigation.
- **Duplicate "Dinner"/"Test Event" entries** created by repeated calendar test runs — pending deletion.
- **Autonomy dial not enforced**: `requires_confirm` is set on the routing decision but the executor doesn't act on it (only shell's own `DESTRUCTIVE_COMMANDS` confirm runs).
- **Briefing category filter not wired**: `categorize()`/`briefing=True` exist in gmail.py, but the morning briefing fetches via `agent/workflows/overnight_poll.py` (+ `greeting.py`), which don't call them yet.
- **web_research is Ollama-bound**: deep research makes many local-model calls; on a memory-constrained machine Ollama can stall mid-run (it falls back, but a full report needs healthy Ollama).

## Standing rules (from the user)
- **No co-author / AI attribution in commit messages.** Plain messages only. (Overrides the default Claude Code trailer.)
- **Commit and push after making a change** without being asked each time; stage only relevant files (this repo carries unrelated pre-existing edits — never `git add -A`); never stage `.env`.
- **After pushing, sync the install clone** (`~/.local/share/bantz/src`) and **restart the daemon via systemd** for backend changes to take effect.
- When a fix doesn't seem to work, check whether the running daemon/UI is the stale install clone before assuming a code bug.
