import { describe, expect, it } from "vitest";
import { resolveVoice, normalizeVoiceLabel, type TtsVoice } from "../../src/tts/voiceResolver";

const DEFAULT_SETTINGS = { stability: 0.5, similarityBoost: 0.75, style: 0.0, useSpeakerBoost: true, speed: 1.0 };

function makeVoice(overrides: Partial<TtsVoice> & { label: string; voiceId: string }): TtsVoice {
  return {
    id: 1,
    tenantId: 1,
    provider: "elevenlabs",
    isDefault: false,
    aliases: [],
    settings: DEFAULT_SETTINGS,
    ...overrides
  };
}

const CESAIRE = makeVoice({ id: 1, label: "Césaire", voiceId: "v-cesaire", isDefault: true, aliases: ["cez", "cezaire"] });
const SETT = makeVoice({ id: 2, label: "Sett", voiceId: "v-sett", aliases: ["set"] });
const JETT = makeVoice({ id: 3, label: "Jett", voiceId: "v-jett" });
const NARRATEUR = makeVoice({ id: 4, label: "Narrateur", voiceId: "v-narrateur", aliases: ["narr"] });

const VOICES = [CESAIRE, SETT, JETT, NARRATEUR];

describe("normalizeVoiceLabel", () => {
  it("lowercases and strips accents", () => {
    expect(normalizeVoiceLabel("Césaire")).toBe("cesaire");
    expect(normalizeVoiceLabel("NARRATEUR")).toBe("narrateur");
  });

  it("strips non-alphanumeric characters", () => {
    expect(normalizeVoiceLabel("je t'appelle")).toBe("jetappelle");
  });
});

describe("resolveVoice", () => {
  it("returns null for empty voice list", () => {
    expect(resolveVoice("cesaire", [])).toBeNull();
  });

  it("exact label match (step 1)", () => {
    expect(resolveVoice("Sett", VOICES)?.voiceId).toBe("v-sett");
    expect(resolveVoice("NARRATEUR", VOICES)?.voiceId).toBe("v-narrateur");
  });

  it("exact label match with accent normalization", () => {
    expect(resolveVoice("Césaire", VOICES)?.voiceId).toBe("v-cesaire");
    expect(resolveVoice("cesaire", VOICES)?.voiceId).toBe("v-cesaire");
    expect(resolveVoice("CESAIRE", VOICES)?.voiceId).toBe("v-cesaire");
  });

  it("exact alias match (step 2)", () => {
    expect(resolveVoice("cez", VOICES)?.voiceId).toBe("v-cesaire");
    expect(resolveVoice("cezaire", VOICES)?.voiceId).toBe("v-cesaire");
    expect(resolveVoice("set", VOICES)?.voiceId).toBe("v-sett");
    expect(resolveVoice("narr", VOICES)?.voiceId).toBe("v-narrateur");
  });

  it("fuzzy match with 1 typo (step 3)", () => {
    // "cesair" vs "cesaire" → distance 1
    expect(resolveVoice("cesair", VOICES)?.voiceId).toBe("v-cesaire");
    // "sett" is exact, "narateur" vs "narrateur" → 1 deletion
    expect(resolveVoice("narateur", VOICES)?.voiceId).toBe("v-narrateur");
    // "jete" vs "jett" → distance 1
    expect(resolveVoice("jete", VOICES)?.voiceId).toBe("v-jett");
  });

  it("fuzzy match with 2 typos (step 3)", () => {
    // "settt" vs "sett" → distance 1, should match
    expect(resolveVoice("settt", VOICES)?.voiceId).toBe("v-sett");
  });

  it("falls back to default voice when no match (step 4)", () => {
    expect(resolveVoice("zzzzzzzzz", VOICES)?.voiceId).toBe("v-cesaire");
  });

  it("falls back to first voice when no default (step 4)", () => {
    const noDefault = VOICES.map((v) => ({ ...v, isDefault: false }));
    expect(resolveVoice("zzzzzzzzz", noDefault)?.voiceId).toBe("v-cesaire");
  });

  it("handles empty string input by falling back to default", () => {
    expect(resolveVoice("", VOICES)?.voiceId).toBe("v-cesaire");
  });
});
