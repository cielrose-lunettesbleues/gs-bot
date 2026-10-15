import type { Command, CommandDependencies } from "./types";
import type { TtsPlaybackEvent } from "../queue/playbackQueue";
import { resolveMediaUrl } from "../media/urlResolver";
import { extractRequestedDuration } from "./durationToken";

function buildTtsGenerate(
  deps: CommandDependencies,
  caption: string | undefined,
  voiceLabel: string | undefined,
  rawChannel: string
): (() => Promise<TtsPlaybackEvent | null>) | undefined {
  if (!deps.ttsService?.isEnabled() || !caption) return undefined;
  const channel = (deps.channelLogin || rawChannel.replace(/^#/, "")).toLowerCase();
  const text = caption;
  const voice = voiceLabel ?? "";
  return async () => {
    const result = await deps.ttsService!.synthesize(text, voice);
    if (!result) return null;
    return {
      type: "tts" as const,
      text,
      audioUrl: deps.createTtsAudioPath
        ? deps.createTtsAudioPath(channel, result.audioId)
        : `/tts/audio/${channel}/${result.audioId}`,
      durationSeconds: result.durationSeconds
    };
  };
}

const URL_RE = /^https?:\/\//i;
const GIF_URL_RE = /\.gif(\?.*)?$/i;
const YOUTUBE_URL_RE = /(?:youtube\.com|youtu\.be)\//i;

/** Media with no end we can know of gets a short pass rather than the tenant length. */
export /** Length of the clip an editor trim describes, when it describes one. */
function clipSeconds(p?: { startSeconds?: number; endSeconds?: number }): number | undefined {
  if (!p || p.endSeconds === undefined) return undefined;
  const span = p.endSeconds - (p.startSeconds ?? 0);
  return span > 0 ? Math.round(span) : undefined;
}

const UNTIMED_DEFAULT_SECONDS = 10;

function isGifUrl(url: string): boolean {
  return GIF_URL_RE.test(url);
}

function isYoutubeUrl(url: string): boolean {
  return YOUTUBE_URL_RE.test(url);
}

export function createGreenScreenCommand(
  deps: CommandDependencies,
  commandName: string,
  aliases: string[] = []
): Command {
  return {
    name: commandName,
    aliases,
    async execute(context, args) {
      if (deps.adminService && args[0] && deps.adminService.isAdminKeyword(args[0])) {
        await deps.adminService.execute(context, args);
        return;
      }

      // A "/<seconds>" cut may sit anywhere, before or after the "|"
      const { input: commandInput, requestedSeconds } = extractRequestedDuration(args.join(" "));

      // Split on "|" to extract: <media query> | <tts text> | <voice>
      const pipeParts = commandInput.split("|").map((s) => s.trim());
      const mainInput = pipeParts[0] ?? "";
      const caption = pipeParts[1] || undefined;
      const voiceLabel = pipeParts[2] || undefined;

      const mainArgs = mainInput ? mainInput.split(/\s+/) : [];

      const feedback = deps.config.playback.chatFeedback !== false;

      const firstArg = mainArgs[0];
      if (!firstArg) {
        // Bare command: hand out the viewer page rather than a usage line, so
        // nobody has to type a URL in chat.
        const link = deps.submitUrl?.();
        if (feedback) {
          await context.reply(
            link
              ? `@${context.user.username} Envoie ta vidéo ici : ${link}`
              : `@${context.user.username} Usage : ${commandName} <url> ou ${commandName} <mots clés> [| texte]`
          );
        }
        return;
      }

      // Le texte part à l'écran et dans la voix de synthèse: il est filtré
      // avant toute résolution, qui coûterait un crédit pour rien.
      const bannedWord = caption ? deps.bannedWordsService?.find(caption) : null;
      if (bannedWord) {
        await context.reply(`@${context.user.username} Texte refusé : il contient un mot interdit.`);
        deps.logger.warn(
          { username: context.user.username, word: bannedWord },
          "Caption refused for a banned word"
        );
        return;
      }

      if (deps.blacklistService.isBlocked(context.user.username)) {
        await context.reply(`@${context.user.username} Vous n'êtes pas autorisé à utiliser cette commande.`);
        deps.logger.warn({ username: context.user.username }, "Blacklisted user attempted command");
        return;
      }

      const permissionDecision = deps.permissionService.canUseGreenScreen(context.user, deps.config.access);
      if (!permissionDecision.allowed) {
        await context.reply(`@${context.user.username} Permission refusée.`);
        deps.logger.warn({ user: context.user.username, reason: permissionDecision.reason }, "Permission denied");
        return;
      }

      const cooldownDecision = deps.cooldownService.checkAndConsume(
        deps.config.cooldown,
        context.user.username
      );
      if (!cooldownDecision.allowed) {
        await context.reply(
          `@${context.user.username} Commande en cooldown (${cooldownDecision.retryAfterSeconds}s).`
        );
        return;
      }

      let videoUrl: string;
      let playDuration = deps.config.playback.durationSeconds;
      let portrait: boolean | undefined;
      let cutAfterSeconds: number | undefined;
      // Vrai seulement quand la longueur réelle du média a été obtenue, et non
      // héritée de la durée de lecture du tenant.
      let durationKnown = false;

      if (URL_RE.test(firstArg)) {
        // ── URL mode ────────────────────────────────────────────────────────
        const urlDecision = deps.urlValidator.validate(firstArg, deps.config.validation);
        if (!urlDecision.valid) {
          await context.reply(`@${context.user.username} URL non autorisée.`);
          return;
        }

        if (/tiktok\.com/i.test(firstArg)) {
          if (!deps.tiktokResolve) {
            await context.reply(`@${context.user.username} Résolution TikTok non configurée.`);
            return;
          }
          if (feedback) await context.reply(`@${context.user.username} Résolution TikTok en cours...`);
          const resolved = await deps.tiktokResolve(firstArg);
          if (!resolved) {
            await context.reply(`@${context.user.username} Impossible de résoudre cette URL TikTok.`);
            return;
          }
          videoUrl = resolved.url;
          playDuration = resolved.durationSeconds || playDuration;
          durationKnown = resolved.durationSeconds > 0;
          portrait = resolved.portrait;
        } else if (/instagram\.com/i.test(firstArg)) {
          if (!deps.instagramResolve) {
            await context.reply(`@${context.user.username} Résolution Instagram non configurée.`);
            return;
          }
          if (feedback) await context.reply(`@${context.user.username} Résolution Instagram en cours...`);
          const resolved = await deps.instagramResolve(firstArg);
          if (!resolved) {
            await context.reply(`@${context.user.username} Impossible de résoudre cette URL Instagram.`);
            return;
          }
          // A requested cut makes the length of the source irrelevant
          const maxDuration = deps.config.validation.maxDurationSeconds;
          if (!requestedSeconds && maxDuration > 0 && resolved.durationSeconds > maxDuration) {
            await context.reply(`@${context.user.username} Vidéo trop longue (${resolved.durationSeconds}s).`);
            return;
          }
          videoUrl = resolved.url;
          playDuration = resolved.durationSeconds || playDuration;
          durationKnown = resolved.durationSeconds > 0;
          portrait = resolved.portrait;
        } else {
          videoUrl = await resolveMediaUrl(firstArg);

          if (deps.youtubeDurationValidator) {
            const durationCheck = await deps.youtubeDurationValidator.check(firstArg);
            if (!durationCheck.allowed) {
              if (durationCheck.reason === "video_not_found") {
                await context.reply(`@${context.user.username} Vidéo introuvable.`);
              } else {
                await context.reply(
                  `@${context.user.username} Vidéo trop longue (${durationCheck.durationSeconds ?? "?"}s).`
                );
              }
              return;
            }
          }

          // Une longueur réelle vaut mieux qu'un passage court arbitraire: elle
          // laisse la vidéo aller jusqu'à sa fin. L'appel coûte un crédit, donc
          // on s'en passe dès qu'une durée a été demandée à la main.
          if (!requestedSeconds && isYoutubeUrl(videoUrl) && deps.youtubeDuration) {
            const seconds = await deps.youtubeDuration(videoUrl);
            if (seconds && seconds > 0) {
              playDuration = seconds;
              durationKnown = true;
            }
          }
        }
      } else {
        // ── Search mode ─────────────────────────────────────────────────────
        const hasGif = args.some((a) => a.toLowerCase() === "gif");

        if (hasGif) {
          // ── GIF search via Tenor ───────────────────────────────────────
          if (!deps.gifSearch) {
            await context.reply(`@${context.user.username} Recherche GIF non configurée (clé Tenor manquante).`);
            return;
          }
          const gifQuery = mainArgs.filter((a) => a.toLowerCase() !== "gif").join(" ").trim();
          if (!gifQuery) {
            await context.reply(`@${context.user.username} Usage : ${commandName} gif <mots clés>`);
            return;
          }
          if (feedback) await context.reply(`@${context.user.username} Recherche GIF en cours...`);
          const gifResult = await deps.gifSearch(gifQuery);
          if (!gifResult) {
            if (feedback) await context.reply(`@${context.user.username} Aucun GIF trouvé pour "${gifQuery}".`);
            return;
          }
          videoUrl = gifResult.url;
          deps.logger.info(
            { username: context.user.username, query: gifQuery, url: videoUrl, title: gifResult.title },
            "Tenor GIF search result found"
          );
        } else {
          // ── Video search via YouTube ───────────────────────────────────
          if (!deps.youtubeSearch) {
            await context.reply(`@${context.user.username} Recherche vidéo non configurée.`);
            return;
          }
          const query = mainArgs.join(" ");
          if (feedback) await context.reply(`@${context.user.username} Recherche en cours...`);
          const searchResult = await deps.youtubeSearch(query, deps.config.validation.maxDurationSeconds);
          if (!searchResult) {
            if (feedback) await context.reply(`@${context.user.username} Aucune vidéo trouvée pour "${query}".`);
            return;
          }
          videoUrl = searchResult.url;
          playDuration = searchResult.durationSeconds;
          // La recherche connaît la longueur réelle de la vidéo
          durationKnown = searchResult.durationSeconds > 0;
          portrait = searchResult.portrait;
          deps.logger.info(
            { username: context.user.username, query, url: videoUrl, title: searchResult.title, durationSeconds: playDuration },
            "Video search result found"
          );
        }
      }

      const maxRequestable = deps.config.validation.maxDurationSeconds;
      const capped = (seconds: number) => (maxRequestable > 0 ? Math.min(seconds, maxRequestable) : seconds);

      // ── Sans longueur connue, la durée vidéo du tenant ne veut rien dire ──
      // Un GIF boucle, et une URL YouTube collée n'apporte aucune durée: dans
      // les deux cas on s'en tient à un passage court plutôt qu'à un réglage
      // pensé pour des vidéos dont on connaît la fin.
      if (!requestedSeconds && (isGifUrl(videoUrl) || (!durationKnown && isYoutubeUrl(videoUrl)))) {
        playDuration = capped(UNTIMED_DEFAULT_SECONDS);
      }

      // Même connue, une longueur reste bornée par le plafond du tenant
      if (durationKnown) {
        playDuration = capped(playDuration);
      }

      // ── Requested cut overrides the resolved length ──────────────────────
      // Capped by the tenant maximum; the chat feedback shows what was applied.
      if (requestedSeconds) {
        playDuration = capped(requestedSeconds);
        cutAfterSeconds = playDuration;
      }

      // ── A trim chosen in the editor is the most specific length there is ──
      // It says where the clip starts and ends, so it wins over both the
      // source's own length and a "/<seconds>" asked for alongside it.
      const presentation = context.presentation;
      const trimmed = clipSeconds(presentation);
      if (trimmed) {
        playDuration = capped(trimmed);
        cutAfterSeconds = playDuration;
      }

      // ── Build TTS generator (called at actual play time) ─────────────────
      const ttsGenerate = buildTtsGenerate(deps, caption, voiceLabel, context.channel);

      // ── Approval / enqueue ───────────────────────────────────────────────
      if (deps.approvalService?.config.enabled && !context.user.isMod) {
        await deps.approvalService.submit(
          {
            url: videoUrl,
            durationSeconds: playDuration,
            username: context.user.username,
            caption,
            portrait,
            cutAfterSeconds,
            presentation,
            ttsGenerate,
            userReply: context.reply
          },
          context.reply
        );
        return;
      }

      const result = await deps.queue.enqueue({
        url: videoUrl,
        durationSeconds: playDuration,
        username: context.user.username,
        caption,
        portrait,
        cutAfterSeconds,
        presentation,
        reply: context.reply,
        ttsGenerate
      });

      if (feedback) {
        switch (result.status) {
          case "playing":
            await context.reply(`@${context.user.username} En cours (${playDuration}s).`);
            break;
          case "queued":
            await context.reply(`@${context.user.username} En attente (position ${result.position}).`);
            break;
          case "replaced":
            await context.reply(`@${context.user.username} URL remplacée.`);
            break;
          case "dropped":
            await context.reply(
              result.reason === "full"
                ? `@${context.user.username} File d'attente pleine.`
                : `@${context.user.username} Commande en cours, réessayez plus tard.`
            );
            return;
        }
      } else if (result.status === "dropped") {
        return;
      }

      deps.historyService.record({
        username: context.user.username,
        url: videoUrl,
        durationSeconds: playDuration
      });

      deps.logger.info(
        { username: context.user.username, command: commandName, url: videoUrl, queueStatus: result.status },
        "Green screen command executed"
      );
    }
  };
}
