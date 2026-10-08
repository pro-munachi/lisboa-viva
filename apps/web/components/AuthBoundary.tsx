"use client";

import { useRouter } from "next/navigation";
import { ReactNode, useEffect, useState } from "react";
import { LogOut, Shirt, UserRound } from "lucide-react";
import { normalizeAuthUser, type AuthUser } from "../lib/auth";
import { MultiplayerProvider } from "../lib/multiplayer";
import Wardrobe from "./Wardrobe";
import styles from "./Wardrobe.module.css";

export default function AuthBoundary({
  children,
}: {
  children: ReactNode | ((user: AuthUser) => ReactNode);
}) {
  const router = useRouter();
  const [user, setUser] = useState<AuthUser | null>(null);
  const [unavailable, setUnavailable] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const [logoutError, setLogoutError] = useState("");
  const [wardrobeOpen, setWardrobeOpen] = useState(false);
  const [appearanceNotice, setAppearanceNotice] = useState("");

  useEffect(() => {
    let active = true;
    fetch("/api/auth/me", { cache: "no-store" })
      .then(async (response) => {
        if (response.ok) {
          const account = normalizeAuthUser(await response.json());
          if (!account) throw new Error("unavailable");
          return account;
        }
        if (response.status === 401) {
          await fetch("/api/auth/logout", { method: "POST" }).catch(() => null);
          router.replace("/login");
          return null;
        }
        throw new Error("unavailable");
      })
      .then((result) => active && result && setUser(result))
      .catch(() => active && setUnavailable(true));
    return () => {
      active = false;
    };
  }, [router]);

  async function logout() {
    if (signingOut) return;
    setSigningOut(true);
    setLogoutError("");
    try {
      const response = await fetch("/api/auth/logout", { method: "POST" });
      if (!response.ok) throw new Error("unavailable");
      setUser(null);
      router.replace("/login");
      router.refresh();
    } catch {
      setLogoutError("Sign out failed. Please try again.");
    } finally {
      setSigningOut(false);
    }
  }

  if (unavailable) {
    return (
      <main className="auth-status">
        <h1>We could not verify your session.</h1>
        <p>Check that the account service is running and try again.</p>
        <button className="primary" onClick={() => location.reload()}>
          Try again
        </button>
      </main>
    );
  }
  if (!user) {
    return (
      <main className="auth-status" aria-live="polite">
        <p>Checking your session…</p>
      </main>
    );
  }
  return (
    <>
      <MultiplayerProvider user={user}>
        {typeof children === "function" ? children(user) : children}
      </MultiplayerProvider>
      <aside
        className={`auth-account ${styles.account}`}
        aria-label="Active account"
      >
        <UserRound size={16} aria-hidden="true" />
        <span className={styles.accountIdentity}>
          <strong>@{user.handle}</strong>
          <small>{user.userType === "local" ? "Local" : "Tourist"}</small>
        </span>
        {logoutError && <span role="alert">{logoutError}</span>}
        <button
          type="button"
          className={styles.accountButton}
          aria-haspopup="dialog"
          disabled={signingOut}
          onClick={() => {
            setAppearanceNotice("");
            setWardrobeOpen(true);
          }}
        >
          <Shirt size={17} aria-hidden="true" /> Edit character
        </button>
        <button
          type="button"
          className={styles.accountIcon}
          onClick={logout}
          aria-label="Sign out"
          title="Sign out"
          disabled={signingOut}
        >
          <LogOut size={16} />
        </button>
      </aside>
      <span className={styles.notice} role="status">
        {appearanceNotice}
      </span>
      {wardrobeOpen && (
        <Wardrobe
          key={user.id}
          user={user}
          onSaved={(updated) => {
            if (updated.id !== user.id) return;
            setUser(updated);
            setWardrobeOpen(false);
            setAppearanceNotice("Your look has been saved.");
          }}
          onClose={() => setWardrobeOpen(false)}
        />
      )}
    </>
  );
}
