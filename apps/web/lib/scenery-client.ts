import { walletSnapshot, type WalletSnapshot } from "./wallet-client";

export type SceneryFine = {
  id: string;
  amountCents: number;
  description: string;
  settled?: boolean;
};
export type ScenerySnapshot = { totalPoints: number; fines: SceneryFine[] };
export type SceneryActionInput = {
  requestId: string;
  objectId: string;
  kind: string;
  actionId: string;
};
export type SceneryActionResult = {
  points: number;
  totalPoints: number;
  fine?: SceneryFine;
};
export type ScenerySettlement = ScenerySnapshot & { wallet: WalletSnapshot };
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const safePoints = (points: unknown) =>
  Number.isSafeInteger(points) && (points as number) >= 0;
export function sceneryFine(value: unknown): SceneryFine | null {
  if (!value || typeof value !== "object") return null;
  const fine = value as Partial<SceneryFine>;
  return typeof fine.id === "string" &&
    uuid.test(fine.id) &&
    [200, 300, 500].includes(fine.amountCents!) &&
    typeof fine.description === "string" &&
    fine.description.length > 0 &&
    fine.description.length <= 100 &&
    (fine.settled === undefined || typeof fine.settled === "boolean")
    ? (fine as SceneryFine)
    : null;
}
export function scenerySnapshot(value: unknown): ScenerySnapshot | null {
  if (!value || typeof value !== "object") return null;
  const data = value as Partial<ScenerySnapshot>;
  if (
    !safePoints(data.totalPoints) ||
    !Array.isArray(data.fines) ||
    data.fines.length > 100 ||
    data.fines.some((fine) => !sceneryFine(fine))
  )
    return null;
  return data as ScenerySnapshot;
}
export function sceneryActionResult(
  value: unknown,
): SceneryActionResult | null {
  if (!value || typeof value !== "object") return null;
  const data = value as Partial<SceneryActionResult>;
  if (
    !safePoints(data.totalPoints) ||
    !safePoints(data.points) ||
    data.points! > 10 ||
    (data.fine !== undefined && !sceneryFine(data.fine))
  )
    return null;
  return data as SceneryActionResult;
}
async function readResponse(response: Response): Promise<unknown> {
  const data = await response.json().catch(() => null);
  if (!response.ok) {
    const problem =
      data && typeof data === "object" && "error" in data
        ? (data as { error?: unknown }).error
        : null;
    throw new Error(
      typeof problem === "string" ? problem : "scenery_unavailable",
    );
  }
  return data;
}
export async function loadScenery(): Promise<ScenerySnapshot> {
  const result = scenerySnapshot(
    await readResponse(
      await fetch("/api/player/scenery", { cache: "no-store" }),
    ),
  );
  if (!result) throw new Error("scenery_invalid");
  return result;
}
export async function performSceneryAction(
  input: SceneryActionInput,
): Promise<SceneryActionResult> {
  const result = sceneryActionResult(
    await readResponse(
      await fetch("/api/player/scenery", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(input),
      }),
    ),
  );
  if (!result) throw new Error("scenery_invalid");
  return result;
}
export async function settleSceneryFine(
  id: string,
): Promise<ScenerySettlement> {
  if (!uuid.test(id)) throw new Error("invalid_scenery_action");
  const value = await readResponse(
    await fetch(`/api/player/scenery/fines/${encodeURIComponent(id)}/settle`, {
      method: "POST",
    }),
  );
  const snapshot = scenerySnapshot(value);
  const wallet =
    value && typeof value === "object" && "wallet" in value
      ? walletSnapshot(value.wallet)
      : null;
  if (!snapshot || !wallet) throw new Error("scenery_invalid");
  return { ...snapshot, wallet };
}
