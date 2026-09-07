"use client";

import { FormEvent, useMemo, useState } from "react";

type Pricing = {
  daily_rate?: number | string;
  approximate_total?: number | string;
  fees_total?: number | string;
  taxes_total?: number | string;
  rental_subtotal?: number | string;
  currency?: string;
};

type V = {
  make_model?: string;
  vehicle_display_name?: string;
  vehicle_type?: string;
  vehicle_class?: string;
  vehicle_size?: string;
  vehicle_body_type?: string;
  vehicle_group?: string;
  sipp_code?: string;
  pricing?: Pricing;
};

type R = {
  error?: string;
  location?: { name?: string };
  vehicles?: V[];
  totalVehicles?: number;
  totalVehiclesFound?: number;
};

const addDays = (s: string, n: number) => {
  const d = new Date(`${s}T12:00:00`);
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
};

const fmt = (s: string) =>
  new Intl.DateTimeFormat("fr-CA", {
    year: "numeric",
    month: "short",
    day: "numeric",
  }).format(new Date(`${s}T12:00:00`));

const money = (v: unknown, c = "CAD") =>
  Number.isFinite(Number(v))
    ? new Intl.NumberFormat("fr-CA", {
        style: "currency",
        currency: c,
      }).format(Number(v))
    : "—";

export default function Home() {
  const today = new Date().toISOString().slice(0, 10);
  const [location, setLocation] = useState("Brossard, QC");
  const [startDate, setStartDate] = useState(today);
  const [startTime, setStartTime] = useState("10:00");
  const [days, setDays] = useState(5);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<R | null>(null);

  const endDate = useMemo(
    () => addDays(startDate, Math.max(1, days)),
    [startDate, days]
  );

  async function search(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    setResult(null);

    try {
      const q = new URLSearchParams({
        location,
        pickupDate: startDate,
        pickupTime: startTime,
        dropoffDate: endDate,
        dropoffTime: startTime,
        minAge: "30",
        countryCode: "CA",
      });

      const r = await fetch(`/api/hertz/search?${q}`);
      const d = await r.json();
      setResult(r.ok ? d : { error: d.error || "Search failed." });
    } catch (e) {
      setResult({ error: String(e) });
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="shell">
      <header className="topbar">
        <div>
          <div className="eyebrow">RENTAL PRICE TRACKER</div>
          <h1>Live rental pricing, ready to track.</h1>
        </div>
        <span className="status">HERTZ + PARSE · EV ONLY</span>
      </header>

      <section className="hero">
        <p>
          Recherche une disponibilité Hertz en véhicules 100 % électriques. La
          date de retour est calculée automatiquement à partir du nombre de
          jours.
        </p>
      </section>

      <section className="panel">
        <form onSubmit={search}>
          <div className="grid">
            <label>
              <span>Lieu</span>
              <input
                value={location}
                onChange={(e) => setLocation(e.target.value)}
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
              <input value="Hertz" readOnly />
            </label>

            <label>
              <span>Date de retour</span>
              <input value={`${fmt(endDate)} à ${startTime}`} readOnly />
            </label>
          </div>

          <div className="actions">
            <button disabled={loading}>
              {loading ? "Recherche en cours…" : "Rechercher les prix"}
            </button>
            <span>
              {fmt(startDate)} {startTime} → {fmt(endDate)} {startTime}
            </span>
          </div>
        </form>
      </section>

      {result?.error && (
        <section className="panel error">
          <strong>Erreur</strong>
          <span>{result.error}</span>
        </section>
      )}

      {result?.vehicles && (
        <section className="results">
          <div className="section-heading">
            <div>
              <div className="eyebrow">RÉSULTATS EN DIRECT · 100 % ÉLECTRIQUES</div>
              <h2>{result.location?.name || location}</h2>
              <p className="muted">
                {result.totalVehicles ?? result.vehicles.length} véhicule(s)
                électrique(s) disponible(s)
                {typeof result.totalVehiclesFound === "number"
                  ? ` · ${result.totalVehiclesFound} véhicule(s) trouvés au total`
                  : ""}
              </p>
            </div>
          </div>

          {result.vehicles.length === 0 ? (
            <div className="empty">
              <strong>Aucun véhicule 100 % électrique trouvé.</strong>
              <span>
                Essaie une autre date ou une autre agence Hertz.
              </span>
            </div>
          ) : (
            <div className="vehicle-grid">
              {result.vehicles.map((v, i) => {
                const pricing = v.pricing;
                const currency = pricing?.currency || "CAD";
                const name =
                  v.make_model || v.vehicle_display_name || v.vehicle_type || "Vehicle";

                return (
                  <article
                    className="vehicle"
                    key={`${v.sipp_code || v.vehicle_group || name}-${i}`}
                  >
                    <div className="vehicle-title">{name}</div>
                    <div className="vehicle-meta">
                      {v.vehicle_class || v.vehicle_size || "—"} · {v.vehicle_body_type || "—"}
                    </div>
                    <div className="vehicle-meta">
                      SIPP {v.sipp_code || "—"} · 100 % électrique
                    </div>
                    <div className="price-row">
                      <strong>
                        {money(pricing?.approximate_total, currency)}
                      </strong>
                      <span>
                        {money(pricing?.daily_rate, currency)} / jour
                      </span>
                    </div>
                    <div className="details">
                      <span>
                        Sous-total : {money(pricing?.rental_subtotal, currency)}
                      </span>
                      <span>
                        Frais : {money(pricing?.fees_total, currency)}
                      </span>
                      <span>
                        Taxes : {money(pricing?.taxes_total, currency)}
                      </span>
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </section>
      )}

      <section className="history">
        <div className="section-heading">
          <div>
            <div className="eyebrow">NEXT</div>
            <h2>Suivi des prix</h2>
          </div>
        </div>
        <div className="empty">
          <strong>Recherche live + filtre EV opérationnels.</strong>
          <span>
            Prochaine étape : enregistrer chaque recherche, suivre les baisses
            de prix et déclencher des alertes automatiquement.
          </span>
        </div>
      </section>
    </main>
  );
}
