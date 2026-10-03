/**
 * Preview build only (claude/dustin-preview): the production API still runs the
 * old threads rules. Posts, titles and replies need at least 10 characters
 * there (StoreThreadRequest, StoreCommentRequest), so the composer says so up
 * front instead of failing with a 422 after Send.
 */
import { DRAFT_LINES, checkDraft, titleFrom, type DraftProblem } from './socialModel';

export const PROD_MIN_CHARS = 10;

export type ProdDraftProblem = DraftProblem | 'too_short';

export const PROD_DRAFT_LINES: Readonly<Record<ProdDraftProblem, string>> = {
  ...DRAFT_LINES,
  too_short: 'A little more, please! Use at least 10 letters.',
};

export function prodCheckDraft(text: string, max: number): ProdDraftProblem | null {
  const problem = checkDraft(text, max);
  if (problem) return problem;
  return text.trim().length < PROD_MIN_CHARS ? 'too_short' : null;
}

/** The old server titles need 10+ characters: a short first line falls back to the whole post on one line. */
export function prodTitleFrom(text: string): string {
  const title = titleFrom(text);
  if (title.length >= PROD_MIN_CHARS) return title;
  const flat = text.trim().replace(/\s+/g, ' ');
  return flat.length > 140 ? `${flat.slice(0, 137)}...` : flat;
}

/** Old posts on the production API carry a separate title and body: show both, unless the title is just the body's first line. */
export function postText(thread: { readonly title?: string | null; readonly content?: string | null }): string {
  const title = (thread.title ?? '').trim();
  const content = (thread.content ?? '').trim();
  if (!content) return title;
  if (!title || content.startsWith(title.replace(/\.\.\.$/, ''))) return content;
  return `${title}\n${content}`;
}
