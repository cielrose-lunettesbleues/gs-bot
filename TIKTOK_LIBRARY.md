# Global TikTok Library Specification

## Overview

Créer une bibliothèque globale de vidéos TikTok partagée entre tous les utilisateurs de GS Bot.

Objectif :

Créer un catalogue communautaire permettant d'obtenir des résultats instantanés sans dépendre d'une API TikTok en temps réel.

---

## Core Principle

Les vidéos sont ajoutées par la communauté.

La recherche est locale.

Aucune recherche TikTok live pendant le stream.

---

## Public Submission Page

Créer une page publique :

```txt
/library/add
```

Accessible sans connexion.

---

## Submission Form

Champs :

```txt
TikTok URL
Tags
Description
```

Exemple :

URL
https://tiktok.com/...

Tags
killua anime reaction drôle

Description
Killua qui regarde quelqu'un faire n'importe quoi

````

---

## Permissions

Tout le monde peut :

```txt
Ajouter
````

Personne ne peut :

```txt
Supprimer
```

Seul l'administrateur principal peut :

```txt
Masquer
Supprimer
Modifier
```

---

## Search Goals

La recherche doit être tolérante.

Un utilisateur ne doit PAS avoir besoin :

* du tag exact
* de la description exacte

---

## Examples

Vidéo :

```txt
Tags :
dog
animal
fail
funny

Description :
chien qui tombe dans une piscine
```

Recherche :

```txt
chien tombe
```

doit fonctionner.

Recherche :

```txt
dog pool
```

doit fonctionner.

Recherche :

```txt
animal drôle
```

doit fonctionner.

---

## Search Engine

Utiliser SQLite FTS5.

Indexer :

```txt
description
tags
normalized_keywords
```

---

## Keyword Normalization

Normaliser :

* accents
* casse
* pluriels simples
* espaces multiples

Exemple :

```txt
chiens
chien
CHIEN
```

→ même résultat

---

## Data Model

Table :

```txt
global_tiktok_videos
```

Colonnes :

```txt
id
url
canonical_url
tiktok_video_id
description
tags
normalized_keywords
status
is_hidden
play_count
created_at
updated_at
```

---

## Status

```txt
pending
approved
hidden
```

Même si V1 approuve automatiquement tout.

Prévoir le champ dès maintenant.

---

## Duplicate Detection

Empêcher les doublons.

Même URL :

```txt
refuser insertion
```

Même vidéo TikTok :

```txt
refuser insertion
```

---

## Bot Commands

Prévoir :

```txt
!gs <query>
```

La recherche doit pouvoir utiliser :

```txt
tags
description
keywords
```

sans distinction.

---

## Ranking

Le score de recherche doit prendre en compte :

```txt
match description
match tags
popularité interne
nombre de lectures
```

---

## Admin Interface

Créer :

```txt
/admin/library
```

Fonctions :

```txt
Lister
Filtrer
Masquer
Supprimer
Modifier tags
Modifier description
Fusionner doublons
```

---

## Future Extensions

Prévoir :

* synonymes
* embeddings IA
* recherche sémantique
* suggestions automatiques
* score qualité

Mais V1 doit rester :

```txt
SQLite + FTS5
```

afin de conserver simplicité, rapidité et coût nul.

---

## Performance Goal

Commande Twitch :

```txt
!gs query
```

↓

Recherche locale

↓

Résultat

↓

Overlay OBS

Objectif :

```txt
< 100 ms
```

hors temps de chargement du média.
