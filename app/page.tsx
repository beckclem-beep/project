"use client";

import { useMemo, useState } from "react";

function addDays(date: string, days: number) {
  const d = new Date(date + "T12:00:00");
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

export default function Home() {
  const today = new Date().toISOString().slice(0, 10);
  const [location, setLocation] = useState("Brossard");
  const [startDate, setStartDate] = useState(today);
  const [startTime, setStartTime] = useState("08:00");
  const [days, setDays] = useState("1");

  const endDate = useMemo(() => addDays(startDate, Math.max(1, Number(days) || 1)), [startDate, days]);

  return (
    <main className="shell">
      <section className="card">
        <div className="eyebrow">RENTAL PRICE TRACKER · BASIC · EV</div>
        <h1>Hertz EV Rental</h1>
        <p className="intro">
          Version de base, sans tracking ni historique. Choisissez votre agence,
          la date, l’heure et la durée.
        </p>
        <div className="form">
          <label><span>Agence / ville</span><input value={location} onChange={e=>setLocation(e.target.value)} placeholder="Brossard"/></label>
          <label><span>Date de début</span><input type="date" value={startDate} onChange={e=>setStartDate(e.target.value)}/></label>
          <label><span>Heure de départ</span><input type="time" value={startTime} onChange={e=>setStartTime(e.target.value)}/></label>
          <label><span>Nombre de jours</span><input type="number" min="1" max="30" value={days} onChange={e=>setDays(e.target.value)}/></label>
          <div className="summary">
            <div><span>Retour prévu</span><strong>{endDate} à {startTime}</strong></div>
            <button type="button" disabled={!location.trim()}>Rechercher les EV</button>
          </div>
        </div>
      </section>
    </main>
  );
}
