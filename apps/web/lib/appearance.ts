export type CharacterAppearance = {
  bodyType: "male" | "female";
  outfitStyle: "casual" | "jacket" | "dress" | "tourist";
  topColor: string;
  bottomColor: string;
  hairStyle: "short" | "curly" | "bob" | "bun";
  hairColor: string;
  skinTone: string;
  shoeColor: string;
};

export const DEFAULT_APPEARANCE: CharacterAppearance = {
  bodyType: "male",
  outfitStyle: "casual",
  topColor: "#b47459",
  bottomColor: "#34444f",
  hairStyle: "short",
  hairColor: "#302823",
  skinTone: "#a87955",
  shoeColor: "#eee8df",
};

export const APPEARANCE_OPTIONS = {
  bodyTypes: [
    ["male", "Male"],
    ["female", "Female"],
  ] as const,
  outfits: [
    ["casual", "Casual"],
    ["jacket", "Jacket"],
    ["dress", "Dress"],
    ["tourist", "Explorer"],
  ] as const,
  hairstyles: [
    ["short", "Short"],
    ["curly", "Curly"],
    ["bob", "Bob"],
    ["bun", "Bun"],
  ] as const,
  tops: ["#ece7df", "#687f73", "#b47459", "#777791", "#c19a4b"],
  bottoms: ["#34444f", "#4e504b", "#6b5147", "#30324a"],
  hair: ["#302823", "#6a4430", "#b98452", "#171719"],
  skin: ["#5b3d30", "#76513b", "#a87955", "#d5af8b"],
  shoes: ["#eee8df", "#5c4b42", "#292d31"],
};

/** Existing saved IDs remain stable; each model has its own creator labels. */
export const APPEARANCE_BODY_OPTIONS = {
  male: {
    outfits: [
      ["casual", "Casual"],
      ["jacket", "Jacket"],
      ["tourist", "Explorer"],
    ],
    hairstyles: [
      ["short", "Short cut"],
      ["curly", "Textured curls"],
      ["bob", "Swept waves"],
      ["bun", "Top knot"],
    ],
  },
  female: {
    outfits: APPEARANCE_OPTIONS.outfits,
    hairstyles: [
      ["short", "Pixie"],
      ["curly", "Curly"],
      ["bob", "Bob"],
      ["bun", "Bun"],
    ],
  },
} as const;

export function isCompatibleAppearance(value: CharacterAppearance): boolean {
  return (
    APPEARANCE_BODY_OPTIONS[value.bodyType]?.outfits.some(
      ([style]) => style === value.outfitStyle,
    ) ?? false
  );
}

/** Keep compatible choices and colours; changing to Male replaces Dress only. */
export function changeAppearanceBody(
  value: CharacterAppearance,
  bodyType: CharacterAppearance["bodyType"],
): CharacterAppearance {
  return {
    ...value,
    bodyType,
    outfitStyle:
      bodyType === "male" && value.outfitStyle === "dress"
        ? "casual"
        : value.outfitStyle,
  };
}

/** Old Male+Dress rows remain stored/readable until an explicit wardrobe save. */
export function compatibleAppearance(
  value: CharacterAppearance,
): CharacterAppearance {
  return changeAppearanceBody(value, value.bodyType);
}

export const APPEARANCE_FIELDS = [
  "bodyType",
  "outfitStyle",
  "topColor",
  "bottomColor",
  "hairStyle",
  "hairColor",
  "skinTone",
  "shoeColor",
] as const satisfies readonly (keyof CharacterAppearance)[];

/** Older saved appearances have no body type. Explicit unsupported values fail. */
export function normalizeCharacterAppearance(
  value: unknown,
): CharacterAppearance | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const appearance = value as Record<string, unknown>;
  const bodyType = Object.hasOwn(appearance, "bodyType")
    ? appearance.bodyType
    : "male";
  if (
    !APPEARANCE_OPTIONS.bodyTypes.some(([id]) => id === bodyType) ||
    !APPEARANCE_OPTIONS.outfits.some(([id]) => id === appearance.outfitStyle) ||
    !APPEARANCE_OPTIONS.hairstyles.some(
      ([id]) => id === appearance.hairStyle,
    ) ||
    !APPEARANCE_OPTIONS.tops.includes(appearance.topColor as string) ||
    !APPEARANCE_OPTIONS.bottoms.includes(appearance.bottomColor as string) ||
    !APPEARANCE_OPTIONS.hair.includes(appearance.hairColor as string) ||
    !APPEARANCE_OPTIONS.skin.includes(appearance.skinTone as string) ||
    !APPEARANCE_OPTIONS.shoes.includes(appearance.shoeColor as string)
  )
    return null;
  return {
    bodyType: bodyType as CharacterAppearance["bodyType"],
    outfitStyle: appearance.outfitStyle as CharacterAppearance["outfitStyle"],
    topColor: appearance.topColor as string,
    bottomColor: appearance.bottomColor as string,
    hairStyle: appearance.hairStyle as CharacterAppearance["hairStyle"],
    hairColor: appearance.hairColor as string,
    skinTone: appearance.skinTone as string,
    shoeColor: appearance.shoeColor as string,
  };
}

/** Human names for the existing server-approved palette; values stay unchanged. */
export const APPEARANCE_COLOR_NAMES: Record<string, string> = {
  "#ece7df": "Cream",
  "#687f73": "Sage",
  "#b47459": "Terracotta",
  "#777791": "Lavender",
  "#c19a4b": "Ochre",
  "#34444f": "Slate",
  "#4e504b": "Olive",
  "#6b5147": "Cocoa",
  "#30324a": "Midnight",
  "#302823": "Espresso",
  "#6a4430": "Chestnut",
  "#b98452": "Honey",
  "#171719": "Black",
  "#5b3d30": "Deep brown",
  "#76513b": "Warm brown",
  "#a87955": "Golden brown",
  "#d5af8b": "Light tan",
  "#eee8df": "Chalk",
  "#5c4b42": "Brown",
  "#292d31": "Graphite",
};
