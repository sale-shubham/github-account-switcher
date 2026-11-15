# Documentation sync rules (multiple-github-account)

> **NON-NEGOTIABLE.** Any code change MUST land with its docs update in the same change. Stale
> docs are treated as a bug.

Same doc-sync policy as the author's other repositories, with this project's file map.

## Before editing

| Change area | Read first |
|---|---|
| `Switch-Profile`, step order | `readme/flows/switch.md` |
| `Save-ProfileState` | `readme/flows/save.md` |
| `Clear-AppState`, add-account procedure | `readme/flows/clear.md` |
| `web/src/**` (page, add-account steps, status rows) | `readme/flows/ui.md` |
| `switch-github-ui.ps1` (server, token, API routes), `web/src/api.ts` | `readme/methods/ui-server.md` |
| `switch-github.ps1` parameters / dispatch | `README.md` usage + the flow doc of the command |
| `CredStore`, `Backup-Tokens`, `Restore-Tokens`, `Get-LoginSpelling`, `$tokenTarget` | `readme/methods/credential-store.md` |
| `vscode_secret.py`, `$vscodeDbs`, `$vscodeExe`, `*-VSCodeSession` | `readme/methods/vscode-session.md` |
| `$desktopStorage`, `$desktopExe`, `Get-DesktopLogin`, `Stop-App`, `Start-Apps`, `Invoke-WithAppsClosed`, `Copy-Folder` | `readme/methods/desktop-state.md` |
| `accounts.json`, `$dataDir` layout, `$loginPattern`, `Get-Account`, `Read-AccountProfiles`, `Set-AccountProfile`, `Remove-AccountProfile`, `Remove-CliLogin`, `Get-ActiveProfile`, `Get-LoginState`, `Get-SwitcherStatus`, `Show-Status` | `readme/methods/profiles.md` |
| Storage locations, lifecycle, limitations | `readme/ARCHITECTURE.md` |
| `docs/index.html` (public GitHub Pages site) | `README.md` - the site repeats its facts |

## Additions trigger

| You added | You MUST also update |
|---|---|
| New command / parameter | **Create `readme/flows/<command>.md`** + register in `CLAUDE.md` + `README.md` usage block + `PROJECT_STRUCTURE.md` module map |
| New screen, step, button or status row in the web UI | `readme/flows/ui.md` (page / steps / status table) + `readme/methods/ui-server.md` client table if a file was added |
| New API route | `switch-github-ui.ps1` `Invoke-UiApi` + `web/src/api.ts` + `readme/methods/ui-server.md` API table |
| New npm dependency in `web/` | Justify it (`.claude/RULES.md` §2) + `PROJECT_STRUCTURE.md` conventions |
| New helper function | The owning `readme/methods/<domain>.md` + `PROJECT_STRUCTURE.md` module map + `.claude/RULES.md` §6 reuse list |
| New app or tool covered (e.g. Cursor, SSH) | `readme/ARCHITECTURE.md` storage map + new `readme/methods/<app>.md` + `README.md` + `CLAUDE.md` registry |
| New Credential Manager target pattern | `$tokenTarget` + `readme/methods/credential-store.md` target table + `readme/ARCHITECTURE.md` storage map |
| New file under `%LOCALAPPDATA%\github-switch` | `readme/methods/profiles.md` data-dir layout |
| New field in `accounts.json` | `Get-Account` validation + `accounts.example.json` + `readme/methods/profiles.md` schema + `README.md` setup |
| New standing rule | `.claude/RULES.md` (+ `CLAUDE.md` hard rules if switcher-specific) |
| New skill | `.claude/skills/<skill>/SKILL.md` + skills table in `CLAUDE.md` + `PROJECT_STRUCTURE.md` tree |
| New hook | `.claude/hooks/` + `.claude/settings.json` + `PROJECT_STRUCTURE.md` tree |

## Modifications trigger

| You changed | You MUST also update |
|---|---|
| Order of steps in the switch | `readme/flows/switch.md` steps + failure behavior + `readme/ARCHITECTURE.md` lifecycle |
| Restore policy (when a backup overwrites) | `readme/methods/credential-store.md` + `readme/flows/switch.md` + `CLAUDE.md` hard rule 5 |
| VS Code DB path or secret key | `vscode_secret.py` `KEY` + `$vscodeDbs` + `readme/methods/vscode-session.md` + `CLAUDE.md` hard rule 7 + `readme/ARCHITECTURE.md` storage map |
| Desktop storage path or login detection | `readme/methods/desktop-state.md` + `readme/ARCHITECTURE.md` storage map |
| App close timeout / close method | `readme/methods/desktop-state.md` (`Stop-App`) |
| `vscode_secret.py` exit codes | `readme/methods/vscode-session.md` + the PowerShell callers |
| A tool version re-verified | `PROJECT_STRUCTURE.md` tool versions |
| `README.md` features, requirements, quick start, CLI usage or FAQ | `docs/index.html` (public site) + `<lastmod>` in `docs/sitemap.xml` |

## Removals trigger

| You removed | You MUST also do |
|---|---|
| A command / parameter | Delete its flow doc; remove rows from `CLAUDE.md`, `README.md`, `PROJECT_STRUCTURE.md` |
| A helper function | Remove from its methods doc, the module map, and `.claude/RULES.md` §6 reuse list |
| A known limitation (fixed) | Remove it from `readme/ARCHITECTURE.md` §"Known limitations" and `CLAUDE.md` in the same change |

## Hard rules

- **No per-directory READMEs.** All documentation lives in `readme/`, plus the four root files
  (`README.md`, `CLAUDE.md`, `PROJECT_STRUCTURE.md`, `docs/DOC_SYNC.md`).
- **One flow per file.** Never merge two commands into one doc.
- **Register before finishing.** New doc files must appear in the `CLAUDE.md` README registry in
  the same change.
- **Every doc carries a `*Last updated:*` footer** with a one-line reason, newest first.

---
*Last updated: 2026-11-15 (Read-AccountProfiles, Remove-CliLogin, Get-LoginSpelling rows)*
*Previously: 2026-11-15 (public site docs/index.html rows)*
*Previously: 2026-11-15 (Remove-AccountProfile row)*
*Previously: 2026-11-14 (web UI + API replace the login window)*
*Previously: 2026-10-30 (core split + login window rows)*
*Previously: 2026-10-30 (initial doc structure)*
