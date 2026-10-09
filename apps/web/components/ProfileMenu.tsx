"use client";

import { useId } from "react";
import { ChevronRight, LogOut } from "lucide-react";
import { useProfile, type ProfileAction } from "./ProfileActions";
import styles from "./ProfileMenu.module.css";

const icons = {
  trip: "🎟️",
  passport: "📖",
  home: "🏡",
  settings: "⚙️",
  saved: "💾",
};

/** Inline Profile app content; its Phone shell owns navigation and focus. */
export default function ProfileMenu({
  onAction,
  travelStyle,
  interests = [],
}: {
  onAction?: () => void;
  travelStyle?: string;
  interests?: { name: string; emoji: string }[];
}) {
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
          <span
            className="app-emoji"
            style={{ fontSize: 32 }}
            aria-hidden="true"
          >
            🧑
          </span>
        </span>
        <div>
          <h2 id={`${id}-identity`}>@{user.handle}</h2>
          <p>{user.userType === "local" ? "Local" : "Traveller"}</p>
          <small>{user.email}</small>
        </div>
      </header>

      {travelStyle && (
        <section
          className={styles.preferenceCard}
          aria-label="Current trip preferences"
        >
          <h3>Travel style</h3>
          <div className={styles.chips}>
            <span>
              <span aria-hidden="true">🧳</span>
              {travelStyle}
            </span>
          </div>
        </section>
      )}
      {interests.length > 0 && (
        <section className={styles.preferenceCard} aria-label="Trip interests">
          <h3>Interests</h3>
          <div className={styles.chips}>
            {interests.map((interest) => (
              <span key={interest.name}>
                <span aria-hidden="true">{interest.emoji}</span>
                {interest.name}
              </span>
            ))}
          </div>
        </section>
      )}

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
            <span className="app-emoji action-emoji" aria-hidden="true">
              👕
            </span>
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
            const emoji = icons[action.icon || "settings"];
            return (
              <button
                key={action.id}
                type="button"
                className={styles.action}
                disabled={action.disabled || signingOut}
                onClick={() => act(action.onSelect)}
              >
                <span className={styles.icon}>
                  <span className="app-emoji action-emoji" aria-hidden="true">
                    {emoji}
                  </span>
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
