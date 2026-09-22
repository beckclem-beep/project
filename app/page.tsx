"use client";

import { useMemo, useState } from "react";

type Vehicle = {
  make_model?: string;
  vehicle_display_name?: string;
  sipp_code?: string;
  pricing?: {
    daily_rate?: number | string;
    approximate_total?: number | string;
    rental_subtotal?: number | string;
    fees_total?: number | string;
    taxes_total?: number | string;
    currency?: string;
  };
};

type SearchResponse = {
  error?: string;
  oagCode?: string;
  location?: {
    name?: string;
    city?: string;
    address?: string;
    oag_code?: string;
  };
  totalVehicles?: number;
  vehicles?: Vehicle[];
};

function localDate() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function addDays(date: string, days: number) {
  const d = new Date(date + "T12:00:00");
  d.setDate(d.getDate() + days);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

const money = (value: number, currency = "CAD") =>
  new Intl.NumberFormat("fr-CA", {
    style: "currency",
    currency,
    maximumFractionDigits: 2,
  }).format(value);

export default function Home() {
  const [location, setLocation] = useState("Brossard");
  const [startDate, setStartDate] = useState(localDate);
  const [startTime, setStartTime] = useState("08:00");
  const [days, setDays] = useState("1");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<SearchResponse | null>(null);

  const rentalDays = Math.min(30, Math.max(1, Number(days) || 1));

  const endDate = useMemo(
    () => addDays(startDate, rentalDays),
    [startDate, rentalDays]
  );

  const vehicles = (result?.vehicles || [])
    .map((vehicle) => ({
      ...vehicle,
      total: Number(vehicle.pricing?.approximate_total),
      name:
        vehicle.make_model ||
        vehicle.vehicle_display_name ||
        "Véhicule électrique",
      currency: vehicle.pricing?.currency || "CAD",
    }))
    .filter((vehicle) => Number.isFinite(vehicle.total))
    .sort((a, b) => a.total - b.total);

  async function searchEVs() {
    setLoading(true);
    setError(null);
    setResult(null);

    try {
      const query = new URLSearchParams({
        location: location.trim(),
        pickupDate: startDate,
        pickupTime: startTime,
        dropoffDate: endDate,
        dropoffTime: startTime,
        minAge: "30",
        countryCode: "CA",
      });

      const response = await fetch(
        `/api/hertz/search?${query.toString()}`,
        { cache: "no-store" }
      );

      const data: SearchResponse = await response.json();

      if (!response.ok) {
        throw new Error(data.error || `Erreur HTTP ${response.status}`);
      }

      setResult(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Une erreur est survenue.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="shell">
      <section className="card">
        <div className="eyebrow">RENTAL PRICE TRACKER · BASIC · EV</div>
        <h1>Hertz EV Rental</h1>
        <p className="intro">
          Recherchez en direct les véhicules électriques disponibles chez Hertz.
          Aucun tracking ni historique dans cette version.
        </p>

        <div className="form">
          <label>
            <span>Agence / ville</span>
            <input
              value={location}
              onChange={(e) => setLocation(e.target.value)}
              placeholder="Brossard"
            />
          </label>

          <label>
            <span>Date de début</span>
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
            />
          </label>

          <label>
            <span>Heure de départ</span>
            <input
              type="time"
              value={startTime}
              onChange={(e) => setStartTime(e.target.value)}
            />
          </label>

          <label>
            <span>Nombre de jours</span>
            <input
              type="number"
              min="1"
              max="30"
              value={days}
              onChange={(e) => setDays(e.target.value)}
            />
          </label>

          <div className="summary">
            <div>
              <span>Retour prévu</span>
              <strong>{endDate} à {startTime}</strong>
            </div>
            <button
              type="button"
              onClick={searchEVs}
              disabled={!location.trim() || loading}
            >
              {loading ? "Recherche en cours…" : "Rechercher les EV"}
            </button>
          </div>
        </div>

        {error && <div className="error">{error}</div>}

        {result && (
          <section className="results">
            <div className="results-head">
              <div>
                <span className="results-label">RÉSULTAT</span>
                <h2>
                  {result.location?.name || result.location?.city || location}
                </h2>
                <p>
                  {startDate} {startTime} → {endDate} {startTime}
                </p>
              </div>
              <div className="count">
                {vehicles.length} EV disponible{vehicles.length > 1 ? "s" : ""}
              </div>
            </div>

            {vehicles.length === 0 ? (
              <div className="empty">Aucun véhicule électrique trouvé pour ces dates.</div>
            ) : (
              <div className="vehicle-list">
                {vehicles.map((vehicle, index) => (
                  <article className={`vehicle ${index === 0 ? "vehicle-best" : ""}`} key={`${vehicle.name}-${index}`}>
                    <div>
                      {index === 0 && <div className="best-badge">PRIX LE PLUS BAS</div>}
                      <h3>{vehicle.name}</h3>
                      <p>{vehicle.sipp_code || "EV"} · 100 % électrique</p>
                    </div>
                    <div className="vehicle-price">
                      {money(vehicle.total, vehicle.currency)}
                      <small>total estimé</small>
                    </div>
                  </article>
                ))}
              </div>
            )}
          </section>
        )}
      </section>
    </main>
  );
}
