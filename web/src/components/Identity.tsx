import type { CSSProperties } from 'react';
import type { Profile, Status } from '../api';
import { toolIcons } from '../icons';
import { offAccountTools, routesFor, toolNames } from '../tools';
import { Avatar } from './Avatar';

interface Props {
  status: Status;
  rewired: number;
  onAdd: () => void;
  onRepair: (profile: Profile) => void;
}

// The active account and the line from it to each of the four tools.
export function Identity({ status, rewired, onAdd, onRepair }: Props) {
  const active = status.profiles.find((p) => p.name === status.activeProfile);
  const routes = routesFor(status, active?.user);
  const onAccount = routes.filter((r) => r.state === 'ok').length;
  const offTools = active ? offAccountTools(status, routes) : '';

  const summary = !active
    ? 'No profile is active. Add an account to start.'
    : onAccount === routes.length
      ? 'All four tools use this account.'
      : `${onAccount} of ${routes.length} tools use this account.`;

  return (
    <section className="identity" aria-labelledby="identity-name">
      <div className="identity-person">
        {active ? (
          <>
            <Avatar user={active.user} size={72} />
            <div>
              <h1 id="identity-name" className="identity-name">
                {active.name}
              </h1>
              <p className="identity-login">@{active.user}</p>
              <p className="identity-commit">
                Commits as {status.git.name ?? 'nobody'}
                {status.git.email ? <span className="muted"> &lt;{status.git.email}&gt;</span> : null}
              </p>
              <p className="identity-summary">{summary}</p>
            </div>
          </>
        ) : (
          <div>
            <h1 id="identity-name" className="identity-name">
              No active account
            </h1>
            <p className="identity-summary">{summary}</p>
            <button type="button" className="btn btn-primary identity-add" onClick={onAdd}>
              Add your first account
            </button>
          </div>
        )}
      </div>

      <div className={`trunk ${active && onAccount === routes.length ? 'trunk-ok' : ''}`} aria-hidden="true" />

      <ul className="routes" key={rewired} data-rewired={rewired > 0 || undefined}>
        {routes.map((route, i) => {
          const ToolIcon = toolIcons[route.key];
          return (
            <li key={route.key} className={`route route-${route.state}`} style={{ '--i': i } as CSSProperties}>
              <span className="route-icon">
                <ToolIcon />
              </span>
              <span className="route-tool">
                <span className="route-name">{toolNames[route.key].name}</span>
                <span className="route-detail">{toolNames[route.key].detail}</span>
              </span>
              <span className="route-account">
                {route.account ? <span className="route-login">@{route.account}</span> : null}
                <span className="route-note">{route.note}</span>
              </span>
            </li>
          );
        })}
      </ul>

      {active && offTools ? (
        <div className="card-callout identity-callout">
          <p>
            {offTools} not use <span className="nowrap">@{active.user}</span>. Sign in to them again and save the profile.
          </p>
          <button type="button" className="btn btn-primary btn-small" onClick={() => onRepair(active)}>
            Sign in again
          </button>
        </div>
      ) : null}
    </section>
  );
}
