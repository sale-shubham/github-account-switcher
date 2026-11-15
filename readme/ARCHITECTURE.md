# Architecture

## Overview

Every GitHub-aware app on Windows keeps its own login in its own place. Switching accounts means
changing all of them together. This tool:

1. **Backs up tokens** — every account's Credential Manager entries are copied to
   `github-switch:<profile>:<original target>` entries (still encrypted by Windows).
2. **Snapshots app sign-in state** — GitHub Desktop's `Local Storage` folder and VS Code's
   encrypted GitHub session value, per profile, under `%LOCALAPPDATA%\github-switch\<profile>`.
3. **Switches** — `gh auth switch`, git config, restores the target's tokens, swaps the app state
   back in with the apps closed, reopens them.

It never signs anything out and never decrypts a token.

## Where each app stores its login (verified 2026-10-30)

| App | Token | "Which account is signed in" |
|---|---|---|
| gh CLI 2.100 | Credential Manager `gh:github.com:<user>` (one per account) | `gh:github.com:` (active copy, empty user) + `%APPDATA%\GitHub CLI\hosts.yml` — both rewritten by `gh auth switch` |
| Git Credential Manager 2.9 | Credential Manager `git:https://github.com` (user = login) — other accounts may get their own `git:https://...github.com` targets | Global git config `credential.https://github.com.username` |
| GitHub Desktop 3.6.7 | Credential Manager `GitHub - https://api.github.com/<login>` (persistence: Enterprise) | `%APPDATA%\GitHub Desktop\Local Storage` (Chromium LevelDB, key `users`). Repositories list is in `IndexedDB` and is **not** swapped |
| VS Code 1.144 | **Not** in Credential Manager. Encrypted value in `%USERPROFILE%\.vscode-shared\sharedStorage\state.vscdb`, key `secret://{"extensionId":"vscode.github-authentication","key":"github.auth"}` | Same value (it holds the session list) |
| git identity | — | Global git config `user.name`, `user.email` |

How these were found: `cmdkey /list` (target names only), VS Code's
`%APPDATA%\Code\logs\<session>\main.log` line `[shared storage] Creating shared storage database
at ...`, and `GitHub Authentication.log` (`Reading sessions from keychain...`). Details in
`readme/methods/vscode-session.md` and `readme/methods/desktop-state.md`.

## Components

| Component | File | Doc |
|---|---|---|
| CLI entry point (`<profile>`, `-Save`, `-Clear`, `-Ui`, status) | `switch-github.ps1` | `readme/flows/*.md` |
| UI server (localhost API, per-run token, static files) | `switch-github-ui.ps1` | `readme/methods/ui-server.md` |
| Web UI (identity panel, profiles, add-account steps, activity) | `web/` (React + TypeScript, Vite) | `readme/flows/ui.md` |
| Operations `Switch-Profile`, `Save-ProfileState`, `Clear-AppState` | `switch-github-core.ps1` | `readme/flows/switch.md`, `save.md`, `clear.md` |
| Credential Manager access | `CredStore` (inline C#) in `switch-github-core.ps1` | `readme/methods/credential-store.md` |
| VS Code secret row | `vscode_secret.py` | `readme/methods/vscode-session.md` |
| Desktop state + app close/reopen | `switch-github-core.ps1` | `readme/methods/desktop-state.md` |
| Profiles + data dir + login state | `accounts.json`, `%LOCALAPPDATA%\github-switch` | `readme/methods/profiles.md` |

Both entry points (CLI and UI server) only call the core operations — each operation exists once.
The React page holds no switching logic; it shows `Get-SwitcherStatus` and calls the API.

```
browser (web/dist)  --X-Switcher-Token-->  switch-github-ui.ps1  --+
switch-github.ps1 (CLI)  ------------------------------------------+-->  switch-github-core.ps1
```

## Switch lifecycle

1. Validate the profile (`Get-Account`)
2. Close GitHub Desktop / VS Code if that profile has a snapshot for them
3. `gh auth switch` — **abort here** if gh has no login for the account (nothing changed yet)
4. Back up every profile's current tokens
5. Restore the target's tokens that are missing or held by another account
6. Set git `user.name`, `user.email`, `credential.https://github.com.username`
7. Swap Desktop `Local Storage` and the VS Code session (previous state kept in `_previous`)
8. Write `current.txt`; reopen the apps that were running
9. Warn if GCM has no stored login for the account; print status

Full detail: `readme/flows/switch.md`.

## Security model

- Tokens stay inside Credential Manager (DPAPI, per Windows user). Backups are more entries in the
  same store, not files.
- The VS Code snapshot file is VS Code's ciphertext (`{"type":"Buffer","data":[118,...]}`,
  Electron safeStorage); the key is DPAPI-protected in VS Code's `Local State`. It only decrypts
  for this user on this machine.
- The Desktop snapshot contains no token — only the user list and Desktop preferences.
- The UI server listens on `localhost` only (other `Host` headers get `400` from HttpListener) and
  every API call needs the per-run key from the link the server opens. API responses carry
  logins, names and emails, never a token (`readme/methods/ui-server.md`).
- The tool reads and writes tokens as opaque bytes; it never prints them.

## Known limitations

- **VS Code storage is undocumented.** It moved to `.vscode-shared` in a recent VS Code release;
  a future release may move it again. Then `-Save` warns "no GitHub session" and the VS Code part
  is skipped. Re-find it per `readme/methods/vscode-session.md`.
- **Copilot's account preference** (`github.copilot-github` in `%APPDATA%\Code\User\globalStorage\state.vscdb`)
  is not swapped — Copilot may ask once which account to use.
- **`-Save` cannot verify the VS Code account** — the session is encrypted. The user must make sure
  the right account is signed in.
- **No save-back.** A switch restores the snapshot from `-Save` time; Desktop preferences changed
  since then are replaced (the replaced state is kept in `_previous`, one level deep).
- **gh logout is not recoverable from backups alone** — `gh auth logout` also removes the account
  from `hosts.yml`; run `gh auth login` again. The switcher runs it only when a profile is deleted
  with "Also sign out of GitHub CLI and Git" ticked (`Remove-CliLogin`).
- **`_cleared\<timestamp>` folders accumulate** — delete old ones by hand.
- **Desktop is reopened from the exact exe path that was running** (`app-3.6.x\GitHubDesktop.exe`).
- **Desktop's repository list is shared by all profiles** (it lives in IndexedDB; only `Local Storage`
  is swapped). Its hourly background fetch of a private repo the active account cannot access logs
  `remote: Repository not found` (GitHub answers 404 to private repos you cannot see). Harmless;
  it stops after switching to the account that has access.
- **Apps reopened by the switcher print their logs in the console that ran it** (`Start-Process` from
  that console). VS Code / Desktop noise there (`DEP0169`, `Unknown channel`, `desktop-notifications`)
  is theirs, not the switcher's.
- **github.com only**, no SSH keys, no GitHub Enterprise Server.
- **The web UI's VS Code row cannot name the account** — it only shows that a session exists.
- **The UI server does one thing at a time.** While apps close (up to 20 s each) the page shows a
  busy modal and status requests wait. The sign-in buttons only start the tools; the add-account
  list picks up the result on its next 4 s check.
- **The web UI needs `npm run build` once** (and after any change in `web/`); without `web\dist`
  the server prints the build command.

## Verified against real apps

- **2026-11-14** - second account added through the (since replaced) WinForms window: Prepare
  (save active profile + `Clear-AppState`), the four sign-ins, Save profile, then Switch between
  the two profiles, with VS Code and Desktop closed and reopened. A commit + push from VS Code
  worked as the new account (after the `Set-GitIdentity` fix in Save).
- **2026-11-15** - third account added through the web UI: Prepare, the four sign-ins, Save
  profile (after a page refresh, resumed with "Skip this step"), then Switch back to an earlier
  profile. Found and fixed on the way: a server started in VS Code's terminal died when Prepare
  closed VS Code; wizard input was lost on refresh; a second `-Ui` could not take over the port.

---
*Last updated: 2026-11-15 (gh logout only on an opt-in profile delete)*
*Previously: 2026-11-15 (web UI verified against real apps; untested limitation removed)*
*Previously: 2026-11-14 (web UI replaces the WinForms window: components, security, limitations)*
*Previously: 2026-11-14 (real-app run done: untested limitation removed; shared Desktop repo list, app logs in console)*
*Previously: 2026-10-30 (core split + login window components and limitations)*
*Previously: 2026-10-30 (initial architecture doc from the build session)*
