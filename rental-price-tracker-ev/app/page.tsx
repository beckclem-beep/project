"use client";

import { FormEvent, useMemo, useState } from "react";

type Pricing = { daily_rate?: number|string; approximate_total?: number|string; fees_total?: number|string; taxes_total?: number|string; rental_subtotal?: number|string; currency?: string };
type Vehicle = { make_model?: string; vehicle_display_name?: string; vehicle_type?: string; vehicle_class?: string; vehicle_size?: string; vehicle_body_type?: string; sipp_code?: string; pricing?: Pricing };
type SearchResult = { error?: string; location?: { name?: string; city?: string; oag_code?: string }; vehicles?: Vehicle[]; totalVehicles?: number };
type CalendarDay = { date:string; available:boolean; loading?:boolean; total:number|null; daily:number|null; currency:string; vehicleName:string|null; evCount:number; error?:string };

const pad=(n:number)=>String(n).padStart(2,"0");
const addDays=(s:string,n:number)=>{const d=new Date(`${s}T12:00:00`);d.setDate(d.getDate()+n);return d.toISOString().slice(0,10)};
const fmt=(s:string)=>new Intl.DateTimeFormat("fr-CA",{year:"numeric",month:"short",day:"numeric"}).format(new Date(`${s}T12:00:00`));
const money=(v:unknown,c="CAD")=>Number.isFinite(Number(v))?new Intl.NumberFormat("fr-CA",{style:"currency",currency:c,maximumFractionDigits:0}).format(Number(v)):"—";
const monthLabel=(m:string)=>new Intl.DateTimeFormat("fr-CA",{month:"long",year:"numeric"}).format(new Date(`${m}-01T12:00:00`)).replace(/^./,c=>c.toUpperCase());
const shiftMonth=(m:string,delta:number)=>{const d=new Date(`${m}-01T12:00:00`);d.setMonth(d.getMonth()+delta);return `${d.getFullYear()}-${pad(d.getMonth()+1)}`};
const monthDates=(m:string)=>{const [y,mo]=m.split("-").map(Number);const last=new Date(y,mo,0).getDate();return Array.from({length:last},(_,i)=>`${y}-${pad(mo)}-${pad(i+1)}`)};
const weekday=(date:string)=>(new Date(`${date}T12:00:00`).getDay()+6)%7;

function priceClass(day:CalendarDay,min:number|null,max:number|null){if(day.loading)return "price-none";if(!day.available||day.total==null||min==null||max==null)return "price-none";if(max===min)return "price-best";const r=(day.total-min)/(max-min);if(r<=.2)return "price-best";if(r<=.45)return "price-good";if(r<=.7)return "price-mid";return "price-high";}
function initialCalendar(month:string){const today=new Date().toISOString().slice(0,10);return monthDates(month).map(date=>({date,available:false,loading:date>=today,total:null,daily:null,currency:"CAD",vehicleName:null,evCount:0,error:date<today?"Date passée":undefined})) as CalendarDay[];}

export default function Home(){
  const today=new Date().toISOString().slice(0,10);
  const [location,setLocation]=useState("Brossard, QC");
  const [startDate,setStartDate]=useState(today),[startTime,setStartTime]=useState("08:00"),[days,setDays]=useState(1);
  const [loading,setLoading]=useState(false),[calendarLoading,setCalendarLoading]=useState(false),[result,setResult]=useState<SearchResult|null>(null),[calendar,setCalendar]=useState<{month:string;days:CalendarDay[]}|null>(null);
  const [calendarMonth,setCalendarMonth]=useState(today.slice(0,7));
  const endDate=useMemo(()=>addDays(startDate,Math.max(1,days)),[startDate,days]);

  async function loadCalendar(month:string,oagCode:string){
    const initial=initialCalendar(month); setCalendar({month,days:initial}); setCalendarLoading(true);
    const dates=initial.filter(d=>d.loading).map(d=>d.date);
    const batchSize=2;
    try{
      for(let i=0;i<dates.length;i+=batchSize){
        const batch=dates.slice(i,i+batchSize);
        const responses=await Promise.all(batch.map(async date=>{
          try{
            const q=new URLSearchParams({oagCode,location:location || "Brossard",pickupDate:date,pickupTime:"08:00",dropoffDate:addDays(date,1),dropoffTime:"08:00",minAge:"30",countryCode:"CA"});
            const r=await fetch(`/api/hertz/search?${q}`,{cache:"no-store"});
            const d=await r.json();
            if(!r.ok) return {date,available:false,total:null,daily:null,currency:"CAD",vehicleName:null,evCount:0,error:d?.error||`Erreur ${r.status}`};
            const vehicles=Array.isArray(d?.vehicles)?d.vehicles:[];
            let best:any=null;
            for(const v of vehicles){const total=Number(v?.pricing?.approximate_total);if(!Number.isFinite(total))continue;const daily=Number(v?.pricing?.daily_rate);const candidate={total,daily:Number.isFinite(daily)?daily:null,currency:String(v?.pricing?.currency||"CAD"),vehicleName:String(v?.make_model||v?.vehicle_display_name||v?.vehicle_type||"Véhicule électrique")};if(!best||candidate.total<best.total)best=candidate;}
            return {date,available:Boolean(best),total:best?.total??null,daily:best?.daily??null,currency:best?.currency??"CAD",vehicleName:best?.vehicleName??null,evCount:vehicles.length};
          }catch(e){return {date,available:false,total:null,daily:null,currency:"CAD",vehicleName:null,evCount:0,error:String(e)};}
        }));
        setCalendar(cur=>{if(!cur||cur.month!==month)return cur;const map=new Map(responses.map(d=>[d.date,d as CalendarDay]));return {...cur,days:cur.days.map(day=>map.get(day.date)||day)}});
      }
    }finally{setCalendarLoading(false);}
  }

  async function search(e:FormEvent){e.preventDefault();setLoading(true);setResult(null);setCalendar(null);setCalendarMonth(startDate.slice(0,7));
    try{const q=new URLSearchParams({location,pickupDate:startDate,pickupTime:startTime,dropoffDate:endDate,dropoffTime:startTime,minAge:"30",countryCode:"CA"});const r=await fetch(`/api/hertz/search?${q}`,{cache:"no-store"});const d=await r.json();setResult(r.ok?d:{error:d?.error||"Recherche impossible."});if(r.ok&&d?.location?.oag_code)void loadCalendar(startDate.slice(0,7),d.location.oag_code);}catch(e){setResult({error:String(e)});}finally{setLoading(false);}
  }
  async function changeMonth(delta:number){if(!result?.location?.oag_code||calendarLoading)return;const next=shiftMonth(calendarMonth,delta);setCalendarMonth(next);await loadCalendar(next,result.location.oag_code)}

  const days=calendar?.days??[]; const available=days.filter(d=>d.available&&typeof d.total==="number"); const min=available.length?Math.min(...available.map(d=>d.total as number)):null; const max=available.length?Math.max(...available.map(d=>d.total as number)):null;

  return <main className="shell">
    <header className="topbar"><div><div className="eyebrow">RENTAL PRICE TRACKER</div><h1>Live rental pricing, ready to track.</h1></div><span className="status">HERTZ + PARSE · EV ONLY</span></header>
    <section className="hero"><p>Recherche une disponibilité Hertz en véhicules 100 % électriques. Le calendrier affiche le <strong>meilleur prix pour 1 jour, départ à 08:00</strong> pour chaque date.</p></section>
    <section className="panel"><form onSubmit={search}><div className="grid">
      <label><span>Lieu</span><input value={location} onChange={e=>setLocation(e.target.value)} required/></label>
      <label><span>Date de début</span><input type="date" value={startDate} onChange={e=>setStartDate(e.target.value)} required/></label>
      <label><span>Heure de début</span><input type="time" value={startTime} onChange={e=>setStartTime(e.target.value)} required/></label>
      <label><span>Nombre de jours</span><input type="number" min={1} max={60} value={days} onChange={e=>setDays(Math.max(1,Number(e.target.value)||1))} required/></label>
      <label><span>Loueur</span><input value="Hertz" readOnly/></label>
      <label><span>Date de retour</span><input value={`${fmt(endDate)} à ${startTime}`} readOnly/></label>
    </div><div className="actions"><button disabled={loading}>{loading?"Recherche en cours…":"Rechercher les prix"}</button><span>{fmt(startDate)} {startTime} → {fmt(endDate)} {startTime}</span></div></form></section>
    {result?.error&&<section className="panel error"><strong>Erreur</strong><span>{result.error}</span></section>}
    {result?.vehicles&&<section className="results"><div className="section-heading"><div><div className="eyebrow">RÉSULTATS EN DIRECT · 100 % ÉLECTRIQUES</div><h2>{result.location?.name||location}</h2><p className="muted">{result.totalVehicles??result.vehicles.length} véhicule(s) électrique(s) disponible(s)</p></div></div>
      {!result.vehicles.length?<div className="empty"><strong>Aucun véhicule 100 % électrique trouvé.</strong><span>Essaie une autre date ou une autre agence Hertz.</span></div>:<div className="vehicle-grid">{result.vehicles.map((v,i)=>{const p=v.pricing;const currency=p?.currency||"CAD";const name=v.make_model||v.vehicle_display_name||v.vehicle_type||"Véhicule électrique";return <article className="vehicle" key={`${v.sipp_code||name}-${i}`}><div className="vehicle-title">{name}</div><div className="vehicle-meta">{v.vehicle_class||v.vehicle_size||"—"} · {v.vehicle_body_type||"—"}</div><div className="vehicle-meta">SIPP {v.sipp_code||"—"} · 100 % électrique</div><div className="price-row"><strong>{money(p?.approximate_total,currency)}</strong><span>{money(p?.daily_rate,currency)} / jour</span></div><div className="details"><span>Sous-total : {money(p?.rental_subtotal,currency)}</span><span>Frais : {money(p?.fees_total,currency)}</span><span>Taxes : {money(p?.taxes_total,currency)}</span></div></article>})}</div>}
    </section>}
    {calendar&&<section className="calendar-section"><div className="calendar-head"><div><div className="eyebrow">CALENDRIER DES PRIX · 1 JOUR · DÉPART 08:00</div><h2>{monthLabel(calendarMonth)}</h2><p className="muted">Meilleur prix total estimé parmi les véhicules 100 % électriques disponibles.</p></div><div className="calendar-nav"><button type="button" onClick={()=>changeMonth(-1)} disabled={calendarLoading}>←</button><button type="button" onClick={()=>changeMonth(1)} disabled={calendarLoading}>→</button></div></div>
      <div className="legend"><span><i className="legend-dot best"/> Meilleur prix</span><span><i className="legend-dot good"/> Bon prix</span><span><i className="legend-dot mid"/> Moyen</span><span><i className="legend-dot high"/> Plus cher</span><span><i className="legend-dot none"/> En attente / aucun EV</span></div>
      <div className="calendar">{(["Lun","Mar","Mer","Jeu","Ven","Sam","Dim"] as const).map(d=><div className="weekday" key={d}>{d}</div>)}{Array.from({length:weekday(days[0].date)}).map((_,i)=><div className="calendar-blank" key={`b${i}`}/>)}{days.map(day=><button type="button" key={day.date} className={`calendar-day ${priceClass(day,min,max)}`} onClick={()=>setStartDate(day.date)} disabled={day.loading} title={day.available?`${fmt(day.date)} · ${day.vehicleName||"EV"}`:`${fmt(day.date)} · ${day.error||"Aucun EV"}`}><span className="day-number">{Number(day.date.slice(-2))}</span><strong>{day.loading?"…":day.available?money(day.total,day.currency):"—"}</strong><small>{day.loading?"Chargement":day.available?day.vehicleName:day.error==="Date passée"?"Passé":day.error||"Aucun EV"}</small></button>)}</div>
      <p className="muted calendar-footnote">{calendarLoading?"Les prix arrivent progressivement…":`${available.length} jour(s) avec au moins un véhicule électrique.`}</p>
    </section>}
    <section className="history"><div className="section-heading"><div><div className="eyebrow">NEXT</div><h2>Suivi des prix</h2></div></div><div className="empty"><strong>Le calendrier permet maintenant de repérer les meilleurs jours.</strong><span>Prochaine étape : enregistrer automatiquement ces prix chaque jour pour voir les baisses et recevoir une alerte.</span></div></section>
  </main>;
}
