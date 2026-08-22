"use client";

import { FormEvent, useMemo, useState } from "react";

function addDays(dateString: string, days: number) {
  const date = new Date(`${dateString}T12:00:00`);
  date.setDate(date.getDate() + days);
  return date.toISOString().slice(0, 10);
}

function formatDate(value: string) {
  if (!value) return "—";
  return new Intl.DateTimeFormat("fr-CA", {
    year: "numeric",
    month: "short",
    day: "numeric",
  }).format(new Date(`${value}T12:00:00`));
}

export default function Home() {
  const today = new Date().toISOString().slice(0, 10);

  const [location, setLocation] = useState("Brossard, QC");
  const [startDate, setStartDate] = useState(today);
  const [startTime, setStartTime] = useState("10:00");
  const [days, setDays] = useState(5);
  const [provider, setProvider] = useState("Hertz");
  const [searched, setSearched] = useState(false);

  const endDate = useMemo(() => addDays(startDate, days), [startDate, days]);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSearched(true);
  }

  return (
    <main className="shell">
      <header className="topbar">
        <div>
          <div className="eyebrow">RENTAL PRICE TRACKER</div>
          <h1>Compare rental prices without losing track.</h1>
        </div>
        <span className="status">MVP</span>
      </header>

      <section className="hero">
        <p>
          Prépare ta recherche, calcule automatiquement la date de retour et
          garde une base prête pour le suivi des prix.
        </p>
      </section>

      <section className="panel">
        <form onSubmit={handleSubmit}>
          <div className="grid">
            <label>
              <span>Lieu</span>
              <input
                value={location}
                onChange={(e) => setLocation(e.target.value)}
                placeholder="Brossard, QC"
                required
              />
            </label>

            <label>
              <span>Date de début</span>
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                required
              />
            </label>

            <label>
              <span>Heure de début</span>
              <input
                type="time"
                value={startTime}
                onChange={(e) => setStartTime(e.target.value)}
                required
              />
            </label>

            <label>
              <span>Nombre de jours</span>
              <input
                type="number"
                min={1}
                max={60}
                value={days}
                onChange={(e) => setDays(Number(e.target.value))}
                required
              />
            </label>

            <label>
              <span>Loueur</span>
              <select
                value={provider}
                onChange={(e) => setProvider(e.target.value)}
              >
                <option>Hertz</option>
                <option>Enterprise</option>
                <option>Avis</option>
                <option>Budget</option>
              </select>
            </label>

            <label>
              <span>Date de retour calculée</span>
              <input value={formatDate(endDate)} readOnly />
            </label>
          </div>

          <div className="actions">
            <button type="submit">Préparer la recherche</button>
            <span>
              {formatDate(startDate)} à {startTime} → {formatDate(endDate)} à{" "}
              {startTime}
            </span>
          </div>
        </form>
      </section>

      {searched && (
        <section className="result panel">
          <div>
            <div className="eyebrow">RECHERCHE PRÉPARÉE</div>
            <h2>
              {provider} · {location}
            </h2>
            <p className="muted">
              {formatDate(startDate)} {startTime} → {formatDate(endDate)}{" "}
              {startTime} · {days} jour{days > 1 ? "s" : ""}
            </p>
          </div>
          <div className="next">
            <span>Étape suivante</span>
            <strong>Connecter la source de prix</strong>
          </div>
        </section>
      )}

      <section className="history">
        <div className="section-heading">
          <div>
            <div className="eyebrow">PRICE HISTORY</div>
            <h2>Historique des recherches</h2>
          </div>
          <span className="count">0 suivi</span>
        </div>

        <div className="empty">
          <strong>Aucun prix suivi pour le moment.</strong>
          <span>
            La structure est prête pour enregistrer le prix actuel, le prix
            précédent, la variation et la date de relevé.
          </span>
        </div>
      </section>
    </main>
  );
}