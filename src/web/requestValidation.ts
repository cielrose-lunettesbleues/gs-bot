import type { Context } from "hono";
import { z } from "zod";

export const setupSchema = z.object({
  clientId: z.string().trim().min(1).max(200),
  clientSecret: z.string().trim().min(1).max(200),
  redirectUri: z.string().trim().url().max(500),
  setupToken: z.string().trim().max(200).optional()
}).strict();
export type SetupBody = z.infer<typeof setupSchema>;

export const configPatchSchema = z.object({
  subOnly: z.boolean().optional(),
  modOnly: z.boolean().optional(),
  cooldownEnabled: z.boolean().optional(),
  cooldownSeconds: z.number().int().min(0).max(3600).optional(),
  approvalEnabled: z.boolean().optional(),
  durationSeconds: z.number().int().min(1).max(300).optional(),
  chatFeedback: z.boolean().optional()
}).strict();
export type ConfigPatchBody = z.infer<typeof configPatchSchema>;

export const simulateSchema = z.object({
  username: z.string().trim().max(25).optional(),
  message: z.string().trim().min(1).max(500),
  isMod: z.boolean().optional(),
  isSubscriber: z.boolean().optional()
}).strict();
export type SimulateBody = z.infer<typeof simulateSchema>;

export const ttsConfigSchema = z.object({
  ttsEnabled: z.boolean().optional(),
  ttsApiKey: z.string().trim().max(200).optional(),
  ttsVolume: z.number().min(0).max(2).optional(),
  ttsMaxLength: z.number().int().min(10).max(1000).optional(),
  ttsCooldownSeconds: z.number().int().min(0).max(3600).optional()
}).strict();
export type TtsConfigBody = z.infer<typeof ttsConfigSchema>;

export const ttsVoiceCreateSchema = z.object({
  label: z.string().trim().min(1).max(60),
  voiceId: z.string().trim().min(1).max(120),
  provider: z.string().trim().min(1).max(40).default("elevenlabs"),
  isDefault: z.boolean().optional().default(false),
  aliases: z.array(z.string().trim().min(1).max(40)).max(20).default([]),
  stability: z.number().min(0).max(1).optional(),
  similarityBoost: z.number().min(0).max(1).optional(),
  style: z.number().min(0).max(1).optional(),
  useSpeakerBoost: z.boolean().optional(),
  speed: z.number().min(0.5).max(2).optional()
}).strict();
export type TtsVoiceCreateBody = z.infer<typeof ttsVoiceCreateSchema>;

export const ttsVoiceUpdateSchema = z.object({
  stability: z.number().min(0).max(1).optional(),
  similarityBoost: z.number().min(0).max(1).optional(),
  style: z.number().min(0).max(1).optional(),
  useSpeakerBoost: z.boolean().optional(),
  speed: z.number().min(0.5).max(2).optional()
}).strict();
export type TtsVoiceUpdateBody = z.infer<typeof ttsVoiceUpdateSchema>;

export async function parseJsonBody<T>(
  c: Context,
  schema: z.ZodType<T>
): Promise<{ success: true; data: T } | { success: false; response: Response }> {
  let raw: unknown;
  try {
    raw = await c.req.json();
  } catch {
    return { success: false, response: c.json({ ok: false, error: "invalid_json" }, 400) };
  }

  const parsed = schema.safeParse(raw);
  if (!parsed.success) {
    return {
      success: false,
      response: c.json({ ok: false, error: "invalid_body", issues: parsed.error.issues }, 400)
    };
  }

  return { success: true, data: parsed.data };
}
