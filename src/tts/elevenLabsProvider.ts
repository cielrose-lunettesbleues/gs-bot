import type { TtsVoiceSettings } from "./voiceResolver";

export interface ITtsProvider {
  synthesize(text: string, voiceId: string, settings: TtsVoiceSettings): Promise<{ audioBuffer: Buffer; mimeType: string } | null>;
}

export interface ElevenLabsError {
  status: number;
  message: string;
}

const ELEVENLABS_API = "https://api.elevenlabs.io/v1/text-to-speech";

/**
 * Extract a human-readable reason from an ElevenLabs error response.
 * ElevenLabs returns `detail` in several shapes depending on the error:
 *   - object:  { detail: { status: "voice_not_found", message: "..." } }
 *   - string:  { detail: "..." }
 *   - array:   { detail: [{ loc: [...], msg: "...", type: "..." }] }  (validation)
 * Falls back to the raw body text when JSON parsing fails.
 */
async function extractErrorDetail(res: Response): Promise<string> {
  let raw: string;
  try {
    raw = await res.text();
  } catch {
    return "";
  }
  if (!raw) return "";

  let body: unknown;
  try {
    body = JSON.parse(raw);
  } catch {
    return raw.slice(0, 300);
  }

  const detail = (body as { detail?: unknown }).detail;
  if (typeof detail === "string") return detail;
  if (Array.isArray(detail)) {
    return detail
      .map((d) => (d as { msg?: string }).msg)
      .filter(Boolean)
      .join("; ");
  }
  if (detail && typeof detail === "object") {
    const d = detail as { status?: string; message?: string };
    return [d.status, d.message].filter(Boolean).join(": ");
  }
  return "";
}

export class ElevenLabsProvider implements ITtsProvider {
  public lastError: ElevenLabsError | null = null;

  constructor(private readonly apiKey: string) {}

  async synthesize(
    text: string,
    voiceId: string,
    settings: TtsVoiceSettings
  ): Promise<{ audioBuffer: Buffer; mimeType: string } | null> {
    this.lastError = null;
    let res: Response;
    try {
      res = await fetch(`${ELEVENLABS_API}/${encodeURIComponent(voiceId)}`, {
        method: "POST",
        headers: {
          "xi-api-key": this.apiKey,
          "Content-Type": "application/json",
          Accept: "audio/mpeg"
        },
        body: JSON.stringify({
          text,
          model_id: "eleven_multilingual_v2",
          voice_settings: {
            stability: settings.stability,
            similarity_boost: settings.similarityBoost,
            style: settings.style,
            use_speaker_boost: settings.useSpeakerBoost,
            speed: settings.speed
          }
        })
      });
    } catch (err) {
      this.lastError = { status: 0, message: `Réseau inaccessible : ${String(err)}` };
      return null;
    }

    if (!res.ok) {
      const detail = await extractErrorDetail(res);
      const suffix = detail ? ` : ${detail}` : "";
      const messages: Record<number, string> = {
        400: `Requête invalide (400)${suffix}`,
        401: "Clé API ElevenLabs invalide ou expirée (401)",
        403: "Accès refusé — vérifiez les droits de la clé API (403)",
        404: `Voix introuvable (404)${suffix}`,
        422: `Paramètre invalide (422)${suffix}`,
        429: "Quota ElevenLabs dépassé (429)",
        500: "Erreur interne ElevenLabs (500)"
      };
      this.lastError = {
        status: res.status,
        message: messages[res.status] ?? `Erreur ElevenLabs ${res.status}${suffix}`
      };
      return null;
    }

    const arrayBuffer = await res.arrayBuffer();
    return { audioBuffer: Buffer.from(arrayBuffer), mimeType: "audio/mpeg" };
  }
}
