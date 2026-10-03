/**
 * Every Fin-ister overlay on the Explore screen: the haunt sheet, Rank the
 * Haunt, Case File reveal, the toast and coach-mark line, the activation
 * tutorial, the exit moment and the Marquee. Mounted outside the in-park block
 * so the exit moment and the Marquee still show after the presence leaves.
 */
import { useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import type { FrightNight } from '../../hooks/useFrightNight';
import { overlayTop } from '../../services/fright/layout';
import FrightSheet from './FrightSheet';
import CaseFileReveal from './CaseFileReveal';
import { FrightCoachMark, FrightExitCard, FrightToast } from './FrightOverlays';
import RewardReveal from './RewardReveal';
import SidePicker from './SidePicker';
import MarqueeRecap from './MarqueeRecap';
import RankCard from './RankCard';
import FrightTutorial from './tutorial/FrightTutorial';
import type { FrightEngine } from './useFrightEngine';

export default function FrightLayer({ night, engine, top = 132 }: {
  readonly night: FrightNight;
  readonly engine: FrightEngine;
  /** Where the toast and coach line sit (below the pill column). */
  readonly top?: number;
}) {
  const box = useRef<View>(null);
  const [boxY, setBoxY] = useState<number | null>(null);
  const lineTop = overlayTop(engine.pillBottom, boxY, top);
  return (
    <>
      <View ref={box} style={[StyleSheet.absoluteFill, { zIndex: 60 }]} pointerEvents="box-none"
        onLayout={() => box.current?.measureInWindow((_x, y) => { if (Number.isFinite(y)) setBoxY(y); })}>
        <FrightToast text={engine.toast} onClose={engine.clearToast} top={lineTop} />
        {!engine.toast && <FrightCoachMark coach={engine.coach} onClose={engine.dismissCoach} top={lineTop} />}
      </View>
      {night.modeOn && <FrightSheet night={night} engine={engine} />}
      {/* One modal at a time (engine.modal): rank, Case File, rewards, team pick. */}
      <RankCard key={engine.modal?.kind === 'rank' ? engine.modal.id : 'rank'} prompt={engine.rank} onSubmit={engine.submitRank} onClose={engine.closeRank} />
      <CaseFileReveal file={engine.caseFile} onClose={engine.closeCaseFile} />
      <RewardReveal rewards={engine.modal?.kind === 'rewards' ? engine.modal.rewards : null} onClose={engine.closeModal} />
      <SidePicker name={engine.modal?.kind === 'side' ? engine.modal.name : null} onClose={engine.closeModal}
        onPick={side => { void engine.pickSide(side); }} />
      <FrightExitCard visible={!!engine.recapOffer && !engine.modal}
        onOpen={() => engine.recapOffer && engine.openMarquee(engine.recapOffer.slug, engine.recapOffer.nightOn)}
        onClose={engine.dismissRecapOffer} />
      <MarqueeRecap target={engine.marquee} onClose={engine.closeMarquee} />
      {engine.tutorial && night.modeOn && (
        <FrightTutorial mode={engine.tutorial} title={night.title} whatsNew={night.tonight?.event?.whats_new}
          spooky={engine.spooky} hero={engine.art.tutorial} onDone={engine.finishTutorial}
          encountersEnabled={night.tonight?.config?.encounters_enabled === true} />
      )}
    </>
  );
}
