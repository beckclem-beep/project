# Rental Price Tracker

Next.js + Vercel app connected to Parse/Hertz.

Current behavior:
- Hertz live availability lookup
- 100% battery-electric vehicles only
- EV detection uses the 4th character of the ACRISS/SIPP code: E or C
- Results sorted by estimated total price
- Parses pricing from `pricing.daily_rate`, `pricing.approximate_total`, `pricing.rental_subtotal`, `pricing.fees_total`, and `pricing.taxes_total`

Required Vercel environment variable:
- `PARSE_API_KEY`

## Calendrier des prix

Le calendrier compare chaque date du mois pour une location de 1 jour avec départ à 08:00, en ne conservant que les véhicules 100 % électriques (SIPP fuel code E/C). La couleur de chaque journée est calculée par rapport aux prix disponibles du mois : vert = meilleur prix, puis bon/moyen/plus cher, gris = aucun EV disponible.
