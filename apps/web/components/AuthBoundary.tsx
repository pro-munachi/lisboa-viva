"use client";

import { useRouter } from "next/navigation";
import { ReactNode, useEffect, useState } from "react";
import { LogOut, UserRound } from "lucide-react";
import type { AuthUser } from "../lib/auth";
import { MultiplayerProvider } from "../lib/multiplayer";

export default function AuthBoundary({ children }: { children: ReactNode }) {
  const router = useRouter();
  const [user, setUser] = useState<AuthUser | null>(null);
  const [unavailable, setUnavailable] = useState(false);

  useEffect(() => {
    let active = true;
    fetch("/api/auth/me", { cache: "no-store" })
      .then(async (response) => {
        if (response.ok) return (await response.json()) as AuthUser;
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
    await fetch("/api/auth/logout", { method: "POST" }).catch(() => null);
    router.replace("/login");
    router.refresh();
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
      <MultiplayerProvider user={user}>{children}</MultiplayerProvider>
      <aside className="auth-account" aria-label="Active account">
        <UserRound size={16} />
        <span>
          <strong>@{user.handle}</strong>
          <small>{user.userType === "local" ? "Local" : "Tourist"}</small>
        </span>
        <button onClick={logout} aria-label="Sign out" title="Sign out">
          <LogOut size={16} />
        </button>
      </aside>
    </>
  );
}
