# TPS Game UI kit (WS0)

One on-brand component set so every stream removes emoji, glyph icons, system
alerts, stock spinners and mismatched CTAs the same way. Import from `src/ui`
(`'../ui'` from `src/screens` and `src/components`). Everything in
`src/ui/index.ts` is a stable export; other files are internal.

Look: Dustin's game as Alex drew it. The kit reuses his art (yellow and red
image buttons, ribbon.png titles, the blue modal card, Alex's icons, the TPS
shark) and only adds behaviour: haptics, reduced-motion paths, loading and
error states, a dialog queue. Brand colours for new surfaces: bright blue
panels (`#0768b9` / `#0879ca`), cream cards (`#fff8e4`), gold (`#ffcf3b`),
navy ink (`#05346e`), navy scrim instead of black. Never dark, neon or purple
surfaces.

**Art rule.** Never redraw, restyle or replace an existing icon, button, frame,
ribbon, badge or the shark. Never draw icons as vector shapes
(react-native-svg, Skia) or use an icon font. New art is made only with GPT
Image 2.5 from Alex's reference images, per
`tps-prime-time-audit/art-pilot/PIPELINE.md`, and must pass its review sheet.

See every component in every state in the dev screen `src/ui/UiKitGym.tsx`
(route params `{ section: 'icons' | 'buttons' | 'dialogs' | 'loaders' | 'text' }`).

## Adopting the kit (other streams)

- Import from `src/ui` only (`index.ts` is the stable surface).
- Swap only files your stream owns. Run `npm test` and read the UI copy report
  for your files.
- `gameAlert` works before the root host lands (it falls back to the native
  alert), so swapping `Alert.alert` is safe today. WS9 mounts
  `<GameDialogHost />` once in `src/Root.tsx` and registers the dev route
  `UiKitGym` (`require('./ui/UiKitGym').default`, flag
  `EXPO_PUBLIC_UI_KIT_PREVIEW=1`) in `src/devRoutes.tsx`.
- Server strings: send `[icon:name]` tokens and render with `<GameRichText>`.

## Swap guide

| You have | Use |
|---|---|
| Emoji or a dingbat (`✕ ✓ ★ ⚡ 🎟️`) in copy | `<GameIcon name="close" />`, or `[icon:ticket]` inside `<GameRichText>` |
| A server string that may contain emoji | `<GameRichText>{serverText}</GameRichText>` (known emoji become icons, others are dropped) |
| `Alert.alert(title, message, buttons)` | `gameAlert(title, message, buttons)` (same signature) or `await confirmGame({...})` |
| `<ActivityIndicator>` or `<Loading />` that can spin forever | `<SharkLoader state={error ? 'error' : empty ? 'empty' : 'loading'} onRetry={reload} />` |
| A hand-rolled CTA (TouchableOpacity with a yellow box) | `<GameButton label="Play ride" icon="ticket" onPress={...} />` (his yellow_button.png). Existing `<YellowButton>` calls can stay as they are |
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

### GameIcon (`GameIcon.tsx`, names in `iconNames.ts`)
```tsx
<GameIcon name="ticket" size={24} />
<GameIcon name="close" size={20} accessibilityLabel="Close" />
<GameIcon name="check" size={16} mono={BRAND.white} />   // single colour silhouette
```
Every icon is a hand-drawn PNG. Three sources, in this order of preference:

1. **Alex's originals and the art players already see** (`ORIGINAL_ICON_NAMES`):
   `close` (Alex X badge), `check`, `back`, `bell`, `settings`, `info` (faq),
   `edit` (pencil), `lock`, `star`, `heart`, `gift`, `chest`, `chestOpen`,
   `trophy` / `trophySilver` / `trophyBronze` (park cups), `map` (compass),
   `xp` (potion), `shark` (classic shark), `fin`, `search`, `new`, `member`,
   `queue`, `coin` and `coins` (Alex's coin art). Files copied from Alex's pack
   live in `assets/icons/game/`; the rest point at the existing screen art.
2. **Currencies exactly as they look today**: `energy`, `ticket`, `swords`,
   `parts`. These are the Feb-2026 files; they are used only for the currency
   they already represent and are never a style reference.
3. **New, no original existed** (`GENERATED_ICON_NAMES`): `crown`, `streak`,
   `timer`, `rush`, `wrench`, `pin`, `medal1`-`medal3`, `dice`, `sparkle`,
   `ride`, `camera`, `pause`, `play`, `retry`, `arrow`. Drawn with GPT Image
   2.5 from Alex's references, trimmed, transparent, 384px long side. Review
   sheets: `tps-prime-time-audit/art-ws0/review-sheet-final-{1,2,3}.png`.

Old names still resolve through `ICON_ALIASES` (`faq`, `compass`, `explore`,
`down`, `vip`, `sword`, `ridePart`, `trophyGold`). Icons are decorative by
default; pass `accessibilityLabel` when the icon is the only content.

**Need an icon that is not here?** First look for an original (Alex's pack in
`tps-prime-time-audit/references/alex/`, then `assets/images/screens/**`). Only
if none exists, generate it with the pipeline (GPT Image 2.5, Alex's
references, 2 variants), pass the review sheet, save it as
`assets/icons/game/<name>.png`, add the name to `GENERATED_ICON_NAMES` and
`ICON_SOURCES`, run `npm test` and check it in UiKitGym at 16, 24 and 48.

### GameRichText and icon tokens (`GameRichText.tsx`, `iconTokens.ts`)
```tsx
<GameRichText preset="body">{'Spend [icon:ticket] 1 Ticket to play'}</GameRichText>
```
Server strings should send `[icon:name]` tokens instead of emoji. Until they
do, legacy emoji are mapped (`⚡` energy, `🔥` streak, `🎟️` ticket, `🏆` trophy
and more) or dropped. The bolt always means Energy; Rush copy must use
`[icon:rush]`. `stripIconTokens()` gives plain text for share sheets
and accessibility.

### GameButton (`GameButton.tsx`) and YellowButton
`YellowButton` is Dustin's original and renders exactly as before; the only
fix is the label size (it started at 72pt and shrank to fit, so "CLOSE" filled
the face while a long label on the same button came out half the size). The
label now sizes from the button height (`artButtonText.ts`) and long labels
still shrink to fit.

`GameButton` is the same art with extras, for new code:
- `primary`: yellow_button.png, up to 320 wide.
- `secondary`: the same yellow button, up to 240 wide.
- `danger`: red_button.png (destructive only).
- `ghost`: a Shark-font text action for "Cancel" and "Not now" (`tone="onBlue"` on blue).

Extras: optional `icon` before the label, `loading` (label pulse, presses
ignored), `disabled` (his 50% fade), a light haptic (`haptics={false}` to skip),
press scale 0.97 on the UI thread. Reduced motion keeps presses instant.

### GameDialog (`GameDialog.tsx`, logic in `gameDialogModel.ts`)
Mount `<GameDialogHost />` exactly once near the root, never per screen: only
the newest host shows dialogs (the previous one is cleared when another
attaches), and if the last host unmounts mid-dialog the queue moves to the
native alert so nothing is left unanswered. Then:
```tsx
gameAlert('Out of Tickets', 'Start a queue adventure to earn your next Ticket.');
gameAlert('How did your wait end?', undefined, [
  { text: 'I reached boarding', onPress: boarded },
  { text: 'I left the line', onPress: left },
  { text: 'Keep playing', style: 'cancel' },
], { icon: 'timer' });
if (await confirmGame({ title: 'Delete account?', confirmLabel: 'Delete', destructive: true })) remove();
```
Look: his modal template (TaskCoinModal, UnfoundCoinModal): ribbon.png title
over the blue card with a white border, optional GameIcon, his yellow buttons.
Button layout: the last non-cancel button is the main yellow action on top,
destructive buttons use his red button, other actions the smaller yellow
button, cancel is a quiet text action at the bottom. Scrim tap and Android back pick cancel (or the only button). Requests
queue one at a time. With no host mounted the call falls back to the native
`Alert`, so swapping a call site can never lose a prompt. Button handlers run
after the close animation, so they can navigate or open another modal.
A controlled `<GameDialog visible ... onAnswer />` is also available.

Titles: the ribbon holds one line of Shark, so keep titles to
`RIBBON_TITLE_MAX` (22) characters, like "Leave the line?". A longer title
(many existing `Alert.alert` titles are sentences) is not squeezed into the
ribbon: it becomes a wrapping heading on the card and warns in dev. When you
swap a call site, shorten the title and move the rest into the message.

Motion: scrim fade plus a spring pop on the UI thread, a fade under Reduce
Motion. `useUiReducedMotion` knows the preference on the first render, so
host dialogs (which mount already open) spring too.

### SharkLoader (`SharkLoader.tsx`) and `Loading`
```tsx
if (error) return <SharkLoader state="error" onRetry={load} />;
if (!items.length) return <SharkLoader state="empty" title="Be the first on the podium" action={{ label: 'Find a ride', onPress }} />;
return <SharkLoader onRetry={load} />;   // loading; "Still loading" and retry after 6s
```
Art: Dustin's TPS shark (`assets/images/screens/pin-collections/shark.png`),
bobbing while it loads; reduced motion holds him still. The art is never
edited: the moving shark is cropped above his baked-in ground shadow in
layout, and a separate still navy shadow shrinks slightly as he rises. `compact` for cards,
`tone="onBlue"` on blue panels. `components/Loading` is
now SharkLoader with the same props, so existing `<Loading />` calls get the new
look and can add `state` and `onRetry` without changing imports. Its slow
message is the CMS crumb `labels.slow_connectivity` when the server sends one,
falling back to SharkLoader's own line.

## Rule gate: `tools/tests/no-emoji.test.cjs`

Scans player-visible copy in `src/` (string literals, template chunks, JSX
text, JSON values; not comments, import paths or console calls) and prints
offender counts per file:

- `emoji`, `emdash` and `glyph` (dingbats used as icons: stars, checks, X
  marks, arrows, notes, most of which are not emoji to Unicode) fail the build
  once the gate is strict. Each owning stream swaps its glyphs to `<GameIcon>`
  or `[icon:]` tokens before the flip.
- `phrase` (third-party phrases) is report-only.
- Dev-only preview and tester screens are listed with `[dev]` and never fail.

It runs in report mode until integration. Preview strict mode with
`UI_COPY_STRICT=1 npm test`. A real exception sits next to the code:
`// ui-copy-allow(emoji): why` on the same line or the line above, or on a
lookup-table declaration (`const X = { ... }` or `[ ... ]`) to cover the whole
table. A pragma above a function, class or component never covers its body.
There is no shared allowlist.

Server-sent display strings: `UI_COPY_BACKEND=<backend checkout> npm test`
also scans the backend's `app/` PHP string literals (read only; comments, log
calls, exceptions and console commands are skipped) for emoji and em dashes.

Preconditions for flipping `STRICT` to true (WS0, at integration):
1. `UI_COPY_STRICT=1 npm test` passes: every owning stream has swapped its
   emoji, em dashes and glyphs.
2. `UI_COPY_BACKEND=<backend> UI_COPY_STRICT=1 npm test` passes: the backend
   owner has replaced server emoji (UpdatePlayerStreakAction, SwordController,
   PlayerTeam, PrepItemSet, PlayerRideController and the rest the scan lists)
   with `[icon:name]` tokens or plain words.

ESLint is not installed in this repo, so the node test is the gate.

## Test helpers
- `tools/tests/helpers/plain.cjs`: `plain(value)` copies vm-realm values into
  this realm for `assert.deepEqual`.
- `tools/tests/helpers/ts-module.cjs`: `loadTs(file, stubs)` transpiles a
  `src` module and its relative imports for pure-logic tests.
