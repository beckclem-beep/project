import { NextRequest, NextResponse } from "next/server";

const BASE = "https://api.parse.bot/scraper/ac2b8d77-183a-4671-a3a2-f58aaf87fd63";

function iso(date: string, time: string) { return `${date}T${time}:00`; }
function normalize(value: unknown) { return String(value ?? "").toLowerCase().replace(/,?\s*qc\b/g, "").trim(); }
function isEV(vehicle: any) {
  const sipp = String(vehicle?.sipp_code ?? "").toUpperCase();
  const fuelCode = sipp.charAt(3);
  return fuelCode === "E" || fuelCode === "C";
}
function safeArray(value: unknown): any[] { return Array.isArray(value) ? value : []; }

export async function GET(request: NextRequest) {
  const key = process.env.PARSE_API_KEY;
  if (!key) return NextResponse.json({ error: "PARSE_API_KEY is not configured." }, { status: 500 });
  const p = request.nextUrl.searchParams;
  const locationQuery = p.get("location")?.trim();
  const oagCode = p.get("oagCode")?.trim();
  const pickupDate = p.get("pickupDate");
  const pickupTime = p.get("pickupTime") || "10:00";
  const dropoffDate = p.get("dropoffDate");
  const dropoffTime = p.get("dropoffTime") || pickupTime;
  const minAge = p.get("minAge") || "30";
  const countryCode = p.get("countryCode") || "CA";
  if (!locationQuery || !pickupDate || !dropoffDate) return NextResponse.json({ error: "location, pickupDate and dropoffDate are required." }, { status: 400 });

  try {
    const headers = { "X-API-Key": key };
    let selected: any = null;
    if (oagCode) {
      selected = { oag_code: oagCode, name: locationQuery || oagCode, city: locationQuery || "" };
    } else {
      const locationsUrl = new URL(`${BASE}/search_locations`);
      locationsUrl.searchParams.set("query", locationQuery || "");
      const locationsResponse = await fetch(locationsUrl, { headers, cache: "no-store" });
      const locationsPayload = await locationsResponse.json();
      if (!locationsResponse.ok) return NextResponse.json({ error: "Parse location search failed.", details: locationsPayload }, { status: locationsResponse.status });
      const locationData = locationsPayload?.data ?? locationsPayload;
      const locations = safeArray(locationData?.locations);
      if (!locations.length) return NextResponse.json({ error: `No Hertz location found for "${locationQuery}".`, locations: [] }, { status: 404 });
      const wanted = normalize(locationQuery);
      selected = locations.find((item: any) => [item?.city, item?.name, item?.address].map(normalize).some((v: string) => v && (v.includes(wanted) || wanted.includes(v)))) || locations[0];
      if (!selected?.oag_code) return NextResponse.json({ error: "Hertz location returned without an OAG code.", location: selected }, { status: 502 });
    }

    const vehiclesUrl = new URL(`${BASE}/search_vehicles`);
    vehiclesUrl.searchParams.set("pickup_location", selected.oag_code);
    vehiclesUrl.searchParams.set("dropoff_location", selected.oag_code);
    vehiclesUrl.searchParams.set("pickup_time", iso(pickupDate, pickupTime));
    vehiclesUrl.searchParams.set("dropoff_time", iso(dropoffDate, dropoffTime));
    vehiclesUrl.searchParams.set("min_age", minAge);
    vehiclesUrl.searchParams.set("country_code", countryCode);
    const vehiclesResponse = await fetch(vehiclesUrl, { headers, cache: "no-store" });
    const vehiclesPayload = await vehiclesResponse.json();
    if (!vehiclesResponse.ok) return NextResponse.json({ error: "Parse vehicle search failed.", details: vehiclesPayload }, { status: vehiclesResponse.status });
    const vehicleData = vehiclesPayload?.data ?? vehiclesPayload;
    const vehicles = safeArray(vehicleData?.vehicles).filter(isEV);
    return NextResponse.json({ source: "Parse / Hertz", searchedAt: new Date().toISOString(), location: selected, totalVehicles: vehicles.length, vehicles });
  } catch (error) {
    return NextResponse.json({ error: "Unexpected server error.", details: String(error) }, { status: 500 });
  }
}
