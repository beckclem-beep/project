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

type Vehicle = {
  make_model?: string;
  vehicle_display_name?: string;
  vehicle_type?: string;
  vehicle_class?: string;
  vehicle_size?: string;
  vehicle_body_type?: string;
  sipp_code?: string;
  pricing?: Pricing;
};

type SearchResult = {
  error?: string;
  location?: { name?: string; city?: string; oag_code?: string };
  vehicles?: Vehicle[];
  totalVehicles?: number;
};

type CalendarDay = {
  date: string;
  loading: boolean;
  available: boolean;
  total: number | null;
  daily: number | null;
  currency: string;
  vehicleName: string | null;
  evCount: number;
  error?: string;
};

const formatDate = (date: string) =>
  new Intl.DateTimeFormat("fr-CA", {
    year: "numeric",
    month: "short",
    day: "numeric",
  }).format(new Date(`${date}T12:00:00`));

const formatMoney = (value: unknown, currency = "CAD") => {
  const number = Number(value);
  if (!Number.isFinite(number)) return "—";
  return new Intl.NumberFormat("fr-CA", {
    style: "currency",
    currency,
    maximumFractionDigits: 0,
  }).format(number);
};

const addDays = (date: string, amount: number) => {
  const d = new Date(`${date}T12:00:00`);
  d.setDate(d.getDate() + amount);
  return d.toISOString().slice(0, 10);
};

const monthLabel = (month: string) =>
  new Intl.DateTimeFormat("fr-CA", {
    month: "long",
    year: "numeric",
  })
    .format(new Date(`${month}-01T12:00:00`))
    .replace(/^./, (c) => c.toUpperCase());

const monthShift = (month: string, amount: number) => {
  const d = new Date(`${month}-01T12:00:00`);
  d.setMonth(d.getMonth() + amount);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
};

const getMonthDates = (month: string) => {
  const [year, monthNumber] = month.split("-").map(Number);
  const daysInMonth = new Date(year, monthNumber, 0).getDate();
  return Array.from({ length: daysInMonth }, (_, index) => {
    const day = index + 1;
    return `${year}-${String(monthNumber).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  });
};

const weekdayMondayFirst = (date: string) =>
  (new Date(`${date}T12:00:00`).getDay() + 6) % 7;

const todayString = () => new Date().toISOString().slice(0, 10);

function initialCalendar(month: string): CalendarDay[] {
  const today = todayString();
  return getMonthDates(month).map((date) => ({
    date,
    loading: date >= today,
    available: false,
    total: null,
    daily: null,
    currency: "CAD",
    vehicleName: null,
    evCount: 0,
    error: date < today ? "Date passée" : undefined,
  }));
}

function colorClass(day: CalendarDay, min: number | null, max: number | null) {
  if (day.loading || !day.available || day.total == null) return "price-none";
  if (min == null || max == null || max === min) return "price-best";

  const ratio = (day.total - min) / (max - min);
  if (ratio <= 0.2) return "price-best";
  if (ratio <= 0.45) return "price-good";
  if (ratio <= 0.7) return "price-mid";
  return "price-high";
}

export default function Home() {
  const today = todayString();
  const [location, setLocation] = useState("Brossard, QC");
  const [startDate, setStartDate] = useState(today);
  const [startTime, setStartTime] = useState("08:00");
  const [days, setDays] = useState(5);
  const [loading, setLoading] = useState(false);
  const [calendarLoading, setCalendarLoading] = useState(false);
  const [result, setResult] = useState<SearchResult | null>(null);
  const [calendar, setCalendar] = useState<CalendarDay[] | null>(null);
  const [calendarMonth, setCalendarMonth] = useState(today.slice(0, 7));

  const endDate = useMemo(
    () => addDays(startDate, Math.max(1, days)),
    [startDate, days]
  );

  async function fetchCalendarDay(
    date: string,
    oagCode: string
  ): Promise<CalendarDay> {
    try {
      const query = new URLSearchParams({
        oagCode,
        pickupDate: date,
        pickupTime: "08:00",
        dropoffDate: addDays(date, 1),
        dropoffTime: "08:00",
        minAge: "30",
        countryCode: "CA",
      });

      const response = await fetch(`/api/hertz/search?${query}`, {
        cache: "no-store",
      });
      const data = (await response.json()) as SearchResult;

      if (!response.ok) {
        throw new Error(data.error || `Erreur ${response.status}`);
      }

      const vehicles = data.vehicles || [];
      let best: { total: number; daily: number | null; name: string; currency: string } | null = null;

      for (const vehicle of vehicles) {
        const total = Number(vehicle.pricing?.approximate_total);
        if (!Number.isFinite(total)) continue;
        const dailyValue = Number(vehicle.pricing?.daily_rate);
        const daily = Number.isFinite(dailyValue) ? dailyValue : total;
        const name =
          vehicle.make_model ||
          vehicle.vehicle_display_name ||
          vehicle.vehicle_type ||
          "Véhicule électrique";
        const currency = vehicle.pricing?.currency || "CAD";

        if (!best || total < best.total) {
          best = { total, daily, name, currency };
        }
      }

      return {
        date,
        loading: false,
        available: Boolean(best),
        total: best?.total ?? null,
        daily: best?.daily ?? null,
        currency: best?.currency ?? "CAD",
        vehicleName: best?.name ?? null,
        evCount: vehicles.length,
      };
    } catch (error) {
      return {
        date,
        loading: false,
        available: false,
        total: null,
        daily: null,
        currency: "CAD",
        vehicleName: null,
        evCount: 0,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  async function loadCalendar(month: string, oagCode: string) {
    const daysForMonth = initialCalendar(month);
    setCalendar(daysForMonth);
    setCalendarLoading(true);

    const dates = daysForMonth.filter((day) => day.loading).map((day) => day.date);
    const batchSize = 3;

    try {
      for (let i = 0; i < dates.length; i += batchSize) {
        const batch = dates.slice(i, i + batchSize);
        const results = await Promise.all(
          batch.map((date) => fetchCalendarDay(date, oagCode))
        );

        setCalendar((current) => {
          if (!current) return current;
          const resultMap = new Map(results.map((item) => [item.date, item]));
          return current.map((item) => resultMap.get(item.date) || item);
        });
      }
    } finally {
      setCalendarLoading(false);
    }
  }

  async function search(event: FormEvent) {
    event.preventDefault();
    setLoading(true);
    setResult(null);
    setCalendar(null);

    const month = startDate.slice(0, 7);
    setCalendarMonth(month);

    try {
      const query = new URLSearchParams({
        location,
        pickupDate: startDate,
        pickupTime: startTime,
        dropoffDate: endDate,
        dropoffTime: startTime,
        minAge: "30",
        countryCode: "CA",
      });

      const response = await fetch(`/api/hertz/search?${query}`, {
        cache: "no-store",
      });
      const data = (await response.json()) as SearchResult;
      setResult(response.ok ? data : { error: data.error || "Recherche impossible." });

      if (response.ok && data.location?.oag_code) {
        await loadCalendar(month, data.location.oag_code);
      }
    } catch (error) {
      setResult({ error: error instanceof Error ? error.message : String(error) });
    } finally {
      setLoading(false);
    }
  }

  async function changeMonth(amount: number) {
    const oagCode = result?.location?.oag_code;
    if (!oagCode || calendarLoading) return;
    const nextMonth = monthShift(calendarMonth, amount);
    setCalendarMonth(nextMonth);
    await loadCalendar(nextMonth, oagCode);
  }

  const availableDays =
    calendar?.filter((day) => day.available && typeof day.total === "number") || [];
  const minTotal = availableDays.length
    ? Math.min(...availableDays.map((day) => day.total as number))
    : null;
  const maxTotal = availableDays.length
    ? Math.max(...availableDays.map((day) => day.total as number))
    : null;

  return (
    <main className="shell">
      <header className="topbar">
        <div>
          <div className="eyebrow">RENTAL PRICE TRACKER</div>
          <h1>Trouve les meilleures dates de location EV.</h1>
        </div>
        <span className="status">HERTZ + PARSE · EV ONLY</span>
      </header>

      <section className="hero">
        <p>
          Recherche en direct des véhicules 100 % électriques Hertz. Le calendrier compare ensuite chaque jour du mois avec une location de <strong>1 jour, départ à 08:00</strong>.
        </p>
      </section>

      <section className="panel">
        <form onSubmit={search}>
          <div className="grid">
            <label>
              <span>Lieu</span>
              <input value={location} onChange={(e) => setLocation(e.target.value)} required />
            </label>
            <label>
              <span>Date de départ</span>
              <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} required />
            </label>
            <label>
              <span>Heure de départ</span>
              <input type="time" value={startTime} onChange={(e) => setStartTime(e.target.value)} required />
            </label>
            <label>
              <span>Nombre de jours</span>
              <input type="number" min={1} max={60} value={days} onChange={(e) => setDays(Number(e.target.value))} required />
            </label>
            <label>
              <span>Loueur</span>
              <input value="Hertz" readOnly />
            </label>
            <label>
              <span>Date de retour</span>
              <input value={`${formatDate(endDate)} à ${startTime}`} readOnly />
            </label>
          </div>

          <div className="actions">
            <button disabled={loading || calendarLoading}>
              {loading ? "Recherche en cours…" : "Rechercher les prix"}
            </button>
            <span>{formatDate(startDate)} {startTime} → {formatDate(endDate)} {startTime}</span>
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
              <h2>{result.location?.city || result.location?.name || location}</h2>
              <p className="muted">
                {result.totalVehicles ?? result.vehicles.length} véhicule(s) électrique(s) disponible(s)
              </p>
            </div>
          </div>

          {result.vehicles.length === 0 ? (
            <div className="empty">
              <strong>Aucun véhicule 100 % électrique trouvé.</strong>
              <span>Essaie une autre date ou une autre agence Hertz.</span>
            </div>
          ) : (
            <div className="vehicle-grid">
              {result.vehicles.map((vehicle, index) => {
                const pricing = vehicle.pricing;
                const currency = pricing?.currency || "CAD";
                const name = vehicle.make_model || vehicle.vehicle_display_name || vehicle.vehicle_type || "Véhicule électrique";
                const daily = Number(pricing?.daily_rate);
                return (
                  <article className="vehicle" key={`${vehicle.sipp_code || name}-${index}`}>
                    <div className="vehicle-title">{name}</div>
                    <div className="vehicle-meta">{vehicle.vehicle_class || vehicle.vehicle_size || "—"} · {vehicle.vehicle_body_type || "—"}</div>
                    <div className="vehicle-meta">SIPP {vehicle.sipp_code || "—"} · 100 % électrique</div>
                    <div className="price-row">
                      <strong>{formatMoney(pricing?.approximate_total, currency)}</strong>
                      <span>{formatMoney(Number.isFinite(daily) ? daily : null, currency)} / jour</span>
                    </div>
                    <div className="details">
                      <span>Sous-total : {formatMoney(pricing?.rental_subtotal, currency)}</span>
                      <span>Frais : {formatMoney(pricing?.fees_total, currency)}</span>
                      <span>Taxes : {formatMoney(pricing?.taxes_total, currency)}</span>
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </section>
      )}

      {calendar && (
        <section className="calendar-section">
          <div className="calendar-head">
            <div>
              <div className="eyebrow">CALENDRIER · 1 JOUR · DÉPART 08:00</div>
              <h2>{monthLabel(calendarMonth)}</h2>
              <p className="muted">Prix total estimé minimum parmi les véhicules 100 % électriques.</p>
            </div>
            <div className="calendar-nav">
              <button type="button" onClick={() => changeMonth(-1)} disabled={calendarLoading}>←</button>
              <button type="button" onClick={() => changeMonth(1)} disabled={calendarLoading}>→</button>
            </div>
          </div>

          <div className="legend">
            <span><i className="legend-dot best" /> Meilleur prix</span>
            <span><i className="legend-dot good" /> Bon prix</span>
            <span><i className="legend-dot mid" /> Moyen</span>
            <span><i className="legend-dot high" /> Plus cher</span>
            <span><i className="legend-dot none" /> Chargement / indisponible</span>
          </div>

          <div className="calendar">
            {["Lun", "Mar", "Mer", "Jeu", "Ven", "Sam", "Dim"].map((day) => (
              <div className="weekday" key={day}>{day}</div>
            ))}

            {Array.from({ length: weekdayMondayFirst(calendar[0].date) }).map((_, index) => (
              <div className="calendar-blank" key={`blank-${index}`} />
            ))}

            {calendar.map((day) => (
              <button
                type="button"
                key={day.date}
                className={`calendar-day ${colorClass(day, minTotal, maxTotal)}`}
                onClick={() => setStartDate(day.date)}
                disabled={day.loading || day.error === "Date passée"}
                title={day.available ? `${formatDate(day.date)} · ${day.vehicleName || "EV"}` : `${formatDate(day.date)} · ${day.error || "Aucun EV"}`}
              >
                <span className="day-number">{Number(day.date.slice(-2))}</span>
                <strong>{day.loading ? "…" : day.available ? formatMoney(day.total, day.currency) : "—"}</strong>
                <small>
                  {day.loading
                    ? "Chargement"
                    : day.error === "Date passée"
                    ? "Passé"
                    : day.available
                    ? day.vehicleName
                    : day.error || "Aucun EV"}
                </small>
              </button>
            ))}
          </div>

          <p className="muted calendar-footnote">
            {calendarLoading
              ? "Le calendrier se remplit progressivement…"
              : `${availableDays.length} jour(s) avec au moins un véhicule électrique.`}
          </p>
        </section>
      )}

      <section className="history">
        <div className="section-heading">
          <div>
            <div className="eyebrow">PROCHAINE ÉTAPE</div>
            <h2>Historique des prix</h2>
          </div>
        </div>
        <div className="empty">
          <strong>Le calendrier permet déjà de repérer les meilleurs jours.</strong>
          <span>La prochaine version enregistrera automatiquement les prix pour détecter les baisses et déclencher des alertes.</span>
        </div>
      </section>
    </main>
  );
}
