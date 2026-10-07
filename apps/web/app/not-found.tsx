import Link from "next/link";
export default function NotFound() {
  return (
    <main className="error-page">
      <h1>A little off the map.</h1>
      <p>Let’s get you back to Lisbon.</p>
      <Link className="primary" href="/">
        Back to ROAM
      </Link>
    </main>
  );
}
