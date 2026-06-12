export interface ITtsProvider {
  synthesize(text: string, voiceId: string): Promise<{ audioBuffer: Buffer; mimeType: string } | null>;
}

const ELEVENLABS_API = "https://api.elevenlabs.io/v1/text-to-speech";

export class ElevenLabsProvider implements ITtsProvider {
  constructor(private readonly apiKey: string) {}

  async synthesize(text: string, voiceId: string): Promise<{ audioBuffer: Buffer; mimeType: string } | null> {
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
          voice_settings: { stability: 0.5, similarity_boost: 0.75 }
        })
      });
    } catch {
      return null;
    }

    if (!res.ok) return null;

    const arrayBuffer = await res.arrayBuffer();
    return { audioBuffer: Buffer.from(arrayBuffer), mimeType: "audio/mpeg" };
  }
}
