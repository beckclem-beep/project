import { NextRequest, NextResponse } from "next/server";

const BASE =
  "https://api.parse.bot/scraper/ac2b8d77-183a-4671-a3a2-f58aaf87fd63";

function iso(date: string, time: string) {
  return `${date}T${time}:00`;
}

function normalize(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

type LocationItem = {
  name?: string;
  city?: string;
  address?: string;
  oag_code?: string;
  is_bookable?: boolean;
};

type Vehicle = {
  make_model?: string;
  vehicle_display_name?: string;
  vehicle_type?: string;
  vehicle_group?: string;
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

function isBatteryElectricVehicle(vehicle: Vehicle) {
  const sipp = String(vehicle.sipp_code || "").toUpperCase();
  const fuelCode = sipp[3];
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
  const suppliedOag = params.get("oagCode")?.trim();
  const pickupDate = params.get("pickupDate");
  const pickupTime = params.get("pickupTime") || "08:00";
  const dropoffDate = params.get("dropoffDate");
  const dropoffTime = params.get("dropoffTime") || "08:00";
  const minAge = params.get("minAge") || "30";
  const countryCode = params.get("countryCode") || "CA";

  if ((!location && !suppliedOag) || !pickupDate || !dropoffDate) {
    return NextResponse.json(
      { error: "location or oagCode, pickupDate and dropoffDate are required." },
      { status: 400 }
    );
  }

  try {
    const headers = { "X-API-Key": key };
    let selected: LocationItem | null = null;

    if (suppliedOag) {
      selected = { oag_code: suppliedOag, name: location || suppliedOag };
    } else {
      const locationsUrl = new URL(`${BASE}/search_locations`);
      locationsUrl.searchParams.set("query", location!);

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
      const locations: LocationItem[] = Array.isArray(locationData?.locations)
        ? locationData.locations
        : [];

      if (!locations.length) {
        return NextResponse.json(
          { error: `No Hertz location found for "${location}".` },
          { status: 404 }
        );
      }

      const cityQuery = normalize((location || "").split(",")[0]);
      selected =
        locations.find((item) => normalize(String(item.city || "")) === cityQuery) ||
        locations.find((item) => normalize(String(item.name || "")).includes(cityQuery)) ||
        locations.find((item) => normalize(String(item.address || "")).includes(cityQuery)) ||
        locations.find((item) => item.is_bookable && item.oag_code) ||
        locations[0];
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
    const vehicles: Vehicle[] = Array.isArray(vehicleData?.vehicles)
      ? vehicleData.vehicles
      : [];

    const evVehicles = vehicles
      .filter(isBatteryElectricVehicle)
      .sort((a, b) => {
        const aTotal = Number(a.pricing?.approximate_total);
        const bTotal = Number(b.pricing?.approximate_total);
        const safeA = Number.isFinite(aTotal) ? aTotal : Number.POSITIVE_INFINITY;
        const safeB = Number.isFinite(bTotal) ? bTotal : Number.POSITIVE_INFINITY;
        return safeA - safeB;
      });

    return NextResponse.json({
      source: "Parse / Hertz",
      searchedAt: new Date().toISOString(),
      location: selected,
      oagCode: selected.oag_code,
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
