# Rental Price Tracker

Application Next.js pour comparer les prix de location Hertz en temps réel.

## Fonctionnalités actuelles

- Recherche Hertz en direct via Parse
- Véhicules **100 % électriques uniquement**
- Détection EV par code SIPP/ACRISS : 4e caractère `E` ou `C`
- Prix triés du moins cher au plus cher
- Détail du total estimé, sous-total, frais et taxes
- Calendrier mensuel
- Calendrier = location de **1 jour, départ 08:00**
- 3 journées comparées en parallèle pour éviter les grosses requêtes serveur
- Une erreur sur une date n'empêche pas les autres dates de charger
- Navigation mois précédent / suivant

## Structure

```text
app/
├── api/
│   └── hertz/
│       └── search/
│           └── route.ts
├── globals.css
├── layout.tsx
└── page.tsx
package.json
tsconfig.json
vercel.json
next-env.d.ts
README.md
```

## Déploiement GitHub → Vercel

Le contenu de ce dossier doit être placé à la racine du repository GitHub.

Sur Vercel, `Root Directory` doit rester vide / racine du repository.

## Variable d'environnement

Vercel doit contenir :

`PARSE_API_KEY`

Aucune clé API ne doit être ajoutée dans le code client.
