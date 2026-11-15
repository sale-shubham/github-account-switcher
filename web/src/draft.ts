// The add-account wizard's progress, kept in localStorage so a refresh or a closed tab does not lose
// it. Holds only what the user typed (no tokens). Cleared once the profile is saved, or on Cancel.

export interface Fields {
  profile: string;
  user: string;
  gitName: string;
  email: string;
}

export interface Draft {
  step: number;
  fields: Fields;
  // The login the apps were prepared for; preparing again is offered when the login changes.
  preparedFor: string;
  // The profile being signed in again ("Sign in again"), or '' when adding a new account.
  repair: string;
}

const key = 'switcher-add-account';

export const emptyFields: Fields = { profile: '', user: '', gitName: '', email: '' };

export function loadDraft(): Draft | null {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const draft = JSON.parse(raw) as Partial<Draft>;
    const fields = { ...emptyFields, ...draft.fields };
    if (Object.values(fields).some((v) => typeof v !== 'string')) return null;
    const step = typeof draft.step === 'number' && draft.step >= 0 && draft.step <= 3 ? draft.step : 0;
    return {
      step,
      fields,
      preparedFor: typeof draft.preparedFor === 'string' ? draft.preparedFor : '',
      repair: typeof draft.repair === 'string' ? draft.repair : '',
    };
  } catch {
    return null;
  }
}

export function saveDraft(draft: Draft): void {
  try {
    localStorage.setItem(key, JSON.stringify(draft));
  } catch {
    // Storage blocked: the wizard still works, it just will not survive a refresh.
  }
}

export function clearDraft(): void {
  try {
    localStorage.removeItem(key);
  } catch {
    // Nothing stored to clear.
  }
}
