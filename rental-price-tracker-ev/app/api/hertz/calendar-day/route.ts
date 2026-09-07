import { NextRequest, NextResponse } from "next/server";

export const maxDuration = 30;

const BASE =
  "https://api.parse.bot/scraper/ac2b8d77-183a-4671-a3a2-f58aaf87fd63";

type Vehicle = {
  sipp_code?: unknown;
  make_model?: unknown;
  vehicle_display_name?: unknown;
  vehicle_type?: unknown;
  pricing?: {
    approximate_total?: unknown;
    daily_rate?: unknown;
    currency?: unknown;
  };
};

type ParsePayload = {
  data?: {
    vehicles?: Vehicle[];
  };
  vehicles?: Vehicle[];
  [key: string]: unknown;
};

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

async function readJson(response: Response): Promise<ParsePayload> {
  const text = await response.text();
  if (!text.trim()) return {};
  try {
    return JSON.parse(text) as ParsePayload;
  } catch {
    throw new Error(`Parse API returned non-JSON (${response.status}).`);
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
  const date = params.get("date")?.trim();
  const oagCode = params.get("oagCode")?.trim();
  const pickupTime = params.get("pickupTime") || "08:00";
  const minAge = params.get("minAge") || "30";
  const countryCode = params.get("countryCode") || "CA";

  if (!date || !oagCode) {
    return NextResponse.json(
      { error: "date and oagCode are required." },
      { status: 400 }
    );
  }

  try {
    const vehiclesUrl = new URL(`${BASE}/search_vehicles`);
    vehiclesUrl.searchParams.set("pickup_location", oagCode);
    vehiclesUrl.searchParams.set("dropoff_location", oagCode);
    vehiclesUrl.searchParams.set("pickup_time", `${date}T${pickupTime}:00`);
    vehiclesUrl.searchParams.set(
      "dropoff_time",
      `${addDays(date, 1)}T${pickupTime}:00`
    );
    vehiclesUrl.searchParams.set("min_age", minAge);
    vehiclesUrl.searchParams.set("country_code", countryCode);

    const response = await fetch(vehiclesUrl, {
      headers: { "X-API-Key": key },
      cache: "no-store",
    });
    const payload = await readJson(response);

    if (!response.ok) {
      return NextResponse.json({
        date,
        available: false,
        total: null,
        daily: null,
        currency: "CAD",
        vehicleName: null,
        evCount: 0,
        error: `Recherche Hertz indisponible (${response.status}).`,
      });
    }

    const data = payload?.data ?? payload;
    const vehicles = Array.isArray(data?.vehicles) ? data.vehicles : [];
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

      if (!best || candidate.total < best.total) best = candidate;
    }

    return NextResponse.json({
      date,
      available: Boolean(best),
      total: best?.total ?? null,
      daily: best?.daily ?? null,
      currency: best?.currency ?? "CAD",
      vehicleName: best?.vehicleName ?? null,
      evCount: evVehicles.length,
    });
  } catch (error) {
    return NextResponse.json({
      date,
      available: false,
      total: null,
      daily: null,
      currency: "CAD",
      vehicleName: null,
      evCount: 0,
      error: String(error),
    });
  }
}
