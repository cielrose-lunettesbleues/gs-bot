# Sprites de la page viewers

Dépose ici les images que tu veux voir sur `/submit/:channel`, puis décris-les
dans un fichier `sprites.json` placé dans ce même dossier.

Chaque emplacement est **optionnel**. S'il est absent, la page garde le dessin
CSS d'origine. Pour retirer un asset, supprime son fichier : aucune
modification de code n'est nécessaire.

## Emplacements disponibles

| Clé | Rôle sur la page |
|-----|------------------|
| `mascot` | Personnage affiché dans l'en-tête, à droite du titre |
| `sidekick` | Second personnage, qui vole à côté du premier et dérive à son propre rythme |
| `ring` | Remplace l'anneau doré dessiné en CSS (titres, favoris, indicateur de chargement) |
| `ground` | Texture du sol défilant sous l'en-tête (se répète horizontalement) |

## Exemple de `sprites.json`

```json
{
  "mascot": { "file": "mascot.png", "frames": 8, "fps": 12, "width": 64, "height": 64 },
  "ring": { "file": "ring.png", "frames": 4, "fps": 8, "width": 16, "height": 16 },
  "ground": { "file": "ground.png", "width": 32, "height": 22 }
}
```

- `frames` : nombre d'images côte à côte dans une planche horizontale. `1` pour
  une image fixe.
- `fps` : vitesse d'animation de la planche.
- `width` / `height` : taille **d'une seule image**, en pixels.

Formats acceptés : `.png`, `.gif`, `.webp`, `.jpg`. Les noms de fichiers doivent
se limiter aux lettres, chiffres, tirets et tirets bas.

## Droits

Si tu déposes ici des images qui ne sont pas les tiennes, elles sont servies
publiquement par ton déploiement, à toute personne disposant du lien. C'est ton
appel ; la page est conçue pour que leur retrait soit immédiat et sans effet de
bord.
