import { ArrowRight, Check, Users } from "lucide-react";
import type { PlayerStory } from "../lib/player-story";

export default function StoryGuide({
  story,
  onContinue,
  onNearby,
}: {
  story: PlayerStory;
  onContinue: () => void;
  onNearby: () => void;
}) {
  return (
    <div className="story-guide">
      <p className="lede">
        Your first Lisbon chapter has a path. Follow it at your own pace; the
        city is still yours to explore.
      </p>
      <ol className="story-steps">
        {story.steps.map((step, index) => (
          <li
            key={step.title}
            className={index === story.activeIndex ? "current" : undefined}
          >
            <span className="story-step-number" aria-hidden="true">
              {step.complete ? <Check size={16} /> : index + 1}
            </span>
            <div>
              <strong>{step.title}</strong>
              <p>{step.detail}</p>
            </div>
            <span className="story-step-status">
              {step.complete
                ? "Done"
                : index === story.activeIndex
                  ? "Next"
                  : "Later"}
            </span>
          </li>
        ))}
      </ol>
      <div className="story-next">
        <span className="eyebrow">YOUR NEXT STEP</span>
        <h3>{story.title}</h3>
        <p>{story.detail}</p>
        <button className="primary full" type="button" onClick={onContinue}>
          {story.actionLabel} <ArrowRight size={17} />
        </button>
      </div>
      <div className="story-social">
        <div>
          <strong>Want company?</strong>
          <p>
            Meeting real players is optional. You can keep playing when nobody
            is nearby.
          </p>
        </div>
        <button type="button" onClick={onNearby}>
          <Users size={16} /> Find nearby players
        </button>
      </div>
      <p className="story-note">
        Trips and memories are simulated. Chapter progress is saved in this
        browser for your account.
      </p>
    </div>
  );
}
