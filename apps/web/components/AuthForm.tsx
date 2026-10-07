"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useState } from "react";
import { ArrowRight, Compass, Home, MapPin } from "lucide-react";
import { authError } from "../lib/auth";

type Mode = "login" | "register";

export default function AuthForm({ mode }: { mode: Mode }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [userType, setUserType] = useState<"tourist" | "local">("tourist");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    const data = new FormData(event.currentTarget);
    const body =
      mode === "login"
        ? {
            identity: data.get("identity"),
            password: data.get("password"),
          }
        : {
            handle: data.get("handle"),
            email: data.get("email"),
            password: data.get("password"),
            userType,
            adultConfirmed: data.get("adultConfirmed") === "on",
          };
    try {
      const response = await fetch(`/api/auth/${mode}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!response.ok) {
        const result = (await response.json().catch(() => ({}))) as {
          error?: string;
        };
        setError(
          authError[result.error || ""] ||
            (response.status === 503
              ? "O serviço de contas ainda não está disponível."
              : "Não foi possível continuar."),
        );
        return;
      }
      router.replace("/");
      router.refresh();
    } catch {
      setError("Não foi possível ligar ao serviço de contas.");
    } finally {
      setBusy(false);
    }
  }

  const registering = mode === "register";
  return (
    <main className="auth-page">
      <section className="auth-story" aria-label="Lisboa Viva">
        <Link
          className="auth-brand"
          href={registering ? "/register" : "/login"}
        >
          ROAM
          <span>Lisbon. Your way.</span>
        </Link>
        <div className="auth-story-copy">
          <span className="eyebrow">LISBOA, AO TEU RITMO</span>
          <h1>
            {registering ? "Começa uma nova história." : "Bem-vindo de volta."}
          </h1>
          <p>
            Guarda a tua conta, escolhe como vives a cidade e entra no mapa com
            uma sessão protegida.
          </p>
          <div className="auth-place-row" aria-hidden="true">
            <span>
              <MapPin size={16} /> Alfama
            </span>
            <span>
              <Compass size={16} /> Tejo
            </span>
            <span>
              <Home size={16} /> Graça
            </span>
          </div>
        </div>
      </section>
      <section className="auth-panel">
        <div className="auth-card">
          <span className="eyebrow">
            {registering ? "CRIAR CONTA" : "ENTRAR"}
          </span>
          <h2>
            {registering ? "Quem és em Lisboa?" : "Continua a tua viagem"}
          </h2>
          <p className="auth-intro">
            {registering
              ? "A tua escolha ajuda-nos a adaptar o início da experiência."
              : "Usa o teu nome de utilizador ou email."}
          </p>
          <form onSubmit={submit} className="auth-form">
            {registering ? (
              <>
                <label>
                  Nome de utilizador
                  <input
                    name="handle"
                    autoComplete="username"
                    minLength={3}
                    maxLength={24}
                    pattern="[a-z0-9_]+"
                    placeholder="ex.: ines_em_lisboa"
                    required
                  />
                </label>
                <label>
                  Email
                  <input
                    name="email"
                    type="email"
                    autoComplete="email"
                    placeholder="tu@exemplo.pt"
                    required
                  />
                </label>
                <fieldset className="auth-type">
                  <legend>Vais explorar como…</legend>
                  <button
                    type="button"
                    aria-pressed={userType === "tourist"}
                    onClick={() => setUserType("tourist")}
                  >
                    <Compass size={20} />
                    <strong>Visitante</strong>
                    <span>Estou a descobrir Lisboa.</span>
                  </button>
                  <button
                    type="button"
                    aria-pressed={userType === "local"}
                    onClick={() => setUserType("local")}
                  >
                    <Home size={20} />
                    <strong>Residente</strong>
                    <span>Lisboa faz parte do meu dia.</span>
                  </button>
                </fieldset>
              </>
            ) : (
              <label>
                Nome de utilizador ou email
                <input
                  name="identity"
                  autoComplete="username"
                  placeholder="nome ou email"
                  required
                  autoFocus
                />
              </label>
            )}
            <label>
              Palavra-passe
              <input
                name="password"
                type="password"
                autoComplete={registering ? "new-password" : "current-password"}
                minLength={registering ? 10 : 1}
                maxLength={72}
                required
              />
              {registering && <small>Entre 10 e 72 caracteres.</small>}
            </label>
            {registering && (
              <label className="auth-check">
                <input name="adultConfirmed" type="checkbox" required />
                <span>Confirmo que tenho pelo menos 18 anos.</span>
              </label>
            )}
            {error && (
              <p className="auth-error" role="alert">
                {error}
              </p>
            )}
            <button
              className="primary auth-submit"
              disabled={busy}
              type="submit"
            >
              {busy ? "A verificar…" : registering ? "Criar conta" : "Entrar"}
              {!busy && <ArrowRight size={18} />}
            </button>
          </form>
          <p className="auth-switch">
            {registering ? "Já tens conta?" : "Ainda não tens conta?"}{" "}
            <Link href={registering ? "/login" : "/register"}>
              {registering ? "Entrar" : "Criar conta"}
            </Link>
          </p>
        </div>
      </section>
    </main>
  );
}
