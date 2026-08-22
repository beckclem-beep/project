import { NextRequest, NextResponse } from "next/server";

const BASE="https://api.parse.bot/scraper/ac2b8d77-183a-4671-a3a2-f58aaf87fd63";
const iso=(d:string,t:string)=>`${d}T${t}:00`;

export async function GET(req:NextRequest){
  const key=process.env.PARSE_API_KEY;
  if(!key) return NextResponse.json({error:"PARSE_API_KEY is not configured."},{status:500});
  const p=req.nextUrl.searchParams;
  const location=p.get("location")?.trim(), pickupDate=p.get("pickupDate"), pickupTime=p.get("pickupTime")||"10:00";
  const dropoffDate=p.get("dropoffDate"), dropoffTime=p.get("dropoffTime")||pickupTime;
  if(!location||!pickupDate||!dropoffDate) return NextResponse.json({error:"location, pickupDate and dropoffDate are required."},{status:400});
  try{
    const headers={"X-API-Key":key};
    const lu=new URL(`${BASE}/search_locations`); lu.searchParams.set("query",location);
    const lr=await fetch(lu,{headers,cache:"no-store"}); const ld=await lr.json();
    if(!lr.ok) return NextResponse.json({error:"Parse location search failed.",details:ld},{status:lr.status});
    const locations=Array.isArray(ld.locations)?ld.locations:[];
    if(!locations.length) return NextResponse.json({error:`No Hertz location found for "${location}".`,locations:[]},{status:404});
    const loc=locations[0];
    if(!loc.oag_code) return NextResponse.json({error:"Hertz location returned without an OAG code.",location:loc},{status:502});
    const vu=new URL(`${BASE}/search_vehicles`);
    vu.searchParams.set("pickup_location",loc.oag_code); vu.searchParams.set("dropoff_location",loc.oag_code);
    vu.searchParams.set("pickup_time",iso(pickupDate,pickupTime)); vu.searchParams.set("dropoff_time",iso(dropoffDate,dropoffTime));
    vu.searchParams.set("min_age",p.get("minAge")||"30"); vu.searchParams.set("country_code",p.get("countryCode")||"CA");
    const vr=await fetch(vu,{headers,cache:"no-store"}); const vd=await vr.json();
    if(!vr.ok) return NextResponse.json({error:"Parse vehicle search failed.",details:vd},{status:vr.status});
    return NextResponse.json({source:"Parse / Hertz",searchedAt:new Date().toISOString(),location:loc,vehicles:vd.vehicles||[],totalVehicles:vd.total_vehicles??(vd.vehicles||[]).length});
  }catch(e){return NextResponse.json({error:"Unexpected server error.",details:String(e)},{status:500});}
}