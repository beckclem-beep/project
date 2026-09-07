import { NextRequest, NextResponse } from "next/server";

export const maxDuration = 120;

const BASE =
  "https://api.parse.bot/scraper/ac2b8d77-183a-4671-a3a2-f58aaf87fd63";

const iso = (date: string, time = "08:00") => `${date}T${time}:00`;

function normalizeLocationQuery(value: string) {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/,\s*(qc|quebec|canada)$/i, "")
    .trim();
}

type Vehicle = {
  sipp_code?: unknown;
  pricing?: {
    approximate_total?: unknown;
    daily_rate?: unknown;
    currency?: unknown;
  };
  make_model?: unknown;
  vehicle_display_name?: unknown;
  vehicle_type?: unknown;
};

type ParsePayload = {
  data?: {
    locations?: Array<{ city?: string; name?: string; oag_code?: string }>;
    vehicles?: Vehicle[];
    total_vehicles?: number;
  };
  locations?: Array<{ city?: string; name?: string; oag_code?: string }>;
  vehicles?: Vehicle[];
  total_vehicles?: number;
  [key: string]: unknown;
};

async function readJson(response: Response): Promise<ParsePayload> {
  const text = await response.text();
  if (!text.trim()) return {};

  try {
    return JSON.parse(text) as ParsePayload;
  } catch {
    throw new Error(`Parse API returned non-JSON (${response.status}).`);
  }
}

function isBatteryElectricVehicle(vehicle: Vehicle) {
  const sipp = String(vehicle.sipp_code || "").toUpperCase();
  const fuelCode = sipp.charAt(3);
  return fuelCode === "E" || fuelCode === "C";
}

function addDays(date: string, offset: number) {
  const d = new Date(`${date}T12:00:00`);
  d.setDate(d.getDate() + offset);
  return d.toISOString().slice(0, 10);
}

function getMonthDates(month: string) {
  const [year, monthNumber] = month.split("-").map(Number);
  if (!year || !monthNumber || monthNumber < 1 || monthNumber > 12) return [];

  const first = `${year}-${String(monthNumber).padStart(2, "0")}-01`;
  const last = new Date(year, monthNumber, 0).getDate();
  return Array.from({ length: last }, (_, i) => addDays(first, i));
}

async function searchDay(
  headers: HeadersInit,
  oagCode: string,
  date: string,
  minAge: string,
  countryCode: string
) {
  try {
    const dropoffDate = addDays(date, 1);
    const vehiclesUrl = new URL(`${BASE}/search_vehicles`);
    vehiclesUrl.searchParams.set("pickup_location", oagCode);
    vehiclesUrl.searchParams.set("dropoff_location", oagCode);
    vehiclesUrl.searchParams.set("pickup_time", iso(date));
    vehiclesUrl.searchParams.set("dropoff_time", iso(dropoffDate));
    vehiclesUrl.searchParams.set("min_age", minAge);
    vehiclesUrl.searchParams.set("country_code", countryCode);

    const response = await fetch(vehiclesUrl, {
      headers,
      cache: "no-store",
    });
    const payload = await readJson(response);

    if (!response.ok) {
      return {
        date,
        available: false,
        total: null,
        daily: null,
        currency: "CAD",
        vehicleName: null,
        evCount: 0,
        error: `Recherche Hertz indisponible (${response.status}).`,
      };
    }

    const data = payload?.data ?? payload;
    const vehicles: Vehicle[] = Array.isArray(data?.vehicles)
      ? data.vehicles
      : [];
    const evVehicles = vehicles.filter(isBatteryElectricVehicle);

    let best: {
      total: number;
      daily: number | null;
      currency: string;
      vehicleName: string;
    } | null = null;

    for (const vehicle of evVehicles) {
      const total = Number(vehicle.pricing?.approximate_total);
      if (!Number.isFinite(total)) continue;

      const dailyValue = Number(vehicle.pricing?.daily_rate);
      const candidate = {
        total,
        daily: Number.isFinite(dailyValue) ? dailyValue : null,
        currency: String(vehicle.pricing?.currency || "CAD"),
        vehicleName: String(
          vehicle.make_model ||
            vehicle.vehicle_display_name ||
            vehicle.vehicle_type ||
            "Véhicule électrique"
        ),
      };

      if (!best || candidate.total < best.total) {
        best = candidate;
      }
    }

    return {
      date,
      available: Boolean(best),
      total: best?.total ?? null,
      daily: best?.daily ?? null,
      currency: best?.currency ?? "CAD",
      vehicleName: best?.vehicleName ?? null,
      evCount: evVehicles.length,
    };
  } catch (error) {
    console.warn("Calendar day search failed", date, error);
    return {
      date,
      available: false,
      total: null,
      daily: null,
      currency: "CAD",
      vehicleName: null,
      evCount: 0,
      error: "Recherche temporairement indisponible.",
    };
  }
}

export async function GET(request: NextRequest) {
  const key = process.env.PARSE_API_KEY;
  if (!key) {
    return NextResponse.json(
      { error: "PARSE_API_KEY is not configured." },
      { status: 500 }
    );
  }

  const params = request.nextUrl.searchParams;
  const location = params.get("location")?.trim() || "Brossard, QC";
  const oagCodeParam = params.get("oagCode")?.trim();
  const month = params.get("month");
  const minAge = params.get("minAge") || "30";
  const countryCode = params.get("countryCode") || "CA";

  if (!month) {
    return NextResponse.json(
      { error: "month is required." },
      { status: 400 }
    );
  }

  const dates = getMonthDates(month);
  if (!dates.length) {
    return NextResponse.json(
      { error: "Invalid month. Use YYYY-MM." },
      { status: 400 }
    );
  }

  try {
    const headers = { "X-API-Key": key };

    let selected: { name?: string; city?: string; oag_code?: string };

    if (oagCodeParam) {
      selected = { name: location, city: location, oag_code: oagCodeParam };
    } else {
      const locationsUrl = new URL(`${BASE}/search_locations`);
      locationsUrl.searchParams.set("query", normalizeLocationQuery(location));

      const locationsResponse = await fetch(locationsUrl, {
        headers,
        cache: "no-store",
      });
      const locationsPayload = await readJson(locationsResponse);

      if (!locationsResponse.ok) {
        return NextResponse.json(
          {
            error: `Parse location search failed (${locationsResponse.status}).`,
            details: locationsPayload,
          },
          { status: locationsResponse.status }
        );
      }

      const locationData = locationsPayload?.data ?? locationsPayload;
      const locations = Array.isArray(locationData?.locations)
        ? locationData.locations
        : [];

      if (!locations.length) {
        return NextResponse.json(
          { error: `No Hertz location found for "${location}".` },
          { status: 404 }
        );
      }

      const normalized = normalizeLocationQuery(location);
      selected =
        locations.find((item) => {
          const city = normalizeLocationQuery(String(item.city || ""));
          const name = normalizeLocationQuery(String(item.name || ""));
          return (
            city === normalized ||
            name === normalized ||
            city.includes(normalized) ||
            name.includes(normalized)
          );
        }) || locations[0];
    }

    if (!selected?.oag_code) {
      return NextResponse.json(
        { error: "Hertz location returned without an OAG code." },
        { status: 502 }
      );
    }

    const results: Array<Awaited<ReturnType<typeof searchDay>>> = [];
    const today = new Date().toISOString().slice(0, 10);
    const datesToSearch = dates.filter((date) => date >= today);
    const skipped = dates.filter((date) => date < today).map((date) => ({
      date, available: false, total: null, daily: null, currency: "CAD",
      vehicleName: null, evCount: 0, error: "Date passée"
    }));
    const batchSize = 3;

    for (let i = 0; i < datesToSearch.length; i += batchSize) {
      const batch = await Promise.all(
        datesToSearch
          .slice(i, i + batchSize)
          .map((date) =>
            searchDay(headers, selected.oag_code as string, date, minAge, countryCode)
          )
      );
      results.push(...batch);
      if (i + batchSize < datesToSearch.length) {
        await new Promise((resolve) => setTimeout(resolve, 650));
      }
    }

    results.push(...skipped);
    results.sort((a, b) => a.date.localeCompare(b.date));

    const availableTotals = results
      .map((day) => day.total)
      .filter((value): value is number => Number.isFinite(value));

    const minTotal = availableTotals.length ? Math.min(...availableTotals) : null;
    const maxTotal = availableTotals.length ? Math.max(...availableTotals) : null;

    return NextResponse.json({
      source: "Parse / Hertz",
      location: selected,
      month,
      pickupTime: "08:00",
      rentalLengthDays: 1,
      filter: "Battery Electric Vehicles only (SIPP fuel code E/C)",
      searchedAt: new Date().toISOString(),
      minTotal,
      maxTotal,
      days: results,
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: "Unexpected server error.",
        details: String(error),
      },
      { status: 500 }
    );
  }
}
