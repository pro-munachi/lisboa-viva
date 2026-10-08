"use client";

import {
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from "react";
import {
  Backpack,
  Check,
  ChevronRight,
  Layers,
  Palette,
  Scissors,
  Shirt,
  Sparkles,
} from "lucide-react";
import type { CharacterAppearance } from "../lib/appearance";
import {
  APPEARANCE_BODY_OPTIONS,
  APPEARANCE_COLOR_NAMES,
  APPEARANCE_OPTIONS,
  changeAppearanceBody,
  compatibleAppearance,
} from "../lib/appearance";
import CharacterPreview from "./CharacterPreview";
import styles from "./AppearanceCustomizer.module.css";

type Section = "clothes" | "hair" | "colours";
type ColourField =
  | "topColor"
  | "bottomColor"
  | "shoeColor"
  | "hairColor"
  | "skinTone";

const sections = [
  { id: "clothes", label: "Clothes", icon: Shirt },
  { id: "hair", label: "Hair", icon: Scissors },
  { id: "colours", label: "Colours", icon: Palette },
] as const;
const colourParts: Record<ColourField, { label: string; colors: string[] }> = {
  topColor: { label: "Top colour", colors: APPEARANCE_OPTIONS.tops },
  bottomColor: { label: "Bottom colour", colors: APPEARANCE_OPTIONS.bottoms },
  shoeColor: { label: "Shoe colour", colors: APPEARANCE_OPTIONS.shoes },
  hairColor: { label: "Hair colour", colors: APPEARANCE_OPTIONS.hair },
  skinTone: { label: "Skin tone", colors: APPEARANCE_OPTIONS.skin },
};
const outfitDescriptions: Record<
  CharacterAppearance["bodyType"],
  Partial<Record<CharacterAppearance["outfitStyle"], string>>
> = {
  male: {
    casual: "Shirt & trousers",
    jacket: "City jacket & trousers",
    tourist: "Travel shirt & daypack",
  },
  female: {
    casual: "Fitted tee & trousers",
    jacket: "Cropped jacket & trousers",
    dress: "An everyday dress",
    tourist: "Travel top & daypack",
  },
};
const hairDescriptions: Record<
  CharacterAppearance["bodyType"],
  Record<CharacterAppearance["hairStyle"], string>
> = {
  male: {
    short: "Neat, close-cropped",
    curly: "Short, textured shape",
    bob: "Brushed back waves",
    bun: "Hair tied high",
  },
  female: {
    short: "Soft, cropped pixie",
    curly: "Full, rounded curls",
    bob: "Chin-length bob",
    bun: "Hair gathered back",
  },
};
const colourName = (color: string) =>
  APPEARANCE_COLOR_NAMES[color.toLowerCase()] ?? "Custom colour";

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
    <div className={styles.palette}>
      <div className={styles.paletteHeading}>
        <strong>{label}</strong>
        <span>{colourName(value)}</span>
      </div>
      <div className={styles.swatchGrid} role="group" aria-label={label}>
        {colors.map((color) => (
          <button
            key={color}
            type="button"
            className={styles.swatch}
            aria-label={`${label}: ${colourName(color)}`}
            aria-pressed={value === color}
            style={{ "--swatch-color": color } as CSSProperties}
            onClick={() => onChange(color)}
          >
            <span className={styles.colourDisc} aria-hidden="true">
              {value === color && (
                <span className={styles.swatchCheck}>
                  <Check size={12} strokeWidth={3} />
                </span>
              )}
            </span>
            <span>{colourName(color)}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

export default function AppearanceCustomizer({
  value: savedValue,
  onChange,
  variant = "registration",
}: {
  value: CharacterAppearance;
  onChange: (appearance: CharacterAppearance) => void;
  variant?: "registration" | "wardrobe";
}) {
  const value = useMemo(() => compatibleAppearance(savedValue), [savedValue]);
  const [section, setSection] = useState<Section>("clothes");
  const [colourField, setColourField] = useState<ColourField>("topColor");
  const colourPicker = useRef<HTMLSelectElement>(null);
  const focusColourPicker = useRef(false);
  const id = useId();
  const panelId = `${id}-choices`;
  const headingId = `${id}-heading`;
  const bodyType = value.bodyType ?? "male";
  const bodyOptions = APPEARANCE_BODY_OPTIONS[bodyType];
  const bodyLabel = bodyType === "female" ? "Female" : "Male";
  const outfitLabel = bodyOptions.outfits.find(
    ([style]) => style === value.outfitStyle,
  )?.[1];
  const hairLabel = bodyOptions.hairstyles.find(
    ([style]) => style === value.hairStyle,
  )?.[1];
  const set = <K extends keyof CharacterAppearance>(
    key: K,
    next: CharacterAppearance[K],
  ) => onChange({ ...value, [key]: next });
  const editColour = (field: ColourField) => {
    focusColourPicker.current = true;
    setColourField(field);
    setSection("colours");
  };
  useEffect(() => {
    if (section !== "colours" || !focusColourPicker.current) return;
    focusColourPicker.current = false;
    colourPicker.current?.focus();
  }, [section]);

  const bodySelector = (
    <div
      className={styles.bodySelector}
      role="group"
      aria-label="Character body"
    >
      {APPEARANCE_OPTIONS.bodyTypes.map(([bodyType, label]) => (
        <button
          type="button"
          key={bodyType}
          aria-label={`Character body: ${label}`}
          aria-pressed={(value.bodyType ?? "male") === bodyType}
          onClick={() => onChange(changeAppearanceBody(value, bodyType))}
        >
          <svg
            viewBox="0 0 28 38"
            className={styles.bodyIcon}
            aria-hidden="true"
          >
            <circle cx="14" cy="6" r="4" />
            <path
              d={
                bodyType === "female"
                  ? "M8 13h12l-2 9 1 5H9l1-5z"
                  : "M6 13h16l-2 14H8z"
              }
            />
            <path
              d="M8 14 5 26m15-12 3 12M11 27l-1 8m7-8 1 8"
              fill="none"
              stroke="currentColor"
              strokeWidth="3"
              strokeLinecap="round"
            />
          </svg>
          <strong>{label}</strong>
          <span className={styles.choiceCheck} aria-hidden="true">
            {(value.bodyType ?? "male") === bodyType && (
              <Check size={13} strokeWidth={3} />
            )}
          </span>
        </button>
      ))}
    </div>
  );

  return (
    <fieldset
      className={styles.customizer}
      data-variant={variant}
      data-body={bodyType}
    >
      <legend className={styles.legend}>Create your character</legend>
      {variant === "registration" && (
        <>
          <p className={styles.intro}>
            Choose your character, then dress your look.
          </p>
          {bodySelector}
        </>
      )}
      <div className={styles.editor}>
        {variant === "wardrobe" && bodySelector}
        <div className={styles.previewFrame}>
          <CharacterPreview
            appearance={value}
            variant={variant === "wardrobe" ? "wardrobe" : undefined}
          />
          <div className={styles.chosenLook}>
            <span className={styles.lookMark} aria-hidden="true">
              <Sparkles size={18} />
            </span>
            <div>
              <span className={styles.eyebrow}>{bodyLabel} · YOUR LOOK</span>
              <strong>
                {outfitLabel} · {hairLabel} hair
              </strong>
              <p>
                {colourName(value.topColor)} top · {colourName(value.hairColor)}{" "}
                hair
              </p>
            </div>
            <span
              className={styles.lookColour}
              style={{ backgroundColor: value.topColor }}
              aria-hidden="true"
            />
          </div>
        </div>
        <div className={styles.editorControls}>
          <div
            className={styles.sections}
            role="group"
            aria-label="Character controls"
          >
            {sections.map(({ id: name, label, icon: Icon }) => (
              <button
                type="button"
                key={name}
                aria-pressed={section === name}
                aria-controls={panelId}
                onClick={() => setSection(name)}
              >
                <Icon size={16} aria-hidden="true" /> {label}
              </button>
            ))}
          </div>
          <div
            id={panelId}
            className={styles.choices}
            role="region"
            aria-labelledby={headingId}
          >
            {section === "clothes" && (
              <>
                <h3 id={headingId}>Choose your outfit</h3>
                <div
                  className={styles.styleGrid}
                  data-choice="outfit"
                  role="group"
                  aria-label={`${bodyLabel} outfit style`}
                >
                  {bodyOptions.outfits.map(([style, label]) => (
                    <button
                      type="button"
                      key={style}
                      className={styles.styleChoice}
                      aria-label={`Outfit: ${label}`}
                      aria-pressed={value.outfitStyle === style}
                      onClick={() => set("outfitStyle", style)}
                    >
                      {variant === "wardrobe" && (
                        <span className={styles.choiceGlyph} aria-hidden="true">
                          {style === "tourist" ? (
                            <Backpack size={23} />
                          ) : style === "jacket" ? (
                            <Layers size={23} />
                          ) : style === "dress" ? (
                            <Sparkles size={23} />
                          ) : (
                            <Shirt size={23} />
                          )}
                        </span>
                      )}
                      <span className={styles.choiceText}>
                        <strong>{label}</strong>
                        <span>{outfitDescriptions[bodyType][style]}</span>
                      </span>
                      <span className={styles.choiceCheck} aria-hidden="true">
                        {value.outfitStyle === style && (
                          <Check size={13} strokeWidth={3} />
                        )}
                      </span>
                    </button>
                  ))}
                </div>
                <p className={styles.shortcutLabel}>Make it your colours</p>
                <div className={styles.colourShortcuts}>
                  {(
                    [
                      ["topColor", "Top"],
                      ["bottomColor", "Bottom"],
                      ["shoeColor", "Shoes"],
                    ] as const
                  ).map(([field, label]) => (
                    <button
                      type="button"
                      key={field}
                      aria-label={`Change ${label.toLowerCase()} colour, currently ${colourName(value[field])}`}
                      onClick={() => editColour(field)}
                    >
                      <span
                        className={styles.shortcutDisc}
                        style={{ backgroundColor: value[field] }}
                        aria-hidden="true"
                      />
                      <span>
                        <strong>{label}</strong>
                        <span>{colourName(value[field])}</span>
                      </span>
                      <ChevronRight size={13} aria-hidden="true" />
                    </button>
                  ))}
                </div>
              </>
            )}
            {section === "hair" && (
              <>
                <h3 id={headingId}>Find your hairstyle</h3>
                <div
                  className={styles.styleGrid}
                  role="group"
                  aria-label={`${bodyLabel} hair style`}
                >
                  {bodyOptions.hairstyles.map(([style, label]) => (
                    <button
                      type="button"
                      key={style}
                      className={styles.styleChoice}
                      aria-label={`Hairstyle: ${label}`}
                      aria-pressed={value.hairStyle === style}
                      onClick={() => set("hairStyle", style)}
                    >
                      {variant === "wardrobe" && (
                        <span className={styles.choiceGlyph} aria-hidden="true">
                          <Scissors size={22} />
                        </span>
                      )}
                      <span className={styles.choiceText}>
                        <strong>{label}</strong>
                        <span>{hairDescriptions[bodyType][style]}</span>
                      </span>
                      <span className={styles.choiceCheck} aria-hidden="true">
                        {value.hairStyle === style && (
                          <Check size={13} strokeWidth={3} />
                        )}
                      </span>
                    </button>
                  ))}
                </div>
                <Swatches
                  label="Hair colour"
                  colors={APPEARANCE_OPTIONS.hair}
                  value={value.hairColor}
                  onChange={(color) => set("hairColor", color)}
                />
              </>
            )}
            {section === "colours" && (
              <>
                <h3 id={headingId}>Pick your palette</h3>
                <label className={styles.partPicker}>
                  Colour for
                  <select
                    ref={colourPicker}
                    value={colourField}
                    onChange={(event) =>
                      setColourField(event.target.value as ColourField)
                    }
                  >
                    {Object.entries(colourParts).map(([field, { label }]) => (
                      <option value={field} key={field}>
                        {label}
                      </option>
                    ))}
                  </select>
                </label>
                <Swatches
                  label={colourParts[colourField].label}
                  colors={colourParts[colourField].colors}
                  value={value[colourField]}
                  onChange={(color) => set(colourField, color)}
                />
                <p className={styles.paletteHint}>
                  {colourField === "bottomColor" &&
                  value.outfitStyle === "dress"
                    ? "Bottom colour shows on Casual, Jacket and Explorer outfits."
                    : "Change your top, bottom, shoes, hair colour and skin tone here."}
                </p>
              </>
            )}
          </div>
        </div>
      </div>
    </fieldset>
  );
}
