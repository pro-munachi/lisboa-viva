"use client";

import { useEffect, useState } from "react";
import { Coins, RefreshCw } from "lucide-react";
import { getWallet, type ActivityWallet } from "../lib/activities";

export default function SimulationWallet({
  wallet,
  onChange,
}: {
  wallet: ActivityWallet | null;
  onChange: (wallet: ActivityWallet) => void;
}) {
  const [revision, setRevision] = useState(0);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState("");
  useEffect(() => {
    const controller = new AbortController();
    setBusy(true);
    setError("");
    void getWallet(controller.signal)
      .then((next) => {
        if (!controller.signal.aborted) onChange(next);
      })
      .catch((reason: unknown) => {
        if (!controller.signal.aborted)
          setError(
            reason instanceof Error
              ? reason.message
              : "Your credits could not load. Try again.",
          );
      })
      .finally(() => {
        if (!controller.signal.aborted) setBusy(false);
      });
    return () => controller.abort();
  }, [revision, onChange]);
  return (
    <section
      className="phone-credit-wallet"
      aria-label="ROAM simulation credits"
    >
      <span className="phone-credit-kicker">
        <Coins size={15} /> YOUR ROAM CREDITS
      </span>
      <strong>
        {wallet
          ? `${wallet.balance.toLocaleString()} credits`
          : "Loading credits…"}
      </strong>
      <p>
        200 welcome credits, once per account. Buy simulated drinks during
        shared outings; free social actions stay available.
      </p>
      <small>Saved to your account · No cash value or real purchases</small>
      {error && <p role="alert">{error}</p>}
      <button
        type="button"
        disabled={busy}
        onClick={() => setRevision((value) => value + 1)}
      >
        <RefreshCw size={15} /> {busy ? "Refreshing…" : "Refresh credits"}
      </button>
    </section>
  );
}
