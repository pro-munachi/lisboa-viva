"use client";
import { World, Player } from "./types";
const colors = [
  "#e5b69b",
  "#edd4ab",
  "#f6e8ce",
  "#c8d7cd",
  "#e5c28a",
  "#ddaaa0",
];
function Building({
  x,
  y,
  w = 22,
  h = 24,
  c = "#efd6b3",
}: {
  x: number;
  y: number;
  w?: number;
  h?: number;
  c?: string;
}) {
  return (
    <g transform={`translate(${x} ${y})`}>
      <path d={`M0 0 L${w} -9 L${w + 12} -2 L12 7Z`} fill="#b96e4f" />
      <path d={`M0 0 L12 7 L12 ${h + 7} L0 ${h}Z`} fill="#d9b696" />
      <path
        d={`M12 7 L${w + 12} -2 L${w + 12} ${h - 2} L12 ${h + 7}Z`}
        fill={c}
      />
      <path d={`M16 13l5 -2v7l-5 2z M${w + 3} 8l5 -2v7l-5 2z`} fill="#527375" />
      {h > 23 && (
        <path
          d={`M16 26l5 -2v7l-5 2z M${w + 3} 21l5 -2v7l-5 2z`}
          fill="#527375"
        />
      )}
      <path
        d={`M0 0L${w} -9L${w + 12} -2`}
        fill="none"
        stroke="#8f503f"
        strokeWidth="1.4"
      />
    </g>
  );
}
function Tree({ x, y, s = 1 }: { x: number; y: number; s?: number }) {
  return (
    <g transform={`translate(${x} ${y}) scale(${s})`}>
      <ellipse cy="9" rx="10" ry="4" fill="#52684f" opacity=".12" />
      <path d="M0 0v11" stroke="#796c4d" strokeWidth="2" />
      <ellipse cy="-3" rx="8" ry="12" fill="#90a781" />
      <ellipse cx="-2" cy="-5" rx="6" ry="8" fill="#a3b792" />
    </g>
  );
}
export default function CityMap({
  world,
  selected,
  onSelect,
  player,
  night,
}: {
  world: World;
  selected: string;
  onSelect: (id: string) => void;
  player?: Player;
  night: boolean;
}) {
  return (
    <svg
      className={"city-map " + (night ? "night" : "")}
      viewBox="0 0 1060 850"
      role="group"
      aria-label="Mapa ilustrado de Lisboa e arredores. Usa os botões dos bairros ou a vista de lista."
    >
      <defs>
        <pattern
          id="water"
          width="50"
          height="28"
          patternUnits="userSpaceOnUse"
        >
          <path
            d="M4 13q7-3 14 0m14 10q7-3 14 0"
            stroke="#d0e0d7"
            strokeWidth="1"
            opacity=".5"
          />
        </pattern>
        <pattern id="paper" width="7" height="7" patternUnits="userSpaceOnUse">
          <circle cx="2" cy="3" r=".6" fill="#a08760" opacity=".08" />
        </pattern>
        <filter id="pinShadow">
          <feDropShadow dx="0" dy="3" stdDeviation="3" floodOpacity=".12" />
        </filter>
      </defs>
      <rect width="1060" height="850" fill="#a9c9c7" />
      <rect width="1060" height="850" fill="url(#water)" />
      <path
        d="M0 0H1060V366Q1030 418 984 441Q925 465 866 515Q796 568 700 589L551 596Q443 594 347 579Q269 564 213 591Q147 619 69 638L0 663Z"
        fill="#e9e6d6"
      />
      <path
        d="M0 0H1060V366Q1030 418 984 441Q925 465 866 515Q796 568 700 589L551 596Q443 594 347 579Q269 564 213 591Q147 619 69 638L0 663Z"
        fill="url(#paper)"
      />
      <path
        d="M360 850L425 799Q469 741 561 712Q613 696 667 682Q763 658 825 637Q960 594 1060 563V850Z"
        fill="#e4e3cd"
      />
      <path
        d="M0 664Q162 623 220 589M225 588Q306 560 405 585T706 587Q796 562 866 515T1060 367"
        fill="none"
        stroke="#f9f1d8"
        strokeWidth="12"
      />
      <path
        d="M45 68Q190 15 257 87T400 105L425 204Q357 260 270 272L157 231L63 171Z"
        fill="#cbd4b8"
      />
      <path
        d="M82 61Q201 57 256 130T373 197M65 91Q179 69 237 147T346 231M40 129Q132 98 201 168T294 252"
        fill="none"
        stroke="#b4c49f"
        strokeWidth="1.5"
        opacity=".7"
      />
      <path
        d="M320 306Q386 268 434 311L474 382Q424 412 365 386Z"
        fill="#c4d0ad"
      />
      <path
        d="M741 151Q795 184 795 262T878 372M716 141Q762 186 769 267T853 393M690 148Q741 192 743 274T827 410M669 157Q711 218 711 280T797 430"
        fill="none"
        stroke="#d5d3ba"
        strokeWidth="2"
      />
      <g fill="none" stroke="#fbf8eb" strokeWidth="16" strokeLinejoin="round">
        <path d="M610 0L605 214L571 435L476 530L270 505L70 601" />
        <path d="M0 421L401 345L572 435L775 340L925 154L1030 42" />
        <path d="M314 178L410 217L610 220L775 340L859 475" />
        <path d="M410 217L401 345L476 530" />
        <path d="M92 414L271 505M942 0L926 153L1018 357" />
        <path d="M552 787L650 735L823 674L1007 637" />
      </g>
      <g fill="none" stroke="#d2cbb7" strokeWidth="1.2">
        <path d="M610 0L605 214L571 435L476 530L270 505L70 601" />
        <path d="M0 421L401 345L572 435L775 340L925 154L1030 42" />
        <path d="M314 178L410 217L610 220L775 340L859 475" />
        <path d="M410 217L401 345L476 530" />
      </g>
      {world.hubs
        .filter((h) => h.id !== "carcavelos")
        .map((h, hi) => (
          <g key={h.id}>
            {Array.from({ length: 15 }, (_, i) => {
              const col = i % 5,
                row = Math.floor(i / 5);
              return (
                <Building
                  key={i}
                  x={h.x - 78 + col * 32 + (row % 2) * 10}
                  y={h.y - 75 + row * 32}
                  w={18 + ((i * 7) % 12)}
                  h={18 + ((i * 11) % 23)}
                  c={colors[(i + hi) % colors.length]}
                />
              );
            })}
            {Array.from({ length: 6 }, (_, i) => (
              <Tree
                key={"t" + i}
                x={h.x - 84 + i * 32}
                y={h.y + 42 + (i % 2) * 10}
                s={0.8}
              />
            ))}
          </g>
        ))}
      <g transform="translate(303 143)">
        <ellipse
          rx="47"
          ry="30"
          fill="#dadad0"
          stroke="#f9f8ee"
          strokeWidth="12"
        />
        <ellipse rx="30" ry="17" fill="#93aa78" />
        <path d="M-20-11h40v22h-40zM0-11v22" fill="none" stroke="#d8e2c9" />
        <circle r="5" fill="none" stroke="#d8e2c9" />
      </g>
      <g transform="translate(55 551)">
        <path
          d="M-25 55Q19 35 82 18"
          stroke="#ead49e"
          strokeWidth="28"
          fill="none"
        />
        <path
          d="M-18 70Q35 43 77 42"
          stroke="#edf0de"
          strokeWidth="3"
          fill="none"
        />
        {[0, 1, 2].map((i) => (
          <g key={i} transform={`translate(${i * 23} ${30 - i * 6})`}>
            <path
              d="M-9 0a9 9 0 0118 0z"
              fill={i % 2 ? "#ecdbb6" : "#c47a58"}
            />
            <path d="M0 0v12" stroke="#86744b" />
          </g>
        ))}
      </g>
      <g transform="translate(535 342) rotate(9)">
        <rect width="18" height="38" rx="5" fill="#d3a23e" stroke="#a98b47" />
        <path d="M3 7h12v8H3zm0 17h12v8H3z" fill="#3f666a" />
        <path d="M3 18h12" stroke="#fbe7a8" strokeWidth="3" />
      </g>
      <path
        d="M491 565Q573 610 638 707"
        stroke="#f7faf0"
        strokeWidth="2"
        strokeDasharray="5 7"
        fill="none"
      />
      <g transform="translate(573 628) rotate(28)">
        <path d="M-19 2H22L13 11H-12Z" fill="#f9f5e6" />
        <path d="M-11-9H12V1H-11Z" fill="#e4bc60" />
        <path d="M-6-7H7V-3H-6Z" fill="#4e767c" />
        <path d="M-25 16h25" stroke="#d7e4d9" />
      </g>
      <text
        x="785"
        y="626"
        textAnchor="middle"
        transform="rotate(-16 785 626)"
        className="river-label"
      >
        RIO TEJO
      </text>
      <text x="109" y="755" textAnchor="middle" className="sea-label">
        ATLÂNTICO
      </text>
      <text x="214" y="82" className="terrain-label">
        MONSANTO
      </text>
      <text x="789" y="810" className="terrain-label">
        MARGEM SUL
      </text>
      {world.hubs.map((h) => {
        const active = selected === h.id;
        const here =
          player &&
          world.venues.find((v) => v.id === player.venue)?.hub === h.id;
        return (
          <g
            key={h.id}
            role="button"
            tabIndex={0}
            aria-label={`Explorar ${h.name}`}
            onClick={() => onSelect(h.id)}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                onSelect(h.id);
              }
            }}
            className={"map-pin " + (active ? "selected" : "")}
            transform={`translate(${h.x} ${h.y + 30})`}
          >
            <rect
              x={-Math.max(51, h.name.length * 3.4 + 18)}
              y="-12"
              width={Math.max(102, h.name.length * 6.8 + 36)}
              height="29"
              rx="14.5"
              fill={active ? "#294b44" : "#fffdf4"}
              filter="url(#pinShadow)"
            />
            <circle
              cx={-Math.max(37, h.name.length * 3.4 + 4)}
              cy="2"
              r="3"
              fill={active ? "#d9e9a5" : "#b78658"}
            />
            <text
              x="7"
              y="6"
              textAnchor="middle"
              fill={active ? "#fffdf4" : "#43514a"}
            >
              {h.name}
            </text>
            {here && (
              <g transform="translate(0 -36)">
                <circle
                  r="17"
                  fill="#fdf9ee"
                  stroke="#34584c"
                  strokeWidth="2"
                />
                <circle cy="-4" r="5" fill="#c88967" />
                <path d="M-8 11v-4a8 8 0 0116 0v4" fill="#416a60" />
                <path d="M-4 18l4 5 4-5" fill="#34584c" />
              </g>
            )}
          </g>
        );
      })}
      <g transform="translate(994 740)" fill="#617c76">
        <path d="M0-25l6 24-6-4-6 4z" />
        <path d="M0 25l6-24-6 4-6-4z" opacity=".3" />
        <text y="-35" textAnchor="middle" fontSize="11">
          N
        </text>
      </g>
    </svg>
  );
}
export function VenueScene({ type = "cafe" }: { type?: string }) {
  const beach = ["beach", "surf"].includes(type);
  return (
    <svg
      viewBox="0 0 360 170"
      className="venue-scene"
      role="img"
      aria-label={
        beach
          ? "Ilustração da praia de Carcavelos"
          : "Ilustração de um espaço do bairro"
      }
    >
      <rect width="360" height="170" fill={beach ? "#d3e3de" : "#e8e3cc"} />
      <circle cx="285" cy="35" r="20" fill="#f4d999" />
      {beach ? (
        <>
          <path d="M0 75Q140 65 360 88V170H0Z" fill="#98bfc0" />
          <path d="M0 137Q140 96 360 119V170H0Z" fill="#ecdbac" />
          <path
            d="M0 130Q140 89 360 112"
            stroke="#faf8e4"
            strokeWidth="4"
            fill="none"
          />
          <g transform="translate(233 112)">
            <path d="M-30 0a30 30 0 0160 0z" fill="#c97d54" />
            <path d="M0 0v40" stroke="#826d4c" />
          </g>
          <ellipse
            cx="101"
            cy="134"
            rx="8"
            ry="30"
            transform="rotate(40 101 134)"
            fill="#fff4ce"
          />
        </>
      ) : (
        <>
          <path d="M0 135L360 88V170H0Z" fill="#d4d0b5" />
          <Building x={80} y={51} w={114} h={82} c="#efdbad" />
          <path d="M95 83L207 55L218 78L107 107Z" fill="#376254" />
          {[0, 1, 2, 3, 4].map((i) => (
            <path
              key={i}
              d={`M${101 + i * 22} ${82 - i * 5.5}l10-2.5 10 23-10 2.5z`}
              fill="#f3edcf"
            />
          ))}
          <path d="M133 107l30-7v35l-30 8z" fill="#31564f" />
          <path d="M175 96l21-5v22l-21 5z" fill="#76998f" />
          <ellipse cx="244" cy="127" rx="25" ry="8" fill="#c7985d" />
          <path
            d="M244 127v25M227 141v12M261 135v12"
            stroke="#736e52"
            strokeWidth="3"
          />
          <Tree x={35} y={115} s={1.8} />
          <Tree x={316} y={98} s={1.6} />
        </>
      )}
      <g transform="translate(271 142)">
        <circle cy="-16" r="6" fill="#b67e5e" />
        <path d="M-7 0v-7q7-12 14 0v7z" fill="#587986" />
        <path d="M-4 0v11M4 0v11" stroke="#565e56" strokeWidth="3" />
      </g>
    </svg>
  );
}
