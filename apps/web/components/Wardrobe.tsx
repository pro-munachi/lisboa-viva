"use client";

import Link from "next/link";
import { useEffect, useId, useRef, useState, type FormEvent } from "react";
import { Check, Shirt, X } from "lucide-react";
import type { AuthUser } from "../lib/auth";
import { APPEARANCE_FIELDS, compatibleAppearance } from "../lib/appearance";
import { AppearanceSaveError, saveAppearance } from "../lib/appearance-client";
import AppearanceCustomizer from "./AppearanceCustomizer";
import styles from "./Wardrobe.module.css";

export default function Wardrobe({
  user,
  onSaved,
  onClose,
}: {
  user: AuthUser;
  onSaved: (user: AuthUser) => void;
  onClose: () => void;
}) {
  const [draft, setDraft] = useState(() =>
    compatibleAppearance(user.appearance),
  );
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<AppearanceSaveError | null>(null);
  const dialog = useRef<HTMLDialogElement>(null);
  const closeButton = useRef<HTMLButtonElement>(null);
  const request = useRef<AbortController | null>(null);
  const pending = useRef(false);
  const alive = useRef(false);
  const titleId = useId();
  const descriptionId = useId();
  const errorId = useId();
  const changed = APPEARANCE_FIELDS.some(
    (field) => draft[field] !== user.appearance[field],
  );

  useEffect(() => {
    const previous = document.activeElement;
    const modal = dialog.current;
    alive.current = true;
    modal?.showModal();
    closeButton.current?.focus();
    return () => {
      alive.current = false;
      request.current?.abort();
      modal?.close();
      if (previous instanceof HTMLElement && previous.isConnected)
        previous.focus();
    };
  }, []);

  function close() {
    if (pending.current) return;
    onClose();
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending.current || !changed) return;
    pending.current = true;
    setBusy(true);
    setFailure(null);
    const controller = new AbortController();
    request.current = controller;
    const timeout = setTimeout(() => controller.abort(), 10_000);
    try {
      const updated = await saveAppearance(user.id, draft, controller.signal);
      if (!alive.current || request.current !== controller) return;
      onSaved(updated);
    } catch (error) {
      if (!alive.current || request.current !== controller) return;
      setFailure(
        error instanceof AppearanceSaveError
          ? error
          : new AppearanceSaveError(
              controller.signal.aborted
                ? "The save timed out. We could not confirm your look. Try again."
                : "We could not save your look. Your changes are still here.",
            ),
      );
    } finally {
      clearTimeout(timeout);
      if (request.current === controller) {
        request.current = null;
        pending.current = false;
        if (alive.current) setBusy(false);
      }
    }
  }

  return (
    <dialog
      ref={dialog}
      className={styles.dialog}
      aria-labelledby={titleId}
      aria-describedby={descriptionId}
      aria-modal="true"
      onCancel={(event) => {
        event.preventDefault();
        close();
      }}
      onClick={(event) => {
        if (event.target === event.currentTarget) close();
      }}
    >
      <form className={styles.form} onSubmit={submit} aria-busy={busy}>
        <header className={styles.header}>
          <div className={styles.symbol} aria-hidden="true">
            <Shirt size={25} />
          </div>
          <div>
            <span className={styles.eyebrow}>MAKE IT YOURS</span>
            <h2 id={titleId}>Your wardrobe</h2>
            <p id={descriptionId}>
              A little more you. Everywhere you go.
            </p>
          </div>
          <button
            ref={closeButton}
            type="button"
            className={styles.close}
            aria-label="Close wardrobe"
            disabled={busy}
            onClick={close}
          >
            <X size={20} />
          </button>
        </header>
        <div className={styles.body}>
          <fieldset className={styles.editor} disabled={busy}>
            <AppearanceCustomizer
              variant="wardrobe"
              value={draft}
              onChange={(value) => {
                if (!pending.current) {
                  setDraft(value);
                  setFailure(null);
                }
              }}
            />
          </fieldset>
        </div>
        <footer className={styles.footer}>
          <div className={styles.feedback} aria-live="polite">
            {failure ? (
              <p className={styles.error} id={errorId} role="alert">
                {failure.message}
                {failure.status === 401 && (
                  <>
                    {" "}
                    <Link href="/login">Sign in again</Link>.
                  </>
                )}
              </p>
            ) : (
              <p>
                <span className={`${styles.statusDot}${changed ? ` ${styles.unsaved}` : ""}`} aria-hidden="true" />
                {busy ? "Saving your look…" : changed ? "Unsaved changes" : "Your current look"}
              </p>
            )}
          </div>
          <div className={styles.actions}>
            <button
              type="button"
              className={styles.cancel}
              disabled={busy}
              onClick={close}
            >
              Cancel
            </button>
            <button
              type="submit"
              className={styles.save}
              disabled={busy || !changed || failure?.status === 401}
              aria-describedby={failure ? errorId : undefined}
            >
              <Check size={18} /> {busy ? "Saving…" : "Save look"}
            </button>
          </div>
        </footer>
      </form>
    </dialog>
  );
}
