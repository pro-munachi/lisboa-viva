"use client";

import { useId } from "react";
import {
  Bookmark,
  BookOpen,
  ChevronRight,
  Home,
  LogOut,
  Settings,
  Shirt,
  Ticket,
  UserRound,
} from "lucide-react";
import { useProfile, type ProfileAction } from "./ProfileActions";
import styles from "./ProfileMenu.module.css";

const icons = {
  trip: Ticket,
  passport: BookOpen,
  home: Home,
  settings: Settings,
  saved: Bookmark,
};

/** Inline Profile app content; its Phone shell owns navigation and focus. */
export default function ProfileMenu({ onAction }: { onAction?: () => void }) {
  const { user, actions, signingOut, logoutError, editCharacter, signOut } =
    useProfile();
  const id = useId();
  const act = (action: () => void) => {
    onAction?.();
    action();
  };
  const tripActions = actions.filter(
    (action) => action.id !== "edit-character",
  );

  return (
    <section className={styles.profile} aria-labelledby={`${id}-identity`}>
      <header className={styles.identity}>
        <span className={styles.avatar} aria-hidden="true">
          <UserRound size={28} strokeWidth={1.7} />
        </span>
        <div>
          <h2 id={`${id}-identity`}>@{user.handle}</h2>
          <p>{user.userType === "local" ? "Local" : "Traveller"}</p>
          <small>{user.email}</small>
        </div>
      </header>

      <section className={styles.group} aria-labelledby={`${id}-character`}>
        <h3 id={`${id}-character`}>Character</h3>
        <button
          type="button"
          className={styles.action}
          aria-haspopup="dialog"
          disabled={signingOut}
          onClick={() => act(editCharacter)}
        >
          <span className={`${styles.icon} ${styles.characterIcon}`}>
            <Shirt size={21} aria-hidden="true" />
          </span>
          <span className={styles.actionText}>
            <strong>Edit character</strong>
            <small>Clothes, hair & colours</small>
          </span>
          <ChevronRight size={17} aria-hidden="true" />
        </button>
      </section>

      {tripActions.length > 0 && (
        <section className={styles.group} aria-labelledby={`${id}-trip`}>
          <h3 id={`${id}-trip`}>Your trip</h3>
          {tripActions.map((action: ProfileAction) => {
            const Icon = icons[action.icon || "settings"];
            return (
              <button
                key={action.id}
                type="button"
                className={styles.action}
                disabled={action.disabled || signingOut}
                onClick={() => act(action.onSelect)}
              >
                <span className={styles.icon}>
                  <Icon size={21} aria-hidden="true" />
                </span>
                <span className={styles.actionText}>
                  <strong>{action.label}</strong>
                  {action.detail && <small>{action.detail}</small>}
                </span>
                <ChevronRight size={17} aria-hidden="true" />
              </button>
            );
          })}
        </section>
      )}

      <section className={styles.group} aria-labelledby={`${id}-account`}>
        <h3 id={`${id}-account`}>Account</h3>
        {logoutError && (
          <p className={styles.error} role="alert">
            {logoutError}
          </p>
        )}
        <button
          type="button"
          className={`${styles.action} ${styles.signOut}`}
          disabled={signingOut}
          onClick={() => void signOut()}
        >
          <span className={styles.icon}>
            <LogOut size={20} aria-hidden="true" />
          </span>
          <span className={styles.actionText}>
            <strong>{signingOut ? "Signing out…" : "Sign out"}</strong>
            <small>
              {signingOut ? "Finishing your session" : "Leave this account"}
            </small>
          </span>
        </button>
      </section>
    </section>
  );
}
