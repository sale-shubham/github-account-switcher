# Profiles and data directory

Covers `accounts.json`, the `%LOCALAPPDATA%\github-switch` layout, `Get-Account`,
`Read-AccountProfiles`, `Set-AccountProfile`, `Remove-AccountProfile` (+ `Remove-CliLogin`), `Get-ActiveProfile`, `Get-DesktopSnapshot`, `Get-VSCodeSnapshot`,
`Get-LoginState`, `Get-SwitcherStatus` and `Show-Status` in `switch-github-core.ps1`.

## `accounts.json` schema

Next to the scripts (`$PSScriptRoot`). Gitignored — copy from `accounts.example.json`, or let the
web UI create it. A missing file loads as zero profiles.

```json
{
  "<profile>": { "name": "<git user.name>", "email": "<git user.email>", "user": "<GitHub login>" }
}
```

| Field | Used for |
|---|---|
| `name` | `git config --global user.name` |
| `email` | `git config --global user.email` |
| `user` | `gh auth switch --user` (as `Get-LoginSpelling` spells it), `credential.https://github.com.username`, token backup filter, Desktop login check. GitHub logins ignore case; every comparison here and in the web UI does too |

## Data directory

```
%LOCALAPPDATA%\github-switch\
├── current.txt                         # last profile switched to / saved (shown as "Active profile")
├── <profile>\
│   ├── Local Storage\                  # GitHub Desktop snapshot (-Save)
│   └── vscode-github-auth.txt          # VS Code session, VS Code-encrypted (-Save)
├── _previous\                          # state replaced by the last switch (one level)
│   ├── Local Storage\
│   └── vscode-github-auth.txt
└── _cleared\<yyyyMMdd-HHmmss>\         # state moved aside by -Clear
```

Token backups are **not** here — they are Credential Manager entries
`github-switch:<profile>:<original target>` (`readme/methods/credential-store.md`).

## API

### `Get-Account $profileName`
Returns the profile object. `throw` if unknown (lists available names) or if `name`, `email` or
`user` is empty.

### `Set-AccountProfile $profileName $gitName $email $user`
Adds or replaces a profile in `$accounts` / `$names` (script scope) and rewrites `accounts.json`
as UTF-8 **without** BOM (`[IO.File]::WriteAllText`; `Set-Content -Encoding UTF8` would add one in
PowerShell 5.1). `throw` if the profile name has anything but letters, digits and `-`, if `$user`
does not match `$loginPattern` (`^[A-Za-z0-9-]{1,39}$`, GitHub's rule — logins go on native
command lines), or if the git name or email is empty.
`$user` is stored as GitHub spells it (`Get-LoginSpelling`, from gh's or Desktop's Credential
Manager entry; it prints "GitHub spells the login '...'; saved that way." when that differs).

**One profile per GitHub account.** It also `throw`s if another profile (any name but the one
being saved) already has the same `user` or the same `email`, compared case-insensitively. GitHub
logins are unique, and GitHub allows an email on only one account at a time and attributes
commits by email - so a second profile with either would be the same account, or would credit
commits to the wrong one. Git itself does not care: `user.name` / `user.email` are free text, and
the git name may repeat across profiles. The web UI shows the same two errors on step 1.

### `Read-AccountProfiles`
(Re)reads `accounts.json` into `$accounts` / `$names` (script scope). Runs once when
`switch-github-core.ps1` loads; the web UI server runs it again before every API request
(`Invoke-UiApi`), so a profile saved from the CLI while the server runs shows up on **Refresh**, and
a save from the page never writes back a list that is missing it.

`$names` is built by piping the properties (`| ForEach-Object { $_.Name }`), here and in
`Set-AccountProfile` / `Remove-AccountProfile`. Never use `@($accounts.PSObject.Properties.Name)`: with
no profiles (no `accounts.json` yet, or the last one deleted) `.Name` is `$null`, and `@($null)` is one
entry. That entry reached the web UI as a profile whose fields were all `null`, and its avatar crashed
the page, which then showed blank (a fresh download showed a blank page).

### `Remove-AccountProfile $profileName [-SignOut]`
Forgets a profile, in this order so a failure never leaves a profile without its backups:
removes it from `accounts.json` (and `$accounts` / `$names`), deletes `<dataDir>\<profile>`
(Desktop + VS Code snapshots), then deletes its Credential Manager backups
`github-switch:<profile>:*`. `throw`s for an unknown profile, a name that is not
`^[A-Za-z0-9-]+$` (it becomes a folder path), or the active profile ("Switch to another profile
first"). Without `-SignOut` the tools' live sign-ins and the GitHub account are not touched, and
no app closes. With `-SignOut` (the opt-in box in the web UI's delete dialog) it then runs `Remove-CliLogin`.
Without it gh and GCM keep the login, so adding the account again skips signing in to them.

### `Set-GitIdentity $account`
Sets global `user.name`, `user.email` and `credential.https://github.com.username` from a profile.
Used by `Switch-Profile` and `Save-ProfileState`. The GCM username is what makes pushes (also
from VS Code, where prompts are disabled) use this account's stored token.

### `Get-ActiveProfile`
First line of `current.txt` as a plain `[string]` (so `ConvertTo-Json` does not serialize
`Get-Content`'s `PSPath` properties), or `''`. Only `Save-ProfileState` and `Switch-Profile` write it, and
both also call `Set-GitIdentity`, so it matches git's account.

### `Get-DesktopSnapshot $profileName` / `Get-VSCodeSnapshot $profileName`
Paths of the two snapshot items for a profile.

### `Remove-CliLogin $user`
Signs one account out of the GitHub CLI and Git Credential Manager on this PC, with their own
commands: `gh auth logout --hostname github.com --user <GitHub's spelling>` (only when
`gh:github.com:<user>` exists; if it was gh's active account, gh picks another), then
`git credential-manager github logout <login> --no-ui` with the login as `github list` spells it
(matched ignoring case). A tool without that login prints "has no login"; a failed logout is a
warning (the profile is already deleted). Warns if `credential.https://github.com.username` is still
this account. Both commands delete the local token only; it stays valid on GitHub until revoked
there. Desktop and VS Code are not touched. Only `Remove-AccountProfile -SignOut` calls it, never a
switch (`CLAUDE.md` hard rule 2).

### `Get-LoginState $user` → ordered hashtable `gh`, `git`, `desktop`, `vscode` (booleans) + `now`
Is each tool ready for `$user`, by the same tests `Save-ProfileState` uses: Credential Manager
`gh:github.com:<user>`; `git credential-manager github list` contains it; `Get-DesktopLogin` equals it
(a Desktop token left in Credential Manager does **not** count: after a prepare it stays there while
Desktop shows signed out); `Test-VSCodeSession` (any account). `now` = `{ gh, git, desktop }`, the
account each tool uses at this moment (`gh config get user`, `credential.https://github.com.username`,
`Get-DesktopLogin`). Local checks only; feeds the web UI's sign-in list (`GET /api/login-state`).

### `Get-SwitcherStatus` → ordered hashtable
Everything the CLI status and the web UI show, gathered once:

```
activeProfile                       current.txt
git      { name, email }            global git config
tools.gh      { installed, account }   gh api user --jq .login (needs network; $null offline)
tools.git     { account, signedIn }    credential.https://github.com.username; signedIn = GCM list has it
tools.desktop { account }              Get-DesktopLogin
tools.vscode  { installed, session }   $hasVSCode; Test-VSCodeSession
profiles [ { name, gitName, email, user, desktopSaved, vscodeSaved } ]
```

Served as `GET /api/status`; the field names are the contract with `web/src/api.ts`.

### `Show-Status`
Prints `Get-SwitcherStatus`: active profile, git `user.name` / `user.email`, GCM default user, gh
active account, Desktop login, and each profile with `[desktop, vscode]` markers for the snapshots
it has. Run with no arguments to see it.

## Notes

- `$dataDir` is created on every run.
- Profile names become folder names and Credential Manager target parts — keep them simple
  (letters, digits, `-`).

---
*Last updated: 2026-11-15 ($names built by piping: zero profiles no longer becomes one empty profile)*
*Previously: 2026-11-15 (Read-AccountProfiles, Remove-CliLogin, Get-LoginState now; logins ignore case)*
*Previously: 2026-11-15 (one profile per GitHub login and email; Remove-AccountProfile)*
*Previously: 2026-11-14 (Get-SwitcherStatus for the web UI; $loginPattern + field checks in Set-AccountProfile)*
*Previously: 2026-11-14 (Set-GitIdentity)*
*Previously: 2026-10-30 (Set-AccountProfile, Get-ActiveProfile, Get-LoginState for the login window)*
*Previously: 2026-10-30 (initial methods doc)*
