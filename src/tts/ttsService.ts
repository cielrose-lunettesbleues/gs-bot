import type { Database } from "../db/database";
import { getTtsVoices } from "../db/database";
import { ElevenLabsProvider, type ITtsProvider, type ElevenLabsError } from "./elevenLabsProvider";
import { resolveVoice, type TtsVoice } from "./voiceResolver";

export interface TtsSynthResult {
  audioId: string;
  durationSeconds: number;
  errorMessage?: string;
}

export interface ITtsService {
  isEnabled(): boolean;
  getVoices(): TtsVoice[];
  synthesize(text: string, voiceLabel: string): Promise<TtsSynthResult | null>;
  getAudio(id: string): { buffer: Buffer; mimeType: string } | null;
}

interface AudioEntry {
  buffer: Buffer;
  mimeType: string;
  expiresAt: number;
}

// Mutable reference — shared with runtimeConfig.tts, mutated by persistConfig
export interface TtsLiveConfig {
  enabled: boolean;
  apiKey: string;
  maxLength: number;
  volume: number;
}

interface TtsLogger {
  info(payload: Record<string, unknown>, msg: string): void;
  warn(payload: Record<string, unknown>, msg: string): void;
  error(payload: Record<string, unknown>, msg: string): void;
}

const AUDIO_TTL_MS = 5 * 60 * 1000;
const BYTES_PER_SECOND = 16_000;

export class TtsService implements ITtsService {
  private readonly audioCache = new Map<string, AudioEntry>();

  constructor(
    private readonly db: Database,
    private readonly tenantId: number,
    /**
     * Live reference to runtimeConfig.tts — mutated in-place by persistConfig.
     * TtsService reads it on every call so API key changes take effect immediately.
     */
    private readonly liveConfig: TtsLiveConfig,
    private readonly logger: TtsLogger,
    /**
     * Provider factory — injected for testing, defaults to ElevenLabs.
     * Called per synthesis with the current API key, so key updates are hot.
     */
    private readonly providerFactory: (apiKey: string) => ITtsProvider = (key) => new ElevenLabsProvider(key)
  ) {}

  isEnabled(): boolean {
    return this.liveConfig.enabled && this.liveConfig.apiKey.length > 0;
  }

  getVoices(): TtsVoice[] {
    return getTtsVoices(this.db, this.tenantId).map((row) => ({
      id: row.id,
      tenantId: row.tenant_id,
      label: row.label,
      provider: row.provider,
      voiceId: row.voice_id,
      isDefault: Boolean(row.is_default),
      aliases: JSON.parse(row.aliases_json) as string[],
      settings: {
        stability: row.stability ?? 0.5,
        similarityBoost: row.similarity_boost ?? 0.75,
        style: row.style ?? 0.0,
        useSpeakerBoost: Boolean(row.use_speaker_boost ?? 1),
        speed: row.speed ?? 1.0
      }
    }));
  }

  async synthesize(text: string, voiceLabel: string): Promise<TtsSynthResult | null> {
    if (!this.isEnabled()) return null;

    const voices = this.getVoices();
    const voice = resolveVoice(voiceLabel, voices);
    if (!voice) {
      this.logger.warn({ tenantId: this.tenantId }, "TTS: no voices configured");
      return null;
    }

    const truncated = text.slice(0, this.liveConfig.maxLength);
    const provider = this.providerFactory(this.liveConfig.apiKey);

    let result: { audioBuffer: Buffer; mimeType: string } | null;
    try {
      result = await provider.synthesize(truncated, voice.voiceId, voice.settings);
    } catch (err) {
      this.logger.error({ err, tenantId: this.tenantId }, "TTS synthesis failed");
      return null;
    }

    if (!result) {
      const err: ElevenLabsError | null = provider instanceof ElevenLabsProvider ? provider.lastError : null;
      const msg = err?.message ?? "Erreur de synthèse TTS inconnue";
      this.logger.warn({ tenantId: this.tenantId, voiceLabel, error: msg }, "TTS provider returned null");
      return { audioId: "", durationSeconds: 0, errorMessage: msg };
    }

    const audioId = crypto.randomUUID();
    const expiresAt = Date.now() + AUDIO_TTL_MS;
    this.audioCache.set(audioId, { buffer: result.audioBuffer, mimeType: result.mimeType, expiresAt });
    this.evictExpired();

    const durationSeconds = Math.max(1, Math.ceil(result.audioBuffer.length / BYTES_PER_SECOND));
    this.logger.info(
      { tenantId: this.tenantId, voice: voice.label, bytes: result.audioBuffer.length, durationSeconds },
      "TTS audio generated"
    );

    return { audioId, durationSeconds };
  }

  getAudio(id: string): { buffer: Buffer; mimeType: string } | null {
    const entry = this.audioCache.get(id);
    if (!entry || entry.expiresAt < Date.now()) {
      this.audioCache.delete(id);
      return null;
    }
    return { buffer: entry.buffer, mimeType: entry.mimeType };
  }

  private evictExpired(): void {
    const now = Date.now();
    for (const [id, entry] of this.audioCache) {
      if (entry.expiresAt < now) this.audioCache.delete(id);
    }
  }
}

/** No-op TTS service used as a safe default before config is loaded. */
export class NullTtsService implements ITtsService {
  isEnabled(): boolean { return false; }
  getVoices(): TtsVoice[] { return []; }
  async synthesize(_text: string, _voiceLabel: string): Promise<null> { return null; }
  getAudio(_id: string): null { return null; }
}
