import { useEffect, useRef, useState } from 'react';

export interface ConfirmRequest {
  title: string;
  body: string;
  confirmLabel: string;
  // An extra choice shown as a checkbox, unticked every time the dialog opens.
  option?: { label: string; hint: string };
  // `optionChecked` is false when the request has no option.
  onConfirm: (optionChecked: boolean) => void;
}

interface Props {
  request: ConfirmRequest | null;
  onClose: () => void;
}

// Native <dialog>: focus trap, Escape and the backdrop come from the browser.
export function ConfirmDialog({ request, onClose }: Props) {
  const ref = useRef<HTMLDialogElement>(null);
  const [checked, setChecked] = useState(false);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (request && !dialog.open) dialog.showModal();
    if (!request && dialog.open) dialog.close();
    setChecked(false);
  }, [request]);

  return (
    <dialog ref={ref} className="dialog" onClose={onClose} aria-labelledby="confirm-title">
      {request ? (
        <form
          method="dialog"
          onSubmit={(event) => {
            event.preventDefault();
            const confirm = request.onConfirm;
            const optionChecked = request.option !== undefined && checked;
            onClose();
            confirm(optionChecked);
          }}
        >
          <h2 id="confirm-title">{request.title}</h2>
          <p>{request.body}</p>
          {request.option ? (
            <label className="dialog-option">
              <input type="checkbox" checked={checked} onChange={(event) => setChecked(event.target.checked)} />
              <span>
                <span className="dialog-option-label">{request.option.label}</span>
                <span className="dialog-option-hint">{request.option.hint}</span>
              </span>
            </label>
          ) : null}
          <div className="dialog-actions">
            <button type="button" className="btn btn-ghost" onClick={onClose}>
              Cancel
            </button>
            <button type="submit" className="btn btn-primary" autoFocus>
              {request.confirmLabel}
            </button>
          </div>
        </form>
      ) : null}
    </dialog>
  );
}
