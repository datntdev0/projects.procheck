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
| Storage boundary | **Application data** → `%LOCALAPPDATA%\Procheck\` (settings.json, projects.json registry, cli\, logs\, cache\). **Project data** → the directory chosen for the project (procheck.json, sources\, artifacts\, board\, .procheck\chats, .procheck\runs, .procheck\home\<cli> (isolated HOME), .procheck\worktrees, .procheck\settings.json). See `PC.data.storage`. |
| Workspace | **No "workspace" concept.** A project = a directory. Never use the word "workspace" in UI. |
| Settings | `settings.html` = **App settings** (stored in LOCALAPPDATA). `project-settings.html` = **Project settings** (stored in the project directory). |
| Language | Bilingual EN / VI with toggle (persisted). |
| Theme | Follows OS by default; Light / Dark override (persisted). |
| Brand | KMS Brand FY27 — Poppins, Electric Blue `#006AFE`, Dark Blue `#245DB3`, Sky `#62CCFE`, accents Magenta `#FE006A` · Purple `#6A26F1` · Teal `#02CCB3`; 60/30/10. Procheck sub-brand = KMS Sun Mark + "Procheck". |

## Files

```
_proto/
  DESIGN.html            Design system
  index.html             All projects (cross-project overview)
  new-project.html       New project wizard (?mode=open → open an existing project folder)
  overview.html          Project overview: phases, metrics (incl. sprint/agent metrics), activity
  initial.html           Initial phase: meetings, clarifications, requirements, scope, artifacts pipeline
  scaffolding.html       Scaffolding phase: linked repo, scaffolding plan & agent generation
  board.html             SDLC board (kanban) — no metrics, no assignees
  task.html              Task detail: solution → plan → agent run in worktree → review evidence → PR
  artifacts.html         Sources & generated artifacts, editor/preview, export
  assistant.html         Full-page Assistant with chat history
  settings.html          App settings (%LOCALAPPDATA%\Procheck)
  project-settings.html  Project settings (<project dir>\.procheck\settings.json)
  assets/ tokens.css · components.css · shell.css · app.js · kms-*.svg
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
- `data-page` ids — project sidebar: `overview`, `artifacts`, `assistant`, `initial`, `scaffolding`, `board`, `task`, `project-settings`; app sidebar: `home`, `new-project`, `open-project`, `settings`, `design`.
- `PC.project()` = current project (switchable via breadcrumb, `?p=<id>`, persisted). Use `p.dir`, `p.repo`, `PC.projectHome('claude')` for paths. `PC.data.agents`, `PC.data.storage`, `PC.data.cli`.
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
