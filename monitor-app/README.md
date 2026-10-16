# Moniteur GS Bot

Une fenêtre sans bordure, transparente et toujours au premier plan, qui montre
au streamer ce que joue sa source GS Bot dans OBS, en direct et sans le son.

Elle charge la page overlay en mode moniteur (`/overlay/<chaîne>?token=...&monitor=1`),
qui lit le flux `/overlay/<chaîne>/monitor` : les mêmes évènements qu'OBS, plus
l'état de la file et des approbations, affichés dans un bandeau en haut à gauche.
Un contour pointillé marque les bords de la source, et il passe en violet pendant une lecture.

## Lancer

```bash
cd monitor-app
npm install
npm start
```

Au premier lancement, collez l'URL de la source navigateur OBS affichée par le
dashboard. Elle est mémorisée, avec la position, la taille et l'opacité.

## Utilisation

- **Déplacer** : glisser n'importe où dans la fenêtre.
- **Clic droit** : taille (25 à 75 % de l'écran, toujours en 16:9), opacité,
  recharger, changer d'URL, quitter.
- **Ctrl+Maj+F** (ou clic droit → Plein écran) : la fenêtre couvre tout l'écran,
  barre des tâches comprise, et laisse passer les clics. Elle repasse au premier
  plan chaque seconde, donc reste au-dessus des jeux et vidéos en plein écran
  fenêtré. Un jeu en plein écran **exclusif** passe devant tout : le régler en
  « fenêtré sans bordure ».
- **Ctrl+Maj+M** : la fenêtre laisse passer les clics vers ce qui est dessous,
  ou les reprend.

La fenêtre ne réveille pas le bot : quand il dort, le bandeau affiche « Bot en veille ».
Elle n'occupe aucune des places réservées à OBS.
