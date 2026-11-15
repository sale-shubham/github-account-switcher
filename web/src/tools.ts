import type { Status, ToolKey } from './api';

export const toolOrder: ToolKey[] = ['gh', 'git', 'desktop', 'vscode'];

export const toolNames: Record<ToolKey, { name: string; detail: string }> = {
  gh: { name: 'GitHub CLI', detail: 'gh' },
  git: { name: 'Git', detail: 'Credential Manager' },
  desktop: { name: 'GitHub Desktop', detail: 'App sign-in' },
  vscode: { name: 'VS Code', detail: 'GitHub session' },
};

export type RouteState = 'ok' | 'other' | 'off';

export interface Route {
  key: ToolKey;
  state: RouteState;
  account: string;
  note: string;
}

// GitHub logins ignore case: gh and Desktop spell one as GitHub does ("Octocat"), a profile may hold "octocat".
export function sameLogin(a: string | null | undefined, b: string | null | undefined): boolean {
  return !!a && !!b && a.toLowerCase() === b.toLowerCase();
}

// How each tool relates to the active account: on it, on another account, or signed out.
export function routesFor(status: Status, user: string | undefined): Route[] {
  const { gh, git, desktop, vscode } = status.tools;

  const byAccount = (key: ToolKey, account: string | null, missing: string): Route => {
    if (!account) return { key, state: 'off', account: '', note: missing };
    if (sameLogin(account, user)) return { key, state: 'ok', account, note: 'Uses this account' };
    return { key, state: 'other', account, note: 'Uses another account' };
  };

  const ghRoute = gh.installed
    ? byAccount('gh', gh.account, 'Not signed in')
    : { key: 'gh' as const, state: 'off' as const, account: '', note: 'Not installed' };

  let gitRoute = byAccount('git', git.account, 'No default account');
  if (gitRoute.state === 'ok' && !git.signedIn) {
    gitRoute = { ...gitRoute, state: 'other', note: 'No saved login, next push asks' };
  }

  const vscodeRoute: Route = !vscode.installed
    ? { key: 'vscode', state: 'off', account: '', note: 'VS Code or Python not found' }
    : vscode.session
      ? { key: 'vscode', state: 'ok', account: '', note: 'Signed in (VS Code hides which account)' }
      : { key: 'vscode', state: 'off', account: '', note: 'Not signed in' };

  return [ghRoute, gitRoute, byAccount('desktop', desktop.account, 'Not signed in'), vscodeRoute];
}

// Git and GitHub Desktop are always shown; gh and VS Code only count when found on this machine.
export function toolInstalled(status: Status, key: ToolKey): boolean {
  return key === 'gh' ? status.tools.gh.installed : key === 'vscode' ? status.tools.vscode.installed : true;
}

// ['GitHub CLI', 'Git', 'GitHub Desktop'] -> "GitHub CLI, Git and GitHub Desktop".
export function listNames(names: string[]): string {
  return names.length < 2 ? (names[0] ?? '') : `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
}

// "GitHub CLI and GitHub Desktop do" (+ "not use @login") for the installed tools that are off the
// active account, or '' when every installed tool uses it. Signing in again fixes these.
export function offAccountTools(status: Status, routes: Route[]): string {
  const names = routes.filter((r) => r.state !== 'ok' && toolInstalled(status, r.key)).map((r) => toolNames[r.key].name);
  if (names.length === 0) return '';
  return `${listNames(names)} ${names.length === 1 ? 'does' : 'do'}`;
}
