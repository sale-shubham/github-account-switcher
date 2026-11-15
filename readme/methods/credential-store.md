# Credential store

Covers `CredStore` / `StoredCredential` (C# compiled by `Add-Type` at the top of
`switch-github-core.ps1`) and the PowerShell functions `Backup-Tokens` and `Restore-Tokens`. Called
by the switch and save flows; `Get-LoginState` also uses `[CredStore]::List` to check sign-ins.

## Token targets

`$tokenTarget = '^(git:https://(.+@)?github\.com|gh:github\.com:|GitHub - https://api\.github\.com/)'`

| Target (as seen in Credential Manager) | Written by | User field |
|---|---|---|
| `git:https://github.com` | Git Credential Manager | GitHub login |
| `git:https://<x>@github.com...` | GCM, for further accounts (pattern allowed for) | GitHub login |
| `gh:github.com:<user>` | gh CLI, one per logged-in account | GitHub login |
| `gh:github.com:` | gh CLI, active account copy | **empty** → never matched by the per-user filter |
| `GitHub - https://api.github.com/<login>` | GitHub Desktop (keytar) | GitHub login |
| `github-switch:<profile>:<original target>` | this tool — backups | GitHub login |

`cmdkey /list` shows these as `LegacyGeneric:target=<target>`.

## API

### `[CredStore]::List(filter)`
`CredEnumerateW`. `filter` is a target prefix ending in `*` (e.g. `"github-switch:work:*"`), or
`$null` / `""` for all entries (an empty string is turned into `null` inside, because PowerShell
passes `$null` to a .NET `string` as `""`). Returns `StoredCredential[]` (`Target`, `User`, `Blob`
bytes, `Persist`); generic credentials only. `ERROR_NOT_FOUND` (1168) → empty array; other errors →
`Win32Exception`.

### `[CredStore]::Write(target, user, blob, persist)`
`CredWriteW`, type generic. Creates or overwrites. Keeps the original `Persist` value (Desktop uses
`3` Enterprise, gh/GCM use `2` Local machine). Attributes and comments are not copied.

### `[CredStore]::Delete(target)`
`CredDeleteW`; missing target is not an error. Used for test cleanup only.

### `Backup-Tokens $profileName $user`
For every live entry whose `User -eq $user` and target matches `$tokenTarget`, writes a copy to
`github-switch:<profile>:<target>`. Overwrites older backups with the current value.

### `Restore-Tokens $profileName $user`
For every `github-switch:<profile>:*` backup: if the original target is **missing**, or held by a
**different user**, writes the backup back to the original target and prints
`Restored token: <target>`. An entry already owned by `$user` is left alone (it may be newer).

### `Get-LoginSpelling $user`
GitHub's spelling of a login: the `<user>` part of `gh:github.com:<user>`, else of
`GitHub - https://api.github.com/<user>`, looked up with `[CredStore]::List` and no `*` (one exact
target; Windows ignores case in target names). Neither found, or `$user` empty: `$user` unchanged.
Reads target names only, never `.Blob`. Needed because GitHub logins ignore case but
`gh auth switch --user` does not ("not logged in to github.com account octocat" when gh knows
`Octocat`). Used by `Set-AccountProfile` (stores that spelling), `Save-ProfileState`, `Switch-Profile`
and `Remove-CliLogin` (pass it to gh).

## Notes

- Token bytes never leave memory except into another Credential Manager entry. Never print `.Blob`.
- `cmdkey` cannot read secrets and failed to create targets containing ` - ` with spaces in tests —
  use `[CredStore]::Write` for test fixtures.
- To load `[CredStore]` in a shell for inspection, dot-source the core
  (`. .\switch-github-core.ps1`) — it defines state and functions and runs nothing.
- `List` with an exact target and no `*` returns just that entry (used by `Get-LoginState`).
- C# must stay C# 5 (Windows PowerShell 5.1 compiles `Add-Type` with the .NET Framework compiler).
  The type is only added once per session (`'CredStore' -as [type]` guard).

---
*Last updated: 2026-11-15 (Get-LoginSpelling: gh matches logins case-sensitively)*
*Previously: 2026-10-30 (code moved to switch-github-core.ps1)*
*Previously: 2026-10-30 (initial methods doc)*
