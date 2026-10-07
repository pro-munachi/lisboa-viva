import { places, type PlaceId } from "./content";
import { validSetup, type Setup } from "./engine";
import { profileMissions } from "./journey";

export type Recommendation = { place: PlaceId; title: string; detail: string };
export type RecommendationResult = {
  source: "curated" | "ai";
  note: string;
  items: Recommendation[];
};

export function profileRecommendations(setup: Setup): Recommendation[] {
  return profileMissions(setup).map((mission) => ({ ...mission }));
}

export async function recommendTrip(
  setup: Setup,
  {
    key,
    model = "gpt-4.1-mini",
    fetcher = fetch,
    timeoutMs = 8000,
    signal,
  }: {
    key?: string;
    model?: string;
    fetcher?: typeof fetch;
    timeoutMs?: number;
    signal?: AbortSignal;
  } = {},
): Promise<RecommendationResult> {
  if (!validSetup(setup)) throw new Error("Choose a valid trip profile first.");
  const fallback: RecommendationResult = {
    source: "curated",
    note: "Matched to your interests and travel category using ROAM’s authored chapters.",
    items: profileRecommendations(setup),
  };
  if (!key)
    return {
      ...fallback,
      note: "Profile-based picks are ready. AI suggestions become available when the server is connected.",
    };
  const controller = new AbortController();
  if (signal?.aborted) return fallback;
  const cancel = () => controller.abort();
  signal?.addEventListener("abort", cancel, { once: true });
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetcher("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${key}`,
      },
      signal: controller.signal,
      body: JSON.stringify({
        model,
        store: false,
        max_output_tokens: 240,
        instructions:
          "Rank three or four distinct ROAM Lisbon game chapters for this trip profile. Use only supplied chapter IDs. Match interests, category, stay length, accommodation style and budget. These are simulated experiences, not real bookings. Do not invent places, prices or services. Return only the required JSON.",
        input: JSON.stringify({
          profile: {
            persona: setup.persona || "tourist",
            interests: setup.interests || [],
            arrival: setup.arrival || "home",
            days: setup.days,
            budget: setup.budget,
            style: setup.style,
            base: setup.base,
            accommodation: setup.accommodation || "apartment",
          },
          chapters: Object.entries(places).map(([id, chapter]) => ({
            id,
            name: chapter.name,
            district: chapter.district,
            description: chapter.description,
          })),
        }),
        text: {
          format: {
            type: "json_schema",
            name: "roam_chapter_order",
            strict: true,
            schema: {
              type: "object",
              additionalProperties: false,
              required: ["places"],
              properties: {
                places: {
                  type: "array",
                  minItems: 3,
                  maxItems: 4,
                  items: { type: "string", enum: Object.keys(places) },
                },
              },
            },
          },
        },
      }),
    });
    if (!response.ok) throw new Error("AI unavailable");
    const result = await response.json();
    if (result.status !== "completed" || !Array.isArray(result.output))
      throw new Error("Incomplete recommendation");
    const text = result.output
      .flatMap(
        (item: {
          type?: string;
          content?: { type?: string; text?: string }[];
        }) =>
          item.type === "message" && Array.isArray(item.content)
            ? item.content
            : [],
      )
      .filter(
        (item: { type?: string; text?: string }) =>
          item.type === "output_text" && typeof item.text === "string",
      )
      .map((item: { text: string }) => item.text)
      .join("");
    if (text.length > 3000) throw new Error("Invalid recommendation");
    const ranked = JSON.parse(text).places;
    if (
      !Array.isArray(ranked) ||
      ranked.length < 3 ||
      ranked.length > 4 ||
      new Set(ranked).size !== ranked.length ||
      ranked.some((id) => typeof id !== "string" || !Object.hasOwn(places, id))
    )
      throw new Error("Invalid chapter IDs");
    return {
      source: "ai",
      note: "AI ranked these ROAM chapters for your profile. Place descriptions remain sourced or authored game content.",
      items: ranked.map((id: PlaceId) => ({
        place: id,
        title: places[id].name,
        detail: places[id].description,
      })),
    };
  } catch {
    return {
      ...fallback,
      note: "AI suggestions are unavailable right now. Your profile-based picks are still ready.",
    };
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener("abort", cancel);
  }
}
