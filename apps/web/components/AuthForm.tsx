"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useState } from "react";
import { ArrowRight, Compass, Home, MapPin } from "lucide-react";
import { authError, type AuthUser } from "../lib/auth";
import AppearanceCustomizer from "./AppearanceCustomizer";
import { DEFAULT_APPEARANCE } from "../lib/appearance";
import { validNewHandle } from "../lib/handle";
import ActivityGraphic from "./ActivityGraphic";

type Mode = "login" | "register";

export default function AuthForm({ mode }: { mode: Mode }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [userType, setUserType] = useState<"tourist" | "local">("tourist");
  const [homeDistrict, setHomeDistrict] = useState<
    "Graça" | "Baixa" | "Alfama"
  >("Graça");
  const [appearance, setAppearance] = useState(DEFAULT_APPEARANCE);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    const data = new FormData(event.currentTarget);
    const handle = data.get("handle");
    if (
      mode === "register" &&
      (typeof handle !== "string" || !validNewHandle(handle))
    ) {
      setError("Use 2–40 characters with no spaces or @ in your username.");
      setBusy(false);
      return;
    }
    const body =
      mode === "login"
        ? {
            identity: data.get("identity"),
            password: data.get("password"),
          }
        : {
            handle,
            email: data.get("email"),
            password: data.get("password"),
            userType,
            homeDistrict,
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
      if (registering) {
        const created = (await response.json()) as AuthUser;
        try {
          sessionStorage.setItem(`roam.signup-intro.${created.id}`, userType);
        } catch {}
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
    <main className={`auth-page${registering ? " auth-register" : ""}`}>
      <section className="auth-story" aria-label="ROAM — Lisbon pilot">
        <Link className="auth-brand" href="/">
          ROAM
          <span>Every city. Your story.</span>
        </Link>
        <ActivityGraphic />
        <div className="auth-story-copy">
          <span className="eyebrow">FIRST CHAPTER · LISBON</span>
          <h1>
            {registering
              ? "New city. Find your people."
              : "Your next little adventure."}
          </h1>
          <p>
            Explore Lisbon, our first playable city, at your own pace. Your
            saved trips stay on this browser, ready for your next little
            adventure.
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
          <Link className="auth-mobile-brand" href="/" aria-label="ROAM home">
            ROAM<span>Every city. Your story.</span>
          </Link>
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
                <div className="auth-identity">
                  <label>
                    Username
                    <input
                      name="handle"
                      autoComplete="username"
                      minLength={2}
                      maxLength={40}
                      pattern={String.raw`\S+`}
                      title="Usernames cannot contain spaces."
                      placeholder="e.g. Inês_Lisboa"
                      required
                    />
                    <small>
                      Use 2–40 characters with no spaces. Punctuation is
                      welcome; @ is reserved for mentions.
                    </small>
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
                </div>
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
                {userType === "local" && (
                  <label>
                    Your home neighbourhood
                    <select
                      value={homeDistrict}
                      onChange={(event) =>
                        setHomeDistrict(
                          event.target.value as typeof homeDistrict,
                        )
                      }
                    >
                      <option value="Graça">Graça</option>
                      <option value="Baixa">Baixa</option>
                      <option value="Alfama">Alfama</option>
                    </select>
                    <small>
                      Saved to your account so you can return here when you sign
                      in.
                    </small>
                  </label>
                )}
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
              {registering && (
                <small>At least 10 characters, up to 72 UTF-8 bytes.</small>
              )}
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
