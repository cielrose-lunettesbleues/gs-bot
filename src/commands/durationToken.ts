// Viewers cap playback with a "/<seconds>" token placed anywhere in the
// command, before or after the "|" caption separator:
//   !gs <url> /10            → plays for 10s
//   !gs <url> /10 | texte    → plays for 10s, shows the caption
//   !gs <url> | texte /10    → same
// The token is removed from the input so it never reaches the caption.
const DURATION_TOKEN_RE = /(?:^|\s)\/(\d{1,4})(?=\s|$)/;

export const MAX_REQUESTED_DURATION_SECONDS = 3600;

export interface ExtractedDuration {
  /** The command input with the duration token removed. */
  input: string;
  /** Undefined when no usable token was present. */
  requestedSeconds?: number;
}

export function extractRequestedDuration(rawInput: string): ExtractedDuration {
  const match = DURATION_TOKEN_RE.exec(rawInput);
  if (!match) return { input: rawInput };

  const seconds = Number(match[1]);
  if (seconds < 1 || seconds > MAX_REQUESTED_DURATION_SECONDS) {
    return { input: rawInput };
  }

  const withoutToken = `${rawInput.slice(0, match.index)} ${rawInput.slice(match.index + match[0].length)}`;
  return { input: withoutToken.replace(/\s+/g, " ").trim(), requestedSeconds: seconds };
}
