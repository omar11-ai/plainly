import { CLOUD_MODEL, cloudReady, maskedKey } from "../cloud";

interface Props {
  cloud: boolean;
  busy: boolean;
  draft: string;
  onDraft: (value: string) => void;
  onSave: () => void;
  onClear: () => void;
  onRefresh: () => void;
}

/**
 * The hosted-model panel. It only renders when no local API answers, so it can
 * never appear on the local-machine experience.
 *
 * A note on the key: it is entered here, checked against Google, and kept in
 * this browser's localStorage. It is not in the repo and not in the bundle, so
 * there is nothing for whoever sees the site to lift — the person reading the
 * page supplies their own quota or nothing runs.
 */
export default function CloudKeyPanel({
  cloud,
  busy,
  draft,
  onDraft,
  onSave,
  onClear,
  onRefresh
}: Props) {
  if (cloud) {
    return (
      <section className="cloud-bar is-live" aria-label="Hosted model">
        <span className="cloud-bar__led" aria-hidden="true" />
        <div className="cloud-bar__body">
          <strong>Running on {CLOUD_MODEL}</strong>
          <span className="cloud-bar__sub">
            Your own Google API key · {maskedKey()} · held in this browser only
          </span>
        </div>
        <button type="button" className="chip-btn" onClick={onRefresh}>
          Re-check
        </button>
        <button type="button" className="chip-btn" onClick={onClear}>
          Remove key
        </button>
      </section>
    );
  }

  const hasKey = cloudReady();
  return (
    <section className="cloud-bar" aria-label="Hosted model">
      <span className="cloud-bar__led" aria-hidden="true" />
      <div className="cloud-bar__body">
        <strong>Run it online with your own Google API key</strong>
        <span className="cloud-bar__sub">
          There's no Ollama on this machine, so the hosted pipeline is offered
          instead — the same two-phase write-and-verify, with the same fact
          locking and escalation. The key is checked, kept in this browser, and
          never sent anywhere but Google.
        </span>
      </div>
      <div className="cloud-bar__controls">
        <input
          className="cloud-bar__input"
          type="password"
          value={draft}
          placeholder="Paste a Google AI Studio API key"
          aria-label="Google API key"
          autoComplete="off"
          spellCheck={false}
          onChange={(e) => onDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              onSave();
            }
          }}
        />
        <button
          type="button"
          className="chip-btn chip-btn--amber"
          onClick={onSave}
          disabled={busy || draft.trim().length < 8}
        >
          {busy ? "Checking…" : "Use key"}
        </button>
        {hasKey && (
          <button type="button" className="chip-btn" onClick={onRefresh}>
            Re-check
          </button>
        )}
      </div>
    </section>
  );
}