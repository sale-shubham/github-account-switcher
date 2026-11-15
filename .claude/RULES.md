# .claude/RULES.md — Standing Instructions

Read this file at the start of every session.
These rules apply to every task in this repository without exception.

Same policy and section order as the author's other repositories, with this repo's languages
(PowerShell 5.1 + Python stdlib + a React/TypeScript UI in `web/`) and hard rules. Shared sections
(docs sync, git workflow, tickets, PR review) are intentionally identical in spirit.

---

## 1. Documentation sync (mandatory)

- All documentation lives in the `readme/` directory at the project root.
- Before touching a file, read the corresponding flow or method README in `readme/`.
- After any code change, update the corresponding README in `readme/`.
- After adding a new command or helper domain, create `readme/flows/<command>.md` or `readme/methods/<domain>.md` and register it in `CLAUDE.md`.
- `CLAUDE.md` must be updated whenever a new README is added.
- **No per-directory or per-module READMEs**: do not create `README.md` files in inner folders. All documentation in `readme/`.
- Full matrix: `docs/DOC_SYNC.md`.

---

## 2. Package hygiene

- **No third-party dependencies** on the PowerShell / Python side. PowerShell built-ins, inline C# (`Add-Type`, .NET Framework), and the Python standard library only.
  - HTTP server: `System.Net.HttpListener` — not a module, not Node.
  - `web/` (npm): `react`, `react-dom`, `vite`, `@vitejs/plugin-react`, `typescript`, `@types/react*` only. Plain CSS, `fetch`, inline SVG icons — no UI kit, CSS framework, icon package, router or HTTP client. `package-lock.json` is committed.
  - SQLite: Python's built-in `sqlite3` (via `vscode_secret.py`) — not `sqlite3.exe`, not `System.Data.SQLite`, not a PowerShell module.
  - Credential Manager: `CredStore` (advapi32 P/Invoke) — not `cmdkey` (cannot read secrets, and fails on some target names), not the `CredentialManager` PowerShell module.
  - JSON: `ConvertFrom-Json` — no other parser.
- Never add a second tool that does the same job as an existing one.

---

## 3. Git workflow

Git repository since 2026-11-14 (public on GitHub). Shared policy:

### Default branches
- `main` — stable
- `dev` — integration branch; all features merge here first

### Committing
- **Never commit on behalf of the user.** Stop and let the user review the diff before committing.
- Conventional commit messages: `feat:`, `fix:`, `refactor:`, `docs:`, `chore:`, `test:`
- Include a short body describing *why*, not just *what*.
- **Never commit `accounts.json`** (personal names/emails) — it is gitignored; `accounts.example.json` is the template.

### Pull requests
- Target branch is always `dev` (never `main` directly).
- PR title format: `[TYPE] Short description`
- **Never self-merge.**

---

## 4. PR review instructions

1. Run `/code-review` for any diff.
2. **Project-specific gates (always check):**
   - Any output, log line or file write that could contain a token value (hard rule 1 in `CLAUDE.md`).
   - Any reordering of the switch steps that lets a change happen before `gh auth switch` succeeds.
   - Any use of `Stop-Process`, `taskkill`, or app "sign out" / `logout` commands.
   - Any restore that skips the pre-switch backup of all profiles.
   - PowerShell 7-only syntax or C# 6+ inside `Add-Type`.
   - Missing README/doc updates per the doc-sync policy (§1).

---

## 5. GitHub tickets

When asked to create a ticket (GitHub issue), once a GitHub repo exists:
- Title: concise, action-oriented
- Body: **Context**, **Acceptance criteria**, **Notes** (optional)
- When creating a PR for work with a ticket, link with `Closes #N`.

---

## 6. Code style

- Follow the existing pattern in the file you are editing.
- PowerShell: `Verb-Noun` function names, approved verbs where they fit (`Get-`, `Set-`, `Save-`, `Clear-`, `Backup-`, `Restore-`, `Stop-`, `Start-`, `Copy-`, `Show-`). Script-level paths and flags are `$camelCase` variables defined once at the top.
- Errors: `throw` with a message that tells the user the next command to run (see the `gh auth login` and `-Save` messages). Non-fatal problems: `Write-Warning`.
- Python: one short module docstring, stdlib only, exit codes as the contract with the PowerShell caller (`3` = no session).
- Comments explain **why**, not what — one line above the non-obvious block. The existing ones (gh-first ordering, backup-before-restore, `gh:github.com:` skip, LevelDB login scan) are the model.
- No commented-out code.
- **Reuse before creating.** Before writing a helper, check `switch-github-core.ps1`: `$loginPattern`, `Read-AccountProfiles`, `Get-Account`, `Set-AccountProfile`, `Remove-AccountProfile`, `Remove-CliLogin` (opt-in delete only, never in a switch), `Set-GitIdentity`, `Get-ActiveProfile`, `Backup-Tokens`, `Restore-Tokens`, `Get-LoginSpelling` (gh matches logins case-sensitively; never pass a typed login to `gh auth switch`), `Get-DesktopLogin`, `Save-VSCodeSession`, `Set-VSCodeSession`, `Clear-VSCodeSession`, `Test-VSCodeSession`, `Stop-App`, `Start-Apps`, `Invoke-WithAppsClosed`, `Copy-Folder`, `Get-LoginState`, `Get-SwitcherStatus`, `Show-Status`, the operations `Save-ProfileState` / `Clear-AppState` / `Switch-Profile`, and `[CredStore]::List/Write/Delete`.
- **Entry points stay thin.** `switch-github.ps1` (CLI) and `switch-github-ui.ps1` (API server) call core functions; logic goes in the core. The React code only displays state and calls the API - it never decides how a switch, save or clear works.
- **API responses go through `Send-UiJson`; actions through `Invoke-UiAction`** so every printed line reaches the Activity log. Return `List.ToArray()`, not `@($list)` (PS 5.1 `ConvertTo-Json` bug).
- **React:** function components + hooks, TypeScript strict, one component per file in `web/src/components/`, types for every API response in `web/src/api.ts`. Colors only through the CSS variables in `styles.css` (light + dark). Dialogs are native `<dialog>` with `showModal()`.
- **ASCII only** in `.ps1` files (PowerShell 5.1 reads BOM-less files as ANSI).

---

## 7. Environment and secrets

- Never hard-code a token, and never print one (see `CLAUDE.md` hard rule 1). Inspect Credential Manager by **target name and user only** (`cmdkey /list`, or `[CredStore]::List(...)` printing `.Target` / `.User`).
- Never decrypt VS Code's stored session.
- Per-profile state lives outside the project: `%LOCALAPPDATA%\github-switch\` and `github-switch:*` entries in Credential Manager. Do not move it into the project folder.
- Before inspecting a live app database, copy it to the session scratchpad and query the copy.

---

## 8. Switcher-specific hard rules

See `CLAUDE.md` §"Hard rules" — the full list (token handling, never sign out, gh-first ordering,
backup-before-restore, apps closed before storage is touched, VS Code location, machine-bound
snapshots, PS 5.1 compatibility, native-arg quoting, no dependencies). They are not repeated here
to avoid drift.

---

## 9. Reuse audit (grep before writing new code)

```powershell
Select-String -Path switch-github-core.ps1, switch-github-ui.ps1 -Pattern '^function '
```

If something close already exists, extend or parameterize it instead of adding a near-duplicate.

---

## 10. Testing

There is **no test suite**. Verification is manual, and nothing here may touch real tokens or
close the user's apps without asking first.

1. **Status (safe):** `.\switch-github.ps1` — prints state, changes nothing.
2. **VS Code helper (safe):** copy `%USERPROFILE%\.vscode-shared\sharedStorage\state.vscdb` to the
   scratchpad, then run `get` → `clear` → `get` (expect exit 3) → `set` → `get` against the copy
   and compare file hashes.
3. **Token backup/restore (safe, fake account):** copy the three `.ps1` files + `vscode_secret.py`
   to the scratchpad with an `accounts.json` containing `work` plus a fake `zz-test` profile; put a
   `gh.cmd` containing `@exit /b 0` first on `PATH`; dot-source the copy's
   `switch-github-core.ps1` to load `[CredStore]` (and `Set-AccountProfile` to write the profiles);
   create fake backups / originals with `[CredStore]::Write` (**not** `cmdkey` — it fails on
   targets with spaces); run the copy with `zz-test`; check `Restored token:` lines and compare
   blobs. Clean up every target matching `zz-test`, then run the real script with `work` to put
   git config back. A profile with no snapshots never closes apps.
4. **Web UI (safe, no actions):**
   - `cd web; npm run check` (typecheck). Never `npm run build` (global rule).
   - Start `powershell -File .\switch-github.ps1 -Ui` in the background and read the token from
     its output. Call the API with `X-Switcher-Token`: `GET /api/status`, `GET /api/login-state`,
     and only *failing* actions (`POST /api/switch` with an unknown profile, `POST /api/save` with
     an invalid name, `POST /api/signin` with an unknown tool). Check `401` without the token and
     that `..` paths are not served.
   - `npx vite` in the background, then headless Edge
     (`msedge --headless=new --screenshot=<scratchpad>\x.png --window-size=1280,900
     --virtual-time-budget=15000 --user-data-dir=<scratchpad>\edge-profile <dev url with ?t=>`)
     for light, dark (`--force-dark-mode --blink-settings=preferredColorScheme=0`) and 500 px wide
     (headless clamps narrower windows). Read the PNGs. Stop both background tasks afterwards.
   - Never the Claude in Chrome tools (global rule).
5. **Real apps (ask first):** `-Save`, `-Clear`, the Desktop / VS Code swap and the UI's
   Prepare / Save profile / Switch close and reopen VS Code and GitHub Desktop. Only run with the
   user's go-ahead.

Do not add a test framework without explicit instruction.

---

## 11. Session bootstrap (mandatory)

RULES.md is auto-injected at the start of every session via the `SessionStart` hook in
`.claude/settings.local.json`.

---

*Last updated: 2026-11-15 (reuse list: Read-AccountProfiles, Remove-CliLogin, Get-LoginSpelling)*
*Previously: 2026-11-15 (Remove-AccountProfile in the reuse list)*
*Previously: 2026-11-14 (React web UI + API server replace the WinForms window: deps, style, test step 4)*
*Previously: 2026-10-30 (core split, login window: reuse list, thin entry points, GUI test step)*
*Previously: 2026-10-30 (initial Claude setup, following the p2x layout)*
