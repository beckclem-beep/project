# Rental Price Tracker — 3 mois

Version simplifiée :
- aucune date à saisir ;
- calendrier des 3 mois courants / suivants ;
- chaque prix = location Hertz EV de 08:00 à 08:00 le lendemain ;
- uniquement les véhicules 100 % électriques ;
- meilleur prix quotidien ;
- code couleur relatif aux prix chargés ;
- chargement progressif côté navigateur, 2 jours à la fois ;
- une seule résolution de l'agence Hertz, puis réutilisation du code OAG.

## Déploiement

Placez le contenu du ZIP directement à la racine du dépôt GitHub.

Vercel :
- Root Directory : `.`
- variable d'environnement : `PARSE_API_KEY` (déjà configurée si votre recherche actuelle fonctionne)

Aucune route `/api/hertz/calendar` n'est utilisée.
