import { NextRequest, NextResponse } from "next/server";

const BASE =
  "https://api.parse.bot/scraper/ac2b8d77-183a-4671-a3a2-f58aaf87fd63";

function iso(date: string, time: string) {
  return `${date}T${time}:00`;
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
  const pickupDate = params.get("pickupDate");
  const pickupTime = params.get("pickupTime") || "10:00";
  const dropoffDate = params.get("dropoffDate");
  const dropoffTime = params.get("dropoffTime") || pickupTime;
  const minAge = params.get("minAge") || "30";
  const countryCode = params.get("countryCode") || "CA";

  if (!location || !pickupDate || !dropoffDate) {
    return NextResponse.json(
      { error: "location, pickupDate and dropoffDate are required." },
      { status: 400 }
    );
  }

  try {
    const headers = { "X-API-Key": key };

    // Parse returns its payload under `data`.
    const locationsUrl = new URL(`${BASE}/search_locations`);
    locationsUrl.searchParams.set("query", location);

    const locationsResponse = await fetch(locationsUrl, {
      headers,
      cache: "no-store",
    });

    const locationsPayload = await locationsResponse.json();

    if (!locationsResponse.ok) {
      return NextResponse.json(
        {
          error: "Parse location search failed.",
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
        {
          error: `No Hertz location found for "${location}".`,
          locations: [],
          parseResponse: locationsPayload,
        },
        { status: 404 }
      );
    }

    // Prefer an exact city match when Parse returns multiple locations.
    const normalizedQuery = location.toLowerCase();
    const selected =
      locations.find(
        (item: { city?: string; name?: string }) =>
          String(item.city || item.name || "")
            .toLowerCase()
            .includes(normalizedQuery.replace(", qc", "").trim())
      ) || locations[0];

    if (!selected?.oag_code) {
      return NextResponse.json(
        {
          error: "Hertz location returned without an OAG code.",
          location: selected,
        },
        { status: 502 }
      );
    }

    const vehiclesUrl = new URL(`${BASE}/search_vehicles`);
    vehiclesUrl.searchParams.set("pickup_location", selected.oag_code);
    vehiclesUrl.searchParams.set("dropoff_location", selected.oag_code);
    vehiclesUrl.searchParams.set(
      "pickup_time",
      iso(pickupDate, pickupTime)
    );
    vehiclesUrl.searchParams.set(
      "dropoff_time",
      iso(dropoffDate, dropoffTime)
    );
    vehiclesUrl.searchParams.set("min_age", minAge);
    vehiclesUrl.searchParams.set("country_code", countryCode);

    const vehiclesResponse = await fetch(vehiclesUrl, {
      headers,
      cache: "no-store",
    });

    const vehiclesPayload = await vehiclesResponse.json();

    if (!vehiclesResponse.ok) {
      return NextResponse.json(
        {
          error: "Parse vehicle search failed.",
          details: vehiclesPayload,
        },
        { status: vehiclesResponse.status }
      );
    }

    const vehicleData = vehiclesPayload?.data ?? vehiclesPayload;
    const vehicles = Array.isArray(vehicleData?.vehicles)
      ? vehicleData.vehicles
      : [];

    return NextResponse.json({
      source: "Parse / Hertz",
      searchedAt: new Date().toISOString(),
      location: selected,
      totalVehicles:
        vehicleData?.total_vehicles ?? vehicles.length,
      vehicles,
      raw: vehiclesPayload,
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
