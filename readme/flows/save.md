# Save

## Purpose

`.\switch-github.ps1 -Save <profile>` (or **Save profile** in the `-Ui` web page) — capture what
is signed in right now into `<profile>`: the Desktop sign-in state, the VS Code GitHub session, and
backups of the account's tokens. Implemented by `Save-ProfileState` in `switch-github-core.ps1`,
run inside `Invoke-WithAppsClosed`. The window first writes the profile to `accounts.json` with
`Set-AccountProfile`.

## Steps

1. `<profile>` is required; `Get-Account` validates it before any app is closed.
2. `Invoke-WithAppsClosed` closes GitHub Desktop, then VS Code (normal close), and remembers which were running.
3. Desktop: `Get-DesktopLogin` reads the signed-in login from `Local Storage`.
   - Equal to the profile's `user` → `Copy-Folder` to `<dataDir>\<profile>\Local Storage`.
   - Anything else → warning, Desktop not saved (protects against saving the wrong account).
4. VS Code: `Save-VSCodeSession` → `vscode_secret.py get` into
   `<dataDir>\<profile>\vscode-github-auth.txt`.
   - Exit 3 (no session) → warning, nothing written (an older snapshot stays).
   - No Python / no VS Code DB → warning.
5. `Backup-Tokens <profile> <user>` — copies every live token entry whose user is `<user>`.
6. Make the profile active for the tools that are not snapshotted: `gh auth switch` to `<user>` as
   GitHub spells it (`Get-LoginSpelling`; gh matches case) if gh has a login for it (else a warning), then `Set-GitIdentity` — global `user.name`,
   `user.email` and `credential.https://github.com.username`.
7. Write `<profile>` to `current.txt`.
8. `Invoke-WithAppsClosed` reopens the apps that were running (also after a failure).

## Data pathways

- In: Desktop `Local Storage`, VS Code shared `state.vscdb`, Credential Manager live entries.
- Out: `%LOCALAPPDATA%\github-switch\<profile>\`, `github-switch:<profile>:*` entries, `current.txt`.

## Failure behavior

- An app does not close → `throw`; nothing saved.
- Desktop signed in as someone else → only Desktop is skipped; VS Code and tokens still saved.

## Notes

- **Why step 6 exists:** before 2026-11-14, Save wrote `current.txt` but left git pointing at the
  previous account. After adding a second account, "Active profile" said the new profile while GCM's
  default user was still the first account, whose GCM token had just been replaced — so a push from
  VS Code (prompts disabled) fell back to a password box and failed with
  `Invalid username or token. Password authentication is not supported`.
- The VS Code session is encrypted, so `-Save` **cannot check which account it belongs to**. Sign
  VS Code in as the profile's account before saving.
- Run `-Save` again any time to refresh a profile (e.g. after re-signing in).
- `-Save` reads the Desktop login from the LevelDB files; see `readme/methods/desktop-state.md`
  for how reliable that is.

---
*Last updated: 2026-11-15 (gh auth switch gets GitHub's spelling of the login)*
*Previously: 2026-11-14 (Save profile button now in the -Ui web page; example made generic)*
*Previously: 2026-11-14 (Save also switches gh and sets git identity + GCM user, so "Active profile" is true)*
*Previously: 2026-10-30 (moved into Save-ProfileState; also used by the -Login window)*
*Previously: 2026-10-30 (initial flow doc)*
