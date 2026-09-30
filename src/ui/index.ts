/**
 * WS0 Game UI kit: stable public exports. Import from 'src/ui' (relative path
 * '../ui' from screens and components). See src/ui/README.md.
 */
export { BRAND, OUTLINE, RADIUS, SPACE, FONT, SHADOW, MOTION, BUTTON, Z, HIT_SLOP } from './tokens';
export type { BrandColor, GameButtonVariant, GameButtonSize } from './tokens';

export { textPreset, SOFT_INK, TEXT_PRESET_NAMES } from './TextPresets';
export type { TextPresetName, TextTone } from './TextPresets';
export { default as GameText } from './GameText';
export type { GameTextProps } from './GameText';

export { default as GameIcon, ICON_SOURCES } from './GameIcon';
export type { GameIconProps } from './GameIcon';
export { GAME_ICON_NAMES, ORIGINAL_ICON_NAMES, GENERATED_ICON_NAMES, ICON_ALIASES, isGameIconName, resolveIconName } from './iconNames';
export type { GameIconName } from './iconNames';
export { parseIconTokens, stripIconTokens, tokenizeLegacyEmoji, iconForEmoji } from './iconTokens';
export type { CopyPart } from './iconTokens';
export { default as GameRichText } from './GameRichText';
export type { GameRichTextProps } from './GameRichText';

export { default as GameButton, buttonLook, BUTTON_ART } from './GameButton';
export type { GameButtonProps } from './GameButton';

export { GameDialog, GameDialogHost, gameAlert, confirmGame, showGameDialog, DIALOG_CARD } from './GameDialog';
export type { GameDialogProps, GameDialogButton, GameDialogOptions } from './GameDialog';

export { default as SharkLoader, SHARK_LOADER_COPY, SHARK_LOADER_ART, sharkLoaderContent } from './SharkLoader';
export type { SharkLoaderProps, SharkLoaderState } from './SharkLoader';
