"use client";

import { useState } from "react";

export default function Home() {
  const [location, setLocation] = useState("Brossard, QC");
  const [pickup, setPickup] = useState("");
  const [dropoff, setDropoff] = useState("");
  const [provider, setProvider] = useState("Hertz");

  return (
    <div className="page">
      <header className="header">
        <div className="headerInner">
          <div className="brand">Rental Price Tracker</div>
          <div className="badge">MVP • Connected</div>
        </div>
      </header>

      <main className="main">
        <section className="hero">
          <h1>Find the best rental price.</h1>
          <p>
            Search rental availability, compare prices and keep a history of
            the best deals — starting with Hertz in Brossard.
          </p>
        </section>

        <section className="card">
          <div className="formGrid">
            <div className="field">
              <label htmlFor="location">Location</label>
              <input id="location" value={location} onChange={(e) => setLocation(e.target.value)} />
            </div>
            <div className="field">
              <label htmlFor="pickup">Pick-up</label>
              <input id="pickup" type="date" value={pickup} onChange={(e) => setPickup(e.target.value)} />
            </div>
            <div className="field">
              <label htmlFor="dropoff">Drop-off</label>
              <input id="dropoff" type="date" value={dropoff} onChange={(e) => setDropoff(e.target.value)} />
            </div>
            <div className="field">
              <label htmlFor="provider">Rental company</label>
              <select id="provider" value={provider} onChange={(e) => setProvider(e.target.value)}>
                <option>Hertz</option>
                <option>Enterprise</option>
                <option>Budget</option>
                <option>Avis</option>
              </select>
            </div>
          </div>
          <button className="primary" type="button" onClick={() => alert("Search engine coming next.")}>Search prices</button>
        </section>

        <section className="section">
          <h2>Price history</h2>
          <div className="card empty">
            No tracked rentals yet. Once the search engine is connected,
            searches and price changes will appear here.
          </div>
        </section>
      </main>
    </div>
  );
}
