const activities = [
  { icon: "☕", label: "Coffee", colour: "peach" },
  { icon: "🎧", label: "Music", colour: "lilac" },
  { icon: "🏖️", label: "Beach days", colour: "blue" },
  { icon: "🥾", label: "City walks", colour: "mint" },
  { icon: "💻", label: "Work & wander", colour: "yellow" },
  { icon: "🎨", label: "Culture", colour: "pink" },
];

/** Decorative activity artwork, never a roster of live players or events. */
export default function ActivityGraphic() {
  return (
    <div className="activity-graphic" aria-hidden="true">
      <div className="activity-graphic-centre">
        <span>✳</span>
        <small>go find your people</small>
      </div>
      {activities.map((activity, index) => (
        <div
          key={activity.label}
          className={`activity-orb orb-${index} ${activity.colour}`}
        >
          <span className="activity-orb-emoji">{activity.icon}</span>
          <small>{activity.label}</small>
          <span className="orb-spark">✦</span>
        </div>
      ))}
    </div>
  );
}
