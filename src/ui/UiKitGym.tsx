/**
 * UiKitGym (dev only): shows every WS0 UI kit component in every state.
 *
 * Route params: { section?: 'icons' | 'buttons' | 'dialogs' | 'loaders' | 'text' }
 * opens straight on one section (used for the approval screenshots);
 * { demo?: DialogDemo, backdrop?: 'cream' | 'blue' } also opens one dialog
 * demo over that page colour, so the scrim can be judged on both.
 * Mounts its own GameDialogHost so the imperative dialog demos work before
 * the app root adopts one. The store shows dialogs on the newest host only,
 * so this one takes over cleanly while the gym is open.
 */
import { useEffect, useState, type ReactNode } from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import YellowButton from '../components/YellowButton';
import GameButton from './GameButton';
import { GameDialog, GameDialogHost, confirmGame, gameAlert } from './GameDialog';
import GameIcon from './GameIcon';
import GameRichText from './GameRichText';
import GameText from './GameText';
import SharkLoader from './SharkLoader';
import { GENERATED_ICON_NAMES, ORIGINAL_ICON_NAMES, type GameIconName } from './iconNames';
import { TEXT_PRESET_NAMES } from './TextPresets';
import { BRAND, OUTLINE, RADIUS, SPACE } from './tokens';

type Section = 'icons' | 'buttons' | 'dialogs' | 'loaders' | 'text';
const SECTIONS: Section[] = ['icons', 'buttons', 'dialogs', 'loaders', 'text'];
const SWATCHES = ['cream', 'white', 'blue', 'blueBright', 'sky', 'navy', 'gold', 'goldLip', 'red', 'green'] as const;

function Panel({ title, children, blue = false }: { title: string; children: ReactNode; blue?: boolean }) {
  return <View style={{
    backgroundColor: blue ? BRAND.blue : BRAND.white,
    borderRadius: RADIUS.lg, borderWidth: OUTLINE.thick, borderColor: BRAND.navy,
    padding: SPACE.md, gap: SPACE.sm, marginBottom: SPACE.lg,
  }}>
    <GameText preset="heading" tone={blue ? 'onBlue' : 'onLight'}>{title}</GameText>
    {children}
  </View>;
}

/** Dev-only tab chip for the gym's own navigation. */
function Chip({ label, selected, onPress }: { label: string; selected: boolean; onPress: () => void }) {
  return <Pressable accessibilityRole="tab" accessibilityState={{ selected }} onPress={onPress} style={{
    paddingHorizontal: 10, paddingVertical: 5, borderRadius: RADIUS.pill, borderWidth: OUTLINE.thin,
    borderColor: BRAND.navy, backgroundColor: selected ? BRAND.gold : BRAND.white,
  }}>
    <GameText preset="label">{label}</GameText>
  </Pressable>;
}

function IconSheet({ blue, names }: { blue: boolean; names: readonly GameIconName[] }) {
  return <View style={{ flexDirection: 'row', flexWrap: 'wrap', rowGap: 6 }}>
    {names.map(name => <View key={name} style={{ width: '33.33%', alignItems: 'center', paddingVertical: 2 }}>
      <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 4, height: 50 }}>
        <GameIcon name={name} size={16} />
        <GameIcon name={name} size={24} />
        <GameIcon name={name} size={48} />
      </View>
      <GameText preset="caption" tone={blue ? 'onBlue' : 'onLight'}>{name}</GameText>
    </View>)}
  </View>;
}

type DialogDemo = 'simple' | 'confirm' | 'three' | 'long';
type Backdrop = 'cream' | 'blue';

const DIALOG_DEMOS: Record<DialogDemo, () => void> = {
  simple: () => gameAlert('Coin saved!', 'It is waiting on your park shelf.'),
  confirm: () => {
    void confirmGame({ title: 'Leave the line?', message: 'Your queue progress is saved for today.', confirmLabel: 'Leave', cancelLabel: 'Keep playing', destructive: true })
      .then(leave => { if (leave) gameAlert('You left the line', undefined, undefined, { icon: 'check' }); });
  },
  three: () => gameAlert('How did your wait end?', 'You keep any eligible rewards either way.', [
    { text: 'I reached boarding' },
    { text: 'I left the line' },
    { text: 'Keep playing', style: 'cancel' },
  ], { icon: 'timer' }),
  // A real Alert.alert title from the app that is a whole sentence: it must not shrink inside the ribbon.
  long: () => gameAlert('Are you sure you want to leave? This draft will not be saved.', 'Your picks so far will be lost.', [
    { text: 'Leave', style: 'destructive' },
    { text: 'Stay', style: 'cancel' },
  ]),
};

export default function UiKitGym({ route }: { route?: { params?: { section?: Section; demo?: DialogDemo; backdrop?: Backdrop } } }) {
  const insets = useSafeAreaInsets();
  const [section, setSection] = useState<Section>(route?.params?.section ?? (route?.params?.demo ? 'dialogs' : 'icons'));
  const [backdrop, setBackdrop] = useState<Backdrop>(route?.params?.backdrop ?? 'cream');
  const demo = route?.params?.demo;
  useEffect(() => {
    if (!demo) return;
    const timer = setTimeout(() => DIALOG_DEMOS[demo](), 600);
    return () => clearTimeout(timer);
  }, [demo]);
  const [controlled, setControlled] = useState(false);
  const [loaderState, setLoaderState] = useState<'loading' | 'empty' | 'error'>('loading');
  const [busy, setBusy] = useState(false);

  const pageColor = section === 'dialogs' && backdrop === 'blue' ? BRAND.blueBright : BRAND.cream;

  return <View style={{ flex: 1, backgroundColor: pageColor }}>
    <View style={{
      backgroundColor: BRAND.blueBright, paddingTop: insets.top + SPACE.sm, paddingBottom: SPACE.sm,
      borderBottomWidth: OUTLINE.thick, borderBottomColor: BRAND.navy,
    }}>
      <GameText preset="display" tone="onBlue" align="center">UI Kit</GameText>
      <View style={{ flexDirection: 'row', justifyContent: 'center', gap: 6, marginTop: SPACE.xs, paddingHorizontal: SPACE.sm }}>
        {SECTIONS.map(name => <Chip key={name} label={name} selected={section === name} onPress={() => setSection(name)} />)}
      </View>
    </View>
    <ScrollView contentContainerStyle={{ padding: SPACE.lg, paddingBottom: insets.bottom + 120 }}>
      {section === 'icons' && <>
        <Panel title="Originals, reused as drawn"><IconSheet blue={false} names={ORIGINAL_ICON_NAMES} /></Panel>
        <Panel title="New, drawn from Alex's references"><IconSheet blue={false} names={GENERATED_ICON_NAMES} /></Panel>
        <Panel title="On house blue" blue><IconSheet blue names={[...ORIGINAL_ICON_NAMES, ...GENERATED_ICON_NAMES]} /></Panel>
      </>}

      {section === 'buttons' && <>
        <Panel title="YellowButton, full width">
          {['Close', 'Collect', 'Awesome!', 'Spend 1 Ticket to Play!', 'Not Enough Resources'].map(label =>
            <YellowButton key={label} text={label} onPress={() => undefined} />)}
          <YellowButton text="Walk closer" disabled />
        </Panel>
        <Panel title="YellowButton in a modal column">
          <View style={{ width: 230, alignSelf: 'center', gap: SPACE.sm }}>
            {['OK', 'Nice!', 'Leave Gift', 'Turn On Location'].map(label =>
              <YellowButton key={label} text={label} onPress={() => undefined} />)}
          </View>
        </Panel>
        <Panel title="GameButton: primary, secondary, danger">
          <GameButton label="Spend 1 Ticket" icon="ticket" onPress={() => undefined} />
          <GameButton label="Show me the line" variant="secondary" onPress={() => undefined} />
          <GameButton label="Leave the line" variant="danger" onPress={() => undefined} />
          <GameButton label="Not now" variant="ghost" onPress={() => undefined} />
        </Panel>
        <Panel title="GameButton states">
          <GameButton label="Saving" loading={busy} onPress={() => undefined} />
          <GameButton label={busy ? 'Stop loading' : 'Start loading'} variant="secondary"
            onPress={() => setBusy(value => !value)} />
          <GameButton label="Walk closer to play" disabled onPress={() => undefined} />
        </Panel>
        <Panel title="On house blue" blue>
          <GameButton label="Play in line" icon="play" onPress={() => undefined} />
          <GameButton label="Maybe later" variant="ghost" tone="onBlue" onPress={() => undefined} />
        </Panel>
      </>}

      {section === 'dialogs' && <View style={{ flexDirection: 'row', gap: 6, marginBottom: SPACE.md, justifyContent: 'center' }}>
        {(['cream', 'blue'] as const).map(name => <Chip key={name} label={`on ${name}`}
          selected={backdrop === name} onPress={() => setBackdrop(name)} />)}
      </View>}
      {section === 'dialogs' && <Panel title="GameDialog">
        <GameButton label="Simple alert" variant="secondary" onPress={DIALOG_DEMOS.simple} />
        <GameButton label="Confirm, destructive" variant="secondary" onPress={DIALOG_DEMOS.confirm} />
        <GameButton label="Three choices with icon" variant="secondary" onPress={DIALOG_DEMOS.three} />
        <GameButton label="Long title" variant="secondary" onPress={DIALOG_DEMOS.long} />
        <GameButton label="Two queued" variant="secondary" onPress={() => {
          gameAlert('First', 'Dialogs queue, one at a time.');
          gameAlert('Second', 'This one waited its turn.', undefined, { icon: 'gift' });
        }} />
        <GameButton label="Controlled dialog" variant="secondary" onPress={() => setControlled(true)} />
        <GameDialog visible={controlled} title="Out of Tickets" icon="ticket"
          message="Start a queue adventure to earn your next Ticket."
          buttons={[{ text: 'Got it' }]} onAnswer={() => setControlled(false)} />
      </Panel>}

      {section === 'loaders' && <>
        <View style={{ flexDirection: 'row', gap: 6, marginBottom: SPACE.md, justifyContent: 'center' }}>
          {(['loading', 'empty', 'error'] as const).map(state => <Chip key={state} label={state}
            selected={loaderState === state} onPress={() => setLoaderState(state)} />)}
        </View>
        <Panel title="SharkLoader">
          <View style={{ height: 300 }}>
            <SharkLoader state={loaderState} onRetry={() => setLoaderState('loading')} slowAfterMs={4000}
              title={loaderState === 'empty' ? 'Be the first on the podium' : undefined}
              message={loaderState === 'empty' ? 'Win a ride challenge to take the top spot.' : undefined}
              action={loaderState === 'empty' ? { label: 'Find a ride', icon: 'map', onPress: () => undefined } : undefined} />
          </View>
        </Panel>
        <Panel title="Compact on blue" blue>
          <SharkLoader compact tone="onBlue" />
        </Panel>
      </>}

      {section === 'text' && <>
        <Panel title="Text presets">
          {TEXT_PRESET_NAMES.map(name => <GameText key={name} preset={name}>{name} Park Coins 42</GameText>)}
        </Panel>
        <Panel title="On house blue" blue>
          {(['display', 'title', 'heading', 'body', 'label'] as const).map(name =>
            <GameText key={name} preset={name} tone="onBlue">{name} Ride Coins</GameText>)}
        </Panel>
        <Panel title="GameRichText">
          <GameRichText>{'Spend [icon:ticket] 1 Ticket, earn [icon:coin] 25 coins'}</GameRichText>
          {/* ui-copy-allow(emoji): demo that legacy server emoji become icons or are dropped */}
          <GameRichText preset="bodySmall">{'Legacy server string: Streak \u{1F525} 3 days ⚡ +20 Energy \u{1F92F}'}</GameRichText>
        </Panel>
        <Panel title="Brand tokens">
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            {SWATCHES.map(key => <View key={key} style={{ alignItems: 'center', width: 58 }}>
              <View style={{ width: 44, height: 44, borderRadius: RADIUS.md, backgroundColor: BRAND[key], borderWidth: OUTLINE.thin, borderColor: BRAND.navy }} />
              <GameText preset="caption">{key}</GameText>
            </View>)}
          </View>
        </Panel>
      </>}
    </ScrollView>
    <GameDialogHost />
  </View>;
}
