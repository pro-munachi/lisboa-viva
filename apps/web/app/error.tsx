"use client";
export default function ErrorPage({ reset }: { reset: () => void }) {
  return (
    <main className="error-page">
      <h1>A little pause.</h1>
      <p>
        ROAM couldn’t load this view. Your saved trip stays on this browser.
      </p>
      <button className="primary" onClick={reset}>
        Try again
      </button>
    </main>
  );
}
