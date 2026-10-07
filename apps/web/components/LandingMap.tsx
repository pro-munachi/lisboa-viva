"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { ArrowRight, Compass, MapPin, Sparkles, Users } from "lucide-react";
import World from "./World";
import { GEOGRAPHIC_HOTSPOTS } from "../lib/geography";
import {
  fromGeographic,
  placeFocus,
  type WorldFocus,
} from "../lib/world-state";

const previewPlaces = [
  { label: "Cais do Sodré", focus: placeFocus.cais },
  { label: "Alfama", focus: placeFocus.exchange },
  { label: "Belém", focus: placeFocus.riverside },
];

export default function LandingMap() {
  const [focus, setFocus] = useState<WorldFocus>({
    ...placeFocus.cais,
    range: 210,
  });
  const hotspots = useMemo(() => GEOGRAPHIC_HOTSPOTS.map(fromGeographic), []);

  return (
    <main className="landing-page">
      <div className="landing-map">
        <World
          focus={focus}
          shirt="#ece7df"
          hotspots={hotspots}
          onHotspot={(hotspot) =>
            setFocus({
              ...hotspot,
              range: hotspot.area === "Belém" ? 190 : 135,
            })
          }
          interior={null}
          onExitInterior={() => undefined}
        />
      </div>
      <div className="landing-shade" aria-hidden="true" />

      <header className="landing-header">
        <Link className="landing-brand" href="/" aria-label="ROAM home">
          ROAM
          <span>LISBON. YOUR WAY.</span>
        </Link>
        <nav className="landing-auth" aria-label="Account">
          <Link className="landing-login" href="/login">
            Sign in
          </Link>
          <Link className="landing-create" href="/register">
            Create account <ArrowRight size={16} />
          </Link>
        </nav>
      </header>

      <section className="landing-hero">
        <span className="landing-kicker">
          <Sparkles size={14} /> A living miniature of Lisbon
        </span>
        <h1>
          Meet Lisbon
          <br /> before you arrive.
        </h1>
        <p>
          Walk its streets, meet its people, and try a few days in the city.
          Your choices shape a Lisbon story that feels like your own.
        </p>
        <div className="landing-actions">
          <Link className="landing-primary" href="/register">
            Start your story <ArrowRight size={18} />
          </Link>
          <Link className="landing-secondary" href="/login">
            I already have an account
          </Link>
        </div>
        <div className="landing-promises" aria-label="Experience highlights">
          <span>
            <Compass size={15} /> Explore freely
          </span>
          <span>
            <Users size={15} /> Meet simulated locals
          </span>
          <span>
            <MapPin size={15} /> Real Lisbon places
          </span>
        </div>
      </section>

      <aside className="landing-locations" aria-label="Preview a neighbourhood">
        <span>Preview the map</span>
        <div>
          {previewPlaces.map((place) => (
            <button
              key={place.label}
              aria-pressed={focus.name === place.focus.name}
              onClick={() => setFocus({ ...place.focus })}
            >
              {place.label}
            </button>
          ))}
        </div>
        <small>Drag to look around · Select a map marker to move closer</small>
      </aside>
    </main>
  );
}
