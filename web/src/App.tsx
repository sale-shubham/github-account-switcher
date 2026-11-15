import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import type { ActionResult, Profile, Status } from './api';
import { api, hasToken } from './api';
import { Activity, type ActivityEntry } from './components/Activity';
import { AddAccount } from './components/AddAccount';
import { ConfirmDialog, type ConfirmRequest } from './components/ConfirmDialog';
import { Identity } from './components/Identity';
import { Profiles } from './components/Profiles';
import { loadDraft } from './draft';
import { BrandMark, RefreshIcon } from './icons';

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

// Shown while an action runs. A modal <dialog> so it also covers the add-account drawer.
function BusyDialog({ text }: { text: string | null }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (text && !dialog.open) dialog.showModal();
    if (!text && dialog.open) dialog.close();
  }, [text]);
  return (
    <dialog ref={ref} className="busy" onCancel={(event) => event.preventDefault()} aria-live="assertive">
      <span className="spinner" aria-hidden="true" />
      <p className="busy-text">{text}</p>
      <p className="busy-hint">If an app asks about unsaved changes, answer it there. The switcher waits up to 20 seconds per app.</p>
    </dialog>
  );
}

function Gate({ title, children }: { title: string; children: ReactNode }) {
  return (
    <main className="gate">
      <BrandMark />
      <h1>{title}</h1>
      {children}
    </main>
  );
}

export function App() {
  const [status, setStatus] = useState<Status | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [confirmRequest, setConfirmRequest] = useState<ConfirmRequest | null>(null);
  // An unfinished add-account wizard (saved in localStorage) reopens after a refresh.
  const [adding, setAdding] = useState(() => loadDraft() !== null);
  // The profile the wizard signs in again, or null when it adds an account.
  const [repairing, setRepairing] = useState<string | null>(() => loadDraft()?.repair || null);
  const [entries, setEntries] = useState<ActivityEntry[]>([]);
  const [rewired, setRewired] = useState(0);
  const lastActive = useRef<string | null>(null);
  const nextId = useRef(1);

  const refresh = useCallback(async () => {
    setRefreshing(true);
    try {
      const next = await api.status();
      if (lastActive.current !== null && lastActive.current !== next.activeProfile) setRewired((n) => n + 1);
      lastActive.current = next.activeProfile;
      setStatus(next);
      setLoadError(null);
    } catch (error) {
      setLoadError(messageOf(error));
    } finally {
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    if (hasToken) void refresh();
  }, [refresh]);

  const run = useCallback(
    async (title: string, busyText: string | null, action: () => Promise<ActionResult>) => {
      if (busyText) setBusy(busyText);
      const record = (ok: boolean, log: ActionResult['log']) =>
        setEntries((list) => [{ id: nextId.current++, at: new Date(), title, ok, log }, ...list].slice(0, 30));
      try {
        const result = await action();
        record(result.ok, result.log);
        return result;
      } catch (error) {
        record(false, [{ level: 'error', text: messageOf(error) }]);
        return null;
      } finally {
        setBusy(null);
        void refresh();
      }
    },
    [refresh],
  );

  const switchTo = (profile: Profile) => {
    const closesApps = profile.desktopSaved || profile.vscodeSaved;
    setConfirmRequest({
      title: `Switch to ${profile.name}?`,
      body: closesApps
        ? `GitHub CLI, git, GitHub Desktop and VS Code all move to @${profile.user}. Desktop and VS Code close and reopen, so save your work in them first.`
        : `GitHub CLI and git move to @${profile.user}. This profile has no saved Desktop or VS Code sign-in, so those apps stay as they are.`,
      confirmLabel: 'Switch',
      onConfirm: () => void run(`Switch to ${profile.name}`, `Switching to ${profile.name}`, () => api.switchTo(profile.name)),
    });
  };

  const deleteProfile = (profile: Profile) =>
    setConfirmRequest({
      title: `Delete profile ${profile.name}?`,
      body: `The switcher forgets ${profile.name}: its saved Desktop and VS Code sign-ins and its token backups. The GitHub account @${profile.user} itself is not touched, and nothing closes.`,
      confirmLabel: 'Delete profile',
      option: {
        label: `Also sign @${profile.user} out of GitHub CLI and Git on this PC`,
        hint: 'Off: gh and Git keep this login, so adding the account again skips signing in to them. On: they forget it here; the token stays valid on GitHub until you revoke it there.',
      },
      onConfirm: (signOut) =>
        void run(`Delete profile ${profile.name}${signOut ? ' and sign out' : ''}`, null, () => api.remove(profile.name, signOut)),
    });

  const openAdd = () => {
    setRepairing(null);
    setAdding(true);
  };

  const repair = (profile: Profile) => {
    setRepairing(profile.name);
    setAdding(true);
  };

  if (!hasToken) {
    return (
      <Gate title="Open the switcher from PowerShell">
        <p>
          This page only works with the one-time link the switcher prints. In the project folder, run{' '}
          <code>.\switch-github.ps1 -Ui</code> and it opens the page for you.
        </p>
      </Gate>
    );
  }

  if (!status) {
    return (
      <Gate title={loadError ? 'Cannot reach the switcher' : 'Reading your sign-ins'}>
        {loadError ? (
          <>
            <p>{loadError}</p>
            <button type="button" className="btn btn-primary" onClick={() => void refresh()}>
              Try again
            </button>
          </>
        ) : (
          <span className="spinner" aria-label="Loading" />
        )}
      </Gate>
    );
  }

  return (
    <>
      <header className="topbar">
        <div className="brand">
          <BrandMark />
          <span className="brand-name">Account Switcher</span>
        </div>
        <button type="button" className="btn btn-ghost" onClick={() => void refresh()} aria-busy={refreshing}>
          <span className={refreshing ? 'spin' : ''}>
            <RefreshIcon />
          </span>
          Refresh
        </button>
      </header>

      <main className="page">
        {loadError ? (
          <p className="banner" role="alert">
            {loadError}
          </p>
        ) : null}
        <Identity status={status} rewired={rewired} onAdd={openAdd} onRepair={repair} />
        <Profiles
          profiles={status.profiles}
          activeProfile={status.activeProfile}
          onSwitch={switchTo}
          onDelete={deleteProfile}
          onRepair={repair}
          onAdd={openAdd}
        />
        <Activity entries={entries} />
      </main>

      <footer className="footer">
        Runs only on this PC. Tokens stay in Windows Credential Manager and are never shown here.
      </footer>

      {adding ? (
        <AddAccount
          status={status}
          run={run}
          confirm={setConfirmRequest}
          onClose={() => setAdding(false)}
          onToolsChanged={refresh}
          repair={repairing}
        />
      ) : null}
      <ConfirmDialog request={confirmRequest} onClose={() => setConfirmRequest(null)} />
      <BusyDialog text={busy} />
    </>
  );
}
