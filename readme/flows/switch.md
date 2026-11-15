# Switch

## Purpose

`.\switch-github.ps1 <profile>` (or **Switch** in the `-Ui` web page) — make `<profile>`'s GitHub
account active in the gh CLI, git, Git Credential Manager, GitHub Desktop and VS Code. Implemented
by `Switch-Profile` in `switch-github-core.ps1`.

## Steps

1. `Get-Account $Name` — the profile must exist in `accounts.json` with `name`, `email`, `user`.
2. Decide which apps take part: Desktop if `<dataDir>\<profile>\Local Storage` exists
   (`$useDesktop`); VS Code if Python + a VS Code DB exist **and**
   `<dataDir>\<profile>\vscode-github-auth.txt` exists (`$useVSCode`).
3. `Invoke-WithAppsClosed -Desktop $useDesktop -VSCode $useVSCode` runs steps 4–10: it calls
   `Stop-App` for each app taking part (normal close, 20 s timeout) and remembers which were running.
4. `gh auth switch --hostname github.com --user <user>`, with `<user>` as GitHub spells it
   (`Get-LoginSpelling`: gh matches the login case-sensitively, a profile may hold it in other
   capitals). Non-zero exit → `throw` with the
   `gh auth login` command. Skipped with a warning if `gh` is not installed.
5. `Backup-Tokens` for **every** profile — refreshes each account's backup from its current entries.
6. `Restore-Tokens <profile>` — writes back each backed-up target that is missing or held by
   another user; prints `Restored token: <target>` for each.
7. `Set-GitIdentity` — global `user.name`, `user.email`, `credential.https://github.com.username`.
8. Desktop: copy the live `Local Storage` to `<dataDir>\_previous\Local Storage`, then replace it
   with the profile's snapshot. No snapshot → warning to run `-Save`.
9. VS Code: save the live session to `<dataDir>\_previous\vscode-github-auth.txt`, then
   `Set-VSCodeSession` with the profile's file. No snapshot → warning.
10. Write the profile name to `<dataDir>\current.txt`.
11. `Invoke-WithAppsClosed` reopens whatever was running (`Start-Apps`, in `finally` — also after a failure).
12. Warn if `git credential-manager github list` does not include the user (next push opens a
    browser sign-in).
13. `Show-Status`.

## Data pathways

- In: `accounts.json`, Credential Manager (`github-switch:*` backups + live entries), snapshots in
  `%LOCALAPPDATA%\github-switch\<profile>`.
- Out: gh active account, global git config, Credential Manager live entries, Desktop
  `Local Storage`, VS Code shared `state.vscdb`, `_previous\`, `current.txt`.

## Failure behavior

| Failure | Effect |
|---|---|
| Unknown profile / missing field | `throw` before anything is touched |
| An app does not close within 20 s | `throw` before gh runs; apps already closed are reopened |
| Run from VS Code's terminal while VS Code is running (and the profile has a VS Code snapshot) | `throw` from `Invoke-WithAppsClosed` before anything closes - closing VS Code would kill the script halfway |
| gh has no login for the user | `throw` before tokens, git config or app state change; apps reopened |
| `CredWriteW` fails | `Win32Exception` — git config / app state may be unchanged or partly changed; rerun the switch |
| `vscode_secret.py set` fails | `throw` after Desktop swapped; rerun the switch |

## Notes

- Why gh first: it is the step most likely to fail, so the switch is all-or-nothing in practice.
- Why back up all profiles before restoring: Restore can overwrite an entry another account holds,
  e.g. `git:https://github.com`. The fresh backup keeps that account's token.
- A profile with no snapshots never closes any app — useful for testing.
- `_previous` keeps only the last replaced state.

---
*Last updated: 2026-11-15 (gh auth switch gets GitHub's spelling of the login)*
*Previously: 2026-11-15 (refuses to run from VS Code's terminal when VS Code must close)*
*Previously: 2026-11-14 (Switch button now in the -Ui web page)*
*Previously: 2026-11-14 (git config step is now Set-GitIdentity, shared with Save)*
*Previously: 2026-10-30 (moved into Switch-Profile in switch-github-core.ps1; app close via Invoke-WithAppsClosed)*
*Previously: 2026-10-30 (initial flow doc)*
