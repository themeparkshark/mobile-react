/**
 * News v2 article body: WordPress HTML drawn natively.
 *
 * - Body copy in the phone's reading face (San Francisco) at 18 pt with a
 *   29 pt line; headings, captions and quotes in the house Knockout face.
 * - Photos at their real shape (width/height from the HTML), tap to zoom.
 * - YouTube embeds become a tap-to-play card that opens the in-app player
 *   (the same kid-safe player as the Watch page; no coins here).
 * - Links: other Theme Park Shark stories open in the reader, everything else
 *   goes through the grown-up gate (services/external).
 */
import { Image } from 'expo-image';
import { createContext, memo, useContext, useMemo, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import RenderHtml, {
  defaultSystemFonts,
  HTMLContentModel,
  HTMLElementModel,
  type CustomBlockRenderer,
  type MixedStyleDeclaration,
} from 'react-native-render-html';
import { BRAND, GameIcon, RADIUS } from '../../ui';
import { prepareArticleHtml } from './newsModel';

export const READ_INK = '#1d3557';
const BODY_SIZE = 18;

const tagsStyles: Readonly<Record<string, MixedStyleDeclaration>> = {
  body: { fontSize: BODY_SIZE, lineHeight: 29, color: READ_INK },
  p: { marginTop: 0, marginBottom: 18 },
  h2: { fontFamily: 'Knockout', fontWeight: 'normal', fontSize: 27, lineHeight: 31, color: BRAND.navy, marginTop: 14, marginBottom: 10 },
  h3: { fontFamily: 'Knockout', fontWeight: 'normal', fontSize: 23, lineHeight: 27, color: BRAND.navy, marginTop: 12, marginBottom: 8 },
  h4: { fontFamily: 'Knockout', fontWeight: 'normal', fontSize: 20, color: BRAND.navy, marginTop: 10, marginBottom: 6 },
  a: { color: BRAND.blue, fontWeight: '700', textDecorationLine: 'none' },
  strong: { fontWeight: '700', color: BRAND.navy },
  ul: { marginTop: 0, marginBottom: 18, paddingLeft: 6 },
  ol: { marginTop: 0, marginBottom: 18, paddingLeft: 6 },
  li: { marginBottom: 8 },
  figure: { marginTop: 4, marginBottom: 20, marginLeft: 0, marginRight: 0 },
  figcaption: { fontFamily: 'Knockout', fontSize: 14, lineHeight: 18, color: BRAND.navySoft, textAlign: 'left', marginTop: 8 },
  blockquote: {
    marginTop: 4, marginBottom: 20, marginLeft: 0, marginRight: 0, paddingTop: 12, paddingBottom: 2, paddingLeft: 14, paddingRight: 12,
    backgroundColor: BRAND.cream, borderLeftWidth: 5, borderLeftColor: BRAND.gold, borderRadius: 10,
  },
  em: { fontStyle: 'italic' },
  hr: { marginVertical: 18, height: 2, backgroundColor: 'rgba(5,52,110,0.12)' },
};

const classesStyles: Readonly<Record<string, MixedStyleDeclaration>> = {
  'wp-block-image': { marginBottom: 20 },
  /** Another TPS story: opens right here. Bold blue on a soft sky band. */
  'tps-link': { color: BRAND.blue, backgroundColor: '#e3f3ff', fontWeight: '700', textDecorationLine: 'none' },
  /** Leaves the game (a grown-up says yes first): quieter navy with a dotted underline. */
  'out-link': { color: BRAND.navySoft, fontWeight: '600', textDecorationLine: 'underline', textDecorationStyle: 'dotted', textDecorationColor: BRAND.navySoft },
};

/** Body text grows with Dynamic Type, up to a size the column still holds. */
const DEFAULT_TEXT_PROPS = { maxFontSizeMultiplier: 1.6 };

const systemFonts = [...defaultSystemFonts, 'Knockout', 'Shark'];
const ignoredDomTags = ['script', 'style', 'iframe', 'noscript', 'svg', 'form', 'input', 'button'];

const customHTMLElementModels = {
  tpsvideo: HTMLElementModel.fromCustomModel({ tagName: 'tpsvideo', contentModel: HTMLContentModel.block }),
};

export type ArticleBodyHandlers = {
  readonly onLink: (href: string) => void;
  readonly onImage: (uri: string, aspect: number) => void;
  readonly onVideo: (id: string, title: string, short: boolean) => void;
};

/**
 * WordPress keeps a 1024 px copy of every big upload ("-1024x768.jpg"). Ask
 * for it instead of the original; if it is missing, BodyImage falls back.
 */
export function smallerUpload(src: string, w: number, h: number): string | null {
  if (!(w > 1100 && h > 0) || /-\d+x\d+\.(?:jpe?g|png|webp)$/i.test(src)) return null;
  const m = /^(.*?)(-scaled)?\.(jpe?g|png|webp)$/i.exec(src);
  if (!m) return null;
  return `${m[1]}-1024x${Math.round((h * 1024) / w)}.${m[3]}`;
}

/**
 * Whether this page is the one on screen. Read through context so a swipe only
 * changes image priority; the renderers (and the images they drew) stay mounted.
 */
const LiveContext = createContext(true);

/** The srcset candidate closest to 1024 px wide (WordPress lists the sizes it really has). */
export function pickFromSrcset(srcset: string | undefined): string | null {
  if (!srcset) return null;
  const options = srcset.split(',').map(part => {
    const [url, size] = part.trim().split(/\s+/);
    return { url, w: Number(String(size ?? '').replace(/w$/, '')) || 0 };
  }).filter(o => o.url && o.w > 0);
  if (!options.length) return null;
  const fit = options.filter(o => o.w >= 900).sort((a, b) => a.w - b.w)[0] ?? options.sort((a, b) => b.w - a.w)[0];
  return fit.url;
}

function BodyImage({ src, srcset, w, h, width, aspect, alt, onPress }: {
  readonly src: string; readonly srcset?: string; readonly w: number; readonly h: number; readonly width: number; readonly aspect: number;
  readonly alt: string; readonly onPress: () => void;
}) {
  const live = useContext(LiveContext);
  const [uri, setUri] = useState(() => pickFromSrcset(srcset) ?? smallerUpload(src, w, h) ?? src);
  return (
    <Pressable accessibilityRole="imagebutton" accessibilityLabel={`${alt}. Tap to look closer`} onPress={onPress}>
      <Image source={{ uri }} style={{ width, aspectRatio: aspect, borderRadius: RADIUS.md, backgroundColor: '#dcecf9' }}
        contentFit="cover" transition={200} cachePolicy="memory-disk" allowDownscaling priority={live ? 'normal' : 'low'}
        onError={() => { if (uri !== src) setUri(src); }} />
    </Pressable>
  );
}

function ArticleBody({ html, width, live = true, handlers }: {
  readonly html: string; readonly width: number; readonly live?: boolean; readonly handlers: ArticleBodyHandlers;
}) {
  const source = useMemo(() => ({ html: prepareArticleHtml(html) }), [html]);

  const renderers = useMemo(() => {
    const img: CustomBlockRenderer = ({ tnode }) => {
      const attrs = tnode.attributes;
      const uri = attrs.src;
      if (!uri) return null;
      const w = Number(attrs.width) || 0;
      const h = Number(attrs.height) || 0;
      const aspect = w > 0 && h > 0 ? Math.min(2.4, Math.max(0.6, w / h)) : 16 / 9;
      const alt = attrs.alt && !/^official source photo/i.test(attrs.alt) ? attrs.alt : 'Photo';
      return <BodyImage src={uri} srcset={attrs.srcset} w={w} h={h} width={width} aspect={aspect} alt={alt} onPress={() => handlers.onImage(uri, aspect)} />;
    };
    const tpsvideo: CustomBlockRenderer = ({ tnode }) => {
      const id = tnode.attributes['data-id'];
      if (!id) return null;
      const title = tnode.attributes['data-title'] || 'Watch the video';
      const short = tnode.attributes['data-short'] === '1';
      return (
        <Pressable accessibilityRole="button" accessibilityLabel={`Play video: ${title}`} onPress={() => handlers.onVideo(id, title, short)}
          style={({ pressed }) => ({ marginBottom: 20, borderRadius: RADIUS.md, overflow: 'hidden', backgroundColor: BRAND.navy,
            borderWidth: 3, borderBottomWidth: 6, borderColor: BRAND.blueLip, transform: [{ scale: pressed ? 0.98 : 1 }] })}>
          <Image source={{ uri: `https://i.ytimg.com/vi/${id}/hqdefault.jpg` }} style={{ width: '100%', aspectRatio: 16 / 9 }} contentFit="cover" transition={200} />
          <View style={{ position: 'absolute', left: 0, right: 0, top: 0, aspectRatio: 16 / 9, alignItems: 'center', justifyContent: 'center' }}>
            <View style={{ width: 72, height: 72, borderRadius: 36, backgroundColor: BRAND.gold, borderWidth: 3, borderColor: BRAND.white, alignItems: 'center', justifyContent: 'center' }}>
              <GameIcon name="play" size={38} />
            </View>
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 12, paddingVertical: 10 }}>
            <Text maxFontSizeMultiplier={1.3} style={{ fontFamily: 'Shark', fontSize: 13, color: BRAND.gold }}>WATCH</Text>
            <Text numberOfLines={2} maxFontSizeMultiplier={1.25} style={{ flex: 1, fontFamily: 'Knockout', fontSize: 17, lineHeight: 20, color: BRAND.white }}>{title}</Text>
          </View>
        </Pressable>
      );
    };
    return { img, tpsvideo };
  }, [width, handlers]);

  const renderersProps = useMemo(() => ({
    a: { onPress: (_: unknown, href: string) => handlers.onLink(href) },
  }), [handlers]);

  return (
    <LiveContext.Provider value={live}>
    <RenderHtml
      contentWidth={width}
      source={source}
      tagsStyles={tagsStyles}
      classesStyles={classesStyles}
      systemFonts={systemFonts}
      ignoredDomTags={ignoredDomTags}
      customHTMLElementModels={customHTMLElementModels}
      renderers={renderers}
      renderersProps={renderersProps}
      enableExperimentalMarginCollapsing
      defaultTextProps={DEFAULT_TEXT_PROPS}
    />
    </LiveContext.Provider>
  );
}

export default memo(ArticleBody);
