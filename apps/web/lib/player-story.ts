import type { Trip } from "./engine";

export type StoryAction =
  | "setup"
  | "journey"
  | "experiences"
  | "travel"
  | "finish"
  | "recap";

export type StoryStep = {
  title: string;
  detail: string;
  complete: boolean;
};

export type PlayerStory = {
  steps: StoryStep[];
  activeIndex: number;
  title: string;
  detail: string;
  action: StoryAction;
  actionLabel: string;
};

export function playerStory(
  trip: Trip | null,
  userType: "tourist" | "local",
  hasExperiences: boolean,
): PlayerStory {
  const settled = Boolean(
    trip &&
      (trip.complete ||
        (trip.journey.phase === "city" &&
          !trip.journey.hub &&
          !trip.journey.ticket)),
  );
  const choices =
    trip?.history.filter((entry) => entry.command.kind === "choice") || [];
  const firstPlace = choices[0]?.place;
  const exploredElsewhere = Boolean(
    firstPlace && choices.some((entry) => entry.place !== firstPlace),
  );
  const steps: StoryStep[] = [
    {
      title: userType === "tourist" ? "Arrive in Lisbon" : "Start at home",
      detail:
        userType === "tourist"
          ? "Choose a simulated ride and reach your home base."
          : "Begin your day in your Lisbon neighbourhood.",
      complete: settled,
    },
    {
      title: "Make a first memory",
      detail: "Try an experience and confirm a choice.",
      complete: choices.length > 0,
    },
    {
      title: "Discover another area",
      detail: "Travel somewhere new and make a memory there.",
      complete: exploredElsewhere,
    },
    {
      title: "Keep your story",
      detail: "Finish the chapter and see your recap.",
      complete: Boolean(trip?.complete),
    },
  ];

  if (!trip)
    return {
      steps,
      activeIndex: 0,
      title: "Plan your Lisbon chapter",
      detail: "Choose a home base and the kind of city day you want to try.",
      action: "setup",
      actionLabel: "Plan your chapter",
    };
  if (trip.complete)
    return {
      steps,
      activeIndex: 3,
      title: "Your Lisbon story is ready",
      detail: "Look back on the places and choices in this chapter.",
      action: "recap",
      actionLabel: "Open recap",
    };
  if (!settled)
    return {
      steps,
      activeIndex: 0,
      title: userType === "tourist" ? "Find your way into Lisbon" : "Get home",
      detail: trip.journey.ticket
        ? "Your simulated ticket is ready. Board to continue."
        : "Choose your route and reach your home base.",
      action: "journey",
      actionLabel: "Continue arrival",
    };
  if (choices.length === 0)
    return {
      steps,
      activeIndex: 1,
      title: "Make a first memory",
      detail: hasExperiences
        ? "Choose an experience near you and see what happens."
        : "Find a place with an experience that interests you.",
      action: hasExperiences ? "experiences" : "travel",
      actionLabel: hasExperiences ? "See things to do" : "Explore places",
    };
  if (!exploredElsewhere)
    return {
      steps,
      activeIndex: 2,
      title: "Discover another area",
      detail:
        trip.place !== firstPlace && hasExperiences
          ? "You have arrived somewhere new. Make a memory here."
          : "Pick another area; transport is charged when it is too far to walk.",
      action:
        trip.place !== firstPlace && hasExperiences ? "experiences" : "travel",
      actionLabel:
        trip.place !== firstPlace && hasExperiences
          ? "See things to do"
          : "Plan a journey",
    };
  return {
    steps,
    activeIndex: 3,
    title: "Keep your Lisbon story",
    detail: "You can continue exploring or finish this chapter for your recap.",
    action: "finish",
    actionLabel: "Finish chapter",
  };
}
