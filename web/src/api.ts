// Typed client for the PowerShell server's JSON API (switch-github-ui.ps1).

export type ToolKey = 'gh' | 'git' | 'desktop' | 'vscode';

export interface Profile {
  name: string;
  gitName: string;
  email: string;
  user: string;
  desktopSaved: boolean;
  vscodeSaved: boolean;
}

export interface Status {
  activeProfile: string;
  git: { name: string | null; email: string | null };
  tools: {
    gh: { installed: boolean; account: string | null };
    git: { account: string | null; signedIn: boolean };
    desktop: { account: string | null };
    vscode: { installed: boolean; session: boolean };
  };
  profiles: Profile[];
}

// Whether each tool is ready for the login being added (the same tests saving uses), and the account
// gh, git and Desktop use right now (null when signed out). VS Code hides its account.
export type LoginState = Record<ToolKey, boolean> & {
  now: { gh: string | null; git: string | null; desktop: string | null };
};

export interface LogLine {
  level: 'info' | 'warn' | 'error';
  text: string;
}

export interface ActionResult {
  ok: boolean;
  log: LogLine[];
}

export interface NewProfile {
  profile: string;
  user: string;
  gitName: string;
  email: string;
}

const tokenKey = 'switcher-token';

// The server opens this page with ?t=<token>. Keep it for reloads, then drop it from the address bar.
function readToken(): string {
  const params = new URLSearchParams(window.location.search);
  const fromUrl = params.get('t');
  if (fromUrl) {
    try {
      sessionStorage.setItem(tokenKey, fromUrl);
    } catch {
      // Storage can be blocked; the token still works until the page reloads.
    }
    params.delete('t');
    const query = params.toString();
    window.history.replaceState(null, '', window.location.pathname + (query ? `?${query}` : '') + window.location.hash);
    return fromUrl;
  }
  try {
    return sessionStorage.getItem(tokenKey) ?? '';
  } catch {
    return '';
  }
}

const token = readToken();
export const hasToken = token !== '';

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let response: Response;
  try {
    response = await fetch(path, {
      ...init,
      headers: { 'Content-Type': 'application/json', 'X-Switcher-Token': token },
    });
  } catch {
    throw new ApiError('The switcher is not running. Start it with .\\switch-github.ps1 -Ui and open the link it prints.', 0);
  }
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new ApiError(body.error ?? `The switcher answered ${response.status}.`, response.status);
  }
  return body as T;
}

function post(path: string, body: object): Promise<ActionResult> {
  return request<ActionResult>(path, { method: 'POST', body: JSON.stringify(body) });
}

export const api = {
  status: () => request<Status>('/api/status'),
  loginState: (user: string) => request<LoginState>(`/api/login-state?user=${encodeURIComponent(user)}`),
  prepare: () => post('/api/prepare', {}),
  signIn: (tool: ToolKey, user: string) => post('/api/signin', { tool, user }),
  save: (profile: NewProfile) => post('/api/save', profile),
  switchTo: (profile: string) => post('/api/switch', { profile }),
  // signOut: also sign the account out of gh and Git Credential Manager on this PC.
  remove: (profile: string, signOut: boolean) => post('/api/delete', { profile, signOut }),
};

export const loginPattern = /^[A-Za-z0-9-]{1,39}$/;
export const profilePattern = /^[A-Za-z0-9-]+$/;
