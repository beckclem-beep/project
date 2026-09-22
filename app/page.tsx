"use client";
import { useMemo, useState } from "react";

type Vehicle = { make_model?: string; vehicle_display_name?: string; sipp_code?: string; pricing?: { daily_rate?: number | string; approximate_total?: number | string; rental_subtotal?: number | string; fees_total?: number | string; taxes_total?: number | string; currency?: string; }; };
type SearchResponse = { error?: string; oagCode?: string; location?: { name?: string; city?: string; address?: string; oag_code?: string; }; vehicles?: Vehicle[]; };
type DayState = "idle" | "loading" | "ok" | "empty" | "error";
type DayResult = { date: string; status: DayState; price?: number; vehicle?: string; currency?: string; vehicles?: Vehicle[]; };

function localDate() { const d = new Date(); const y = d.getFullYear(); const m = String(d.getMonth()+1).padStart(2,"0"); const day = String(d.getDate()).padStart(2,"0"); return y+"-"+m+"-"+day; }
function parseDate(date: string) { return new Date(date+"T12:00:00"); }
function toISODate(d: Date) { const y=d.getFullYear(); const m=String(d.getMonth()+1).padStart(2,"0"); const day=String(d.getDate()).padStart(2,"0"); return y+"-"+m+"-"+day; }
function addDays(date: string, days: number) { const d=parseDate(date); d.setDate(d.getDate()+days); return toISODate(d); }
function monthKey(date: Date) { return date.getFullYear()+"-"+date.getMonth(); }
const money = (value:number, currency="CAD") => new Intl.NumberFormat("fr-CA",{style:"currency",currency,maximumFractionDigits:2}).format(value);
const sleep=(ms:number)=>new Promise(resolve=>setTimeout(resolve,ms));

function buildThreeMonths(startDate:string){
  const start=parseDate(startDate); const months=[];
  for(let offset=0;offset<3;offset++){
    const first=new Date(start.getFullYear(),start.getMonth()+offset,1);
    const last=new Date(start.getFullYear(),start.getMonth()+offset+1,0); const days=[];
    for(let day=1;day<=last.getDate();day++){ const current=new Date(first.getFullYear(),first.getMonth(),day); const date=toISODate(current); days.push({date,day,beforeStart:date<startDate}); }
    months.push({key:monthKey(first),label:new Intl.DateTimeFormat("fr-CA",{month:"long",year:"numeric"}).format(first),firstWeekday:(first.getDay()+6)%7,days});
  }
  return months;
}
function percentile(values:number[], value:number){ const sorted=[...values].sort((a,b)=>a-b); if(sorted.length<=1)return 0; const index=sorted.findIndex(v=>v>=value); return (Math.max(0,index)/(sorted.length-1))*100; }

export default function Home(){
  const [location,setLocation]=useState("Brossard");
  const [startDate,setStartDate]=useState(localDate);
  const [startTime,setStartTime]=useState("08:00");
  const [days,setDays]=useState("1");
  const [loading,setLoading]=useState(false);
  const [error,setError]=useState<string|null>(null);
  const [notice,setNotice]=useState<string|null>(null);
  const [results,setResults]=useState<Record<string,DayResult>>({});
  const [selectedDate,setSelectedDate]=useState<string|null>(null);
  const [progress,setProgress]=useState({done:0,total:0});
  const rentalDays=Math.min(30,Math.max(1,Number(days)||1));
  const endDate=useMemo(()=>addDays(startDate,rentalDays),[startDate,rentalDays]);
  const months=useMemo(()=>buildThreeMonths(startDate),[startDate]);
  const scanDates=useMemo(()=>months.flatMap(m=>m.days.filter(d=>!d.beforeStart).map(d=>d.date)),[months]);
  const loadedPrices=Object.values(results).filter(r=>r.status==="ok"&&Number.isFinite(r.price)).map(r=>r.price as number);
  const selectedResult=selectedDate?results[selectedDate]:null;
  const selectedVehicles=(selectedResult?.vehicles||[]).map(v=>({...v,total:Number(v.pricing?.approximate_total),name:v.make_model||v.vehicle_display_name||"Véhicule électrique",currency:v.pricing?.currency||"CAD"})).filter(v=>Number.isFinite(v.total)).sort((a,b)=>a.total-b.total);

  async function fetchDay(date:string,oagCode?:string|null){
    setResults(prev=>({...prev,[date]:{date,status:"loading"}}));
    const query=new URLSearchParams({location:location.trim(),pickupDate:date,pickupTime:startTime,dropoffDate:addDays(date,rentalDays),dropoffTime:startTime,minAge:"30",countryCode:"CA"});
    if(oagCode) query.set("oagCode",oagCode);

    for(let attempt=0;attempt<4;attempt++){
      try{
        const response=await fetch("/api/hertz/search?"+query.toString(),{cache:"no-store"});
        const data:SearchResponse=await response.json();
        if(response.ok){
          const vehicles=Array.isArray(data.vehicles)?data.vehicles:[];
          const valid=vehicles.map(v=>({vehicle:v,total:Number(v.pricing?.approximate_total),name:v.make_model||v.vehicle_display_name||"Véhicule électrique",currency:v.pricing?.currency||"CAD"})).filter(v=>Number.isFinite(v.total)).sort((a,b)=>a.total-b.total);
          setResults(prev=>({...prev,[date]:valid.length?{date,status:"ok",price:valid[0].total,vehicle:valid[0].name,currency:valid[0].currency,vehicles}:{date,status:"empty",vehicles:[]}}));
          return {oag:data.oagCode||data.location?.oag_code||oagCode||null,success:true};
        }

        if(response.status===429){
          const retryAfter=Number(response.headers.get("Retry-After")||"0");
          const wait=Math.max(13000,retryAfter*1000||0)*Math.pow(2,attempt);
          setNotice("Limite de requêtes atteinte par Parse. Pause de "+Math.ceil(wait/1000)+" s puis reprise automatique…");
          await sleep(wait);
          continue;
        }

        const message=data.error||"Erreur HTTP "+response.status;
        setResults(prev=>({...prev,[date]:{date,status:"error"}}));
        return {oag:oagCode||null,success:false,error:message};
      }catch(e){
        if(attempt===3){
          const message=e instanceof Error?e.message:"Erreur réseau";
          setResults(prev=>({...prev,[date]:{date,status:"error"}}));
          return {oag:oagCode||null,success:false,error:message};
        }
        await sleep(2500*(attempt+1));
      }
    }
    return {oag:oagCode||null,success:false,error:"Erreur inconnue"};
  }

  async function loadCalendar(){
    if(!location.trim()) return;
    setLoading(true); setError(null); setNotice("Analyse progressive pour éviter les limites de l’API…"); setResults({}); setSelectedDate(null); setProgress({done:0,total:scanDates.length});
    let resolvedOag:string|null=null; let successfulCount=0; let firstError:string|null=null;
    try{
      if(!scanDates.length){setError("Aucune date à analyser.");return;}
      const dates=scanDates;
      for(let i=0;i<dates.length;i++){
        // Keep a conservative cadence: the calendar uses one Parse request per date.
        if(i>0) await sleep(13000);
        const result=await fetchDay(dates[i],resolvedOag);
        if(result.success){successfulCount++; if(!resolvedOag&&result.oag) resolvedOag=result.oag;}
        else if(!firstError) firstError=result.error||"Une recherche a échoué.";
        setProgress({done:i+1,total:dates.length});
      }
      if(firstError&&successfulCount===0) setError(firstError);
      if(successfulCount>0) setNotice("Analyse terminée. Les couleurs représentent le prix relatif entre les dates trouvées.");
      else setNotice(null);
    }catch(e){setError(e instanceof Error?e.message:"Une erreur est survenue.");}
    finally{setLoading(false);}
  }

  function getPriceClass(price?:number){ if(!Number.isFinite(price)||!loadedPrices.length)return "neutral"; const p=percentile(loadedPrices,price as number); if(p<=15)return "best"; if(p<=40)return "good"; if(p<=70)return "medium"; return "high"; }

  return <main className="shell"><section className="card wide-card">
    <div className="eyebrow">RENTAL PRICE TRACKER · BASIC · EV</div>
    <h1>Hertz EV Rental</h1>
    <p className="intro">Comparez le prix total estimé d’une location EV à chaque date sur les trois prochains mois. Aucun tracking ni historique.</p>
    <div className="form">
      <label><span>Agence / ville</span><input value={location} onChange={e=>setLocation(e.target.value)} placeholder="Brossard"/></label>
      <label><span>Date de début</span><input type="date" value={startDate} onChange={e=>setStartDate(e.target.value)}/></label>
      <label><span>Heure de départ</span><input type="time" value={startTime} onChange={e=>setStartTime(e.target.value)}/></label>
      <label><span>Nombre de jours</span><input type="number" min="1" max="30" value={days} onChange={e=>setDays(e.target.value)}/></label>
      <div className="summary"><div><span>Retour prévu</span><strong>{endDate} à {startTime}</strong></div><button type="button" onClick={loadCalendar} disabled={!location.trim()||loading}>{loading?"Analyse "+progress.done+"/"+progress.total+"…":"Rechercher les prix sur 3 mois"}</button></div>
    </div>
    {error&&<div className="error">{error}</div>}
    {notice&&<div className="notice">{notice}</div>}
    {Object.keys(results).length>0&&<><div className="calendar-toolbar"><div><strong>{loadedPrices.length}</strong> dates avec un prix EV</div><div className="legend"><span><i className="dot best"/> Meilleur</span><span><i className="dot good"/> Bon</span><span><i className="dot medium"/> Moyen</span><span><i className="dot high"/> Cher</span><span><i className="dot neutral"/> Indisponible</span></div></div>
      <section className="months">{months.map(month=><article className="month-card" key={month.key}><div className="month-title">{month.label}</div><div className="weekdays">{["Lun","Mar","Mer","Jeu","Ven","Sam","Dim"].map(day=><div key={day}>{day}</div>)}</div><div className="calendar-grid">
        {Array.from({length:month.firstWeekday}).map((_,i)=><div className="blank" key={"blank-"+month.key+"-"+i}/>)}
        {month.days.map(day=>{ const result=results[day.date]; if(day.beforeStart)return <div className="day neutral past" key={day.date}><div className="day-number">{day.day}</div><div className="day-price">—</div></div>; const cls=result?.status==="ok"?getPriceClass(result.price):"neutral"; return <button type="button" key={day.date} className={"day day-button "+cls+(selectedDate===day.date?" selected":"")} onClick={()=>setSelectedDate(day.date)}><div className="day-number">{day.day}</div><div className="day-price">{result?.status==="loading"?"…":result?.status==="ok"?money(result.price||0,result.currency||"CAD"):result?.status==="empty"?"Aucun EV":result?.status==="error"?"Erreur":"—"}</div>{result?.status==="ok"&&<div className="day-vehicle">{result.vehicle}</div>}</button>; })}
      </div></article>)}</section></>}
    {selectedResult&&<section className="selected-result"><div className="results-head"><div><span className="results-label">DATE SÉLECTIONNÉE</span><h2>{selectedDate}</h2><p>{location} · {startTime} → {addDays(selectedDate||startDate,rentalDays)} à {startTime}</p></div><div className="count">{selectedVehicles.length} EV</div></div>{selectedVehicles.length===0?<div className="empty">Aucun véhicule électrique disponible.</div>:<div className="vehicle-list">{selectedVehicles.map((v,index)=><article className={"vehicle "+(index===0?"vehicle-best":"")} key={(selectedDate||"")+"-"+v.name+"-"+index}><div>{index===0&&<div className="best-badge">PRIX LE PLUS BAS</div>}<h3>{v.name}</h3><p>{v.sipp_code||"EV"} · 100 % électrique</p></div><div className="vehicle-price">{money(v.total,v.currency)}<small>total estimé</small></div></article>)}</div>}</section>}
  </section></main>;
}