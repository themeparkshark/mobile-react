# TPS Game UI kit (WS0)

One on-brand component set so every stream removes emoji, glyph icons, system
alerts, stock spinners and mismatched CTAs the same way. Import from `src/ui`
(`'../ui'` from `src/screens` and `src/components`). Everything in
`src/ui/index.ts` is a stable export; other files are internal.

Look: flat cartoon, thick navy outlines (`#05346e`), bright blue panels
(`#0768b9` / `#0879ca`), white and cream cards (`#fff8e4`), gold calls to
action (`#ffcf3b` on a `#d99a00` lip). Never black scrims, dark navy
surfaces, neon or purple.

See every component in every state in the dev screen `src/ui/UiKitGym.tsx`
(route params `{ section: 'icons' | 'buttons' | 'dialogs' | 'loaders' | 'text' }`).

## Swap guide

| You have | Use |
|---|---|
| Emoji or a dingbat (`✕ ✓ ★ ⚡ 🎟️`) in copy | `<GameIcon name="close" />`, or `[icon:ticket]` inside `<GameRichText>` |
| A server string that may contain emoji | `<GameRichText>{serverText}</GameRichText>` (known emoji become icons, others are dropped) |
| `Alert.alert(title, message, buttons)` | `gameAlert(title, message, buttons)` (same signature) or `await confirmGame({...})` |
| `<ActivityIndicator>` or `<Loading />` that can spin forever | `<SharkLoader state={error ? 'error' : empty ? 'empty' : 'loading'} onRetry={reload} />` |
| A yellow image button or a hand-rolled CTA | `<GameButton label="Play ride" icon="ticket" onPress={...} />` |
| `fontWeight: 'bold'` on the system font | `<GameText preset="heading">` or `style={textPreset('heading', 'onBlue')}` |
| Hex colours, `rgba(0,0,0,.5)` scrims | `BRAND.navy`, `BRAND.scrim`, `SHADOW.card` |

## Components

### Tokens (`tokens.ts`)
`BRAND` colours, `OUTLINE` (thin 2, thick 3, heavy 4), `RADIUS`, `SPACE`,
`FONT` (`display` = Shark, `body` = Knockout), `SHADOW` (navy, never black),
`MOTION` durations and springs, `BUTTON` geometry, `Z`, `HIT_SLOP`.

### Text (`TextPresets.ts`, `GameText.tsx`)
Presets: `hero`, `display`, `title`, `heading`, `button`, `number` (Shark) and
`label`, `body`, `bodySmall`, `caption` (Knockout). Tones: `onLight` (navy
ink), `onBlue` and `onGold` (white, display presets get the navy outline
shadow). Presets never set `fontWeight`.

```tsx
<GameText preset="title" tone="onBlue" align="center">Coin caught!</GameText>
<Text style={[textPreset('label'), { marginTop: 4 }]}>Next ride</Text>
```

### GameIcon (`GameIcon.tsx`, art in `gameIconArt.ts`)
```tsx
<GameIcon name="ticket" size={24} />
<GameIcon name="close" size={20} accessibilityLabel="Close" />
<GameIcon name="check" size={16} mono={BRAND.white} />   // single colour silhouette
```
Names: `energy ticket coin crown swords star` reuse existing repo art;
`rush wrench pin gift medal1 medal2 medal3 timer streak dice bell check close
pause play sparkle heart map shark ride trophy lock info retry arrow` are
hand-drawn vectors (48 grid, sticker-style navy outline, brand fills).
Decorative by default; pass `accessibilityLabel` when the icon is the only
content. To add an icon, add a `VectorIcon` to `VECTOR_ICONS`, run
`npm test` (grid and palette checks) and check it in UiKitGym at 16, 24, 48.

### GameRichText and icon tokens (`GameRichText.tsx`, `iconTokens.ts`)
```tsx
<GameRichText preset="body">{'Spend [icon:ticket] 1 Ticket to play'}</GameRichText>
```
Server strings should send `[icon:name]` tokens instead of emoji. Until they
do, legacy emoji are mapped (`⚡` rush, `🔥` streak, `🎟️` ticket, `🏆` trophy
and more) or dropped. `stripIconTokens()` gives plain text for share sheets
and accessibility.

### GameButton (`GameButton.tsx`)
Variants `primary` (gold), `secondary` (blue), `danger` (red, destructive
only), `ghost` (text only; `tone="onBlue"` on blue). Sizes `regular` (58pt,
Shark 24) and `compact` (46pt, Shark 20). Max width 320, 4pt lip, press
collapse on the UI thread, light haptic on press (respects the haptics
setting), `loading` pulse, greyed `disabled`. Reduced motion keeps the pressed
state without tweens. `YellowButton` now renders a primary GameButton.

### GameDialog (`GameDialog.tsx`, logic in `gameDialogModel.ts`)
Mount `<GameDialogHost />` once near the root. Then:
```tsx
gameAlert('Out of Tickets', 'Start a queue adventure to earn your next Ticket.');
gameAlert('How did your wait end?', undefined, [
  { text: 'I reached boarding', onPress: boarded },
  { text: 'I left the line', onPress: left },
  { text: 'Keep playing', style: 'cancel' },
], { icon: 'timer' });
if (await confirmGame({ title: 'Delete account?', confirmLabel: 'Delete', destructive: true })) remove();
```
Button layout: the last non-cancel button is the main gold action on top,
destructive buttons are red, other actions blue, cancel is a quiet ghost at the
bottom. Scrim tap and Android back pick cancel (or the only button). Requests
queue one at a time. With no host mounted the call falls back to the native
`Alert`, so swapping a call site can never lose a prompt. Button handlers run
after the close animation, so they can navigate or open another modal.
A controlled `<GameDialog visible ... onAnswer />` is also available.

### SharkLoader (`SharkLoader.tsx`) and `Loading`
```tsx
if (error) return <SharkLoader state="error" onRetry={load} />;
if (!items.length) return <SharkLoader state="empty" title="Be the first on the podium" action={{ label: 'Find a ride', onPress }} />;
return <SharkLoader onRetry={load} />;   // loading; "Still loading" and retry after 6s
```
`compact` for cards, `tone="onBlue"` on blue panels. `components/Loading` is
now SharkLoader with the same props, so existing `<Loading />` calls get the new
look and can add `state` and `onRetry` without changing imports.

## Rule gate: `tools/tests/no-emoji.test.cjs`

Scans player-visible copy in `src/` (string literals, template chunks, JSX
text, JSON values; not comments, import paths or console calls) and prints
offender counts per file:

- `emoji` and `emdash` fail the build once the gate is strict.
- `glyph` (dingbats used as icons) and `phrase` (third-party phrases) are
  report-only.
- Dev-only preview and tester screens are listed with `[dev]` and never fail.

It runs in report mode until integration. Preview strict mode with
`UI_COPY_STRICT=1 npm test`. A real exception sits next to the code:
`// ui-copy-allow(emoji): why` on the line above, or on a declaration to cover
a whole lookup table. There is no shared allowlist.

ESLint is not installed in this repo, so the node test is the gate.

## Test helpers
- `tools/tests/helpers/plain.cjs`: `plain(value)` copies vm-realm values into
  this realm for `assert.deepEqual`.
- `tools/tests/helpers/ts-module.cjs`: `loadTs(file, stubs)` transpiles a
  `src` module and its relative imports for pure-logic tests.
