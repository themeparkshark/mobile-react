/**
 * TitleLabel: a fixed-size cut label that sits on a page's top edge and shares its white edge.
 * White (calm), gold (offer), blue (info). Page mounts it outside its own level 2, so it wears
 * the edge; dropped loose inside a page it follows the rule and goes without.
 */
import { memo } from 'react';
import { View } from 'react-native';
import Shell from './Shell';
import { useEdge } from './StickerContext';
import StickerText from './StickerText';
import { DROP, EDGE, INK, LABEL, LINE, RADIUS, SHADE } from './tokens';

export type TitleLabelTone = 'white' | 'gold' | 'blue';

const FACES = {
  white: { colors: [INK.white, SHADE.labelLow] as const },
  gold: { colors: [INK.goldLight, INK.gold] as const },
  blue: { colors: [SHADE.blueFaceTop, INK.blueBright] as const },
};

function TitleLabelImpl({ children, tone = 'white', large = false, edge: asked, width, padLeft }: {
  readonly children: string;
  readonly tone?: TitleLabelTone;
  readonly large?: boolean;
  readonly edge?: boolean;
  /** A fixed width (the gate's label); otherwise it hugs its words. */
  readonly width?: number;
  /** Room on the left for art that hangs off the label's end (the lock). */
  readonly padLeft?: number;
}) {
  const { edge } = useEdge('TitleLabel', asked);
  const height = large ? LABEL.heightLarge : LABEL.height;
  const size = large ? LABEL.fontLarge : LABEL.font;
  return (
    <Shell radius={RADIUS.label} line={LINE.card} face={FACES[tone]} edge={edge ? EDGE.label : 0}
      drop={DROP.label} dropColor={edge ? DROP.color : DROP.inPage}
      style={{ height, width, paddingHorizontal: LABEL.padX, paddingLeft: padLeft ?? LABEL.padX, justifyContent: 'center', alignSelf: 'flex-start' }}>
      <View style={{ paddingTop: 2 }}>
        {tone === 'blue'
          ? <StickerText size={size} stroke={2.1} drop={2} spacing={0.04} lineHeight={size + 4} role="header">{children}</StickerText>
          : <StickerText size={size} tone="navy" stroke={0} spacing={0.04} lineHeight={size + 4} role="header">{children}</StickerText>}
      </View>
    </Shell>
  );
}

const TitleLabel = memo(TitleLabelImpl);
export default TitleLabel;
