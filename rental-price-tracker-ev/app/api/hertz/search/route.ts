import { NextRequest, NextResponse } from "next/server";

const BASE =
  "https://api.parse.bot/scraper/ac2b8d77-183a-4671-a3a2-f58aaf87fd63";

function iso(date: string, time: string) {
  return `${date}T${time}:00`;
}

function normalizeLocationQuery(value: string) {
  return value
    .toLowerCase()
    .replace(/\s*,\s*(qc|quebec|canada)\s*$/i, "")
    .trim();
}

function isBatteryElectricVehicle(vehicle: { sipp_code?: unknown }) {
  const sipp = String(vehicle.sipp_code || "").toUpperCase();
  const fuelCode = sipp.charAt(3);
  return fuelCode === "E" || fuelCode === "C";
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
  const location = params.get("location")?.trim();
  const oagCodeParam = params.get("oagCode")?.trim();
  const pickupDate = params.get("pickupDate")?.trim();
  const pickupTime = params.get("pickupTime") || "08:00";
  const dropoffDate = params.get("dropoffDate")?.trim();
  const dropoffTime = params.get("dropoffTime") || pickupTime;
  const minAge = params.get("minAge") || "30";
  const countryCode = params.get("countryCode") || "CA";

  if (!pickupDate || !dropoffDate || (!location && !oagCodeParam)) {
    return NextResponse.json(
      {
        error:
          "pickupDate, dropoffDate and either location or oagCode are required.",
      },
      { status: 400 }
    );
  }

  try {
    const headers = { "X-API-Key": key };
    let selected: {
      name?: string;
      city?: string;
      oag_code: string;
      address?: string;
      timezone?: string;
      is_bookable?: boolean;
    } | null = null;

    if (oagCodeParam) {
      selected = { oag_code: oagCodeParam, name: oagCodeParam };
    } else {
      const locationsUrl = new URL(`${BASE}/search_locations`);
      locationsUrl.searchParams.set("query", location as string);

      const locationsResponse = await fetch(locationsUrl, {
        headers,
        cache: "no-store",
      });

      const locationsText = await locationsResponse.text();
      let locationsPayload: any = {};
      try {
        locationsPayload = locationsText ? JSON.parse(locationsText) : {};
      } catch {
        return NextResponse.json(
          { error: `Parse location search returned invalid JSON (${locationsResponse.status}).` },
          { status: 502 }
        );
      }

      if (!locationsResponse.ok) {
        return NextResponse.json(
          { error: "Parse location search failed.", details: locationsPayload },
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

      const normalizedQuery = normalizeLocationQuery(location as string);
      selected =
        locations.find((item: { city?: string; name?: string }) =>
          String(item.city || item.name || "")
            .toLowerCase()
            .includes(normalizedQuery)
        ) || locations[0];
    }

    if (!selected?.oag_code) {
      return NextResponse.json(
        { error: "Hertz location returned without an OAG code." },
        { status: 502 }
      );
    }

    const vehiclesUrl = new URL(`${BASE}/search_vehicles`);
    vehiclesUrl.searchParams.set("pickup_location", selected.oag_code);
    vehiclesUrl.searchParams.set("dropoff_location", selected.oag_code);
    vehiclesUrl.searchParams.set("pickup_time", iso(pickupDate, pickupTime));
    vehiclesUrl.searchParams.set("dropoff_time", iso(dropoffDate, dropoffTime));
    vehiclesUrl.searchParams.set("min_age", minAge);
    vehiclesUrl.searchParams.set("country_code", countryCode);

    const vehiclesResponse = await fetch(vehiclesUrl, {
      headers,
      cache: "no-store",
    });

    const vehiclesText = await vehiclesResponse.text();
    let vehiclesPayload: any = {};
    try {
      vehiclesPayload = vehiclesText ? JSON.parse(vehiclesText) : {};
    } catch {
      return NextResponse.json(
        { error: `Parse vehicle search returned invalid JSON (${vehiclesResponse.status}).` },
        { status: 502 }
      );
    }

    if (!vehiclesResponse.ok) {
      return NextResponse.json(
        {
          error: `Parse vehicle search failed (${vehiclesResponse.status}).`,
          details: vehiclesPayload,
        },
        { status: vehiclesResponse.status }
      );
    }

    const vehicleData = vehiclesPayload?.data ?? vehiclesPayload;
    const vehicles = Array.isArray(vehicleData?.vehicles)
      ? vehicleData.vehicles
      : [];

    const evVehicles = vehicles
      .filter(isBatteryElectricVehicle)
      .sort((a: any, b: any) => {
        const aTotal = Number(a?.pricing?.approximate_total ?? Infinity);
        const bTotal = Number(b?.pricing?.approximate_total ?? Infinity);
        return aTotal - bTotal;
      });

    return NextResponse.json({
      source: "Parse / Hertz",
      filter: "Battery Electric Vehicles only (SIPP fuel code E/C)",
      searchedAt: new Date().toISOString(),
      location: selected,
      totalVehiclesFound: vehicles.length,
      totalVehicles: evVehicles.length,
      vehicles: evVehicles,
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
