import { useEffect, useState } from "react";
import type { DialogState } from "./types";

interface DialogHostProps {
  dialogs: DialogState[];
  onRespond: (dialog: DialogState, value: unknown) => void;
}

export function DialogHost({ dialogs, onRespond }: DialogHostProps) {
  const dialog = dialogs[0];
  const payload = (dialog?.payload ?? {}) as Record<string, unknown>;
  const [inputValue, setInputValue] = useState("");

  useEffect(() => {
    setInputValue(typeof payload.value === "string" ? payload.value : "");
  }, [dialog?.requestId]);

  if (!dialog) {
    return <div className="dialog-host" aria-live="polite" />;
  }

  const title = String(payload.prompt ?? payload.placeHolder ?? dialogTitle(dialog));

  return (
    <div className="dialog-host active" aria-live="assertive">
      <section className="dialog-card" role="dialog" aria-modal="true" aria-label={title}>
        <h2>{title}</h2>
        {dialog.group === "dialog.showInputBox" ? (
          <form
            onSubmit={(event) => {
              event.preventDefault();
              onRespond(dialog, inputValue);
            }}
          >
            <input
              autoFocus
              className="dialog-input"
              onChange={(event) => setInputValue(event.target.value)}
              placeholder={typeof payload.placeHolder === "string" ? payload.placeHolder : ""}
              type={payload.password === true ? "password" : "text"}
              value={inputValue}
            />
            <div className="dialog-actions">
              <button type="button" onClick={() => onRespond(dialog, null)}>Cancel</button>
              <button type="submit">OK</button>
            </div>
          </form>
        ) : (
          <>
            <div className="quick-pick-list">
              {quickPickItems(payload).map((item, index) => (
                <button className="quick-pick-item" key={index} type="button" onClick={() => onRespond(dialog, item)}>
                  {quickPickLabel(item)}
                </button>
              ))}
            </div>
            <div className="dialog-actions">
              <button type="button" onClick={() => onRespond(dialog, null)}>Cancel</button>
            </div>
          </>
        )}
      </section>
    </div>
  );
}

function dialogTitle(dialog: DialogState): string {
  return dialog.group === "dialog.showQuickPick" ? "Select an option" : "Enter a value";
}

function quickPickItems(payload: Record<string, unknown>): unknown[] {
  return Array.isArray(payload.items) ? payload.items : [];
}

function quickPickLabel(item: unknown): string {
  if (typeof item === "string") {
    return item;
  }
  if (item && typeof item === "object" && "label" in item) {
    const label = (item as { label?: unknown }).label;
    if (typeof label === "string") {
      return label;
    }
  }
  return String(item);
}
