"use client";
export default function ErrorPage({ reset }: { reset: () => void }) {
  return (
    <main className="loading">
      <h1>Precisamos de um instante.</h1>
      <p>
        Não foi possível abrir a cidade. O teu progresso está guardado no
        servidor.
      </p>
      <button className="primary" onClick={reset}>
        Tentar novamente
      </button>
    </main>
  );
}
