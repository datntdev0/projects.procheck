# Procheck — HTML/CSS/JS prototype

Clickable prototype for **Procheck** (local desktop app, Tauri + Angular later). Pure HTML/CSS/JS, no build step.
Open `index.html` in a browser (double-click works; `npx serve _proto` is nicer).

## Product decisions (confirmed with product owner)

| Topic | Decision |
|---|---|
| Phases | **Initial → Scaffolding → SDLC** (phase id for Scaffolding stays `release` in code/tokens; label is always "Scaffolding"). Each phase has its own screen: `initial.html`, `scaffolding.html`, `board.html`. |
| Window chrome | **Native OS title bar** (min / max / close drawn by the OS). The app never renders custom window controls. |
| Layout | Full-height **sidebar** (no icon rail) · in-app **topbar** with breadcrumb, search, language, theme, Assistant toggle · canvas · Assistant panel (`Ctrl J`). |
| Navigation | Cross-project overview via breadcrumb: **Projects** (→ `index.html`) **/ Project ▾** (switcher) **/ Page**. |
| Chrome colors | Sidebar/topbar follow the selected theme (`--bg-sidebar`, `--bg-topbar`) like native chrome — no fixed navy. |
| People | **Single user, local PC.** There is only **me** ("You") and **agents** (Claude Code, Codex). No assignees, members, reviewers or teams. |
| Storage boundary | **Application data** → `%LOCALAPPDATA%\Procheck\` (settings.json, projects.json registry, cli\, logs\, cache\). **Project data** → the directory chosen for the project (procheck.json, sources\, artifacts\, board\, repository\ (git repo with source code, when kept inside), .procheck\chats, .procheck\runs, .procheck\cli\<cli> (project CLI profile), .procheck\worktrees, .procheck\settings.json). See `PC.data.storage`. |
| CLI isolation | **Procheck CLI home, isolated context.** Connecting a CLI = running its exe with a **CLI home in application data**: `%LOCALAPPDATA%\Procheck\cli\<cli>\`, set through the CLI's home variable (`CLAUDE_CONFIG_DIR`, `CODEX_HOME`). Procheck's sign-in (`claude auth login`, `codex login` run inside that home), base config and sessions live there; the user's own profile (`~/.claude`, `~/.codex`) is never read or changed, and credential env vars (`ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, …) are not passed. `HOME` / `USERPROFILE` stay unchanged so git, ssh and npm keep working. The user signs in once in **App settings → Agent Integration** and every project reuses it. Per project, Procheck isolates the context of each launch: cwd = project dir (Assistant) or worktree (agents) · project CLI profile in `.procheck\cli\<cli>\` (settings, MCP servers, instructions — no credentials) · shared CLI-home config ignored by default · `--resume` only with session ids recorded in the project · env allowlist. See `PC.cliHome`, `PC.cliEnv`, `PC.projectCli`, `PC.cliFlags`. |
| Chat scopes | **Project chats** (`<project dir>\.procheck\chats`, cwd = project dir) and **General chats** (`%LOCALAPPDATA%\Procheck\chats`, cwd = empty `%LOCALAPPDATA%\Procheck\scratch`, app-level CLI profile, Ask mode only, no artifacts). The project sidebar has no Chats group (Project: Overview, Artifacts, Sources; Workflow: Initial, Scaffolding, SDLC board, Agent runs); chats are reached from the Assistant panel and **All chats**; `assistant.html?scope=general` opens general chats in the app (home) shell. A general chat can be **moved to a project**. |
| Usage display | Assistant shows **context window** (last reply's prompt size / model window) and **usage limits** (5-hour + weekly, per CLI account). Updated **at the end of each reply**, not realtime. See *Usage telemetry* below. |
| Phase customization | Defined per project in **Project settings → Customization**, one tab per phase (Initial phase, Scaffolding, SDLC): a phase prompt (moved here from AI overrides), then steps (SDLC: task stages) with free-text instructions and artifacts; Scaffolding and SDLC steps can be turned off (`assets/workflow.js`, `PC.workflow` / `PC.workflow.phase(id)`; stored in `.procheck\settings.json` → `customization`, templates in `.procheck\templates\`). Deliberately loose: each step has **free-text instructions** for the Assistant and a list of **artifacts = name + optional template file of any document type**. No roles, dependencies or locks. Procheck default: Discovery produces **Meeting notes** (factual record per meeting: attendees, discussion, decisions, action items) and a **Discovery report** (one synthesis of all meetings + client documents: findings by theme with citations, conflicts, open questions, requirement candidates); every other step has one artifact (Business requirements, Scope definition, Effort estimation, SOW). **Implemented in the app (Initial phase only):** templates are Markdown only (`.md`, ≤ 1 MB); each project picks a **document language** (VI / EN) in the New project wizard, and the bundled defaults of that language (`desktop/resources/defaults/initial/{vi,en}/`: phase prompt, step instructions, artifact names, 5 templates) are seeded into `.procheck\settings.json` and `.procheck\templates\initial\<artifact id>.md` when the project is created. Scaffolding and SDLC customization are not implemented yet (hidden in the app). The Discovery tab shows one card per artifact of the step with live coverage, a preview built from the current sources and Generate / Update with AI. A step is done when its artifacts are approved; on the Overview each Phase progress card has **Generate / Update with AI** for the whole step; approval happens on the artifact itself. |
| Sources | `sources.html` is a **table**, not a preview: name, type, size, added, Assistant access, used in. **Any file type** can be added (files, folders or drag-and-drop anywhere on the page). Each kind has a read mode: text extracted, transcribed (audio/video), image read, parsed as data, read as code, unpacked (archives) or **stored only** (no reader, e.g. `.fig`). Extracted content goes to `.procheck\index\`. Registry and per-project data: `assets/sources.js` (`PC.srcKinds`, `PC.srcKindOf`, `PC.sources()`). |
| Workspace | **No "workspace" concept.** A project = a directory. Never use the word "workspace" in UI. |
| Settings | `settings.html` = **App settings** (stored in LOCALAPPDATA). `project-settings.html` = **Project settings** (stored in the project directory). |
| Language | Bilingual EN / VI with toggle (persisted). |
| Theme | Follows OS by default; Light / Dark override (persisted). |
| Brand | KMS Brand FY27 — Poppins, Electric Blue `#006AFE`, Dark Blue `#245DB3`, Sky `#62CCFE`, accents Magenta `#FE006A` · Purple `#6A26F1` · Teal `#02CCB3`; 60/30/10. Procheck sub-brand = KMS Sun Mark + "Procheck". |

## Visual direction — enterprise, flat (binding)

The UI reads as a dense, calm enterprise tool, not a marketing page. `overview.html` is the reference implementation.

1. **One level of containers.** A bordered panel (`.card` / `.panel`) never contains another bordered box. Inside a panel, split content with rules: `.panel-head`, `.panel-section`, `.rows > .row-item`, `border-top: 1px solid var(--border-subtle)`. `components.css` flattens `.card .card` as a safety net, but don't rely on it: fix the markup.
2. **Figures go in a strip, not in cards.** A row of KPIs is one `.stat-strip` (cells divided by vertical rules); no icon tile per figure.
3. **Columns, not card grids.** Related items side by side (phases, steps, options) share one panel with columns divided by rules. Repeating entities (projects, tasks, files) are table or list rows; board columns are the only place where items are small cards, and they sit directly on the column background.
4. **No gradients, no hero panels, no glow.** Page tops use `.page-head` (title, meta line, actions, bottom rule). Shadows only on floating layers (menus, modals, toasts).
5. **Icons are plain glyphs.** No colored square/circle icon tiles behind icons in lists, headers or stats; color an icon only when it carries status (success / warning / danger).
6. **Status = small square badges** (`.badge`, 2px radius). Pills only for removable filter chips.
7. **AI actions are not special-colored.** `.btn-ai` is a secondary button with a brand-colored sparkle; add `.is-primary` only when it is the page's main action. Never several primary buttons in one view.
8. **Notices** use a flat bar with a 3px tone stripe on the left (`.alert-*`, `.focus`), never a tinted gradient.
9. **Sizes**: radius 2–8px (`--radius-*`), control height 32px (26px small), H1 22px, section titles 13.5px semibold.

## Files

```
_proto/
  DESIGN.html            Design system
  splash.html            Startup splash (no chrome): checks bundled Git / Claude Code / Codex in the data folder, downloads Git only (required); CLIs are downloaded in Settings → Agent integration. ?state=checking|missing|running|failed|ready. Git version is frozen (no update flow)
  index.html             All projects (cross-project overview)
  new-project.html       New project wizard (?mode=open → open an existing project folder)
  overview.html          Project overview: phases, metrics (incl. sprint/agent metrics)
  initial.html           Initial phase, tabs (#overview #discovery #clarifications #requirements #milestones #estimation). Overview = phase progress (AI actions per step) + gate; Discovery = meetings + client documents -> findings register with citations and conflicts
  scaffolding.html       Scaffolding phase: linked repo, scaffolding plan & agent generation
  board.html             SDLC board (kanban) — no metrics, no assignees
  task.html              Task detail: solution → plan → agent run in worktree → review evidence → PR
  artifacts.html         Generated artifacts, editor/preview, export (?gen=<source ids> opens Generate)
  sources.html           Uploaded sources as a table: filters, bulk actions, details panel, upload any file type (?upload=1)
  assistant.html         Full-page Assistant with chat history
  settings.html          App settings (%LOCALAPPDATA%\Procheck)
  project-settings.html  Project settings (<project dir>\.procheck\settings.json), incl. Customization: per-phase prompt + steps with instructions and artifacts (template files)
  assets/ tokens.css · components.css · shell.css · app.js · sources.js · workflow.js · kms-*.svg
```

## Page contract

```html
<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
  <title>SDLC board · Procheck</title>
  <link rel="stylesheet" href="assets/tokens.css">
  <link rel="stylesheet" href="assets/components.css">
  <link rel="stylesheet" href="assets/shell.css">
  <script src="assets/app.js"></script>
  <script defer src="https://unpkg.com/lucide@0.468.0/dist/umd/lucide.min.js"></script>
  <style>/* page-only styles, tokens only */</style>
</head>
<body data-page="board" data-shell="project" data-crumb="nav.board">
  <main class="canvas"><div class="canvas-inner"> … </div></main>
  <script>
    PC.i18n.extend({ en: { … }, vi: { … } });
    PC.onReady(() => { /* render, then PC.refresh(el) */ });
    document.addEventListener('pc:lang', () => { /* re-render dynamic text */ });
  </script>
</body>
</html>
```

- `data-shell`: `project` (project sidebar) · `home` (app sidebar: all projects, new/open project, recent projects) · `none` (no chrome).
- `data-page` ids — project sidebar: `overview`, `artifacts`, `sources`, `assistant`, `initial`, `scaffolding`, `board`, `task`, `project-settings`; app sidebar: `home`, `new-project`, `open-project`, `settings`, `design`.
- `PC.project()` = current project (switchable via breadcrumb, `?p=<id>`, persisted). Use `p.dir`, `p.repo`, `PC.projectCli('claude')` for paths and `PC.cliFlags('claude')` for CLI launch lines. `PC.data.agents`, `PC.data.storage`, `PC.data.cli`.
- i18n: `data-i18n`, `-placeholder`, `-title`, `-tip`, `-html`; dynamic text via `PC.t()` + `pc:lang`. Shared keys: `phase.release` = "Scaffolding", `nav.scaffolding`, `nav.board` = "SDLC board", `storage.app`, `storage.project`.
- Helpers: `PC.toast`, `PC.modal`, `PC.popover`, `PC.assistant.setContext / seed / setSuggestions / reply`, `PC.esc`.
- Only semantic tokens so both themes work.

## Sample projects = lifecycle states (binding)

Every project page renders from `PC.project().state` (defined in `assets/app.js`, `STATES`). Never assume the current project is in SDLC. Use `PC.phaseStatus('initial'|'release'|'sdlc')` → `locked | not_started | in_progress | done`, and `PC.L({en,vi})` for localized state text.

| Project (`?p=`) | Initial | Scaffolding | SDLC | What it demonstrates |
|---|---|---|---|---|
| `saigon-tms` | **in_progress — just started** (1 meeting, 2 sources, 0 artifacts, 0 questions) | locked | locked | Empty states, first-run guidance |
| `viethealth` | **in_progress — scoping** (BRD v1 in review, scope draft, 5 open / 2 blocking questions) | locked | locked | Mid-phase work, blockers, review states |
| `mekong` | done | **in_progress** (existing brownfield repo, ADR-004 awaiting approval, agent running CI/CD step 4/6) | locked | Live agent run, approval gate, brownfield repo |
| `lotus-pay` | done | done | **in_progress — sprint 4** (LP-142 in human review) | Healthy SDLC, review & promote PR |
| `atlas-hr` | done | done | **in_progress — release hardening** (AH-311 agent run FAILED 6/9 e2e, AH-298 changes requested) | Failure & recovery states |

Locked phase screens show a **locked state**: what the phase does, the gate/prerequisites (`state.<phase>.gate`), progress of the previous phase, and a CTA to the phase that must be finished. Phase-specific metrics only appear when the phase has data.

## Usage telemetry (context window & quota) — feasibility

Verified on 2026-11-23 with Claude Code 2.1.330 and codex-cli 0.168.0. Everything is read **at the end of a turn**, so no polling is needed.

| Data | Claude Code | Codex |
|---|---|---|
| Context used (last reply) | `result.usage`: `input_tokens + cache_read_input_tokens + cache_creation_input_tokens` (+ `output_tokens`). Also on every `assistant` line of the transcript JSONL. | `token_count.info.last_token_usage`: `input_tokens` (`cached_input_tokens` is a subset) + `output_tokens` |
| Context window size | `result.modelUsage[<model>].contextWindow` | `token_count.info.model_context_window` (e.g. 258400) |
| Usage limits | `rate_limit_event.rate_limit_info.unifiedWindows.five_hour / seven_day` → `utilization`, `resetsAt`, `status` (`claude -p --output-format stream-json --verbose`) | `token_count.rate_limits.primary / secondary` → `used_percent`, `window_minutes`, `resets_at`, `plan_type` (rollout file `~/.codex/sessions/YYYY/MM/DD/rollout-*-<thread_id>.jsonl`) |
| Chat totals / cost | `result.total_cost_usd`, `modelUsage[*].costUSD` | `token_count.info.total_token_usage` (no cost) |

**Recommended capture path.** Procheck spawns the CLI itself, so the main source is its own output: parse `result` and `rate_limit_event` from Claude's `stream-json`, and after Codex's `turn.completed` read the last `token_count` line of that thread's rollout file (`thread.started.thread_id` gives the file). Use the **Stop hook** only for runs Procheck does not parse, such as an interactive TUI or an agent in a worktree. Put it in the project CLI profile and have it append one line to `.procheck\runs\usage.jsonl`:

- Claude `Stop` hook stdin = `session_id, transcript_path, cwd, last_assistant_message, …`. It has **no usage fields**, so the hook reads the last `assistant` usage from `transcript_path`. Context is available that way, but the window size and the limits are not, so keep the last values from the stream.
- Codex `hooks` is a stable feature. Hooks need persisted trust, or `--dangerously-bypass-hook-trust` for automation. The Stop payload is not verified yet. Fallback: the `notify` program on `agent-turn-complete` plus the rollout file.

**Not recommended:** calling the undocumented OAuth usage endpoint. It needs the CLI's credentials, which breaks the "no credentials" rule.
**Still to check:** whether Claude's `utilization` is a 0–1 fraction or a percentage. Compare it with `/usage` before display. The Codex free plan reports one monthly window (`window_minutes` 43200).
