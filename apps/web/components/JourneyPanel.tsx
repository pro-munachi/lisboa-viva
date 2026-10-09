"use client";

import { useId, useState } from "react";
import { ArrowRight, Check, Clock3 } from "lucide-react";
import { euro as fare, previewJourney, time, type Trip } from "../lib/engine";
import { places } from "../lib/content";
import {
  JOURNEY_HUBS,
  JOURNEY_NOTE,
  JOURNEY_PERSONAS,
  JOURNEY_ROUTES,
  journeyFor,
  peopleAtHub,
  routesAtHub,
  type HubId,
  type JourneyAction,
  type JourneyPerson,
} from "../lib/journey";
import styles from "./JourneyPanel.module.css";

export type JourneyPanelProps = {
  trip: Trip;
  onCommand: (action: JourneyAction) => Promise<boolean>;
  onEnterHub: (hub: HubId) => void;
};

const hubGraphics = { airport: "✈️", station: "🚆", "bus-stop": "🚌" };
const modeGraphics = {
  metro: "🚇",
  train: "🚆",
  bus: "🚌",
  walk: "🚶",
  flight: "✈️",
  taxi: "🚕",
};

function EncounterPortrait({ person }: { person: JourneyPerson }) {
  const traveller = person.role === "traveller";
  return (
    <svg
      viewBox="0 0 44 44"
      className={styles.portrait}
      aria-hidden="true"
      focusable="false"
    >
      <path
        d="M6 44v-8c0-8 7-12 16-12s16 4 16 12v8"
        className={styles.portraitShirt}
      />
      <path d="M18 24v5l4 3 4-3v-5" fill="#c99672" />
      <ellipse cx="22" cy="17" rx="8" ry="10" fill="#ddb18b" />
      {traveller ? (
        <path
          d="M13 15V9c0-5 18-5 18 0v6l-5-4-13 4ZM12 9h21v3H12Z"
          fill="#4b5551"
        />
      ) : (
        <path d="M13 17V9c0-7 18-8 18 0v9l-3-7-4 2-8-2-3 6Z" fill="#4b4038" />
      )}
      <path
        d="M18 18h1m6 0h1"
        stroke="#4e3b32"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
      <path
        d="M20 23q2 2 4 0"
        fill="none"
        stroke="#9b6854"
        strokeWidth="1.2"
        strokeLinecap="round"
      />
      {traveller && (
        <path d="m12 31 4 13m16-13-4 13" stroke="#f4e7cf" strokeWidth="3" />
      )}
    </svg>
  );
}

export default function JourneyPanel({
  trip,
  onCommand,
  onEnterHub,
}: JourneyPanelProps) {
  const id = useId();
  const [selectedPersonId, setSelectedPersonId] = useState<string | null>(null);
  const journey = journeyFor(trip);
  const persona = JOURNEY_PERSONAS[trip.setup.persona || "tourist"];
  const currentHub = journey.hub ? JOURNEY_HUBS[journey.hub] : null;
  const routes = routesAtHub(journey.hub).filter(
    (route) => journey.phase !== "arriving" || !route.departure,
  );
  const booked = journey.ticket
    ? JOURNEY_ROUTES.find((route) => route.id === journey.ticket?.routeId)
    : null;
  const cardPreview = previewJourney(trip, { action: "get-card" });
  const boardPreview = previewJourney(trip, { action: "board" });
  const hubGraphic = currentHub ? hubGraphics[currentHub.kind] : "🗺️";
  const finished = journey.phase === "departed" || trip.complete;
  const people = peopleAtHub(journey.hub);
  const selectedPerson =
    people.find((person) => person.id === selectedPersonId) || people[0];
  const encounter = selectedPerson
    ? previewJourney(trip, { action: "talk", personId: selectedPerson.id })
    : null;
  const chatted = selectedPerson
    ? journey.talked.includes(selectedPerson.id)
    : false;

  if (finished) {
    return (
      <section className={styles.panel} aria-label="Journey recap">
        <div className={styles.recap}>
          <span className={styles.heroIcon}>
            <Check size={25} aria-hidden="true" />
          </span>
          <span className={styles.eyebrow}>YOUR LISBON CHAPTER</span>
          <h3>
            {journey.phase === "departed"
              ? "On your way, with memories."
              : "A chapter to remember."}
          </h3>
          <p>
            {trip.history.at(-1)?.outcome ||
              "Your simulated journey is complete. Revisit its moments in your journal."}
          </p>
          <div className={styles.recapStats}>
            <div>
              <strong>{fare(trip.spent)}</strong>
              <span>simulated spend</span>
            </div>
            <div>
              <strong>Day {trip.day}</strong>
              <span>{time(trip.minute)} in Lisbon</span>
            </div>
            <div>
              <strong>{trip.history.length}</strong>
              <span>recorded moments</span>
            </div>
          </div>
        </div>
        <p className={styles.note}>{JOURNEY_NOTE}</p>
      </section>
    );
  }

  return (
    <section className={styles.panel} aria-label="Your transport journey">
      <header className={styles.hero}>
        <div className={styles.heroHeading}>
          <span className={styles.heroIcon} aria-hidden="true">
            {hubGraphic}
          </span>
          <div>
            <span className={styles.eyebrow}>
              {journey.phase === "arriving"
                ? "ARRIVAL SIMULATION"
                : "YOUR SIMULATED JOURNEY"}
              <span aria-hidden="true"> · </span>
              {persona.name}
            </span>
            <h3>{currentHub?.name || "Where will Lisbon take you?"}</h3>
          </div>
        </div>
        <p>
          {journey.phase === "arriving"
            ? "You have landed. Book a simulated Uber or airport taxi to your base, or explore other ways into Lisbon."
            : "Start at a transport hub, choose a route and board when you are ready."}
        </p>
        {journey.phase === "arriving" && (
          <ol className={styles.trail} aria-label="Arrival steps">
            <li data-state="done">
              <span>
                <Check size={12} aria-hidden="true" />
              </span>
              Arrive
            </li>
            <li data-state={booked ? "done" : "current"}>
              <span>
                {booked ? <Check size={12} aria-hidden="true" /> : "2"}
              </span>
              Book a ride
            </li>
            <li data-state={booked ? "current" : "next"}>
              <span>3</span>Travel into Lisbon
            </li>
          </ol>
        )}
        {currentHub && (
          <button
            type="button"
            className={styles.sceneButton}
            onClick={() => onEnterHub(currentHub.id)}
          >
            <span className={styles.graphic} aria-hidden="true">
              🗺️
            </span>
            Explore this{" "}
            {currentHub.kind === "airport"
              ? "arrivals hall"
              : currentHub.kind === "station"
                ? "station"
                : "bus stop"}{" "}
            in 3D
            <ArrowRight size={16} aria-hidden="true" />
          </button>
        )}
      </header>

      {currentHub && (
        <>
          <div className={styles.cardPrompt}>
            <span className={styles.cardIcon} aria-hidden="true">
              💳
            </span>
            <div className={styles.cardCopy}>
              <h4>
                {journey.card
                  ? "Your city card is ready"
                  : "One small card. More ways to go."}
              </h4>
              <p>
                {journey.card
                  ? "Your simulated travel card can be used for routes marked Card required."
                  : "Prepare a simulated travel card for metro, bus and train routes. Uber, taxi and walking options do not need one."}
              </p>
            </div>
            {journey.card ? (
              <span className={styles.ready}>
                <Check size={14} aria-hidden="true" />
                Ready
              </span>
            ) : (
              <button
                type="button"
                className={styles.cardButton}
                disabled={!!cardPreview.reason}
                aria-describedby={
                  cardPreview.reason ? `${id}-card-reason` : undefined
                }
                onClick={() => onCommand({ action: "get-card" })}
              >
                Get card <span>{fare(cardPreview.cost)}</span>
              </button>
            )}
            {!journey.card && cardPreview.reason && (
              <p id={`${id}-card-reason`} className={styles.reason}>
                {cardPreview.reason}
              </p>
            )}
          </div>

          {booked && (
            <section className={styles.booked} aria-label="Your ready ticket">
              <div className={styles.ticketTop}>
                <span
                  className={styles.graphic}
                  data-tone="pink"
                  aria-hidden="true"
                >
                  🎟️
                </span>
                <span>TICKET READY · SIMULATION</span>
              </div>
              <h4>{booked.name.replace(/ · simulation$/, "")}</h4>
              <p>
                {booked.departure
                  ? "Board to complete your simulated Lisbon chapter. This is an imagined departure, with no real flight reserved."
                  : booked.mode === "walk"
                    ? `Confirm this walk to continue into ${places[booked.toPlace].district}.`
                    : booked.mode === "taxi"
                      ? `Start this simulated ride to your base in ${trip.setup.base}. No real vehicle is requested.`
                      : `Board to begin this simulated journey to ${places[booked.toPlace].district}.`}
              </p>
              <div className={styles.boardRow}>
                <span>
                  {boardPreview.minutes} min <span aria-hidden="true">·</span>{" "}
                  Fare already accounted for
                </span>
                <button
                  type="button"
                  className={styles.primary}
                  disabled={!!boardPreview.reason}
                  aria-describedby={
                    boardPreview.reason ? `${id}-board-reason` : undefined
                  }
                  onClick={() => onCommand({ action: "board" })}
                >
                  {booked.mode === "walk"
                    ? "Continue on foot"
                    : booked.mode === "taxi"
                      ? "Start ride"
                      : booked.departure
                        ? "Board departure"
                        : `Board ${booked.mode}`}
                  <ArrowRight size={16} aria-hidden="true" />
                </button>
              </div>
              {boardPreview.reason && (
                <p id={`${id}-board-reason`} className={styles.reason}>
                  {boardPreview.reason}
                </p>
              )}
            </section>
          )}

          <section aria-labelledby={`${id}-routes`}>
            <div className={styles.sectionHeading}>
              <h4 id={`${id}-routes`}>
                {booked
                  ? "Other routes from here"
                  : journey.phase === "arriving"
                    ? "Choose your airport ride"
                    : "Choose your route"}
              </h4>
              <span>Book, then board</span>
            </div>
            <div className={styles.routes}>
              {routes.map((route) => {
                const preview = previewJourney(trip, {
                  action: "book",
                  routeId: route.id,
                });
                const isBooked = route.id === booked?.id;
                return (
                  <article
                    key={route.id}
                    className={styles.route}
                    data-booked={isBooked}
                  >
                    <div className={styles.routeTop}>
                      <span
                        className={styles.routeIcon}
                        data-mode={route.mode}
                        aria-hidden="true"
                      >
                        {modeGraphics[route.mode]}
                      </span>
                      <div>
                        <h5>{route.name.replace(/ · simulation$/, "")}</h5>
                        <span>
                          {route.departure
                            ? "Departure"
                            : route.toPlace === "home"
                              ? trip.setup.base
                              : places[route.toPlace].district}{" "}
                          <span aria-hidden="true">·</span> {route.minutes} min
                        </span>
                      </div>
                      <strong className={styles.fare}>
                        {fare(preview.cost)}
                      </strong>
                    </div>
                    <p>{route.description}</p>
                    <div className={styles.routeBottom}>
                      <span className={styles.requirement}>
                        <span
                          className={styles.graphic}
                          data-tone="peach"
                          aria-hidden="true"
                        >
                          {route.requiresCard ? "💳" : modeGraphics[route.mode]}
                        </span>
                        {route.requiresCard
                          ? "Card required"
                          : "No card needed"}
                      </span>
                      <button
                        type="button"
                        className={styles.routeButton}
                        disabled={isBooked || !!preview.reason}
                        aria-describedby={
                          preview.reason && !isBooked
                            ? `${id}-${route.id}-reason`
                            : undefined
                        }
                        onClick={() =>
                          onCommand({ action: "book", routeId: route.id })
                        }
                      >
                        {isBooked ? (
                          <>
                            <Check size={14} aria-hidden="true" />
                            Ticket ready
                          </>
                        ) : route.mode === "walk" ? (
                          "Choose walk"
                        ) : route.mode === "taxi" ? (
                          "Book ride"
                        ) : (
                          "Book ticket"
                        )}
                        {!isBooked && (
                          <ArrowRight size={14} aria-hidden="true" />
                        )}
                      </button>
                    </div>
                    {preview.reason && !isBooked && (
                      <p
                        id={`${id}-${route.id}-reason`}
                        className={styles.reason}
                      >
                        {preview.reason}
                      </p>
                    )}
                  </article>
                );
              })}
            </div>
          </section>
        </>
      )}

      {journey.phase === "city" && (
        <section aria-labelledby={`${id}-hubs`}>
          <div className={styles.sectionHeading}>
            <h4 id={`${id}-hubs`}>Start at another hub</h4>
            <span>Move there first</span>
          </div>
          <div className={styles.hubs}>
            {Object.values(JOURNEY_HUBS)
              .filter((hub) => hub.id !== journey.hub)
              .map((hub) => {
                const preview = previewJourney(trip, {
                  action: "visit-hub",
                  hub: hub.id,
                });
                return (
                  <div key={hub.id} className={styles.hub}>
                    <span
                      className={styles.routeIcon}
                      data-mode={hub.kind}
                      aria-hidden="true"
                    >
                      {hubGraphics[hub.kind]}
                    </span>
                    <div>
                      <h5>{hub.name}</h5>
                      <span>
                        {preview.minutes} min <span aria-hidden="true">·</span>{" "}
                        {fare(preview.cost)}
                      </span>
                    </div>
                    <button
                      type="button"
                      className={styles.hubButton}
                      disabled={!!preview.reason}
                      aria-label={`Go to ${hub.name}`}
                      aria-describedby={
                        preview.reason ? `${id}-${hub.id}-reason` : undefined
                      }
                      onClick={async () => {
                        if (
                          await onCommand({ action: "visit-hub", hub: hub.id })
                        )
                          onEnterHub(hub.id);
                      }}
                    >
                      Go <ArrowRight size={14} aria-hidden="true" />
                    </button>
                    {preview.reason && (
                      <p
                        id={`${id}-${hub.id}-reason`}
                        className={styles.reason}
                      >
                        {preview.reason}
                      </p>
                    )}
                  </div>
                );
              })}
          </div>
        </section>
      )}

      {selectedPerson && encounter && (
        <section className={styles.encounters} aria-labelledby={`${id}-people`}>
          <div className={styles.sectionHeading}>
            <h4 id={`${id}-people`}>A familiar face, a fresh perspective</h4>
            <span
              className={styles.graphic}
              data-tone="pink"
              aria-hidden="true"
            >
              💬
            </span>
          </div>
          <p className={styles.encounterIntro}>
            Meet an original local or fellow traveller while you are here.
          </p>
          <div
            className={styles.people}
            role="group"
            aria-label="Choose a character"
          >
            {people.map((person) => (
              <button
                key={person.id}
                type="button"
                className={styles.person}
                data-accent={person.id}
                aria-pressed={selectedPerson.id === person.id}
                aria-controls={`${id}-conversation`}
                onClick={() => setSelectedPersonId(person.id)}
              >
                <span className={styles.portraitFrame}>
                  <EncounterPortrait person={person} />
                </span>
                <span className={styles.personCopy}>
                  <strong>{person.name}</strong>
                  <span>
                    {person.role === "local" ? "Local" : "Fellow traveller"}
                  </span>
                </span>
                {journey.talked.includes(person.id) && (
                  <Check size={15} aria-label="Conversation recorded" />
                )}
              </button>
            ))}
          </div>
          <div
            id={`${id}-conversation`}
            className={styles.conversation}
            data-accent={selectedPerson.id}
          >
            <span className={styles.conversationSpeaker}>
              {selectedPerson.name} says
            </span>
            <blockquote>{selectedPerson.greeting}</blockquote>
            {chatted ? (
              <div className={styles.reply} role="status" aria-live="polite">
                <span>
                  A thought for your {persona.name.toLowerCase()} chapter
                </span>
                <p>
                  {selectedPerson.responses[trip.setup.persona || "tourist"]}
                </p>
              </div>
            ) : (
              <p className={styles.chatInvitation}>
                Make a little time to share plans and hear their perspective.
              </p>
            )}
            <div className={styles.chatRow}>
              <span>
                <Clock3 size={13} aria-hidden="true" />
                {encounter.minutes} simulated minutes
              </span>
              <button
                type="button"
                className={styles.chatButton}
                disabled={chatted || !!encounter.reason}
                aria-label={
                  chatted
                    ? `Conversation with ${selectedPerson.name} recorded`
                    : `Chat with ${selectedPerson.name} for ${encounter.minutes} simulated minutes`
                }
                aria-describedby={
                  encounter.reason && !chatted ? `${id}-chat-reason` : undefined
                }
                onClick={() =>
                  onCommand({ action: "talk", personId: selectedPerson.id })
                }
              >
                {chatted ? (
                  <Check size={14} aria-hidden="true" />
                ) : (
                  <span className={styles.graphic} aria-hidden="true">
                    💬
                  </span>
                )}
                {chatted
                  ? "Conversation recorded"
                  : `Chat · ${encounter.minutes} min`}
              </button>
            </div>
            {encounter.reason && !chatted && (
              <p id={`${id}-chat-reason`} className={styles.reason}>
                {encounter.reason}
              </p>
            )}
          </div>
          <p className={styles.encounterNote}>
            Fictional characters with one authored conversation each.
          </p>
        </section>
      )}

      <section className={styles.missions} aria-labelledby={`${id}-missions`}>
        <div className={styles.sectionHeading}>
          <h4 id={`${id}-missions`}>
            Your {persona.name.toLowerCase()} chapter
          </h4>
          <span className={styles.graphic} data-tone="mint" aria-hidden="true">
            🧭
          </span>
        </div>
        <p>{persona.description}</p>
        <ul>
          {persona.missions.map((mission) => (
            <li key={mission.title}>
              <span
                className={styles.graphic}
                data-tone="peach"
                aria-hidden="true"
              >
                📍
              </span>
              <div>
                <strong>{mission.title}</strong>
                <span>{mission.detail}</span>
              </div>
            </li>
          ))}
        </ul>
      </section>
      <p className={styles.note}>{JOURNEY_NOTE}</p>
    </section>
  );
}
