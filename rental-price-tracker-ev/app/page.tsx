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
  location?: { name?: string; city?: string; oag_code?: string };
  vehicles?: Vehicle[];
};

type DayResult = {
  date: string;
  status: "idle" | "loading" | "ok" | "empty" | "error";
  price?: number;
  vehicle?: string;
  currency?: string;
};

const money = (value: number, currency = "CAD") =>
  new Intl.NumberFormat("fr-CA", {
    style: "currency",
    currency,
    maximumFractionDigits: 0,
  }).format(value);

const toISODate = (d: Date) => {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
};

const addDays = (date: string, days: number) => {
  const d = new Date(`${date}T12:00:00`);
  d.setDate(d.getDate() + days);
  return toISODate(d);
};

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function buildThreeMonths() {
  const now = new Date();
  const months = [];

  for (let offset = 0; offset < 3; offset++) {
    const first = new Date(now.getFullYear(), now.getMonth() + offset, 1);
    const last = new Date(now.getFullYear(), now.getMonth() + offset + 1, 0);
    const days = [];

    for (let d = 1; d <= last.getDate(); d++) {
      const current = new Date(first.getFullYear(), first.getMonth(), d);
      const isPast =
        current.getFullYear() === now.getFullYear() &&
        current.getMonth() === now.getMonth() &&
        d < now.getDate();

      days.push({
        date: toISODate(current),
        day: d,
        isPast,
      });
    }

    months.push({
      key: `${first.getFullYear()}-${first.getMonth()}`,
      label: new Intl.DateTimeFormat("fr-CA", {
        month: "long",
        year: "numeric",
      }).format(first),
      firstWeekday: (first.getDay() + 6) % 7,
      days,
    });
  }

  return months;
}

function percentile(values: number[], value: number) {
  const sorted = [...values].sort((a, b) => a - b);
  if (sorted.length <= 1) return 0;
  const index = sorted.findIndex((v) => v >= value);
  return (Math.max(0, index) / (sorted.length - 1)) * 100;
}

export default function Home() {
  const months = useMemo(buildThreeMonths, []);
  const activeDates = useMemo(
    () => months.flatMap((m) => m.days.filter((d) => !d.isPast).map((d) => d.date)),
    [months]
  );

  const [location, setLocation] = useState("Brossard");
  const [loading, setLoading] = useState(false);
  const [oagCode, setOagCode] = useState<string | null>(null);
  const [results, setResults] = useState<Record<string, DayResult>>({});
  const [progress, setProgress] = useState({ done: 0, total: activeDates.length });
  const [error, setError] = useState<string | null>(null);

  const loadedPrices = Object.values(results)
    .filter((r) => r.status === "ok" && Number.isFinite(r.price))
    .map((r) => r.price as number);

  async function fetchDay(date: string, knownOag?: string | null) {
    setResults((prev) => ({
      ...prev,
      [date]: { date, status: "loading" },
    }));

    const query = new URLSearchParams({
      location,
      pickupDate: date,
      pickupTime: "08:00",
      dropoffDate: addDays(date, 1),
      dropoffTime: "08:00",
      minAge: "30",
      countryCode: "CA",
    });

    if (knownOag) query.set("oagCode", knownOag);

    let lastError = "Erreur inconnue";

    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const response = await fetch(`/api/hertz/search?${query.toString()}`, {
          cache: "no-store",
        });
        const data: SearchResponse = await response.json();

        if (response.ok) {
          const vehicles = Array.isArray(data.vehicles) ? data.vehicles : [];
          const valid = vehicles
            .map((v) => ({
              total: Number(v.pricing?.approximate_total),
              name: v.make_model || v.vehicle_display_name || "EV",
              currency: v.pricing?.currency || "CAD",
            }))
            .filter((v) => Number.isFinite(v.total))
            .sort((a, b) => a.total - b.total);

          setResults((prev) => ({
            ...prev,
            [date]: valid.length
              ? {
                  date,
                  status: "ok",
                  price: valid[0].total,
                  vehicle: valid[0].name,
                  currency: valid[0].currency,
                }
              : { date, status: "empty" },
          }));

          return data.oagCode || data.location?.oag_code || knownOag || null;
        }

        lastError = data.error || `HTTP ${response.status}`;
      } catch (e) {
        lastError = String(e);
      }

      await sleep(900 * (attempt + 1));
    }

    setResults((prev) => ({
      ...prev,
      [date]: { date, status: "error" },
    }));
    return { error: lastError } as const;
  }

  async function loadPrices() {
    setLoading(true);
    setError(null);
    setResults({});
    setProgress({ done: 0, total: activeDates.length });

    let resolvedOag = oagCode;

    try {
      if (!activeDates.length) return;

      // First day resolves the Hertz location once.
      const firstDate = activeDates[0];
      const first = await fetchDay(firstDate, resolvedOag);
      if (typeof first === "object" && "error" in first) {
        throw new Error(first.error);
      }
      resolvedOag = first;
      if (resolvedOag) setOagCode(resolvedOag);
      setProgress((p) => ({ ...p, done: 1 }));

      // Then fetch the rest progressively, 2 at a time.
      const rest = activeDates.slice(1);
      for (let i = 0; i < rest.length; i += 2) {
        const batch = rest.slice(i, i + 2);
        await Promise.all(batch.map((date) => fetchDay(date, resolvedOag)));
        setProgress((p) => ({
          ...p,
          done: Math.min(p.total, p.done + batch.length),
        }));
        await sleep(450);
      }
    } catch (e) {
      setError(String(e).replace(/^Error:\s*/, ""));
    } finally {
      setLoading(false);
    }
  }

  function getPriceClass(price?: number) {
    if (!Number.isFinite(price) || !loadedPrices.length) return "neutral";
    const p = percentile(loadedPrices, price as number);
    if (p <= 15) return "best";
    if (p <= 40) return "good";
    if (p <= 70) return "medium";
    return "high";
  }

  return (
    <main className="shell">
      <header className="hero">
        <div>
          <div className="eyebrow">RENTAL PRICE TRACKER · HERTZ · EV ONLY</div>
          <h1>Les 3 prochains mois, en un coup d’œil.</h1>
          <p>
            Prix minimum pour une location de <strong>1 jour</strong>, départ à{" "}
            <strong>08:00</strong> et retour à <strong>08:00</strong>.
          </p>
        </div>
      </header>

      <section className="controls">
        <label>
          <span>Agence / ville</span>
          <input
            value={location}
            onChange={(e) => {
              setLocation(e.target.value);
              setOagCode(null);
            }}
            placeholder="Brossard"
          />
        </label>
        <button onClick={loadPrices} disabled={loading || !location.trim()}>
          {loading ? "Chargement des prix…" : "Charger les 3 prochains mois"}
        </button>
        <div className="progress">
          {loading
            ? `${progress.done} / ${progress.total} jours analysés`
            : loadedPrices.length
            ? `${loadedPrices.length} jours avec prix`
            : "Prêt"}
        </div>
      </section>

      {error && <div className="error">{error}</div>}

      <section className="legend">
        <span><i className="dot best" /> Meilleur prix</span>
        <span><i className="dot good" /> Bon prix</span>
        <span><i className="dot medium" /> Moyen</span>
        <span><i className="dot high" /> Plus cher</span>
        <span><i className="dot neutral" /> Indisponible / non chargé</span>
      </section>

      <section className="months">
        {months.map((month) => (
          <article className="month-card" key={month.key}>
            <div className="month-title">{month.label}</div>

            <div className="weekdays">
              {["Lun", "Mar", "Mer", "Jeu", "Ven", "Sam", "Dim"].map((d) => (
                <div key={d}>{d}</div>
              ))}
            </div>

            <div className="calendar-grid">
              {Array.from({ length: month.firstWeekday }).map((_, i) => (
                <div className="blank" key={`blank-${i}`} />
              ))}

              {month.days.map((day) => {
                const result = results[day.date];
                const cls =
                  day.isPast || !result
                    ? "neutral"
                    : result.status === "ok"
                    ? getPriceClass(result.price)
                    : "neutral";

                return (
                  <div
                    className={`day ${cls} ${day.isPast ? "past" : ""}`}
                    key={day.date}
                    title={
                      result?.status === "ok"
                        ? `${result.vehicle} · ${money(
                            result.price || 0,
                            result.currency || "CAD"
                          )}`
                        : ""
                    }
                  >
                    <div className="day-number">{day.day}</div>
                    <div className="day-price">
                      {day.isPast
                        ? "—"
                        : result?.status === "loading"
                        ? "…"
                        : result?.status === "ok"
                        ? money(result.price || 0, result.currency || "CAD")
                        : result?.status === "empty"
                        ? "Aucun EV"
                        : result?.status === "error"
                        ? "Erreur"
                        : "—"}
                    </div>
                    {result?.status === "ok" && (
                      <div className="day-vehicle">{result.vehicle}</div>
                    )}
                  </div>
                );
              })}
            </div>
          </article>
        ))}
      </section>
    </main>
  );
}
