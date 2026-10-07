"use client";

import type { CharacterAppearance } from "../lib/appearance";
import { APPEARANCE_OPTIONS } from "../lib/appearance";

function Swatches({
  label,
  colors,
  value,
  onChange,
}: {
  label: string;
  colors: string[];
  value: string;
  onChange: (color: string) => void;
}) {
  return (
    <div className="appearance-colors">
      <span>{label}</span>
      <div>
        {colors.map((color) => (
          <button
            key={color}
            type="button"
            aria-label={`${label}: ${color}`}
            aria-pressed={value === color}
            style={{ background: color }}
            onClick={() => onChange(color)}
          />
        ))}
      </div>
    </div>
  );
}

export default function AppearanceCustomizer({
  value,
  onChange,
}: {
  value: CharacterAppearance;
  onChange: (appearance: CharacterAppearance) => void;
}) {
  const set = <K extends keyof CharacterAppearance>(
    key: K,
    next: CharacterAppearance[K],
  ) => onChange({ ...value, [key]: next });

  return (
    <fieldset className="appearance-customizer">
      <legend>Create your look</legend>
      <div className="appearance-preview" aria-label="Character preview">
        <span
          className={`appearance-hair hair-${value.hairStyle}`}
          style={{ background: value.hairColor }}
        />
        <span
          className="appearance-head"
          style={{ background: value.skinTone }}
        />
        <span
          className={`appearance-top outfit-${value.outfitStyle}`}
          style={{ background: value.topColor }}
        />
        <span
          className="appearance-legs"
          style={{ color: value.bottomColor }}
        />
        <span className="appearance-shoes" style={{ color: value.shoeColor }} />
      </div>
      <div className="appearance-controls">
        <div className="appearance-choice">
          <span>Outfit</span>
          <div>
            {APPEARANCE_OPTIONS.outfits.map(([id, label]) => (
              <button
                type="button"
                key={id}
                aria-pressed={value.outfitStyle === id}
                onClick={() => set("outfitStyle", id)}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
        <div className="appearance-choice">
          <span>Hair</span>
          <div>
            {APPEARANCE_OPTIONS.hairstyles.map(([id, label]) => (
              <button
                type="button"
                key={id}
                aria-pressed={value.hairStyle === id}
                onClick={() => set("hairStyle", id)}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
        <div className="appearance-swatches">
          <Swatches
            label="Top"
            colors={APPEARANCE_OPTIONS.tops}
            value={value.topColor}
            onChange={(v) => set("topColor", v)}
          />
          <Swatches
            label="Bottom"
            colors={APPEARANCE_OPTIONS.bottoms}
            value={value.bottomColor}
            onChange={(v) => set("bottomColor", v)}
          />
          <Swatches
            label="Hair colour"
            colors={APPEARANCE_OPTIONS.hair}
            value={value.hairColor}
            onChange={(v) => set("hairColor", v)}
          />
          <Swatches
            label="Skin tone"
            colors={APPEARANCE_OPTIONS.skin}
            value={value.skinTone}
            onChange={(v) => set("skinTone", v)}
          />
          <Swatches
            label="Shoes"
            colors={APPEARANCE_OPTIONS.shoes}
            value={value.shoeColor}
            onChange={(v) => set("shoeColor", v)}
          />
        </div>
      </div>
    </fieldset>
  );
}
