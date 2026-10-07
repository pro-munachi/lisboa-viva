"use client";

import { useRouter } from "next/navigation";
import { ReactNode, useEffect, useState } from "react";
import { LogOut, UserRound } from "lucide-react";
import type { AuthUser } from "../lib/auth";

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
        <h1>Não foi possível validar a sessão.</h1>
        <p>Confirma que o serviço de contas está ativo e tenta novamente.</p>
        <button className="primary" onClick={() => location.reload()}>
          Tentar novamente
        </button>
      </main>
    );
  }
  if (!user) {
    return (
      <main className="auth-status" aria-live="polite">
        <p>A validar a sessão…</p>
      </main>
    );
  }
  return (
    <>
      {children}
      <aside className="auth-account" aria-label="Conta ativa">
        <UserRound size={16} />
        <span>
          <strong>@{user.handle}</strong>
          <small>{user.userType === "local" ? "Residente" : "Visitante"}</small>
        </span>
        <button
          onClick={logout}
          aria-label="Terminar sessão"
          title="Terminar sessão"
        >
          <LogOut size={16} />
        </button>
      </aside>
    </>
  );
}
