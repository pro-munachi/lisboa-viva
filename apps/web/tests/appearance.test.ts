import assert from "node:assert/strict";
import { test } from "node:test";
import {
  APPEARANCE_FIELDS,
  APPEARANCE_BODY_OPTIONS,
  APPEARANCE_OPTIONS,
  changeAppearanceBody,
  compatibleAppearance,
  DEFAULT_APPEARANCE,
  isCompatibleAppearance,
  normalizeCharacterAppearance,
} from "../lib/appearance";

test("legacy character appearances retain all seven existing choices with a male body default", () => {
  const { bodyType: _bodyType, ...legacy } = DEFAULT_APPEARANCE;
  assert.deepEqual(normalizeCharacterAppearance(legacy), DEFAULT_APPEARANCE);
  assert.deepEqual(
    APPEARANCE_OPTIONS.bodyTypes.map(([id]) => id),
    ["male", "female"],
  );
  const selected = {
    ...DEFAULT_APPEARANCE,
    bodyType: "female",
    privateExtra: "discard",
  };
  const normalized = normalizeCharacterAppearance(selected)!;
  assert.equal(normalized.bodyType, "female");
  assert.deepEqual(Object.keys(normalized), [...APPEARANCE_FIELDS]);
  assert.equal("privateExtra" in normalized, false);
  assert.notEqual(normalized, selected);
});

test("body-specific choices retain saved IDs while switching preserves compatible clothes, hair and colours", () => {
  assert.deepEqual(
    APPEARANCE_BODY_OPTIONS.male.outfits.map(([id]) => id),
    ["casual", "jacket", "tourist"],
  );
  assert.deepEqual(
    APPEARANCE_BODY_OPTIONS.female.outfits.map(([id]) => id),
    ["casual", "jacket", "dress", "tourist"],
  );
  assert.deepEqual(
    APPEARANCE_BODY_OPTIONS.male.hairstyles.map(([id]) => id),
    APPEARANCE_BODY_OPTIONS.female.hairstyles.map(([id]) => id),
  );
  assert.deepEqual(
    APPEARANCE_BODY_OPTIONS.male.hairstyles.map(([, name]) => name),
    ["Short cut", "Textured curls", "Swept waves", "Top knot"],
  );
  assert.deepEqual(
    APPEARANCE_BODY_OPTIONS.female.hairstyles.map(([, name]) => name),
    ["Pixie", "Curly", "Bob", "Bun"],
  );
  for (const outfitStyle of ["casual", "jacket", "tourist"] as const) {
    const original = {
      ...DEFAULT_APPEARANCE,
      outfitStyle,
      hairStyle: "bun" as const,
      topColor: "#c19a4b",
      skinTone: "#5b3d30",
    };
    const female = changeAppearanceBody(original, "female");
    assert.deepEqual(female, { ...original, bodyType: "female" });
    assert.deepEqual(changeAppearanceBody(female, "male"), original);
    assert.equal(isCompatibleAppearance(female), true);
    assert.notEqual(female, original);
  }
});

test("legacy Male + Dress stays readable while the editor fallback changes only the draft outfit", () => {
  const legacy = {
    ...DEFAULT_APPEARANCE,
    outfitStyle: "dress" as const,
    hairStyle: "bob" as const,
    topColor: "#687f73",
  };
  const savedBefore = { ...legacy };
  assert.deepEqual(normalizeCharacterAppearance(legacy), legacy);
  assert.equal(isCompatibleAppearance(legacy), false);
  assert.deepEqual(compatibleAppearance(legacy), {
    ...legacy,
    outfitStyle: "casual",
  });
  assert.deepEqual(changeAppearanceBody(legacy, "female"), {
    ...legacy,
    bodyType: "female",
  });
  assert.deepEqual(legacy, savedBefore);
  const femaleDress = { ...legacy, bodyType: "female" as const };
  assert.equal(isCompatibleAppearance(femaleDress), true);
  assert.deepEqual(changeAppearanceBody(femaleDress, "male"), {
    ...legacy,
    outfitStyle: "casual",
  });
});

test("explicit unsupported body types and incomplete palettes fail instead of resetting a saved look", () => {
  for (const bodyType of [
    "",
    "Female",
    "unknown",
    1,
    null,
    undefined,
    {},
    ["male"],
  ])
    assert.equal(
      normalizeCharacterAppearance({ ...DEFAULT_APPEARANCE, bodyType }),
      null,
    );
  for (const field of APPEARANCE_FIELDS.filter(
    (field) => field !== "bodyType",
  )) {
    const incomplete: Record<string, unknown> = { ...DEFAULT_APPEARANCE };
    delete incomplete[field];
    assert.equal(normalizeCharacterAppearance(incomplete), null);
  }
  assert.equal(
    normalizeCharacterAppearance({
      ...DEFAULT_APPEARANCE,
      topColor: "#123456",
    }),
    null,
  );
  assert.equal(normalizeCharacterAppearance(null), null);
  assert.equal(normalizeCharacterAppearance([]), null);
});
