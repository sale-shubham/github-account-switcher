# GitHub Account Switcher for Windows

Use **multiple GitHub accounts on one Windows PC**, such as a work and a personal account, and
switch between them in **all four places at once**: the GitHub CLI (`gh`), git (commit identity +
Git Credential Manager), **GitHub Desktop** and **VS Code**. No signing out and back in. It has a
local web UI and a one-line CLI.

![Account Switcher: the active account wired to GitHub CLI, Git, GitHub Desktop and VS Code, with the saved profiles below](docs/screenshot.png)

Each of these tools keeps its own GitHub sign-in, and none of them follows the others. Moving
from a work account to a personal one usually means signing out and back in four times. Signing
out also deletes the saved token. This tool signs every account in once, keeps each account's
sign-ins safe, and puts them back when you switch.

## Features

- **One view of every tool**: the active account and which account each tool really uses, with
  mismatches flagged.
- **One-click switch** between profiles, with a confirmation and a full log of what changed.
- **One profile per GitHub account**: a username or email already in use is refused, and a
  profile can be deleted without touching the account or the apps, or, if you tick the box, also
  signed out of the GitHub CLI and Git on this PC.
- **Guided add-account flow**: prepare the apps, sign in to each tool with live status, save.
  **Sign in again** reopens it for a saved profile, to fix one saved before every tool was signed in.
- **Nothing is ever signed out**. Tokens are backed up and restored inside Windows Credential
  Manager, and app sign-ins are moved aside, never deleted.
- **Local only**. A localhost server with a per-run key. Tokens are never shown, logged or sent
  anywhere.
- **Safe app handling**. VS Code and Desktop are closed normally, so unsaved-work prompts still
  appear, then reopened.

## How it works

```
 React UI (web/)  --HTTP + per-run key-->  switch-github-ui.ps1  (localhost:47821)
                                                 |
 switch-github.ps1 (CLI) ----------------------> switch-github-core.ps1
                                                 |
        +-------------------+--------------------+--------------------+
        |                   |                    |                    |
   gh auth switch    Credential Manager    Desktop "Local      VS Code shared state DB
   git config        token backups         Storage" snapshot   (vscode_secret.py, sqlite3)
                     (advapi32 P/Invoke)
```

| Tool | Where its login lives | What a switch does |
|---|---|---|
| GitHub CLI | Credential Manager `gh:github.com:<user>` | `gh auth switch` |
| Git | Credential Manager `git:https://github.com` + global git config | Restores that account's token, sets `user.name`, `user.email` and GCM's default account |
| GitHub Desktop | `%APPDATA%\GitHub Desktop\Local Storage` + Credential Manager | Swaps in the profile's saved `Local Storage` and restores the token |
| VS Code | `~\.vscode-shared\sharedStorage\state.vscdb` (encrypted by VS Code) | Writes back the profile's saved, still-encrypted session |

Full storage map and switch lifecycle: [`readme/ARCHITECTURE.md`](./readme/ARCHITECTURE.md).

**Tech:** Windows PowerShell 5.1 with inline C# (advapi32 P/Invoke for Credential Manager), the
Python standard library (`sqlite3`), React 18 + TypeScript + Vite. The PowerShell side has no
third-party dependencies.

## Requirements

- Windows 10/11, Windows PowerShell 5.1
- Git for Windows with Git Credential Manager
- GitHub CLI `gh` 2.40+ (multi-account support)
- Python 3 on `PATH` (standard library only), for the VS Code part
- Node.js 18+, only to build the web UI once
- GitHub Desktop and VS Code are optional; each part is skipped with a warning if missing

## Quick start

```powershell
cd web
npm install
npm run build
cd ..
.\switch-github.ps1 -Ui
```

The browser opens the switcher. Keep the PowerShell window open while you use it. Run it from a
normal PowerShell window: started from VS Code's terminal it reopens itself in its own window,
because a switch closes VS Code and everything running inside it.

**Add your first account:** click **Add account** and follow the four steps. To add more, repeat
them; the current account is saved before the apps are signed out.

## Command line

```powershell
.\switch-github.ps1                  # show current state and saved profiles
.\switch-github.ps1 work             # switch everything to profile 'work'
.\switch-github.ps1 -Save work       # save what is signed in now into 'work'
.\switch-github.ps1 -Clear           # sign Desktop + VS Code out safely, to add another account
.\switch-github.ps1 -Ui              # open the web UI
```

`accounts.json` (created by the UI, or copied from `accounts.example.json`) holds the profiles:

```json
{
  "work":     { "name": "Your Name", "email": "you@company.com", "user": "work-login" },
  "personal": { "name": "Your Name", "email": "you@example.com", "user": "personal-login" }
}
```

Adding an account without the UI: `-Save` the current one, `-Clear`, sign in to Desktop, VS Code,
`gh auth login --web` and `git credential-manager github login --username <login>`, then
`-Save <new profile>`. See [`readme/flows/clear.md`](./readme/flows/clear.md).

> **Never click "Sign out"** in Desktop or VS Code, and never run `gh auth logout`. It deletes
> the token. Use **Prepare** in the UI, or `-Clear`, instead.

## FAQ

**How do I use two GitHub accounts on one Windows PC?**
Add each account once with **Add account** in the UI (or `-Save` on the command line). After that,
one **Switch** moves the GitHub CLI, git, GitHub Desktop and VS Code to the other account.

**Does `gh auth switch` also change the account git pushes with?**
Not with Git Credential Manager, the Git for Windows default. `gh auth switch` changes only the
GitHub CLI; git keeps pushing with the account saved in Git Credential Manager, and commits keep
the old `user.name` / `user.email`. The switcher changes all three.

**How do I switch GitHub accounts in GitHub Desktop or VS Code without signing out?**
Signing out deletes the saved token, so you sign in from scratch every time. The switcher closes
the app normally, swaps in the sign-in it saved for that account, and reopens it.

**Is it safe? Where are my tokens?**
Tokens stay in Windows Credential Manager, encrypted for your Windows user. The UI runs on
localhost only, with a per-run key, and never shows a token.

**Does it work on macOS or Linux?**
No. It is built on Windows Credential Manager and the Windows app data folders.

## Not covered

- SSH keys, and GitHub Enterprise Server hosts (github.com only)
- Copilot's remembered account preference (it may ask once which account to use)
- Which account the VS Code session belongs to: VS Code encrypts it, so the UI only shows that
  one exists

Full list: [`readme/ARCHITECTURE.md`](./readme/ARCHITECTURE.md), "Known limitations".

## Documentation

| Doc | Covers |
|---|---|
| [Website](https://sale-shubham.github.io/github-account-switcher/) | Project page with a live demo of a switch |
| [`readme/ARCHITECTURE.md`](./readme/ARCHITECTURE.md) | Where each app stores its login, switch lifecycle, security, known limitations |
| [`readme/RESEARCH.md`](./readme/RESEARCH.md) | Existing tools surveyed and why they fall short |
| [`readme/flows/`](./readme/flows/) | Switch, save, clear, and the web UI, step by step |
| [`readme/methods/`](./readme/methods/) | Credential store, VS Code session, Desktop state, profiles, UI server + API |
| [`PROJECT_STRUCTURE.md`](./PROJECT_STRUCTURE.md) | File tree, module map, tool versions |
| [`CLAUDE.md`](./CLAUDE.md), [`docs/DOC_SYNC.md`](./docs/DOC_SYNC.md) | How the docs are kept in sync with the code |

## License

[MIT](./LICENSE)
