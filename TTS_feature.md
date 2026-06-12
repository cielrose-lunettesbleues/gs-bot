# TTS Feature Specification

## Overview

Ajouter un système de Text-To-Speech (TTS) multi-tenant basé sur ElevenLabs.

Chaque streamer peut connecter sa propre clé API ElevenLabs et définir plusieurs voix personnalisées.

Le TTS doit être intégré au flux actuel du bot afin que les messages soient :

1. Affichés dans l'overlay OBS
2. Lus vocalement par ElevenLabs
3. Joués dans l'overlay synchronisé avec le média affiché

---

## Goals

Permettre aux viewers de déclencher :

```txt
!tts <media query> | <message> | <voice>
```

ou

```txt
!gs <media query> | <message> | <voice>
```

avec lecture TTS et affichage du texte dans l'overlay.

---

## User Experience

### Exemple 1

```txt
!gs gif killua | comment je me sens | césaire
```

Résultat :

* Recherche du GIF "killua"
* Affichage du GIF dans OBS
* Affichage du texte :

```txt
Comment je me sens
```

* Lecture TTS avec la voix "Césaire"

---

### Exemple 2

```txt
!tts ooh maitre gims | dégouté | cez
```

Résultat :

* Recherche de la vidéo "ooh maitre gims"
* Lecture de la vidéo
* Affichage du texte :

```txt
Dégouté
```

* Lecture TTS avec la voix "Césaire"

---

## Voice System

Chaque tenant possède :

```txt
ElevenLabs API Key
```

et une liste de voix.

Exemple :

```txt
Césaire
Sett
Jett
Narrateur
```

---

## Voice Aliases

Le système doit être extrêmement permissif.

Toutes les variantes suivantes doivent résoudre vers :

```txt
Césaire
```

Exemples :

```txt
cez
cesaire
césaire
Césaire
CESAIRE
cesair
cezaire
```

Même logique pour toutes les voix.

---

## Voice Resolution Rules

### Step 1

Normaliser :

* lowercase
* suppression accents
* trim
* suppression caractères spéciaux

Exemple :

```txt
"Césaire"
↓
"cesaire"
```

---

### Step 2

Recherche alias exact.

---

### Step 3

Recherche fuzzy.

Tolérance légère :

```txt
cesair
sett
narateur
jete
```

doivent être acceptés.

Utiliser distance de Levenshtein.

---

### Step 4

Fallback.

Si aucune voix n'est reconnue :

```txt
default_voice = Césaire
```

Toujours jouer une voix.

Ne jamais échouer.

---

## Database

Nouvelle table :

```txt
tenant_tts_voices
```

Colonnes :

```txt
id
tenant_id
label
provider
voice_id
is_default
aliases_json
created_at
```

---

## Tenant Configuration

Nouvelle configuration :

```txt
tts_enabled
tts_provider
tts_api_key
tts_volume
tts_max_length
tts_cooldown_seconds
```

---

## Overlay Events

Ajouter :

```ts
{
  type: "tts",
  text: string,
  audioUrl: string,
  durationSeconds: number
}
```

L'overlay doit :

* afficher le texte
* jouer l'audio
* masquer le texte à la fin

---

## New Services

Créer :

```txt
src/tts/
  ttsService.ts
  elevenLabsProvider.ts
  voiceResolver.ts
```

---

## Requirements

* Multi-tenant
* Compatible architecture actuelle
* Compatible PlaybackQueue
* Compatible OverlayBroadcaster
* Aucun blocage de thread
* Gestion erreurs ElevenLabs
* Fallback voix par défaut

---

## Future Extensions

Prévoir :

```txt
Google TTS
XTTS
OpenAI TTS
```

via architecture provider-based.
