import type { SocialPostType } from '../../models/social-post-type';

/**
 * The coin thank-you is for watching, not for opening and closing: the
 * player must stay open this long (a Short is under a minute, so less).
 */
export function minWatchMs(isShort: boolean | undefined): number {
  return isShort ? 10_000 : 30_000;
}

/** Coins are earned by time actually playing (ads and pauses excluded), or by finishing. */
/**
 * Up next for the player: unwatched videos first (newest first), then the
 * rest, never the one playing. `watched` is the page's view of each video.
 */
export function upNextFor(
  current: SocialPostType,
  videos: readonly SocialPostType[],
  watched: (post: SocialPostType) => boolean,
  limit = 6,
): SocialPostType[] {
  const rest = videos.filter(v => v.id !== current.id).map(v => ({ ...v, has_watched: watched(v) }));
  return [...rest.filter(v => !v.has_watched), ...rest.filter(v => v.has_watched)].slice(0, limit);
}

/**
 * Coins and save failures waiting to be shown. Every save, whenever it lands
 * (a switch, a close, a quiet retry), adds to the bank; the bank is shown
 * only when no player or dialog is up, so nothing is dropped or stacked.
 */
export type RewardBank = { readonly coins: number; readonly unsaved: boolean };

export const EMPTY_BANK: RewardBank = { coins: 0, unsaved: false };

export function bankResult(bank: RewardBank, result: number | null): RewardBank {
  return result === null ? { ...bank, unsaved: true } : { ...bank, coins: bank.coins + result };
}

/** What to show next: the reward first, then the "not saved" note. */
export function nextBankDialog(bank: RewardBank, busy: boolean): 'reward' | 'unsaved' | null {
  if (busy) return null;
  if (bank.coins > 0) return 'reward';
  if (bank.unsaved) return 'unsaved';
  return null;
}

/** Only a 403 means "already paid"; offline and server errors keep the coins on offer. */
export function viewFailureKind(error: unknown): 'already-paid' | 'retry' {
  const status = (error as { response?: { status?: number } } | null)?.response?.status;
  return status === 403 ? 'already-paid' : 'retry';
}

export function earnedView(playedMs: number, ended: boolean, isShort: boolean | undefined): boolean {
  return ended || playedMs >= minWatchMs(isShort);
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

/** Player settings: privacy-enhanced host, rel=0 (end screen only from this channel), no annotations, no keyboard, inline. */
export const PLAYER_VARS = {
  autoplay: 1,
  playsinline: 1,
  rel: 0,
  modestbranding: 1,
  iv_load_policy: 3,
  fs: 1,
  disablekb: 1,
  cc_load_policy: 0,
  origin: EMBED_BASE_URL,
} as const;

export const PLAYER_HOST = 'https://www.youtube-nocookie.com';

/**
 * The player page. It drives the official IFrame Player API so the app
 * hears the real events: "ready" when the player can play (the spinner waits
 * for this, not for the page), "state" for playing/paused/buffering, "ended",
 * and "blocked" when an end-screen or card tap tried to switch videos (the
 * player is put back on the chosen video). Embeds never show comments.
 */
export function playerHtml(videoId: string): string {
  if (!VIDEO_ID.test(videoId)) throw new Error('bad video id');
  const vars = JSON.stringify(PLAYER_VARS);
  return `<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no">
<style>html,body{margin:0;height:100%;background:#000;overflow:hidden}#p{position:absolute;inset:0;width:100%;height:100%}</style>
</head><body><div id="p"></div><script>
var VID=${JSON.stringify(videoId)},player=null,readySent=false;
function post(m){try{window.ReactNativeWebView.postMessage(JSON.stringify(m));}catch(e){}}
window.onYouTubeIframeAPIReady=function(){
 player=new YT.Player('p',{host:${JSON.stringify(PLAYER_HOST)},videoId:VID,width:'100%',height:'100%',playerVars:${vars},
  events:{
   onReady:function(e){readySent=true;post({type:'ready'});try{e.target.playVideo();}catch(x){}},
   onStateChange:function(e){
    var d={};try{d=player.getVideoData()||{};}catch(x){}
    if(d.video_id&&d.video_id!==VID){try{player.cueVideoById(VID);}catch(x){}post({type:'blocked'});return;}
    if(e.data===0){post({type:'ended'});return;}
    post({type:'state',state:e.data});
   },
   onError:function(e){post({type:'error',code:e.data});}
  }});
};
window.tpsReplay=function(){try{player.seekTo(0,true);player.playVideo();}catch(x){}};
window.tpsPause=function(){try{player.pauseVideo();}catch(x){}};
var t=document.createElement('script');t.src='https://www.youtube.com/iframe_api';t.onerror=function(){post({type:'error',code:'api'});};document.head.appendChild(t);
setTimeout(function(){if(!readySent)post({type:'error',code:'timeout'});},20000);
</script></body></html>`;
}

export type PlayerMessage =
  | { type: 'ready' }
  | { type: 'state'; state: number }
  | { type: 'ended' }
  | { type: 'blocked' }
  | { type: 'error'; code: string | number };

export function parsePlayerMessage(data: string): PlayerMessage | null {
  try {
    const msg = JSON.parse(data) as { type?: unknown };
    if (msg && typeof msg.type === 'string' && ['ready', 'state', 'ended', 'blocked', 'error'].includes(msg.type)) {
      return msg as PlayerMessage;
    }
  } catch { /* not ours */ }
  return null;
}

/** YouTube player states. */
export const PLAYING = 1;
export const PAUSED = 2;

/** Hosts the player's own frames come from. Nothing else may load a frame. */
const FRAME_HOSTS = ['www.youtube-nocookie.com', 'www.youtube.com'];

function hostOf(url: string): string | null {
  const m = url.match(/^https:\/\/([^/?#:]+)(?:[/?#]|$)/i);
  return m ? m[1].toLowerCase() : null;
}

/**
 * Navigation allowlist for the player WebView.
 * - Top frame: only our player page (about:blank or the themeparkshark.com
 *   base it is served under). The YouTube logo, title, "Watch on YouTube",
 *   channel avatar and ad click-throughs would all open other pages
 *   (comments, unrelated suggestions, advertiser sites), so they are blocked.
 * - Frames: only the YouTube embed itself (youtube-nocookie.com/embed or
 *   youtube.com/embed) and blank/srcdoc frames. Ad landing pages, sign-in,
 *   and any other site cannot load even as a frame.
 * Media and script fetches are not navigations and are unaffected.
 */
export function allowPlayerNavigation(url: string, isTopFrame: boolean | undefined): boolean {
  if (url === 'about:blank' || url === 'about:srcdoc') return true;
  if (isTopFrame !== false) {
    return url === EMBED_BASE_URL || url === `${EMBED_BASE_URL}/`;
  }
  const host = hostOf(url);
  if (!host || !FRAME_HOSTS.includes(host)) return false;
  return /^https:\/\/[^/]+\/embed\//i.test(url);
}

/**
 * Deliberately '*'. react-native-webview hands any URL that fails
 * originWhitelist to Linking.openURL, which would open Safari or the YouTube
 * app (an ad click-through, a channel link) outside the kid-safe player. With
 * '*', every navigation reaches allowPlayerNavigation, which blocks it in place.
 */
export const PLAYER_ORIGIN_WHITELIST = ['*'];

/** "Today", "Yesterday", "3 days ago", "2 weeks ago" for the hero card. */
export function postedAgo(video: SocialPostType, now: number = Date.now()): string | null {
  const ms = publishedMs(video);
  if (!Number.isFinite(ms)) return null;
  const hours = Math.max(0, (now - ms) / 3_600_000);
  if (hours < 1) return 'Just posted';
  if (hours < 24) return `${Math.floor(hours)} hour${Math.floor(hours) === 1 ? '' : 's'} ago`;
  const days = Math.floor(hours / 24);
  if (days === 1) return 'Yesterday';
  if (days < 14) return `${days} days ago`;
  const weeks = Math.floor(days / 7);
  if (weeks < 9) return `${weeks} weeks ago`;
  return null;
}
