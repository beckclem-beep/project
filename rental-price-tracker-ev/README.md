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
