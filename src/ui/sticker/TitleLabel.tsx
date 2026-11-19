/**
 * TitleLabel: a fixed-height cut label that sits on a page's top edge and shares its white edge.
 * White (calm), gold (offer), blue (info). Page mounts it in its own place (level 1), so it wears
 * the edge; dropped loose inside a page it follows the rule and goes without. It hugs its words;
 * text scales to 1.15x at most and a one-line label shrinks to fit rather than clip.
 */
import { memo } from 'react';
import { Image, View, type ImageSourcePropType } from 'react-native';
import Shell from './Shell';
import { useStickerPlace } from './StickerContext';
import StickerText from './StickerText';
import { edgeFor } from './level';
import { TEXT } from './textRoles';
import { DROP, INK, LABEL, LINE, RADIUS, SHADE } from './tokens';

export type TitleLabelTone = 'white' | 'gold' | 'blue';

const FACES = {
  white: { colors: [INK.white, SHADE.labelLow] as const },
  gold: { colors: [INK.goldLight, INK.gold] as const },
  blue: { colors: [SHADE.blueFaceTop, INK.blueBright] as const },
};

function TitleLabelImpl({ children, tone = 'white', large = false, icon, iconRatio = 1, padLeft }: {
  readonly children: string;
  /** Alex's small art before the words (FREE TICKETS: his ticket). */
  readonly icon?: ImageSourcePropType;
  readonly iconRatio?: number;
  readonly tone?: TitleLabelTone;
  readonly large?: boolean;
  /** Internal (Page): room on the left for art that hangs off the label's end (the lock). */
  readonly padLeft?: number;
}) {
  const place = useStickerPlace();
  const edge = edgeFor('label', place);
  const height = large ? LABEL.heightLarge : LABEL.height;
  const size = large ? LABEL.fontLarge : LABEL.font;
  const spec = { ...TEXT.name, size, spacing: 0.04, maxScale: LABEL.maxScale };
  return (
    <Shell radius={RADIUS.label} line={LINE.card} face={FACES[tone]} edge={edge}
      drop={DROP.label} dropColor={edge ? DROP.color : DROP.inPage}
      style={{ height, paddingHorizontal: LABEL.padX, paddingLeft: padLeft ?? (icon ? LABEL.padX - 4 : LABEL.padX), justifyContent: 'center', alignSelf: 'flex-start', maxWidth: '100%' }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
        {icon ? <Image source={icon} resizeMode="contain" fadeDuration={0} style={{ height: height - 12, width: (height - 12) * iconRatio }} /> : null}
        <View style={{ paddingTop: 2, flexShrink: 1 }}>
          <StickerText spec={spec} tone={tone === 'blue' ? 'white' : 'navy'} lineHeight={size + 4} role="header" fit>{children}</StickerText>
        </View>
      </View>
    </Shell>
  );
}

const TitleLabel = memo(TitleLabelImpl);
export default TitleLabel;
