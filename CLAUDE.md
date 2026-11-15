# CLAUDE.md — Project Intelligence Hub

This file is the single source of truth for Claude Code in this project.
Whenever code, logic, or flow changes — update the relevant README(s) listed below **in the same
operation**.

---

## Project type

**Language:** Windows PowerShell 5.1 (`switch-github.ps1` CLI, `switch-github-core.ps1` shared functions with inline C# via `Add-Type`, `switch-github-ui.ps1` localhost API server) + Python 3 stdlib (`vscode_secret.py`) + React 18 / TypeScript / Vite (`web/`, the UI)
**Package manager:** npm, for `web/` only (React, Vite, TypeScript). The PowerShell / Python side has no third-party dependencies by design
**Platform:** Windows only (Credential Manager, DPAPI, `%APPDATA%` layouts)

This project is a **GitHub account switcher for one Windows user**. One command switches the
active GitHub account across the gh CLI, git (identity + Git Credential Manager), GitHub Desktop
and VS Code. Each account's tokens are backed up in Windows Credential Manager, and each app's
sign-in state is snapshotted per profile and swapped in on switch. No existing tool did all of
this — see `readme/RESEARCH.md`.

---

## README registry

All READMEs live in the `readme/` directory at the project root.

### Core documentation

| Path | Covers |
|---|---|
| `README.md` | Project overview (portfolio), how it works, quick start, CLI usage, requirements |
| `PROJECT_STRUCTURE.md` | File tree, module map, conventions, tool versions |
| `readme/ARCHITECTURE.md` | Where each app stores its login, components, switch lifecycle, known limitations |
| `readme/RESEARCH.md` | Survey of existing switcher tools (2026-10-30) and why this project exists |
| `docs/DOC_SYNC.md` | **MANDATORY** — which docs to update when adding / modifying / removing code |
| `docs/index.html` | Public GitHub Pages site (SEO landing page, served from `main` `/docs`); repeats README facts, so it changes with them |

### Folder-based documentation

| Folder | Covers | Naming convention |
|---|---|---|
| `readme/flows/` | End-to-end command flows | `<command>.md` |
| `readme/methods/` | Helpers and storage reference | `<domain>.md` |

### Registered flow / method docs

| Path | Covers |
|---|---|
| `readme/flows/switch.md` | `.\switch-github.ps1 <profile>` — ordering, token restore, app swap, failure behavior |
| `readme/flows/save.md` | `-Save <profile>` — Desktop snapshot, VS Code session, token backup |
| `readme/flows/clear.md` | `-Clear` + the full add-an-account procedure (CLI) |
| `readme/flows/ui.md` | `-Ui` web page — identity panel, profiles + Switch, add-account steps, activity log |
| `readme/methods/credential-store.md` | `CredStore` (C# P/Invoke), `Backup-Tokens` / `Restore-Tokens`, token target names |
| `readme/methods/vscode-session.md` | `vscode_secret.py`, VS Code DB locations, secret key, how to re-find it after a VS Code update |
| `readme/methods/desktop-state.md` | Desktop `Local Storage`, `Get-DesktopLogin`, `Stop-App` / `Start-Apps` / `Invoke-WithAppsClosed`, `Copy-Folder` |
| `readme/methods/profiles.md` | `accounts.json` schema, data-dir layout, `Get-Account`, `Set-AccountProfile` (one profile per GitHub login/email), `Read-AccountProfiles`, `Remove-AccountProfile` (+ opt-in `Remove-CliLogin`), `Get-ActiveProfile`, `Get-LoginState`, `Get-SwitcherStatus`, `Show-Status` |
| `readme/methods/ui-server.md` | `switch-github-ui.ps1` (HttpListener, per-run token, API routes, `Invoke-UiAction`) and the React client file map |

---

## Plugins & Skills

No vendored plugins — a small tool with no PR flow yet.

### Project-specific skills

| Skill file | Purpose |
|---|---|
| `.claude/skills/readme-sync/SKILL.md` | README update checklist + this repo's doc map and high-frequency traps |

---

## Sync rules for Claude

**Full additions / modifications / removals matrix lives in [`docs/DOC_SYNC.md`](./docs/DOC_SYNC.md).
Read it before any code change.**

Quick reference:

1. **Before editing any file** — read the relevant doc in `readme/flows/` or `readme/methods/`.
2. **After editing any file** — update the corresponding `readme/` file in the SAME change.
3. **When adding a new command / flow** — create `readme/flows/<command>.md` AND register it above.
4. **When adding a helper domain** — create or update `readme/methods/<domain>.md`.
5. **Never leave a README out of date** — stale README = bug.
6. **No per-directory READMEs** — flows and methods only, in `readme/`.
7. **One flow per file** — never merge unrelated flows.

The Stop hook `.claude/hooks/check-readme-sync.sh` blocks a turn that edited `*.ps1` / `*.py`
without touching `readme/`.

---

## Hard rules (switcher-specific)

1. **Never print, log, or write a token in clear text.** Token bytes only travel between
   Credential Manager entries (`CredStore`) and stay in memory. Output shows target names and
   user names only. The VS Code snapshot is the value VS Code already encrypted — never decrypt it.
2. **Never sign out to switch.** "Sign out" in Desktop / VS Code and `gh auth logout` /
   `git credential-manager github logout` **delete the token**. Use `-Clear`, which moves state aside.
   The one exception is deleting a profile with the opt-in "Also sign out of GitHub CLI and Git" box
   ticked (`Remove-AccountProfile -SignOut` -> `Remove-CliLogin`): the user asked for that account to
   be removed from this PC. Off by default.
3. **gh switches first, before any change.** It is the step most likely to fail (account not
   logged in to gh); failing there must leave git config, tokens and app state untouched. Keep
   that ordering in `readme/flows/switch.md` in sync.
4. **Back up every profile's tokens before restoring.** A restore can overwrite an entry another
   account holds (e.g. `git:https://github.com`). The pre-switch backup is what makes that lossless.
5. **Restore only when the entry is missing or held by another user.** An entry already owned
   by the target user may be fresher than the backup — never overwrite it.
6. **Apps must be fully closed before their storage is touched.** Desktop writes `Local Storage`
   on exit; VS Code keeps its state DB in memory and flushes on exit. Close with
   `CloseMainWindow()` (normal close, unsaved-work prompts apply) — **never** `Stop-Process`/kill.
7. **VS Code's secret location is undocumented and has moved before.** As of VS Code 1.144 it is
   `%USERPROFILE%\.vscode-shared\sharedStorage\state.vscdb`, key
   `secret://{"extensionId":"vscode.github-authentication","key":"github.auth"}` — not Credential
   Manager, not the global `state.vscdb`. After a VS Code update, re-verify per
   `readme/methods/vscode-session.md` before trusting the VS Code part.
8. **Snapshots are bound to this Windows user on this machine.** VS Code's value is encrypted with
   a DPAPI-protected key; Credential Manager entries are per-user. Never copy them to another machine.
9. **`gh:github.com:` (no user) is gh's active-account entry.** It has an empty user name, so the
   per-user backup filter skips it on purpose; `gh auth switch` rewrites it.
10. **Windows PowerShell 5.1 compatibility is required.** No `&&`/`||`/`??`/`?.`; `Add-Type` C# is
    C# 5 (no `$""`, no `out var`); a `$null` passed to a .NET `string` parameter arrives as `""`
    (handled inside `CredStore.List`); never name a parameter `$Profile` (automatic variable); no
    global `$ErrorActionPreference = 'Stop'` (native `2>$null` then throws `NativeCommandError`) —
    use `-ErrorAction Stop` per file operation; wrap filtered lists in `@()` (a single result is a
    scalar and `[0]` would index a string's characters).
11. **Never pass double-quoted text to a native exe from PS 5.1.** Embedded `"` are stripped —
    that is why the VS Code key lives inside `vscode_secret.py`, not on the command line.
12. **No new dependencies.** PowerShell built-ins + inline C# + Python stdlib only; Python runs
    with `python -I`. `web/` may use React, React DOM, Vite and TypeScript (+ their types) — no UI
    kits, state libraries or HTTP clients. Never run `npm run build` / `vite build` yourself
    (global rule): verify with `npm run check` and the dev server, the user builds.
13. **One implementation per operation.** Save / clear / switch live once in
    `switch-github-core.ps1` (`Save-ProfileState`, `Clear-AppState`, `Switch-Profile`, wrapped by
    `Invoke-WithAppsClosed`). The CLI and the UI server only call them — never copy their logic
    into either entry point, and never into the React code.
14. **Script files stay ASCII.** Windows PowerShell 5.1 reads a `.ps1` without BOM as ANSI, so a
    non-ASCII character in a string prints garbled.
15. **The UI API stays local and keyed.** `HttpListener` prefix `http://localhost:<port>/` only
    (never `+`, `*` or an IP — other hosts must keep getting `400`), and every `/api/` route checks
    the per-run `X-Switcher-Token`. Never add CORS headers. GitHub tokens never appear in an API
    response.

---

## Known limitations

Documented in `readme/ARCHITECTURE.md` §"Known limitations". Do not treat these as bugs to fix
incidentally — they are known, and removing them means updating the docs that describe them:

- Copilot's per-extension account preference (`github.copilot-github` in VS Code's global state) is not swapped
- `-Save` cannot verify which account the VS Code session belongs to (it is encrypted)
- No save-back: a switch restores the snapshot taken at `-Save` time
- The web UI's VS Code row shows only whether *a* session exists, not whose
- Desktop's repository list is shared by all profiles (background fetch of a repo the active account cannot see logs "Repository not found")
---

## Rules reference

All standing instructions live in `.claude/RULES.md`, auto-injected each session by the
`SessionStart` hook in `.claude/settings.local.json`. Read it at the start of every session.
