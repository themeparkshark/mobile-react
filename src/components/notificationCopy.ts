/**
 * Notification message cleanup (WS8). Stored rows can predate the backend
 * emoji cleanup, and some used an emoji as the break between two sentences
 * ("Kraken is attacking Magic Kingdom <emoji> Join the raid"). GameRichText
 * swaps a known emoji for his art and drops an unknown one, which ran those
 * sentences together. This puts a full stop where the emoji was doing that job:
 * after a word with no final punctuation and before a capitalised word.
 * Pure, tested in tools/tests/ws8-copy-gate.test.cjs.
 */
// ui-copy-allow(emoji): matches legacy emoji only to place punctuation; they are never rendered here
const SENTENCE_BREAK_EMOJI =
  /([\p{L}\p{N}])[ \t]*((?:(?:\p{Extended_Pictographic}|[\u{1F1E6}-\u{1F1FF}])[\u{FE0F}\u{200D}\u{1F3FB}-\u{1F3FF}\p{Extended_Pictographic}]*[ \t]*)+)(?=\p{Lu})/gu;

export function notificationMessage(text: string | null | undefined): string {
  if (!text) return '';
  return text.replace(SENTENCE_BREAK_EMOJI, (_match, last: string, emoji: string) => `${last}. ${emoji.trimEnd()} `);
}
