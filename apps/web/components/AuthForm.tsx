"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useState } from "react";
import { ArrowRight, Compass, Home, MapPin } from "lucide-react";
import { authError } from "../lib/auth";
import AppearanceCustomizer from "./AppearanceCustomizer";
import { DEFAULT_APPEARANCE } from "../lib/appearance";

type Mode = "login" | "register";

export default function AuthForm({ mode }: { mode: Mode }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [userType, setUserType] = useState<"tourist" | "local">("tourist");
  const [appearance, setAppearance] = useState(DEFAULT_APPEARANCE);

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
            appearance,
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
              ? "The account service is not available yet."
              : "We could not continue."),
        );
        return;
      }
      router.replace("/play");
      router.refresh();
    } catch {
      setError("We could not connect to the account service.");
    } finally {
      setBusy(false);
    }
  }

  const registering = mode === "register";
  return (
    <main className="auth-page">
      <section className="auth-story" aria-label="Lisboa Viva">
        <Link className="auth-brand" href="/">
          ROAM
          <span>Lisbon. Your way.</span>
        </Link>
        <div className="auth-story-copy">
          <span className="eyebrow">LISBON, YOUR WAY</span>
          <h1>{registering ? "Start a new story." : "Welcome back."}</h1>
          <p>
            Save your account, choose how you experience the city, and enter the
            map with a protected session.
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
            {registering ? "CREATE ACCOUNT" : "SIGN IN"}
          </span>
          <h2>
            {registering ? "Who are you in Lisbon?" : "Continue your journey"}
          </h2>
          <p className="auth-intro">
            {registering
              ? "Your choice helps us tailor the start of your experience."
              : "Use your username or email address."}
          </p>
          <form onSubmit={submit} className="auth-form">
            {registering ? (
              <>
                <label>
                  Username
                  <input
                    name="handle"
                    autoComplete="username"
                    minLength={3}
                    maxLength={24}
                    pattern="[a-z0-9_]+"
                    placeholder="e.g. ines_in_lisbon"
                    required
                  />
                </label>
                <label>
                  Email
                  <input
                    name="email"
                    type="email"
                    autoComplete="email"
                    placeholder="you@example.com"
                    required
                  />
                </label>
                <fieldset className="auth-type">
                  <legend>You will explore as…</legend>
                  <button
                    type="button"
                    aria-pressed={userType === "tourist"}
                    onClick={() => setUserType("tourist")}
                  >
                    <Compass size={20} />
                    <strong>Tourist</strong>
                    <span>I am discovering Lisbon.</span>
                  </button>
                  <button
                    type="button"
                    aria-pressed={userType === "local"}
                    onClick={() => setUserType("local")}
                  >
                    <Home size={20} />
                    <strong>Local</strong>
                    <span>Lisbon is part of my daily life.</span>
                  </button>
                </fieldset>
                <AppearanceCustomizer
                  value={appearance}
                  onChange={setAppearance}
                />
              </>
            ) : (
              <label>
                Username or email
                <input
                  name="identity"
                  autoComplete="username"
                  placeholder="username or email"
                  required
                  autoFocus
                />
              </label>
            )}
            <label>
              Password
              <input
                name="password"
                type="password"
                autoComplete={registering ? "new-password" : "current-password"}
                minLength={registering ? 10 : 1}
                maxLength={72}
                required
              />
              {registering && <small>Between 10 and 72 characters.</small>}
            </label>
            {registering && (
              <label className="auth-check">
                <input name="adultConfirmed" type="checkbox" required />
                <span>I confirm that I am at least 18 years old.</span>
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
              {busy ? "Checking…" : registering ? "Create account" : "Sign in"}
              {!busy && <ArrowRight size={18} />}
            </button>
          </form>
          <p className="auth-switch">
            {registering ? "Already have an account?" : "New to ROAM?"}{" "}
            <Link href={registering ? "/login" : "/register"}>
              {registering ? "Sign in" : "Create account"}
            </Link>
          </p>
        </div>
      </section>
    </main>
  );
}
