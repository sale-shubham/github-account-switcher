# Web UI server and API

Covers `switch-github-ui.ps1` (dot-sourced by `switch-github.ps1 -Ui` after the core) and the
client in `web/src/api.ts`. The user flow is in `readme/flows/ui.md`.

## Server

`Start-UiServer` opens `System.Net.HttpListener` on `http://localhost:47821/` (`$uiPort`) and
handles one request at a time on the PowerShell thread, so two actions never run together. It
waits on `BeginGetContext` in 500 ms slices so Ctrl+C can stop it; the listener is closed in
`finally`.

| Path | Served by |
|---|---|
| `/api/*` | `Invoke-UiApi` (token required) |
| anything else | `Send-UiFile` from `web\dist`; unknown paths get `index.html`; a path that resolves outside `web\dist` is never served |

**Taking over from a running server.** `Open-UiListener` tries the port; if another switcher UI
holds it, it sets the named event `$uiStopEventName` (`Local\GitHubAccountSwitcherUi-Stop`, manual
reset) and retries every 500 ms for up to `$uiTakeoverSeconds` (90). The running server waits on
that event together with `BeginGetContext`, so it only notices **between requests** - an action
in progress (a switch closing apps) always finishes first - then prints "A newer switcher UI was
started, so this one stopped" and closes its listener. The new server takes the port and resets
the event. A server from before 2026-11-15 does not listen for the event; then the wait times out
with a `throw` saying to close that window with Ctrl+C.

Once listening, it sets the console title to `$uiWindowTitle` ("Account Switcher server - keep
open, Ctrl+C to stop"), so the window is easy to find - especially one reopened from VS Code's
terminal. (`Get-NetTCPConnection` shows the port as owned by `System`, because HttpListener runs
in http.sys; `netsh http show servicestate view=requestq` lists the real process ID.)

Started inside VS Code's integrated terminal (`TERM_PROGRAM=vscode`), `Start-UiServer` first
starts `powershell.exe -NoProfile -NoExit -File switch-github.ps1 -Ui` in a new console (with
`TERM_PROGRAM` cleared for the child, restored afterwards) and returns. A new console is not
attached to VS Code's terminal, so it survives VS Code closing during an action.

## Access control

- **Per-run token.** `New-UiToken` makes 24 random bytes (`RandomNumberGenerator`) per start. The
  browser is opened at `/?t=<token>`; the page keeps it in `sessionStorage`, removes it from the
  address bar and sends it as `X-Switcher-Token` on every API call. Wrong or missing: `401`.
  Other web pages cannot read it, and a cross-origin request with that header needs a CORS
  preflight the server never allows.
- **localhost only.** `HttpListener` with a `localhost` prefix answers `400 Bad Request - Invalid
  Hostname` to any other `Host` header (DNS rebinding), before the script sees the request.
- No admin rights are needed for a `localhost` prefix.
- The token protects this API only; it is not a GitHub token and is printed in the console.

## API

All JSON. Actions return `{ ok, log: [{ level: info|warn|error, text }] }`.

| Route | Body / query | Calls |
|---|---|---|
| `GET /api/status` | - | `Get-SwitcherStatus` |
| `GET /api/login-state` | `?user=<login>` (must match `$loginPattern`, else `400`) | `Get-LoginState` |
| `POST /api/prepare` | - | `Invoke-WithAppsClosed { Save-ProfileState <active>; Clear-AppState }` |
| `POST /api/signin` | `{ tool: gh\|git\|desktop\|vscode, user }` | `Start-ToolSignIn` |
| `POST /api/save` | `{ profile, user, gitName, email }` | `Set-AccountProfile`, then `Invoke-WithAppsClosed { Save-ProfileState }` |
| `POST /api/switch` | `{ profile }` | `Switch-Profile` |
| `POST /api/delete` | `{ profile, signOut }` (`signOut` must be JSON `true` to count; missing = `false`) | `Remove-AccountProfile`, with `-SignOut` when ticked (`Remove-CliLogin`: gh + GCM logout for that account). No app closes |

Unknown route: `404`. An exception outside an action: `500 { error }` and a warning in the console.

### `Invoke-UiAction $Action`
Runs the action with `*>&1` and turns each record into a log line: `WarningRecord` -> `warn`;
`ErrorRecord` -> `error`, except `NativeCommandError*` (gh / git progress on stderr) -> `info`;
`Write-Host` and native stdout -> `info`. A thrown exception sets `ok = $false` and adds an
`error` line. Returns `$log.ToArray()` - PowerShell 5.1's `ConvertTo-Json` fails on `@($list)`
("Argument types do not match").

### `Start-ToolSignIn $tool $user`
Starts the sign-in for one tool (table in `readme/flows/ui.md`). `git` requires a login matching
`$loginPattern`, because it goes on the `git credential-manager` command line. Desktop and VS Code
cannot be signed in from outside: their buttons are labelled **Open Desktop** / **Open VS Code**
and only start the app (VS Code with `--reuse-window`, so a running instance gets no second
window); the user signs in inside the app.

### `Send-UiJson` / `Send-UiResponse` / `Read-UiBody` / `Send-UiFile`
JSON via `ConvertTo-Json -Depth 6 -Compress`, UTF-8. Every response has `Cache-Control: no-store`
and `X-Content-Type-Options: nosniff`.

## Client (`web/`)

React 18 + TypeScript, built with Vite into `web\dist`. No UI library; styles in
`web/src/styles.css` (light and dark via `prefers-color-scheme`).

| File | Owns |
|---|---|
| `src/api.ts` | Types for every response, token handling, `api.*` calls, `loginPattern` / `profilePattern` (same rules as the core) |
| `src/tools.ts` | Tool names, `sameLogin` (GitHub logins ignore case; every login comparison in the client uses it), `routesFor` (how each tool relates to the active account), `toolInstalled`, `listNames`, `offAccountTools` (installed tools off the active account, for the Sign in again callout) |
| `src/App.tsx` | Page state, `run` (busy modal + Activity entry + refresh), Switch confirm, gate screens |
| `src/components/Identity.tsx` | Active account, the line to each tool, and the Sign in again callout |
| `src/components/Profiles.tsx` | Profile list with saved sign-ins, **Delete**, **Sign in again** and **Switch** |
| `src/components/AddAccount.tsx` | Four-step drawer, sign-in polling (row notes from `now`, save-step warning, `onToolsChanged` reloads the page status when a sign-in changes); also signs a saved profile in again (`repair`) |
| `src/draft.ts` | Wizard progress in `localStorage` (`loadDraft` / `saveDraft` / `clearDraft`), so a refresh does not lose it; `repair` records which profile it signs in again |
| `src/components/ConfirmDialog.tsx`, `Activity.tsx`, `Avatar.tsx` | Confirm modal (optional `option` checkbox, unticked on every open, passed to `onConfirm`), action log, GitHub avatar with initials fallback |

`npm run check` (= `tsc --noEmit`) typechecks; `npm run build` typechecks and writes `web\dist`.

## Notes

- Before every route `Invoke-UiApi` runs `Read-AccountProfiles`, so profiles saved from the CLI while
  the server runs are seen, and a save never writes back an older list.
- `GET /api/login-state` also returns `now: { gh, git, desktop }`.
- PowerShell 5.1 strings from `Get-Content` carry `PSPath` etc.; `Get-ActiveProfile` casts to
  `[string]` so `ConvertTo-Json` writes a plain string.
- `vite.config.ts` proxies `/api` to the server with `changeOrigin`, so the `Host` header is
  `localhost:47821` - the only host the listener accepts.

---
*Last updated: 2026-11-15 (delete takes signOut; Read-AccountProfiles per request; login-state now; client files)*
*Previously: 2026-11-15 (POST /api/delete -> Remove-AccountProfile)*
*Previously: 2026-11-15 (a new -Ui takes over from a running server between requests: Open-UiListener + stop event)*
*Previously: 2026-11-15 (server window title; port-in-use message says where the old server is)*
*Previously: 2026-11-15 (src/draft.ts: wizard progress survives a refresh)*
*Previously: 2026-11-15 (Start-ToolSignIn: VS Code --reuse-window; Open Desktop / Open VS Code labels)*
*Previously: 2026-11-15 (Start-UiServer reopens itself outside VS Code's terminal)*
*Previously: 2026-11-14 (initial: replaces the WinForms window)*
