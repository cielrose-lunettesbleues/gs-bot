import type { TtsVoiceSettings } from "./voiceResolver";

export interface ITtsProvider {
  synthesize(text: string, voiceId: string, settings: TtsVoiceSettings): Promise<{ audioBuffer: Buffer; mimeType: string } | null>;
}

export interface ElevenLabsError {
  status: number;
  message: string;
}

const ELEVENLABS_API = "https://api.elevenlabs.io/v1/text-to-speech";

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
      let detail = "";
      try { detail = (await res.json() as { detail?: { message?: string } }).detail?.message ?? ""; } catch { /* ignore */ }
      const messages: Record<number, string> = {
        401: "Clé API ElevenLabs invalide ou expirée (401)",
        403: "Accès refusé — vérifiez les droits de la clé API (403)",
        422: `Paramètre invalide (422)${detail ? ": " + detail : ""}`,
        429: "Quota ElevenLabs dépassé (429)",
        500: "Erreur interne ElevenLabs (500)"
      };
      this.lastError = { status: res.status, message: messages[res.status] ?? `Erreur ElevenLabs ${res.status}` };
      return null;
    }

    const arrayBuffer = await res.arrayBuffer();
    return { audioBuffer: Buffer.from(arrayBuffer), mimeType: "audio/mpeg" };
  }
}
