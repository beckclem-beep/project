# Rental Price Tracker

Version propre et complète.

## Structure

- `app/page.tsx` — interface, recherche, calendrier
- `app/api/hertz/search/route.ts` — recherche principale Hertz + filtre EV
- `app/api/hertz/calendar-day/route.ts` — prix d'une journée à 08:00
- `app/globals.css` — styles

## Vercel

Root Directory: `.`

Variable requise: `PARSE_API_KEY`.
