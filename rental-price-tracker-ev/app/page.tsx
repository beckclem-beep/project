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
  location?: { name?: string; city?: string; oag_code?: string };
  vehicles?: V[];
  totalVehicles?: number;
  totalVehiclesFound?: number;
};

type CalendarDay = {
  date: string;
  available?: boolean;
  loading?: boolean;
  total?: number | null;
  daily?: number | null;
  currency?: string;
  vehicleName?: string | null;
  evCount?: number;
  error?: string;
};

type CalendarResult = {
  month: string;
  days: CalendarDay[];
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
        maximumFractionDigits: 0,
      }).format(Number(v))
    : "—";

const monthLabel = (month: string) =>
  new Intl.DateTimeFormat("fr-CA", { month: "long", year: "numeric" })
    .format(new Date(`${month}-01T12:00:00`))
    .replace(/^./, (c) => c.toUpperCase());

const shiftMonth = (month: string, delta: number) => {
  const d = new Date(`${month}-01T12:00:00`);
  d.setMonth(d.getMonth() + delta);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
};

const monthDates = (month: string) => {
  const [year, monthNumber] = month.split("-").map(Number);
  const last = new Date(year, monthNumber, 0).getDate();
  return Array.from({ length: last }, (_, i) => {
    const d = new Date(year, monthNumber - 1, i + 1, 12);
    return `${year}-${String(monthNumber).padStart(2, "0")}-${String(
      d.getDate()
    ).padStart(2, "0")}`;
  });
};

const dayNumber = (date: string) => Number(date.slice(-2));
const weekday = (date: string) => (new Date(`${date}T12:00:00`).getDay() + 6) % 7;

function priceClass(day: CalendarDay, min: number | null, max: number | null) {
  if (day.loading) return "price-none";
  if (!day.available || day.total == null || min == null || max == null) return "price-none";
  if (max === min) return "price-best";
  const ratio = (day.total - min) / (max - min);
  if (ratio <= 0.2) return "price-best";
  if (ratio <= 0.45) return "price-good";
  if (ratio <= 0.7) return "price-mid";
  return "price-high";
}

function buildInitialDays(month: string) {
  const today = new Date().toISOString().slice(0, 10);
  return monthDates(month).map((date) => ({
    date,
    available: false,
    loading: date >= today,
    total: null,
    daily: null,
    currency: "CAD",
    vehicleName: null,
    evCount: 0,
    error: date < today ? "Date passée" : undefined,
  }));
}

export default function Home() {
  const today = new Date().toISOString().slice(0, 10);
  const [location, setLocation] = useState("Brossard, QC");
  const [startDate, setStartDate] = useState(today);
  const [startTime, setStartTime] = useState("08:00");
  const [days, setDays] = useState(5);
  const [loading, setLoading] = useState(false);
  const [calendarLoading, setCalendarLoading] = useState(false);
  const [result, setResult] = useState<R | null>(null);
  const [calendar, setCalendar] = useState<CalendarResult | null>(null);
  const [calendarMonth, setCalendarMonth] = useState(today.slice(0, 7));

  const endDate = useMemo(() => addDays(startDate, Math.max(1, days)), [startDate, days]);

  async function loadCalendar(month: string, oagCodeOverride?: string) {
    const oagCode = oagCodeOverride || result?.location?.oag_code;
    if (!oagCode) return;

    const initialDays = buildInitialDays(month);
    setCalendar({ month, days: initialDays });
    setCalendarLoading(true);

    const dates = initialDays.filter((d) => d.loading).map((d) => d.date);
    const batchSize = 3;

    try {
      for (let i = 0; i < dates.length; i += batchSize) {
        const batch = dates.slice(i, i + batchSize);
        const responses = await Promise.all(
          batch.map(async (date) => {
            try {
              const q = new URLSearchParams({
                date,
                oagCode,
                pickupTime: "08:00",
                minAge: "30",
                countryCode: "CA",
              });
              const response = await fetch(`/api/hertz/calendar-day?${q}`, {
                cache: "no-store",
              });
              const data = await response.json();
              if (!response.ok) throw new Error(data?.error || `Erreur ${response.status}`);
              return data as CalendarDay;
            } catch (error) {
              return {
                date,
                available: false,
                loading: false,
                total: null,
                daily: null,
                currency: "CAD",
                vehicleName: null,
                evCount: 0,
                error: String(error),
              } as CalendarDay;
            }
          })
        );

        setCalendar((current) => {
          if (!current || current.month !== month) return current;
          const byDate = new Map(responses.map((day) => [day.date, day]));
          return {
            month,
            days: current.days.map((day) => byDate.get(day.date) || day),
          };
        });
      }
    } finally {
      setCalendarLoading(false);
    }
  }

  async function search(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    setResult(null);
    setCalendar(null);
    const month = startDate.slice(0, 7);
    setCalendarMonth(month);

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
      const r = await fetch(`/api/hertz/search?${q}`, { cache: "no-store" });
      const d = await r.json();
      setResult(r.ok ? d : { error: d.error || "Search failed." });
      if (r.ok && d?.location?.oag_code) await loadCalendar(month, d.location.oag_code);
    } catch (e) {
      setResult({ error: String(e) });
    } finally {
      setLoading(false);
    }
  }

  async function changeMonth(delta: number) {
    if (!result?.location?.oag_code) return;
    const next = shiftMonth(calendarMonth, delta);
    setCalendarMonth(next);
    await loadCalendar(next, result.location.oag_code);
  }

  const availableDays = calendar?.days.filter((d) => d.available && typeof d.total === "number") || [];
  const minTotal = availableDays.length ? Math.min(...availableDays.map((d) => d.total as number)) : null;
  const maxTotal = availableDays.length ? Math.max(...availableDays.map((d) => d.total as number)) : null;

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
          Recherche une disponibilité Hertz en véhicules 100 % électriques. Le
          calendrier affiche le <strong>meilleur prix pour 1 jour, départ à 08:00</strong> pour chaque date.
        </p>
      </section>

      <section className="panel">
        <form onSubmit={search}>
          <div className="grid">
            <label><span>Lieu</span><input value={location} onChange={(e) => setLocation(e.target.value)} required /></label>
            <label><span>Date de début</span><input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} required /></label>
            <label><span>Heure de début</span><input type="time" value={startTime} onChange={(e) => setStartTime(e.target.value)} required /></label>
            <label><span>Nombre de jours</span><input type="number" min={1} max={60} value={days} onChange={(e) => setDays(Number(e.target.value))} required /></label>
            <label><span>Loueur</span><input value="Hertz" readOnly /></label>
            <label><span>Date de retour</span><input value={`${fmt(endDate)} à ${startTime}`} readOnly /></label>
          </div>
          <div className="actions">
            <button disabled={loading || calendarLoading}>{loading ? "Recherche en cours…" : "Rechercher les prix"}</button>
            <span>{fmt(startDate)} {startTime} → {fmt(endDate)} {startTime}</span>
          </div>
        </form>
      </section>

      {result?.error && <section className="panel error"><strong>Erreur</strong><span>{result.error}</span></section>}

      {result?.vehicles && (
        <section className="results">
          <div className="section-heading"><div><div className="eyebrow">RÉSULTATS EN DIRECT · 100 % ÉLECTRIQUES</div><h2>{result.location?.name || location}</h2><p className="muted">{result.totalVehicles ?? result.vehicles.length} véhicule(s) électrique(s) disponible(s)</p></div></div>
          {result.vehicles.length === 0 ? (
            <div className="empty"><strong>Aucun véhicule 100 % électrique trouvé.</strong><span>Essaie une autre date ou une autre agence Hertz.</span></div>
          ) : (
            <div className="vehicle-grid">
              {result.vehicles.map((v, i) => {
                const pricing = v.pricing;
                const currency = pricing?.currency || "CAD";
                const name = v.make_model || v.vehicle_display_name || v.vehicle_type || "Vehicle";
                const daily = Number(pricing?.daily_rate) > 0 ? pricing?.daily_rate : (Number(pricing?.rental_subtotal) > 0 ? Number(pricing?.rental_subtotal) / Math.max(1, days) : null);
                return <article className="vehicle" key={`${v.sipp_code || v.vehicle_group || name}-${i}`}>
                  <div className="vehicle-title">{name}</div>
                  <div className="vehicle-meta">{v.vehicle_class || v.vehicle_size || "—"} · {v.vehicle_body_type || "—"}</div>
                  <div className="vehicle-meta">SIPP {v.sipp_code || "—"} · 100 % électrique</div>
                  <div className="price-row"><strong>{money(pricing?.approximate_total, currency)}</strong><span>{money(daily, currency)} / jour</span></div>
                  <div className="details"><span>Sous-total : {money(pricing?.rental_subtotal, currency)}</span><span>Frais : {money(pricing?.fees_total, currency)}</span><span>Taxes : {money(pricing?.taxes_total, currency)}</span></div>
                </article>;
              })}
            </div>
          )}
        </section>
      )}

      {calendar && (
        <section className="calendar-section">
          <div className="calendar-head">
            <div><div className="eyebrow">CALENDRIER DES PRIX · 1 JOUR · DÉPART 08:00</div><h2>{monthLabel(calendarMonth)}</h2><p className="muted">Prix total estimé minimum parmi les véhicules 100 % électriques disponibles.</p></div>
            <div className="calendar-nav"><button type="button" onClick={() => changeMonth(-1)} disabled={calendarLoading}>←</button><button type="button" onClick={() => changeMonth(1)} disabled={calendarLoading}>→</button></div>
          </div>

          <div className="legend"><span><i className="legend-dot best" /> Meilleur prix</span><span><i className="legend-dot good" /> Bon prix</span><span><i className="legend-dot mid" /> Moyen</span><span><i className="legend-dot high" /> Plus cher</span><span><i className="legend-dot none" /> En attente / aucun EV</span></div>

          <div className="calendar">
            {(["Lun", "Mar", "Mer", "Jeu", "Ven", "Sam", "Dim"] as const).map((d) => <div className="weekday" key={d}>{d}</div>)}
            {Array.from({ length: weekday(calendar.days[0].date) }).map((_, i) => <div className="calendar-blank" key={`blank-${i}`} />)}
            {calendar.days.map((day) => (
              <button type="button" key={day.date} className={`calendar-day ${priceClass(day, minTotal, maxTotal)}`} onClick={() => setStartDate(day.date)} disabled={day.loading} title={day.available ? `${fmt(day.date)} · ${day.vehicleName || "EV"}` : `${fmt(day.date)} · ${day.error || "Aucun EV"}`}>
                <span className="day-number">{dayNumber(day.date)}</span>
                <strong>{day.loading ? "…" : day.available ? money(day.total, day.currency || "CAD") : "—"}</strong>
                <small>{day.loading ? "Chargement" : day.available ? day.vehicleName : day.error === "Date passée" ? "Passé" : "Aucun EV"}</small>
              </button>
            ))}
          </div>
          <p className="muted calendar-footnote">{calendarLoading ? "Les prix arrivent progressivement…" : `${availableDays.length} jour(s) avec au moins un véhicule électrique.`}</p>
        </section>
      )}

      <section className="history"><div className="section-heading"><div><div className="eyebrow">NEXT</div><h2>Suivi des prix</h2></div></div><div className="empty"><strong>Le calendrier permet maintenant de repérer les meilleurs jours.</strong><span>Prochaine étape : enregistrer automatiquement ces prix chaque jour pour voir les baisses et recevoir une alerte.</span></div></section>
    </main>
  );
}
