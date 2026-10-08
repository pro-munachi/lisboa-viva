export type WalletEntry = {
  id: number;
  transactionId: string;
  kind: "opening" | "spend";
  amountCents: number;
  balanceAfterCents: number;
  purpose: "opening" | "travel" | "activity" | "ticket";
  description: string;
  createdAt: string;
};

export type WalletSnapshot = {
  currency: "EUR";
  balanceCents: number;
  entries: WalletEntry[];
};

export function walletSnapshot(value: unknown): WalletSnapshot | null {
  if (!value || typeof value !== "object") return null;
  const data = value as Partial<WalletSnapshot>;
  if (
    data.currency !== "EUR" ||
    !Number.isSafeInteger(data.balanceCents) ||
    data.balanceCents! < 0 ||
    !Array.isArray(data.entries) ||
    data.entries.length > 20 ||
    data.entries.some(
      (entry) =>
        !entry ||
        !Number.isSafeInteger(entry.id) ||
        typeof entry.description !== "string" ||
        !Number.isSafeInteger(entry.amountCents) ||
        !Number.isSafeInteger(entry.balanceAfterCents),
    )
  )
    return null;
  return data as WalletSnapshot;
}

export async function loadWallet(): Promise<WalletSnapshot> {
  const response = await fetch("/api/player/wallet", { cache: "no-store" });
  if (!response.ok) throw new Error("wallet_unavailable");
  const wallet = walletSnapshot(await response.json());
  if (!wallet) throw new Error("wallet_invalid");
  return wallet;
}

export async function spendWallet(input: {
  transactionId: string;
  amountCents: number;
  purpose: "travel" | "activity" | "ticket";
  description: string;
}): Promise<WalletSnapshot> {
  const response = await fetch("/api/player/wallet/spend", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(input),
  });
  if (!response.ok) {
    const error = (await response.json().catch(() => ({}))) as {
      error?: string;
    };
    throw new Error(error.error || "wallet_unavailable");
  }
  const wallet = walletSnapshot(await response.json());
  if (!wallet) throw new Error("wallet_invalid");
  return wallet;
}
