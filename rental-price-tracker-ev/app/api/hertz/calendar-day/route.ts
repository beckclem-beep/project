import { NextRequest, NextResponse } from "next/server";

export const maxDuration = 30;
const BASE = "https://api.parse.bot/scraper/ac2b8d77-183a-4671-a3a2-f58aaf87fd63";

function addDays(date: string, offset: number) { const d = new Date(`${date}T12:00:00`); d.setDate(d.getDate()+offset); return d.toISOString().slice(0,10); }
function isEV(vehicle: any) { const sipp = String(vehicle?.sipp_code ?? "").toUpperCase(); const c = sipp.charAt(3); return c === "E" || c === "C"; }

export async function GET(request: NextRequest) {
  const key = process.env.PARSE_API_KEY;
  const p = request.nextUrl.searchParams;
  const date = p.get("date")?.trim();
  const oagCode = p.get("oagCode")?.trim();
  const pickupTime = p.get("pickupTime") || "08:00";
  const minAge = p.get("minAge") || "30";
  const countryCode = p.get("countryCode") || "CA";
  if (!key) return NextResponse.json({ error: "PARSE_API_KEY is not configured." }, { status: 500 });
  if (!date || !oagCode) return NextResponse.json({ error: "date and oagCode are required." }, { status: 400 });
  const empty = (error?: string) => ({ date, available:false, total:null, daily:null, currency:"CAD", vehicleName:null, evCount:0, ...(error ? {error} : {}) });
  try {
    const url = new URL(`${BASE}/search_vehicles`);
    url.searchParams.set("pickup_location", oagCode);
    url.searchParams.set("dropoff_location", oagCode);
    url.searchParams.set("pickup_time", `${date}T${pickupTime}:00`);
    url.searchParams.set("dropoff_time", `${addDays(date,1)}T${pickupTime}:00`);
    url.searchParams.set("min_age", minAge);
    url.searchParams.set("country_code", countryCode);
    const response = await fetch(url, { headers:{"X-API-Key":key}, cache:"no-store" });
    const text = await response.text();
    let payload: any = {};
    try { payload = text ? JSON.parse(text) : {}; } catch { return NextResponse.json(empty(`Réponse non JSON (${response.status}).`)); }
    if (!response.ok) return NextResponse.json(empty(`Recherche indisponible (${response.status}).`));
    const data = payload?.data ?? payload;
    const vehicles = Array.isArray(data?.vehicles) ? data.vehicles.filter(isEV) : [];
    let best:any = null;
    for (const vehicle of vehicles) {
      const total = Number(vehicle?.pricing?.approximate_total);
      if (!Number.isFinite(total)) continue;
      const daily = Number(vehicle?.pricing?.daily_rate);
      const candidate = { total, daily:Number.isFinite(daily) ? daily : null, currency:String(vehicle?.pricing?.currency || "CAD"), vehicleName:String(vehicle?.make_model || vehicle?.vehicle_display_name || vehicle?.vehicle_type || "Véhicule électrique") };
      if (!best || candidate.total < best.total) best = candidate;
    }
    return NextResponse.json({ date, available:Boolean(best), total:best?.total ?? null, daily:best?.daily ?? null, currency:best?.currency ?? "CAD", vehicleName:best?.vehicleName ?? null, evCount:vehicles.length });
  } catch (error) {
    return NextResponse.json(empty(String(error)));
  }
}
