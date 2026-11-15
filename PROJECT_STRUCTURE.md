# Project structure — multiple-github-account

Windows GitHub account switcher: a PowerShell 5.1 core (with inline C# for Credential Manager),
one Python stdlib helper for VS Code's SQLite state, a localhost API server, and a React UI.

```
multiple-github-account/
├── CLAUDE.md                            # Root intelligence hub + README registry
├── PROJECT_STRUCTURE.md                 # This file
├── README.md                            # Overview, how it works, quick start, CLI usage
├── LICENSE                              # MIT
├── switch-github.ps1                    # CLI entry point — parameters, dispatch
├── switch-github-core.ps1               # Shared state + functions, CredStore (inline C#)
├── switch-github-ui.ps1                 # -Ui: HttpListener server, API routes, static files
├── vscode_secret.py                     # get/set/clear/has VS Code's GitHub secret row (sqlite3)
├── accounts.json                        # Your profiles (gitignored — personal data)
├── accounts.example.json                # Template for accounts.json
├── web/                                 # React UI (Vite + TypeScript)
│   ├── package.json / package-lock.json
│   ├── vite.config.ts                   # dev server; proxies /api to the PowerShell server
│   ├── tsconfig.json
│   ├── index.html
│   ├── public/favicon.svg
│   ├── src/
│   │   ├── main.tsx                     # mounts <App>
│   │   ├── App.tsx                      # page state, action runner, gate screens
│   │   ├── api.ts                       # API types + calls + per-run token
│   │   ├── tools.ts                     # tool names, sameLogin, routesFor (tool vs active account), offAccountTools
│   │   ├── draft.ts                     # add-account progress in localStorage (survives refresh)
│   │   ├── icons.tsx                    # inline SVG icons + brand mark
│   │   ├── styles.css                   # design tokens (light/dark) + all styles
│   │   └── components/                  # Identity, Profiles, AddAccount, ConfirmDialog, Activity, Avatar
│   └── dist/                            # build output (gitignored; npm run build)
├── .claude/
│   ├── RULES.md                         # Standing instructions
│   ├── settings.json                    # Hooks: edit log, doc-sync check, syntax/type gate
│   ├── settings.local.json              # SessionStart hook — cats RULES.md (gitignored)
│   ├── hooks/
│   │   ├── log-edit.sh                  # PostToolUse — records edited paths
│   │   ├── check-readme-sync.sh         # Stop — code edited but no readme/ touched → block
│   │   └── quality-gate.sh              # Stop — parse .ps1 / .py, typecheck web/ after changes
│   └── skills/
│       └── readme-sync/SKILL.md
├── readme/
│   ├── ARCHITECTURE.md                  # Storage map, components, lifecycle, limitations
│   ├── RESEARCH.md                      # Existing-tool survey (2026-10-30)
│   ├── flows/
│   │   ├── switch.md                    # .\switch-github.ps1 <profile>
│   │   ├── save.md                      # -Save <profile>
│   │   ├── clear.md                     # -Clear + add-an-account procedure
│   │   └── ui.md                        # -Ui web page
│   └── methods/
│       ├── credential-store.md          # CredStore, Backup-Tokens, Restore-Tokens
│       ├── vscode-session.md            # vscode_secret.py + VS Code DB locations
│       ├── desktop-state.md             # Desktop Local Storage, Stop-App, Start-Apps
│       ├── profiles.md                  # accounts.json, data dir, status functions
│       └── ui-server.md                 # API server, token, routes, React client map
├── docs/                                # also the GitHub Pages site (served from main /docs)
│   ├── DOC_SYNC.md                      # MANDATORY doc-sync matrix
│   ├── index.html                       # public site: SEO landing page, self-contained HTML/CSS/JS
│   ├── sitemap.xml, robots.txt          # for search engines
│   ├── og-image.png                     # 1280x640 link preview (also for the repo's social preview)
│   ├── favicon.svg                      # copy of web/public/favicon.svg
│   ├── .nojekyll                        # Pages serves the files as they are (no Jekyll)
│   └── screenshot.png                   # README + site screenshot (work profile blurred)
├── .gitignore
└── .claudeignore
```

State kept **outside** the project (per Windows user):

```
%LOCALAPPDATA%\github-switch\            # snapshots — see readme/methods/profiles.md
Credential Manager: github-switch:<profile>:<original target>   # token backups
```

## Module map

| File | Owns |
|---|---|
| `switch-github.ps1` | Parameters (`<profile>`, `-Save`, `-Clear`, `-Ui`); dot-sources the core (and the UI server for `-Ui`) and dispatches. No logic of its own |
| `switch-github-core.ps1` | `CredStore` / `StoredCredential` (C#); script-scope state (`$accounts`, `$names`, paths, `$tokenTarget`, `$loginPattern`); `Read-AccountProfiles`, `Get-Account`, `Set-AccountProfile`, `Remove-AccountProfile`, `Remove-CliLogin`, `Set-GitIdentity`, `Get-ActiveProfile`, `Get-DesktopSnapshot`, `Get-VSCodeSnapshot`, `Backup-Tokens`, `Restore-Tokens`, `Get-LoginSpelling`, `Get-DesktopLogin`, `Save-VSCodeSession`, `Set-VSCodeSession`, `Clear-VSCodeSession`, `Test-VSCodeSession`, `Stop-App`, `Start-Apps`, `Invoke-WithAppsClosed`, `Copy-Folder`, `Get-LoginState`, `Get-SwitcherStatus`, `Show-Status`; operations `Clear-AppState`, `Save-ProfileState`, `Switch-Profile` |
| `switch-github-ui.ps1` | `$uiPort`, `$uiRoot`, `$uiTypes`, `$uiWindowTitle`, `$uiStopEventName`, `$uiTakeoverSeconds`; `Start-UiServer`, `Open-UiListener`, `Invoke-UiRequest`, `Invoke-UiApi`, `Invoke-UiAction`, `Start-ToolSignIn`, `New-UiToken`, `Send-UiFile`, `Send-UiJson`, `Send-UiResponse`, `Read-UiBody` |
| `vscode_secret.py` | `KEY` (the VS Code secret key), actions `get` / `set` / `clear` / `has`, exit code `3` = no session |
| `web/src/` | React client — file map in `readme/methods/ui-server.md` |
| `accounts.json` | Profile name → `name`, `email`, `user` |

## Conventions

| Concern | Choice |
|---|---|
| Credential Manager access | `CredStore` — advapi32 `CredEnumerateW` / `CredWriteW` / `CredDeleteW` via `Add-Type` |
| SQLite | Python stdlib `sqlite3`, run as `python -I vscode_secret.py ...` |
| JSON | `ConvertFrom-Json` / `ConvertTo-Json -Depth 6 -Compress` |
| App close | `Process.CloseMainWindow()` loop, 20 s timeout — never kill |
| HTTP | `System.Net.HttpListener` on `http://localhost:47821/`, one request at a time, per-run `X-Switcher-Token` |
| UI | React 18 function components, TypeScript strict, plain CSS with light/dark tokens, native `<dialog>`; Segoe UI Variable + Cascadia Mono (Windows-native) |
| Errors | `throw` with the next command to run; `Write-Warning` for skipped parts; the UI shows both in Activity |

## Tool versions (verified on this machine)

- Windows 10 Pro 10.0.19045, Windows PowerShell 5.1.19041
- Git 2.55.0.windows.3, Git Credential Manager 2.9.0
- GitHub CLI 2.100.0
- Python 3.14.7 (SQLite 3.50.4)
- VS Code 1.144.0 (uses `.vscode-shared` shared storage for secrets)
- GitHub Desktop 3.6.7
- Node.js 24.19.0, npm 11.17.0; React 18.3.1, Vite 6.4.6, TypeScript 5.9.3 (2026-11-14)

## Not present here (by design)

- No PowerShell / Python dependency file — stdlib and built-ins only
- No test suite — manual procedure in `.claude/RULES.md` §10
- No vendored Claude plugins
- No committed `web/dist` — build it once with `npm run build`

---
*Last updated: 2026-11-15 (Read-AccountProfiles, Remove-CliLogin, Get-LoginSpelling; tools.ts helpers)*
*Previously: 2026-11-15 (MIT LICENSE)*
*Previously: 2026-11-15 (GitHub Pages site in docs/)*
*Previously: 2026-11-15 (Remove-AccountProfile; docs/screenshot.png for the README)*
*Previously: 2026-11-14 (React web UI + switch-github-ui.ps1 replace the WinForms window)*
*Previously: 2026-10-30 (core split out of switch-github.ps1; -Login window added)*
*Previously: 2026-10-30 (initial Claude setup)*
