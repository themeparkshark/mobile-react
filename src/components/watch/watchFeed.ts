import type { SocialPostType } from '../../models/social-post-type';

/**
 * The coin thank-you is for watching, not for opening and closing: the
 * player must stay open this long (a Short is under a minute, so less).
 */
export function minWatchMs(isShort: boolean | undefined): number {
  return isShort ? 10_000 : 30_000;
}

export function earnedView(openedAt: number | null, closedAt: number, isShort: boolean | undefined): boolean {
  return openedAt !== null && closedAt - openedAt >= minWatchMs(isShort);
}

/** A video counts as NEW for its first 24 hours on the channel. */
export const NEW_WINDOW_MS = 24 * 60 * 60 * 1000;

/** Embeds are served as if from themeparkshark.com so YouTube sees a real referrer. */
export const EMBED_BASE_URL = 'https://themeparkshark.com';

const VIDEO_ID = /^[A-Za-z0-9_-]{6,20}$/;

function publishedMs(video: SocialPostType): number {
  const ms = video.published_at ? Date.parse(video.published_at) : NaN;
  return Number.isFinite(ms) ? ms : NaN;
}

export function isNewVideo(video: SocialPostType, now: number = Date.now()): boolean {
  const ms = publishedMs(video);
  if (!Number.isFinite(ms)) return false;
  const age = now - ms;
  return age >= -5 * 60 * 1000 && age < NEW_WINDOW_MS;
}

/** Newest first; videos without a date keep the server's order after dated ones. */
export function sortNewestFirst(videos: readonly SocialPostType[]): SocialPostType[] {
  return videos
    .map((video, index) => ({ video, index, ms: publishedMs(video) }))
    .sort((a, b) => {
      const aHas = Number.isFinite(a.ms);
      const bHas = Number.isFinite(b.ms);
      if (aHas && bHas && a.ms !== b.ms) return b.ms - a.ms;
      if (aHas !== bHas) return aHas ? -1 : 1;
      return a.index - b.index;
    })
    .map(entry => entry.video);
}

/** The YouTube id from the API field, or from a watch/shorts/youtu.be permalink. */
export function videoIdOf(video: SocialPostType): string | null {
  if (video.video_id && VIDEO_ID.test(video.video_id)) return video.video_id;
  const match = video.permalink?.match(/(?:[?&]v=|\/shorts\/|youtu\.be\/|\/embed\/)([A-Za-z0-9_-]{6,20})/);
  return match ? match[1] : null;
}

/** Grid cards use the 16:9 mqdefault; the featured card uses the large image. */
export function thumbnailFor(video: SocialPostType, featured: boolean): string {
  if (featured) return video.image_url;
  return video.thumbnail_url ?? video.image_url;
}

/** "12:05" or "1:02:03"; null for unknown or live (0). */
export function formatDuration(seconds: number | null | undefined): string | null {
  if (!seconds || seconds <= 0) return null;
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  const pad = (n: number) => String(n).padStart(2, '0');
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`;
}

/**
 * Kid-safe player URL: privacy-enhanced youtube-nocookie host, rel=0 (end
 * screen suggests only this channel), no annotations, no keyboard, inline.
 * Embeds never show comments.
 */
export function embedUrl(videoId: string): string {
  const params = [
    'autoplay=1',
    'playsinline=1',
    'rel=0',
    'modestbranding=1',
    'iv_load_policy=3',
    'fs=1',
    'disablekb=1',
    `origin=${encodeURIComponent(EMBED_BASE_URL)}`,
  ].join('&');
  return `https://www.youtube-nocookie.com/embed/${videoId}?${params}`;
}

export function embedHtml(videoId: string): string {
  if (!VIDEO_ID.test(videoId)) throw new Error('bad video id');
  return `<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1">
<style>html,body{margin:0;height:100%;background:#000}iframe{position:absolute;inset:0;width:100%;height:100%;border:0}</style>
</head><body><iframe src="${embedUrl(videoId)}" title="Theme Park Shark video" allow="autoplay; encrypted-media; picture-in-picture; fullscreen" allowfullscreen referrerpolicy="strict-origin-when-cross-origin"></iframe></body></html>`;
}

/**
 * Only the player page itself may load in the top frame. Taps on the YouTube
 * logo, the title or "Watch on YouTube" would open youtube.com (comments,
 * unrelated suggestions), so those are blocked; the iframe's own loads pass.
 */
export function allowPlayerNavigation(url: string, isTopFrame: boolean | undefined): boolean {
  if (isTopFrame === false) return true;
  return url === 'about:blank' || url === EMBED_BASE_URL || url === `${EMBED_BASE_URL}/` || url.startsWith('https://www.youtube-nocookie.com/embed/');
}
