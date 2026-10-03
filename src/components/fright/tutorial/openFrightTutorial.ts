import * as RootNavigation from '../../../RootNavigation';

/** Replay the Fin-ister Nights tutorial cards from anywhere (How to Play "More", the pill "?"). */
export function openFrightTutorial(title?: string | null): void {
  RootNavigation.navigate('FrightTutorial', title ? { title } : undefined);
}
