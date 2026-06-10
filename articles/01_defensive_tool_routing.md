# Everything That Broke When I Made an 8B Model My Tool Router (And What Fixed It)

## Status
Current quarter readiness: **Q1 VERIFIED — ready to draft, all numbers measured end-to-end**
Last updated: 2026-06-10 (late evening — rescue fix shipped and re-measured)
Fix shipped at commit `bbc2f45`, re-eval run 2026-06-10.

**What changed today:** Gap 1 CLOSED — routing eval harness built and run (`eval/routing_eval.py`, results in `eval/routing_eval_results.json`): NAIVE 5% → FULL 51%, with per-defense attribution. Gap 2 CLOSED — 20-test live suite re-run (`eval/test_report_current.md`): strict pass 6/20 → 10/20, conversational latency −52%. Gap 3 mostly closed (root debris deleted, `tests/tui/` quarantined to `tests/_aspirational/`; dead source modules deliberately deferred). **New headline finding:** in 35 of 42 residual planner over-routes, the model named the *correct* tool in `tool_name` while writing `planner` into `route` — a one-line defense that doesn't exist yet and would take measured accuracy from 51% to ~86%. This becomes the article's closing beat.

## One-Line Thesis
Function-calling tutorials assume a frontier model; this is the complete catalog of what actually breaks when your tool router is llama3.1:8b on local hardware — malformed JSON, invented tool names, fake success claims, leaked reasoning tags, refusal false-positives — with a working, hand-rolled countermeasure for each.

## Target Reader
Engineers building local/private LLM agents on Ollama-class hardware (8B–13B models, consumer GPUs). They've read the agent papers and framework docs, tried to reproduce with a small model, and watched the JSON parsing fall apart. Secondary: anyone doing structured output with small models.

## Unique Angle
- **Zero frameworks.** Every defense is hand-rolled and visible — no LangChain/LlamaIndex abstraction hiding the failure handling.
- **Every technique has a receipt.** 416 commits and a numbered-issue history mean each defense traces to a documented real failure: #282 (refusal false-positive from "sorry" inside CoT), #214 (leaked `<thinking>` tags broke JSON parsers), #253 ("People-Pleaser fix" — silent fallback to chat hid tool failures), #255 (circuit breaker), #216 (one-shot replan), #256 (web_search claiming success on errors).
- **Quantified failure data already exists**: `TEST_REPORT.md` (2026-05-26, daemon `ba6c71a`) documents 6/20 strict pass with a per-category failure analysis, including six planner over-routing cases (tests 8, 13, 16, 17, 18, 20).
- Most published "function calling" content shows the happy path on GPT-4-class models. This article is structured as failure mode → countermeasure → code, which almost nobody publishes because almost nobody keeps the paper trail.

## Proposed Outline

### 1. The Setup (short)
Local-first butler assistant; the router *must* run locally even when nothing else does. Pipeline diagram from `README.md:31-64` (Input → Translation → Memory → Routing → Executor → Finalizer). Establish the constraint: `llama3.1:8b` main model, optional `qwen2.5:3b` routing model (`README.md:229-233`).

### 2. Failure: The Model Can't Follow Your Output Schema
The model puts the tool name in the `route` field, wraps JSON in markdown fences, or rambles past the JSON. Countermeasures:
- Compact one-line-per-tool routing hints instead of full schemas — `src/bantz/core/intent.py:35-68` (`_ROUTING_HINTS`) and `:71-78` (`_build_compact_schemas`), because full schemas blow the prompt budget on an 8B.
- `_extract_json` at `intent.py:188-209`: normalizes llama3.1's *specific documented mistake* of emitting `route: "gmail"` instead of `route: "tool"` (lines 200-208).
- Two-attempt repair loop with a correction message — `intent.py:521-545`.
- `num_predict: 768` output cap (`intent.py:241`) to stop the model generating thousands of reasoning tokens.

### 3. Failure: Reasoning Leaks Into Output
`<thinking>` blocks that never close, re-trigger detection, or land inside the JSON. Countermeasures:
- `strip_thinking` applied at the earliest ingestion point, including unclosed-tag handling — `intent.py:154-165` (#214, #273).
- Force-close after `_THINKING_MAX_TOKENS = 512` tokens for models that never emit `</thinking>` — `intent.py:236, 330-336`.
- `thinking_complete` latch to stop old tags in the buffer re-triggering detection ("ThinkingPanel spam", #273) — `intent.py:274-276`.
- Refusal detection that strips thinking *first*, because CoT containing "sorry" falsely aborted tool routing (#282) — `intent.py:176-183`.

### 4. Failure: The Model Invents Reality
Invented tool names, hallucinated params, example content copied into plans. Countermeasures:
- Post-hoc alias table mapping `firefox`/`bash`/`google` → real registry names — `src/bantz/agent/planner.py:357-375` (`_PLANNER_ALIASES`), plus unknown-tool step dropping at `:383-392`.
- Anti-example-leakage rules in the planner prompt — `planner.py:210-215` ("NEVER output 'GitHub', 'trending', 'quantum computing'… unless the USER said it").
- The visibly human mid-prompt correction at `planner.py:82` ("Actually, the rule is: ALWAYS use `$REF_STEP_N`…") as evidence of prompt-as-scar-tissue.
- The COT rule block at `intent.py:95-135` — emotional-statement rules and anti-false-positive rules ("'I don't stand for this' does NOT mean 'stand' = music/player").

### 5. Failure: Success Isn't Success
Tools that return `success=True` with "Error: 403" in the output; step outputs that corrupt downstream JSON. Countermeasures:
- `_is_step_failure` + `_FAILURE_MARKERS` regex catching tools that claim success but emit error text (#256) — `src/bantz/agent/executor.py:105-122`.
- `$REF_STEP_N` resolved at Python-dict level, not string level, to avoid JSON corruption from special characters — `executor.py:552-639`, two-phase resolution at `:610-637`.
- Automatic URL extraction when prose output feeds `read_url` — `executor.py:590-599` (the model can't be trusted to extract URLs, so the executor does it deterministically).
- Circuit breaker + exactly-one replan with recursion guard (`_replanned=True`) — `executor.py:332-342`, `_attempt_replan` at `:365-447`, `REPLAN_SYSTEM` prompt at `planner.py:218-246`.

### 6. Failure: The Router Escalates Everything to the Planner
`TEST_REPORT.md:57-72` — six of twenty live tests over-routed to the planner (a venting message got a calendar+email+web plan; "open firefox" got rejected). Countermeasures since shipped:
- Regex fast-paths checked *before* the LLM: `_REMINDER_FAST` and `_CHAT_FAST` — `intent.py:372-396, 432-442` (these directly answer TEST_REPORT Issue 2 and Issue 3).
- Hardware-only `quick_route` regex layer — `src/bantz/core/routing_engine.py:51-118`.
- Single-step plans now execute directly instead of being rejected (`routing_engine.py:387-388`) — fixing the `len(steps) < 2` false-failure guard called out at `TEST_REPORT.md:146`.
- Confidence threshold fallback at `intent.py:484-486`; routing-model → main-model fallback on 404 at `intent.py:493-519`.

### 7. What the Numbers Say (data now in hand — `eval/routing_eval_results.json`)
100-utterance eval, every registry tool ≥3 cases, llama3.1:8b, temperature 0, LLM responses cached so ablation diffs are noise-free:
- **NAIVE 5% → FULL 51%.** The naive router (no defenses, minimal prompt) put a tool name in the `route` field or failed to parse on 93/100 cases. The defense stack is worth +46 points.
- **Per-defense attribution** (cases that break when one defense is removed, all else equal): `_extract_json` route normalization −13, two-attempt retry −9, regex fast-paths + quick_route −10, `<thinking>` stripping −0, refusal check −0 (the last two never fired on this benign English/Turkish eval — they exist for thinking-tag models and adversarial inputs; say so honestly).
- **FULL_PROD 45%** (the real `cot_route` at production sampling temperature) validates the harness reimplementation (51% at temp 0) and shows sampling variance.
- **Category sweep:** chat 7/7, emotional 4/4, idiom 3/3, internal 6/6, system 7/7, planner 4/4 — *every* failure class the defenses target is at 100%. The residue is single-tool dispatch: 20/69.

### 8. The Missing Defense — SHIPPED AND MEASURED (the payoff)
42 of FULL's 49 residual failures were planner over-routes ("df -h" → planner). The forensic detail: **in 35 of those 42, `tool_name` contained the correct tool with correct args** — e.g. `{"route": "planner", "tool_name": "shell", "tool_args": {"command": "df -h"}, "confidence": 1.0}`. The model answers the question and mislabels the envelope, and because `planner` is a *valid* route, the original normalization (`intent.py:200-208`) never touched it.

**The fix is now in the code** (`src/bantz/core/intent.py:209-236`): when `route=="planner"` but `tool_name` is a single registered tool and `tool_args` is a populated dict, trust `tool_name`. Guards: registry membership (so hallucinated agent-role names like `"researcher"` are NOT rescued), string type (so plan-shaped `tool_name` lists are NOT rescued), populated args.

**Measured result (`FULL_POST_FIX` in `eval/routing_eval_results.json`): 51% → 82%.** 34 of the 35 candidates rescued (one drifted under fresh temp-0 sampling); **3 regressions, all predicted in advance from the data**: two genuine multi-step requests whose JSON also named their first tool (pla02 "check email, *then* weather, *and* calendar" → demoted to gmail-only; pla03 "play X on yt music" → demoted to browser-open) and one both-acceptable case (url03). This is the article's honest tension: at the JSON level, gma01 ("check my email") and pla02 ("check my email, then…") emit *byte-identical* shapes — the rescue cannot discriminate them, so you trade 2 demoted plans for 34 rescued tool calls. Net +31 points. The residual 18 failures decompose cleanly: 5 chat-under-routes (inline-text summarize/contacts), 6 wrong-tool picks (mostly browser_control as the GUI hammer), 3 predicted regressions, plus drift/overlap singles.

Live confirmation of the underlying nondeterminism: in the re-run suite the same inputs ("bugün hava nasıl?", "firefox'u aç") routed correctly in one run and to planner in another 30 minutes apart (`eval/test_report_current.md`, tests 06/13).

## Key Code Artifacts

| Artifact | Location | Why it matters |
|---|---|---|
| `_ROUTING_HINTS` | `src/bantz/core/intent.py:35-68` | One-line-per-tool schemas — prompt budget discipline for 8B models |
| `COT_SYSTEM` rules | `src/bantz/core/intent.py:81-139` | The accumulated rule set incl. emotional/anti-false-positive blocks |
| `strip_thinking` | `src/bantz/core/intent.py:154-165` | Earliest-point reasoning-tag removal, handles unclosed tags (#214) |
| `_is_refusal` | `src/bantz/core/intent.py:176-183` | Strips thinking before refusal check (#282 false-positive fix) |
| `_extract_json` | `src/bantz/core/intent.py:188-209` | Normalizes llama3.1's route-field mistake |
| `_THINKING_MAX_TOKENS` / force-close | `src/bantz/core/intent.py:236, 330-336` | Bounded buffering for models that never close the tag |
| `_REMINDER_FAST`, `_CHAT_FAST` | `src/bantz/core/intent.py:372-396` | Pre-LLM regex fast-paths born from TEST_REPORT failures |
| `cot_route` retry + model fallback | `src/bantz/core/intent.py:467-545` | Two-attempt repair; routing-model 404 → main model |
| `quick_route` | `src/bantz/core/routing_engine.py:51-118` | Regex fast-path scoped to hardware controls only (#272, #340) |
| `execute_plan` single-step path | `src/bantz/core/routing_engine.py:383-388` | Fix for the `len(steps)<2` false-failure guard |
| `PLANNER_SYSTEM` | `src/bantz/agent/planner.py:32-216` | Prompt-as-scar-tissue exhibit (line 82 mid-prompt correction) |
| `_PLANNER_ALIASES` + validation | `src/bantz/agent/planner.py:357-392` | Deterministic repair of invented tool names |
| `REPLAN_SYSTEM` / `replan` | `src/bantz/agent/planner.py:218-246, 439-502` | Plan B generation with completed-step context (#216) |
| `_is_step_failure` | `src/bantz/agent/executor.py:105-122` | Catches success=True-with-error-text (#256) |
| `_inject_context` | `src/bantz/agent/executor.py:552-639` | Dict-level `$REF` binding; URL auto-extraction at :590-599 |
| `_attempt_replan` | `src/bantz/agent/executor.py:365-447` | Circuit breaker → one-shot Plan B with recursion guard |
| `hallucination_check` | `src/bantz/core/finalizer.py:340-394` | Final-layer fabrication detection (cameo; full treatment in article #3) |
| `TEST_REPORT.md` | repo root, lines 41-146 | Quantified live failure data (May), per-category root causes |
| Routing eval harness | `eval/routing_eval.py` | 100-case eval set, 8 configs, cached-response ablations |
| Eval results | `eval/routing_eval_results.json` | Accuracy table, defense attribution, raw model outputs per case, `FULL_POST_FIX` 82/100 with per-case rescue/regression lists |
| **The planner→tool_name rescue** | `src/bantz/core/intent.py:209-236` | The defense derived from the eval data: 51%→82%, +5 unit tests |
| Post-fix re-run driver | `eval/post_fix_rerun.py` | Measures the shipped extractor; guards against the editable-install import trap |
| Live re-run report | `eval/test_report_current.md` | Before/after vs May: strict 6→10/20, conversational latency −52% |
| Live re-run runner + raw data | `eval/test_report_runner.py`, `eval/test_report_run.json` | Reconstructed-input methodology, stream-consumption timing fix visible in git history |

## Gap Analysis

### Gap 1 — Routing accuracy numbers — **CLOSED 2026-06-10**
- **Delivered:** `eval/routing_eval.py` — 100 utterances (every one of the 24 registry tools ≥3 cases; sources: unit tests, TEST_REPORT live cases, COT_SYSTEM rule examples, new adversarial incl. Turkish, idioms, emotional). 8 configurations run end-to-end; results in `eval/routing_eval_results.json`, run log in `eval/routing_eval_run.log`.
- **Numbers:**

  | Config | Accuracy |
  |---|---|
  | **FULL_POST_FIX (all defenses + planner rescue, shipped)** | **82/100** |
  | FULL (all defenses, pre-rescue, temp 0) | **51/100** |
  | FULL_PROD (real `cot_route`, prod sampling) | 45/100 |
  | NAIVE (pre-defense baseline) | **5/100** |
  | − `_extract_json` normalization | 38/100 (−13) |
  | − two-attempt retry | 42/100 (−9) |
  | − fast-paths + quick_route | 41/100 (−10) |
  | − `<thinking>` stripping | 51/100 (−0) |
  | − refusal check | 51/100 (−0) |
  | − routing-model fallback | N/A (no separate routing model configured; defense can't fire — documented in results JSON) |

- **Key forensic finding:** 42/49 FULL failures are planner over-routes; **35/42 had the correct tool in `tool_name`** (route/tool_name disagreement). See outline section 8.
- **Methodology notes baked into the JSON:** temp 0 for determinism; LLM responses cached per (case, prompt, attempt) so ablation diffs are attributable purely to the ablated defense; NAIVE still regex-extracts the first `{...}` (a bare `json.loads` baseline would be a strawman); thinking-strip and refusal defenses scored 0 on this benign eval — they target thinking-tag models (e.g. deepseek-r1) and adversarial inputs not represented here. The article must state this rather than imply they're dead weight.

### Gap 2 — Re-run the 20-test live suite — **CLOSED 2026-06-10**
- **Delivered:** `eval/test_report_runner.py` + `eval/test_report_current.md` (before/after diff section at top) + raw `eval/test_report_run.json`.
- **Numbers:** strict pass 6/20 → **10/20**; functional pass 11/20 → **14/20**; conversational latency 14.4s avg → **6.9s (−52%)** — live confirmation of the #422 sentence-streaming fix (commit `cab0dc6`). May failures verified fixed live: tech news 69.4s→16.5s on the right tool, reminder 17.7s→0.9s via fast-path, venting 55.9s→7.6s chat, Turing 44.0s→4.8s chat.
- **Caveats the article must carry:** inputs reconstructed from labels (originals never committed); single run at production sampling — tests 06/13 demonstrably nondeterministic; new finding of recent-history bleed (tests 19–20 answered about the previous turn's topic) is a candidate issue to file.

### Gap 3 — Repo hygiene — **MOSTLY CLOSED 2026-06-10**
- **Done:** deleted `patch_test_routing{,_2,_3,_4}.py`, `patch_test_planner.py`, `pr_description.txt`; moved `tests/tui/` → `tests/_aspirational/tui/` with a pytest `--ignore` (collection now clean: 3086 tests); gitignored `pytest.log` (+ eval run log).
- **Still open (deliberately deferred — source deletions need their own pass):** `src/bantz/interface/tui/`, `src/bantz/tools/gui_tool.py`, `src/bantz/tools/mail.py`, stale TUI import in `llm/ollama.py`, stray root `package-lock.json`, `bantz-ui` build artifacts. ~2 hours when scheduled.
- **Severity of remainder:** WEAKENING only.

### Gap 4 — Verify cited line numbers at publish time (WEAKENING, trivial) — OPEN
- Re-grep all citations the day the draft is written; line numbers pinned to `85b762d` and today's session added `eval/` without touching `src/`, so drift risk is currently nil. 1 hour at draft time.

### Gap 5 — Ship the route/tool_name defense and re-measure — **CLOSED 2026-06-10**
- **Shipped:** rescue in `src/bantz/core/intent.py:209-236` with debug log line; 5 unit tests added to `tests/core/test_intent.py` (fires for known tool; skips unknown tool, empty/missing/`"planner"` tool_name, empty args, list-shaped tool_name). Full `tests/core/test_intent.py` + `test_routing_engine.py`: 127 passed (122 pre-fix baseline preserved).
- **Measured:** `FULL_POST_FIX` = **82/100** (pre-fix 51/100; projection was ~86 — delta explained by 1 sampling-drift case and the 3 predicted regressions). Rescued 34 planner over-routes; 3 regressions, all identified *before* implementation from the genuine-planner JSON shapes (pla02/pla03/url03 — see section 8). Appended to `eval/routing_eval_results.json` as `FULL_POST_FIX` alongside untouched pre-fix results, with per-case rescue/regression lists under `vs_prefix_FULL`.
- **Methodology trap worth a footnote in the article:** `bantz` is pip-installed editable from a *separate clone* (`~/.local/share/bantz/src`), which shadows the repo's `src/` for plain `python3` — the first post-fix run silently measured the unfixed installed copy (0 rescues, and an accidental exact reproduction of the 51/100 baseline, confirming temp-0 determinism). `eval/post_fix_rerun.py` now hard-fails unless `bantz.core.intent` resolves to the repo tree.

## Prerequisites
None from other articles. This is the lead article; its eval harness (Gap 1) is a shared asset that articles #2 and #4 reuse.

## Estimated Total Work to Publish
**Q1 now — drafting can start immediately.** All blocking gaps closed 2026-06-10. Optional pre-draft work: Gap 5 (ship the route/tool_name defense + re-measure, 2–3 h) and the Gap 3 remainder (source-module deletions, ~2 h). Gap 4 (citation re-grep) happens at draft time.

## Draft Hook
> The first time I asked my assistant "what's my CPU usage," it Googled it. Not metaphorically — it routed the question to web search, scraped a tutorial about Task Manager, and read it to me in the voice of a 1920s butler. The router was llama3.1:8b running on my own GPU, and it had just demonstrated the first of about nine distinct failure modes I would spend the next four months cataloging. Every function-calling tutorial I'd read worked perfectly — because every tutorial quietly assumed a frontier model that papers over malformed JSON, invented tool names, and reasoning tags that never close. My router didn't get a frontier model. It got 8 billion parameters and a defense system. Here is every layer of it, with the issue number where each one was born.

## Notes & Risks
- **Scope creep is the #1 risk.** The material supports five articles; this one must stay at the routing/execution layer. The translation war story is article #2 (fold in only test 08/16's translated-routing examples); the hallucination guard gets a cameo, not a section.
- **Ablation results WERE embarrassing in the useful way (resolved 2026-06-10):** thinking-strip and refusal-check ablations moved accuracy by exactly 0 on this eval. The article must frame them as defenses for inputs the eval doesn't contain (thinking-tag models like deepseek-r1; adversarial/refusal-bait requests) — with the #282/#214 issue history as evidence they fire in the wild — rather than quietly omitting the zeros.
- **The 51% mid-story number cuts both ways.** It's honest and it powers the section-8 discovery, but a skim-reader may take away "his router is a coin flip." Mitigations: the arc is now measured end-to-end as **5% → 51% → 82%** — lead with the full progression, show the category sweep (everything except single-tool dispatch at 100% even pre-rescue), and present the 3 predicted regressions as the cost the data forecast before the fix was written.
- **llama3.1:8b is aging.** A reviewer may say "just use qwen3 / a newer model." Pre-empt: the point is the *failure taxonomy*, which transfers; also the routing-model abstraction (`BANTZ_OLLAMA_ROUTING_MODEL`, `intent.py:471`) means the stack is model-agnostic by design.
- The repo is public under `miclaldogan/bantzv2` — verify there's nothing sensitive in `.env.example` and the demo GIFs before driving traffic.
