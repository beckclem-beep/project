# Rental Price Tracker

Version propre : recherche Hertz + EV uniquement + calendrier mensuel.

Le calendrier ne dépend d’aucune route `/api/hertz/calendar`. Chaque journée appelle directement `/api/hertz/search` avec l’OAG déjà résolu, une journée à la fois.

## Structure
- app/page.tsx — interface et calendrier
- app/api/hertz/search/route.ts — recherche Hertz, résolution agence et filtre EV
- app/globals.css — styles

## Vercel
Root Directory: `.`
Variable requise: `PARSE_API_KEY`.
