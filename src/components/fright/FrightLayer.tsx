/**
 * Every Fin-ister overlay on the Explore screen: the haunt sheet, Rank the
 * Haunt, Case File reveal, the toast and coach-mark line, the activation
 * tutorial, the exit moment and the Marquee. Mounted outside the in-park block
 * so the exit moment and the Marquee still show after the presence leaves.
 */
import type { FrightNight } from '../../hooks/useFrightNight';
import FrightSheet from './FrightSheet';
import { CaseFileReveal, FrightCoachMark, FrightExitCard, FrightToast } from './FrightOverlays';
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
  return (
    <>
      {night.modeOn && <FrightSheet night={night} engine={engine} />}
      <RankCard prompt={engine.rank} onSubmit={engine.submitRank} onClose={engine.closeRank} />
      <CaseFileReveal file={engine.caseFile} onClose={engine.closeCaseFile} />
      <FrightToast text={engine.toast} onClose={engine.clearToast} top={top} />
      {!engine.toast && <FrightCoachMark coach={engine.coach} onClose={engine.dismissCoach} top={top} />}
      <FrightExitCard visible={!!engine.recapOffer}
        onOpen={() => engine.recapOffer && engine.openMarquee(engine.recapOffer.slug, engine.recapOffer.nightOn)}
        onClose={engine.dismissRecapOffer} />
      <MarqueeRecap target={engine.marquee} onClose={engine.closeMarquee} />
      {engine.tutorial && night.modeOn && (
        <FrightTutorial mode={engine.tutorial} title={night.title} whatsNew={night.tonight?.event?.whats_new}
          spooky={engine.spooky} onDone={engine.finishTutorial} />
      )}
    </>
  );
}
