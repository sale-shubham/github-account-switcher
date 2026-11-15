# Web UI (see accounts, add an account, switch)

## Purpose

`.\switch-github.ps1 -Ui` starts a local server (`Start-UiServer` in `switch-github-ui.ps1`) and
opens a React page (`web/`) in the browser. The page shows which account each tool uses, lists
the profiles with a **Switch** button, and walks through adding an account. Every action calls
the shared functions in `switch-github-core.ps1`; the server and API are described in
`readme/methods/ui-server.md`.

## First run

```powershell
cd web
npm install
npm run build        # once, and after any change in web/
cd ..
.\switch-github.ps1 -Ui
```

Without `web\dist` the server still starts and prints the build command plus a development link.
Keep the PowerShell window open while the page is in use; Ctrl+C stops the server. Running `-Ui`
again while one is open replaces it: the old server stops after any running action and the new
one opens a fresh page (`readme/methods/ui-server.md`, "Taking over").

Started from **VS Code's terminal**, `Start-UiServer` reopens itself in its own PowerShell window
and returns: Prepare / Save / Switch close VS Code, which ends every process in its terminals, so a
server running there would die mid-action and never reopen the apps.

## Page

| Area | Shows / does | Data |
|---|---|---|
| Identity panel | Active profile, its GitHub login, the git name/email commits use, and a line to each tool: green = uses this account, amber dashed = another account (or GCM has no saved login), grey dashed = signed out. Logins are compared ignoring case (`Octocat` and `octocat` are the same account). When an installed tool is off the active account, a callout names those tools with **Sign in again** | `GET /api/status` |
| Profiles | Every profile with its login, git identity and which sign-ins are saved (Desktop, VS Code). **Switch** asks to confirm, then runs `Switch-Profile`. **Sign in again** (every profile) reopens the add-account drawer for that profile. **Delete** (not on the active profile) asks to confirm, then runs `Remove-AccountProfile`: the switcher forgets the profile's snapshots and token backups; no app closes. The dialog's opt-in box **Also sign @login out of GitHub CLI and Git on this PC** (unticked each time) also runs `Remove-CliLogin`; without it no live sign-in changes | `GET /api/status`, `POST /api/switch`, `POST /api/delete` |
| Add account | Drawer with four steps (below) | see steps |
| Activity | Each action's result and every line it printed (warnings amber, errors red), newest first, last 30 | action responses |

**Refresh** re-reads the status, including the profile list (the server re-reads `accounts.json`
before every request, so profiles saved from the CLI appear). After an action the page refreshes by
itself; a change of active profile replays the line animation once.

**Deleting a profile** forgets only what the switcher saved. gh and Git Credential Manager each keep
a list of logins, so without the opt-in box they stay signed in to that account: adding the same
account again shows them "Signed in" and that sign-in can be skipped.

**Sign in again** runs the same four steps for a saved profile: the details are filled in, the
profile name is locked, and saving updates the profile. Use it for a profile saved before every tool
was signed in, or a sign-in that stopped working. Its progress is kept like an add (`repair` in the
draft).

## Add-account steps (what the user does)

1. **Account details** - each field says what goes in it, with an example as placeholder:
   - **Profile name** - your own label, only used in the switcher (`work`); not the GitHub name.
   - **GitHub username** - the login in `github.com/<username>` (GitHub's rule), not the display
     name or email; capitals do not matter, the profile is saved with GitHub's spelling.
   - **Name on commits** - `git user.name`, the author shown on every commit.
   - **Email on commits** - `git user.email`: an email added to that GitHub account or its private
     noreply address (`<id>+<login>@users.noreply.github.com`); GitHub credits commits by it.

   Checked in the browser before **Next**; checked again by
   `Set-AccountProfile` on save. A GitHub username or email that another profile already has is
   refused (one profile per GitHub account, see `readme/methods/profiles.md`); reusing a profile's
   own name replaces it.
2. **Prepare the apps** - confirm, then `POST /api/prepare`:
   `Invoke-WithAppsClosed { Save-ProfileState <active>; Clear-AppState }`. The current sign-in is
   saved into the active profile (if one is known), then Desktop and VS Code start signed out
   (`readme/flows/clear.md`). **Skip this step** is for when the apps are already signed out, or
   already signed in as the new account (e.g. after a refresh) - preparing again would move those
   new sign-ins aside. The step counts as done only for the login it was run for, so changing the
   GitHub username offers Prepare again.
3. **Sign in to each tool** - sign in to github.com in the browser as the new account first. Each
   row's button (**Sign in** for GitHub CLI and Git, **Open Desktop** / **Open VS Code** for the apps,
   where you sign in inside the app) calls `POST /api/signin` (`Start-ToolSignIn`):

   | Tool | What starts |
   |---|---|
   | GitHub CLI | New console: `gh auth login --hostname github.com --web --git-protocol https --clipboard`. Answer **n** to "Authenticate Git with your GitHub credentials?" so git keeps using GCM |
   | Git | `git credential-manager github login --username <login> --browser` |
   | GitHub Desktop | Desktop (`$desktopExe`) if not running; user clicks "Sign in to GitHub.com" |
   | VS Code | `Code.exe --reuse-window` (`$vscodeExe`): starts VS Code, or hands a running one the request in its last window (no new window; Windows may not bring it to the front). User clicks the Accounts icon at the bottom of the left bar, signs in with GitHub, approves in the browser |

   The list re-checks every 4 s (`GET /api/login-state`, `Get-LoginState`).
4. **Save profile** - confirm, then `POST /api/save`: `Set-AccountProfile` writes `accounts.json`,
   then `Invoke-WithAppsClosed { Save-ProfileState <profile> }` (`readme/flows/save.md`). The new
   profile becomes active everywhere, gh and git included. On success the drawer closes.

**Progress survives a refresh.** The wizard keeps its step, the four fields and which login was
prepared in `localStorage` (`switcher-add-account`, `web/src/draft.ts`) - only what was typed, no
tokens. After a reload or a closed tab the drawer reopens at the same step with "Picked up where
you left off." The draft is deleted when the profile is saved or on **Cancel** (step 1); the close
button (X) keeps it. If the browser blocks storage, the wizard still works without this.

## Status checks

| Identity row | "Uses this account" when |
|---|---|
| GitHub CLI | `gh api user` returns the profile's login (needs network) |
| Git | `credential.https://github.com.username` is the login **and** `git credential-manager github list` has it; otherwise amber "No saved login, next push asks" |
| GitHub Desktop | `Get-DesktopLogin` returns the login |
| VS Code | a GitHub session exists - VS Code encrypts it, so the account cannot be checked |

The add-account list uses `Get-LoginState` (local checks only, see `readme/methods/profiles.md`).

## Failure behavior

- An action that throws comes back as `ok: false`; the Activity entry shows **Failed** and the
  error in red, and failed entries stay expanded. Nothing else on the page changes.
- Apps that do not close within 20 s: `... did not close (unsaved changes?)` - nothing changed.
- While an action runs, a modal covers the page ("If an app asks about unsaved changes, answer it
  there"). The server handles one request at a time, so actions never overlap.
- Server not running: the page shows "Cannot reach the switcher" with **Try again**.
- Page opened without the one-time link: it explains to start `.\switch-github.ps1 -Ui`.

## Notes

- The sign-in list notes whose account gh, git and Desktop use now (`Get-LoginState` `now`), e.g.
  "Uses @other now. Saving switches it to @login." Desktop counts as signed in only when the app
  itself shows the login. The save step warns about installed tools that are not ready.
- The Prepare step says what the apps hold right now; with nothing on another account, skipping is
  the suggested choice.
- One scrollbar at a time: while a dialog is open the page is locked
  (`html:has(dialog:modal) { overflow: hidden }`) and only the drawer body scrolls. `.drawer-body`
  is `position: relative` so screen-reader-only text inside it stays in the scrolling box instead of
  growing a second scrollbar on the dialog.
- Avatars load from `https://github.com/<login>.png`; initials are shown if that fails.
- Development: run `.\switch-github.ps1 -Ui`, then `cd web; npm run dev` and open the
  `http://localhost:5173/?t=...` link the server printed. Vite forwards `/api` to the server.
- Testing without clicking real actions: `.claude/RULES.md` section 10, step 4.

---
*Last updated: 2026-11-15 (logins ignore case; Sign in again; delete sign-out option; field hints; one scrollbar)*
*Previously: 2026-11-15 (duplicate login/email refused; Delete profile button)*
*Previously: 2026-11-15 (wizard progress kept in localStorage across refresh; Skip copy for already-signed-in)*
*Previously: 2026-11-15 (Open Desktop / Open VS Code labels; VS Code opened with --reuse-window)*
*Previously: 2026-11-15 (server reopens outside VS Code's terminal; failed Activity entries stay expanded)*
*Previously: 2026-11-14 (replaces the WinForms -Login window)*
