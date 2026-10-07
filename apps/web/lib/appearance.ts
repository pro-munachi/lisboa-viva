export type CharacterAppearance = {
  outfitStyle: "casual" | "jacket" | "dress" | "tourist";
  topColor: string;
  bottomColor: string;
  hairStyle: "short" | "curly" | "bob" | "bun";
  hairColor: string;
  skinTone: string;
  shoeColor: string;
};

export const DEFAULT_APPEARANCE: CharacterAppearance = {
  outfitStyle: "casual",
  topColor: "#b47459",
  bottomColor: "#34444f",
  hairStyle: "short",
  hairColor: "#302823",
  skinTone: "#a87955",
  shoeColor: "#eee8df",
};

export const APPEARANCE_OPTIONS = {
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
