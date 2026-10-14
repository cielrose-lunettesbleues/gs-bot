import { addBannedWord, listBannedWords, removeBannedWord, type Database } from "../db/database";

export interface IBannedWordsService {
  /** The offending word when the text carries one, otherwise null. */
  find(text: string): string | null;
  add(word: string): boolean;
  remove(word: string): boolean;
  list(): string[];
}

/**
 * Lowercases, drops accents and collapses spacing, so "CONNERIE", "connerie"
 * and "cônnerie" all meet as the same thing. Applied both when a word is stored
 * and when a text is checked, so the two sides always compare alike.
 */
export function normaliseText(text: string): string {
  return text
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

export class BannedWordsService implements IBannedWordsService {
  constructor(private readonly db: Database, private readonly userId: number) {}

  // Recherche par inclusion plutôt que par mot entier: un pluriel ou un mot
  // accolé doit être attrapé. En contrepartie un mot court peut se retrouver
  // dans un mot innocent, ce qui se règle en bannissant des mots assez longs.
  find(text: string): string | null {
    const haystack = normaliseText(text);
    if (!haystack) return null;

    for (const word of listBannedWords(this.db, this.userId)) {
      if (word && haystack.includes(word)) return word;
    }
    return null;
  }

  add(word: string): boolean {
    const normalised = normaliseText(word);
    if (!normalised) return false;
    return addBannedWord(this.db, this.userId, normalised);
  }

  remove(word: string): boolean {
    const normalised = normaliseText(word);
    if (!normalised) return false;
    return removeBannedWord(this.db, this.userId, normalised);
  }

  list(): string[] {
    return listBannedWords(this.db, this.userId);
  }
}
