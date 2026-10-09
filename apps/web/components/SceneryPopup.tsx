"use client";
import { useEffect, useId, useRef } from "react";
import { X } from "lucide-react";
import {
  sceneryActions,
  sceneryDescription,
  SCENERY_GRAPHICS,
  type SceneryAction,
  type SceneryObject,
} from "../lib/scenery-actions";
import type { SceneryFine, ScenerySnapshot } from "../lib/scenery-client";
import styles from "./SceneryPopup.module.css";

const euros = (cents: number) =>
  new Intl.NumberFormat("en-IE", {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: cents % 100 ? 2 : 0,
  }).format(cents / 100);

export default function SceneryPopup({
  object,
  items,
  onPick,
  onAction,
  onClose,
  walletView = false,
  snapshot,
  balanceCents,
  busy = false,
  loading = false,
  error,
  onSettle,
  onRefresh,
  onWallet,
}: {
  object: SceneryObject | null;
  items?: SceneryObject[];
  onPick: (object: SceneryObject) => void;
  onAction: (object: SceneryObject, action: SceneryAction) => void;
  onClose: () => void;
  walletView?: boolean;
  snapshot?: ScenerySnapshot | null;
  balanceCents?: number;
  busy?: boolean;
  loading?: boolean;
  error?: string;
  onSettle?: (fine: SceneryFine) => void;
  onRefresh?: () => void;
  onWallet?: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const title = useId();
  const pendingFines = snapshot?.fines.filter((fine) => !fine.settled) || [];
  useEffect(() => {
    const element = dialog.current;
    element?.showModal();
    return () => element?.close();
  }, []);
  return (
    <dialog
      ref={dialog}
      className={styles.dialog}
      aria-labelledby={title}
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
    >
      <header className={styles.header}>
        <span className={styles.hero} aria-hidden="true">
          {walletView
            ? "💶"
            : object
              ? SCENERY_GRAPHICS[object.kind] || "✨"
              : "🌿"}
        </span>
        <div>
          <p>
            {walletView ? "YOUR CITY MOMENTS" : "YOUR CITY, LITTLE MOMENTS"}
          </p>
          <h2 id={title}>
            {walletView
              ? "Your city wallet"
              : object?.name || "Things around you"}
          </h2>
        </div>
        <button
          type="button"
          className={styles.close}
          aria-label="Close scenery options"
          onClick={onClose}
        >
          <X size={18} />
        </button>
      </header>
      {walletView ? (
        <>
          <div className={styles.walletSummary}>
            <span>
              <small>City XP</small>
              <strong>
                {snapshot ? `${snapshot.totalPoints} XP` : "Loading…"}
              </strong>
            </span>
            <span>
              <small>Game euros</small>
              <strong>
                {balanceCents !== undefined ? euros(balanceCents) : "Loading…"}
              </strong>
            </span>
          </div>
          <p className={styles.description}>
            Little discoveries earn XP. Park fines are simulated game rules,
            settled from your saved game euros.
          </p>
          <div className={styles.fines} aria-label="Pending simulated fines">
            <h3>
              {!snapshot
                ? "Checking your city moments…"
                : pendingFines.length
                  ? `${pendingFines.length} to settle`
                  : "All clear"}
            </h3>
            {pendingFines.length ? (
              pendingFines.map((fine) => (
                <div className={styles.fine} key={fine.id}>
                  <span className={styles.emoji} aria-hidden="true">
                    🧾
                  </span>
                  <div>
                    <strong>{euros(fine.amountCents)}</strong>
                    <p>{fine.description}</p>
                    <button
                      type="button"
                      disabled={busy || loading}
                      onClick={() => onSettle?.(fine)}
                    >
                      Pay {euros(fine.amountCents)} fine
                    </button>
                  </div>
                </div>
              ))
            ) : (
              <p>
                {!snapshot
                  ? loading
                    ? "Loading your saved XP and game fines…"
                    : "Refresh to load your saved XP and game fines."
                  : "No pending game fines. Enjoy your next little discovery. 🌱"}
              </p>
            )}
          </div>
          <p className={styles.note}>
            No cash value or real payments. Up to 200 new XP each day, with one
            reward per object and action.
          </p>
          {error && (
            <p className={styles.error} role="alert">
              {error}
            </p>
          )}
          <button
            type="button"
            className={styles.refresh}
            disabled={busy || loading}
            onClick={onRefresh}
          >
            {loading ? "Refreshing…" : "Refresh city wallet"}
          </button>
        </>
      ) : object ? (
        <>
          <p className={styles.description}>{sceneryDescription(object)}</p>
          <div className={styles.actions}>
            {sceneryActions(object).map((action) => (
              <button
                type="button"
                key={action.id}
                disabled={busy}
                data-scenery-action={action.id}
                onClick={() => onAction(object, action)}
              >
                <span className={styles.emoji} aria-hidden="true">
                  {action.emoji}
                </span>
                <span>
                  <strong>{action.label}</strong>
                  <small>{action.detail}</small>
                  {action.fineCents && (
                    <small className={styles.warning}>
                      Simulated {euros(action.fineCents)} fine · paid from your
                      game wallet
                    </small>
                  )}
                </span>
                <span className={styles.points}>Up to {action.points} XP</span>
              </button>
            ))}
          </div>
          <p className={styles.note}>
            Your character walks up first. Actions close this popup
            automatically; rewards arrive after you reach the object. One reward
            per object and action each day, up to 200 new XP daily.
          </p>
        </>
      ) : (
        <>
          <p className={styles.description}>
            Pick a little city moment. Your character will walk over to join in.
          </p>
          <div className={styles.actions}>
            {items?.length ? (
              items.map((item) => (
                <button
                  type="button"
                  key={item.id}
                  disabled={busy}
                  onClick={() => onPick(item)}
                >
                  <span className={styles.emoji} aria-hidden="true">
                    {SCENERY_GRAPHICS[item.kind] || "✨"}
                  </span>
                  <span>
                    <strong>{item.name}</strong>
                    <small>Explore this little corner</small>
                  </span>
                  <span aria-hidden="true">→</span>
                </button>
              ))
            ) : (
              <p className={styles.description}>
                Walk closer to a park or a street to discover its objects.
              </p>
            )}
          </div>
        </>
      )}
      {!walletView && (
        <button type="button" className={styles.walletLink} onClick={onWallet}>
          <span aria-hidden="true">💶</span>{" "}
          {snapshot ? `${snapshot.totalPoints} XP` : "Your city XP"} · City
          wallet
          {pendingFines.length > 0 && (
            <span className={styles.fineCount}>{pendingFines.length}</span>
          )}
        </button>
      )}
    </dialog>
  );
}

export function SceneryNotice({
  message,
  busy,
  onRetry,
  onWallet,
  onClose,
}: {
  message: string;
  busy?: boolean;
  onRetry?: () => void;
  onWallet?: () => void;
  onClose: () => void;
}) {
  return (
    <aside className={styles.notice} aria-label="City moment update">
      <span className={styles.noticeEmoji} aria-hidden="true">
        {busy ? "🚶" : "✨"}
      </span>
      <div>
        <p role="status" aria-live="polite">
          {message}
        </p>
        {(onRetry || onWallet) && (
          <div className={styles.noticeActions}>
            {onRetry && (
              <button type="button" disabled={busy} onClick={onRetry}>
                Try again
              </button>
            )}
            {onWallet && (
              <button type="button" disabled={busy} onClick={onWallet}>
                City wallet
              </button>
            )}
          </div>
        )}
      </div>
      <button
        type="button"
        className={styles.dismiss}
        aria-label="Dismiss city moment update"
        onClick={onClose}
      >
        <X size={16} />
      </button>
    </aside>
  );
}
