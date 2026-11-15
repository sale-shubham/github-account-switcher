import type { Profile } from '../api';
import { CheckIcon, PlusIcon } from '../icons';
import { Avatar } from './Avatar';

interface Props {
  profiles: Profile[];
  activeProfile: string;
  onSwitch: (profile: Profile) => void;
  onDelete: (profile: Profile) => void;
  onRepair: (profile: Profile) => void;
  onAdd: () => void;
}

function Saved({ ok, label }: { ok: boolean; label: string }) {
  return (
    <span className={`saved ${ok ? 'saved-ok' : 'saved-missing'}`}>
      {ok ? <CheckIcon /> : <span className="saved-dash" aria-hidden="true" />}
      {label}
      <span className="visually-hidden">{ok ? ' saved' : ' not saved'}</span>
    </span>
  );
}

export function Profiles({ profiles, activeProfile, onSwitch, onDelete, onRepair, onAdd }: Props) {
  return (
    <section className="panel" aria-labelledby="profiles-title">
      <div className="panel-head">
        <h2 id="profiles-title">Profiles</h2>
        <button type="button" className="btn btn-primary" onClick={onAdd}>
          <PlusIcon />
          Add account
        </button>
      </div>

      {profiles.length === 0 ? (
        <p className="empty">Each GitHub account you add becomes a profile here, ready to switch to.</p>
      ) : (
        <ul className="profiles">
          {profiles.map((profile) => {
            const active = profile.name === activeProfile;
            return (
              <li key={profile.name} className={`profile ${active ? 'profile-active' : ''}`}>
                <Avatar user={profile.user} size={44} />
                <div className="profile-who">
                  <span className="profile-name">{profile.name}</span>
                  <span className="profile-login">@{profile.user}</span>
                  <span className="profile-email">
                    {profile.gitName} &lt;{profile.email}&gt;
                  </span>
                </div>
                <div className="profile-saved" title="Sign-ins saved in this profile">
                  <Saved ok={profile.desktopSaved} label="Desktop" />
                  <Saved ok={profile.vscodeSaved} label="VS Code" />
                </div>
                <div className="profile-action">
                  {active ? null : (
                    <button
                      type="button"
                      className="btn btn-danger-ghost btn-small"
                      onClick={() => onDelete(profile)}
                      aria-label={`Delete profile ${profile.name}`}
                    >
                      Delete
                    </button>
                  )}
                  <button
                    type="button"
                    className="btn btn-ghost btn-small"
                    onClick={() => onRepair(profile)}
                    aria-label={`Sign in again to profile ${profile.name}`}
                  >
                    Sign in again
                  </button>
                  {active ? (
                    <span className="pill pill-active">Active</span>
                  ) : (
                    <button type="button" className="btn btn-secondary" onClick={() => onSwitch(profile)}>
                      Switch
                    </button>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
