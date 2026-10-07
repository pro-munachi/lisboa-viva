/** The current ROAM palette; legacy colours remain valid when replaying saves. */
export const TRAVELLER_COLOURS = [
  { name: "Cobalt", value: "#264ddb" },
  { name: "Coral", value: "#f15b50" },
  { name: "Mint", value: "#42b894" },
  { name: "Sunshine", value: "#ffce45" },
  { name: "Aqua", value: "#34a8c2" },
  { name: "Lilac", value: "#9b80e5" },
  { name: "Ink", value: "#20314f" },
  { name: "Cream", value: "#fff9ed" },
] as const;

export const VALID_TRAVELLER_COLOURS = new Set<string>([
  ...TRAVELLER_COLOURS.map((colour) => colour.value),
  "#ece7df",
  "#687f73",
  "#b47459",
  "#777791",
  "#456a86",
  "#ceab62",
  "#b9828f",
  "#454b4e",
]);
