import { useEffect, useRef, useState, type ChangeEvent, type ReactNode } from 'react';
import type { ActionResult, LoginState, Profile, Status, ToolKey } from '../api';
import { api, loginPattern, profilePattern } from '../api';
import { CheckIcon, CloseIcon, toolIcons } from '../icons';
import { clearDraft, emptyFields, loadDraft, saveDraft, type Fields } from '../draft';
import { listNames, sameLogin, toolInstalled, toolNames, toolOrder } from '../tools';
import type { ConfirmRequest } from './ConfirmDialog';

type Run = (title: string, busyText: string | null, action: () => Promise<ActionResult>) => Promise<ActionResult | null>;

interface Props {
  status: Status;
  run: Run;
  confirm: (request: ConfirmRequest) => void;
  onClose: () => void;
  // Reload the page's status when a sign-in changes, so the page behind the wizard says the same thing.
  onToolsChanged: () => void;
  // A saved profile to sign in again (same steps, details filled in, saving updates it), or null to add one.
  repair: string | null;
}

const steps = ['Account details', 'Prepare the apps', 'Sign in to each tool', 'Save profile'];

const signInHelp: Record<ToolKey, string> = {
  gh: 'Opens a console and puts a one-time code on your clipboard. If it asks to authenticate Git with your GitHub credentials, answer n.',
  git: 'Opens the browser to sign Git Credential Manager in. Pushes from any tool use this login.',
  desktop: 'Opens GitHub Desktop. Choose "Sign in to GitHub.com", then approve in the browser.',
  vscode: 'Opens VS Code. Click the Accounts icon at the bottom of the left bar, sign in with GitHub, then approve in the browser.',
};

// gh and git start the sign-in themselves; Desktop and VS Code can only be opened - you sign in inside the app.
const signInLabel: Record<ToolKey, string> = {
  gh: 'Sign in',
  git: 'Sign in',
  desktop: 'Open Desktop',
  vscode: 'Open VS Code',
};

// Same rules as Set-AccountProfile: one profile per GitHub login and per email (both case-insensitive),
// because GitHub logins are unique and an email belongs to one GitHub account at a time.
function validate(fields: Fields, profiles: Profile[]): Partial<Record<keyof Fields, string>> {
  const errors: Partial<Record<keyof Fields, string>> = {};
  const others = profiles.filter((p) => p.name.toLowerCase() !== fields.profile.toLowerCase());
  const sameUser = others.find((p) => p.user.toLowerCase() === fields.user.trim().toLowerCase());
  const sameEmail = others.find((p) => p.email.toLowerCase() === fields.email.trim().toLowerCase());
  if (!profilePattern.test(fields.profile)) errors.profile = 'Use letters, digits and "-" only, for example personal.';
  if (!loginPattern.test(fields.user)) errors.user = 'Enter the username from your profile link, github.com/<username>.';
  else if (sameUser) errors.user = `@${sameUser.user} already has a profile: ${sameUser.name}. Use it, or delete it first.`;
  if (!fields.gitName.trim()) errors.gitName = 'Enter the name your commits should show.';
  if (!/^[^\s@]+@[^\s@]+$/.test(fields.email)) errors.email = 'Enter the email your commits should show.';
  else if (sameEmail) errors.email = `This email is already in profile ${sameEmail.name}. GitHub links an email to one account only.`;
  return errors;
}

function fieldsOf(profile: Profile): Fields {
  return { profile: profile.name, user: profile.user, gitName: profile.gitName, email: profile.email };
}

// Add-account wizard: details, prepare (sign the apps out safely), sign in to each tool, save.
// With `repair` it signs a saved profile in again: the same steps, and saving updates that profile.
export function AddAccount({ status, run, confirm, onClose, onToolsChanged, repair }: Props) {
  const ref = useRef<HTMLDialogElement>(null);
  const repairing = repair ? (status.profiles.find((p) => p.name === repair) ?? null) : null;
  // Resume a draft only if it is for the same thing (adding, or signing in this profile again).
  const [restored] = useState(() => {
    const draft = loadDraft();
    return draft && draft.repair === (repair ?? '') ? draft : null;
  });
  const [step, setStep] = useState(restored?.step ?? 0);
  const [fields, setFields] = useState<Fields>(() => restored?.fields ?? (repairing ? fieldsOf(repairing) : emptyFields));
  const [touched, setTouched] = useState(false);
  const [preparedFor, setPreparedFor] = useState(restored?.preparedFor ?? '');
  const [logins, setLogins] = useState<LoginState | null>(null);
  const lastLogins = useRef('');
  const saved = useRef(false);

  const errors = validate(fields, status.profiles);
  const detailsValid = Object.keys(errors).length === 0;
  const replacing = status.profiles.some((p) => p.name === fields.profile);
  const activeProfile = status.profiles.find((p) => p.name === status.activeProfile);
  const prepared = preparedFor !== '' && preparedFor === fields.user;

  // What the apps hold right now that is not this account: the reason to prepare them first.
  const elsewhere: string[] = [];
  const desktopAccount = status.tools.desktop.account;
  if (desktopAccount && !sameLogin(desktopAccount, fields.user)) {
    elsewhere.push(`GitHub Desktop is signed in as @${desktopAccount}`);
  }
  // VS Code hides the account. Only the active profile's own session can be assumed to be this account.
  if (status.tools.vscode.session && !(repairing && repairing.name === status.activeProfile)) {
    elsewhere.push('VS Code is signed in to GitHub (it hides which account)');
  }

  useEffect(() => {
    const dialog = ref.current;
    if (dialog && !dialog.open) dialog.showModal();
  }, []);

  // Keep progress across a refresh until the profile is saved or the wizard is cancelled.
  useEffect(() => {
    if (saved.current) return;
    if (step > 0 || Object.values(fields).some((v) => v !== '')) {
      saveDraft({ step, fields, preparedFor, repair: repair ?? '' });
    }
  }, [step, fields, preparedFor, repair]);

  const cancel = () => {
    clearDraft();
    ref.current?.close();
  };

  // While the sign-in step is open, check the four tools every few seconds.
  useEffect(() => {
    if (step < 2) return;
    let cancelled = false;
    const check = () =>
      api
        .loginState(fields.user)
        .then((state) => {
          if (cancelled) return;
          const key = JSON.stringify(state);
          if (lastLogins.current && key !== lastLogins.current) onToolsChanged();
          lastLogins.current = key;
          setLogins(state);
        })
        .catch(() => undefined);
    void check();
    if (step !== 2) return () => void (cancelled = true);
    const timer = window.setInterval(check, 4000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [step, fields.user, onToolsChanged]);

  // Beyond "Signed in" / "Not yet": whose account a tool uses now, and what saving changes about it.
  const rowNote = (tool: ToolKey): { text: ReactNode; warn: boolean } | null => {
    if (!logins || tool === 'vscode') return null;
    const now = logins.now[tool];
    const onUser = sameLogin(now, fields.user);
    const login = (name: string) => <span className="nowrap">@{name}</span>;
    if (tool === 'desktop') {
      // Saving keeps Desktop only when the app itself shows this account.
      return !logins.desktop && now
        ? {
            text: (
              <>
                Signed in as {login(now)}, not {login(fields.user)}. Go back one step and prepare the apps.
              </>
            ),
            warn: true,
          }
        : null;
    }
    // gh and git hold several logins; saving switches them to this one.
    if (!logins[tool] || onUser) return null;
    return {
      text: now ? (
        <>
          Uses {login(now)} now. Saving switches it to {login(fields.user)}.
        </>
      ) : (
        <>Saving makes it use {login(fields.user)}.</>
      ),
      warn: false,
    };
  };
  const notReady = logins
    ? toolOrder.filter((tool) => !logins[tool] && toolInstalled(status, tool)).map((tool) => toolNames[tool].name)
    : [];

  const set = (key: keyof Fields) => (event: ChangeEvent<HTMLInputElement>) =>
    setFields((f) => ({ ...f, [key]: event.target.value }));

  const next = () => {
    if (step === 0 && !detailsValid) {
      setTouched(true);
      return;
    }
    setStep((s) => Math.min(s + 1, steps.length - 1));
  };

  const prepare = () =>
    confirm({
      title: 'Prepare the apps?',
      body: activeProfile
        ? `The current sign-ins are saved into "${activeProfile.name}" first. Then GitHub Desktop and VS Code close, start again signed out, and reopen. Save your work in them first.`
        : 'No profile is active, so the current sign-ins are kept aside in a backup folder. Then GitHub Desktop and VS Code close, start again signed out, and reopen. Save your work in them first.',
      confirmLabel: 'Prepare apps',
      onConfirm: async () => {
        const user = fields.user;
        const result = await run('Prepare apps', 'Closing GitHub Desktop and VS Code', api.prepare);
        if (result?.ok) setPreparedFor(user);
      },
    });

  const save = () =>
    confirm({
      title: `${replacing ? 'Update' : 'Save'} profile "${fields.profile}"?`,
      body: `GitHub Desktop and VS Code close and reopen while their sign-ins for @${fields.user} are saved. The profile then becomes active everywhere, git included.`,
      confirmLabel: replacing ? 'Update profile' : 'Save profile',
      onConfirm: async () => {
        const verb = replacing ? 'Update' : 'Save';
        const result = await run(`${verb} profile ${fields.profile}`, 'Saving sign-ins', () => api.save(fields));
        if (result?.ok) {
          saved.current = true;
          clearDraft();
          ref.current?.close();
        }
      },
    });

  const field = (key: keyof Fields, label: string, hint: string, example: string, type = 'text') => {
    const error = touched ? errors[key] : undefined;
    // Signing a profile in again keeps its name; everything else can be corrected.
    const locked = repairing !== null && key === 'profile';
    return (
      <label className="field">
        <span className="field-label">{label}</span>
        <input
          type={type}
          value={fields[key]}
          onChange={set(key)}
          placeholder={example}
          readOnly={locked}
          aria-invalid={error ? true : undefined}
          spellCheck={false}
          autoComplete="off"
          autoFocus={key === (repairing ? 'user' : 'profile')}
        />
        <span className={error ? 'field-error' : 'field-hint'}>{error ?? hint}</span>
      </label>
    );
  };

  const profileHint = repairing
    ? 'Saving updates this profile.'
    : replacing
      ? 'A profile with this name exists. Saving replaces it.'
      : 'Your own label for this account, used only in this switcher. Not your GitHub name.';

  return (
    <dialog ref={ref} className="drawer" onClose={onClose} aria-labelledby="add-title">
      <header className="drawer-head">
        <h2 id="add-title">{repairing ? `Sign in again: ${repairing.name}` : 'Add an account'}</h2>
        <button
          type="button"
          className="btn btn-icon"
          onClick={() => ref.current?.close()}
          aria-label="Close, your progress is kept"
          title="Close, your progress is kept"
        >
          <CloseIcon />
        </button>
      </header>

      <ol className="stepper">
        {steps.map((label, i) => (
          <li key={label} className={i === step ? 'step-current' : i < step ? 'step-done' : ''}>
            <span className="step-mark">{i < step ? <CheckIcon /> : i + 1}</span>
            <span className="step-label">{label}</span>
          </li>
        ))}
      </ol>
      {restored ? <p className="drawer-note">Picked up where you left off.</p> : null}

      <div className="drawer-body">
        {step === 0 ? (
          <div className="fields">
            {repairing ? (
              <p className="field-hint">
                Sign in to the tools again as @{repairing.user}, then save. This fixes a profile that was saved before
                every tool was signed in, or a sign-in that stopped working. Check the details first.
              </p>
            ) : null}
            {field('profile', 'Profile name', profileHint, 'work')}
            {field(
              'user',
              'GitHub username',
              'The login in your profile link, github.com/<username>. Not your display name or email. Capitals do not matter.',
              'octocat',
            )}
            {field(
              'gitName',
              'Name on commits',
              'Shown as the author of every commit (git user.name). Usually the name on your GitHub profile.',
              'Mona Lisa',
            )}
            {field(
              'email',
              'Email on commits',
              'An email added to this GitHub account (Settings > Emails), or its private noreply address. GitHub credits each commit to the account that owns this email (git user.email).',
              'octocat@users.noreply.github.com',
              'email',
            )}
          </div>
        ) : null}

        {step === 1 ? (
          <div className="prose">
            <p>
              Each app holds one GitHub sign-in at a time. Preparing keeps the current one safe, then starts GitHub
              Desktop and VS Code signed out so @{fields.user} can sign in.
            </p>
            <p className="callout">
              Never use <strong>Sign out</strong> inside the apps. It deletes the saved login. Preparing moves it aside
              instead.
            </p>
            {prepared ? null : elsewhere.length > 0 ? (
              <p>
                Right now {elsewhere.join(', and ')}. Prepare the apps so you can sign in there as @{fields.user}. If
                that is already @{fields.user}, skip this step.
              </p>
            ) : (
              <p>
                Neither GitHub Desktop nor VS Code is signed in to another account, so you can skip this step and sign
                in on the next one.
              </p>
            )}
            {prepared ? (
              <p className="done-line">
                <CheckIcon /> The apps are ready for @{fields.user}.
              </p>
            ) : (
              <button type="button" className={`btn ${elsewhere.length > 0 ? 'btn-primary' : 'btn-secondary'}`} onClick={prepare}>
                Prepare apps
              </button>
            )}
          </div>
        ) : null}

        {step >= 2 ? (
          <div className="prose">
            {step === 2 ? (
              <p>
                First sign in to github.com in your browser as <strong>@{fields.user}</strong>. Every tool below signs
                in through the browser and picks up that account. This list checks itself every few seconds.
              </p>
            ) : (
              <dl className="summary">
                <dt>Profile</dt>
                <dd>{fields.profile}</dd>
                <dt>GitHub</dt>
                <dd>@{fields.user}</dd>
                <dt>Commits as</dt>
                <dd>
                  {fields.gitName} &lt;{fields.email}&gt;
                </dd>
              </dl>
            )}
            <ul className="signins">
              {toolOrder.map((tool) => {
                const ToolIcon = toolIcons[tool];
                const ok = logins?.[tool];
                const note = rowNote(tool);
                return (
                  <li key={tool} className={`signin ${ok ? 'signin-ok' : ''}`}>
                    <span className="route-icon">
                      <ToolIcon />
                    </span>
                    <span className="signin-text">
                      <span className="route-name">{toolNames[tool].name}</span>
                      {note ? <span className={`signin-note ${note.warn ? 'signin-note-warn' : ''}`}>{note.text}</span> : null}
                      {step === 2 ? <span className="signin-help">{signInHelp[tool]}</span> : null}
                    </span>
                    <span className="signin-state">
                      {logins === null ? 'Checking' : ok ? 'Signed in' : 'Not yet'}
                    </span>
                    {step === 2 ? (
                      <button
                        type="button"
                        className="btn btn-secondary btn-small"
                        onClick={() =>
                          void run(
                            `${tool === 'gh' || tool === 'git' ? 'Sign in to' : 'Open'} ${toolNames[tool].name}`,
                            null,
                            () => api.signIn(tool, fields.user),
                          )
                        }
                      >
                        {signInLabel[tool]}
                      </button>
                    ) : null}
                  </li>
                );
              })}
            </ul>
            {step === 2 ? (
              <p className="field-hint">VS Code keeps its account encrypted, so its row only shows that a session exists.</p>
            ) : null}
            {step === 3 && notReady.length > 0 ? (
              <p className="callout">
                {listNames(notReady)} {notReady.length === 1 ? 'is' : 'are'} not signed in as{' '}
                <span className="nowrap">@{fields.user}</span>, so saving leaves {notReady.length === 1 ? 'it' : 'them'}{' '}
                out. Go back and sign in, or save now and use Sign in again later.
              </p>
            ) : null}
            {step === 3 ? (
              <button type="button" className="btn btn-primary" onClick={save}>
                {replacing ? 'Update profile' : 'Save profile'}
              </button>
            ) : null}
          </div>
        ) : null}
      </div>

      <footer className="drawer-foot">
        <button type="button" className="btn btn-ghost" onClick={() => (step === 0 ? cancel() : setStep(step - 1))}>
          {step === 0 ? 'Cancel' : 'Back'}
        </button>
        {step < steps.length - 1 ? (
          <button
            type="button"
            className={`btn ${step === 1 && !prepared && elsewhere.length > 0 ? 'btn-secondary' : 'btn-primary'}`}
            onClick={next}
          >
            {step === 1 && !prepared ? 'Skip this step' : 'Next'}
          </button>
        ) : null}
      </footer>
    </dialog>
  );
}
