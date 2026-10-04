import * as RootNavigation from '../../../RootNavigation';
import { preloadFrightTutorialArt } from './preloadTutorialArt';

/** Replay the Fin-ister Nights tutorial cards from anywhere (How to Play "More", the pill "?"). */
export function openFrightTutorial(title?: string | null): void {
  void preloadFrightTutorialArt();
  RootNavigation.navigate('FrightTutorial', title ? { title } : undefined);
}
