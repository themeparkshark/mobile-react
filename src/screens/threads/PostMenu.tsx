/**
 * The "..." sheet for a post or reply. Big rows, one word each, Alex chrome.
 * - Mine: Edit (posts), Delete.
 * - Someone else's: Report, Block.
 * Report is a second step with five kid reasons. After a report or block
 * the item disappears at once and a kind toast says a grown-up will check.
 */
import { useContext, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Modal from 'react-native-modal';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { blockPlayer, removeComment, removeThread, report, type ReportReason } from '../../api/endpoints/social';
import { useToast } from '../../components/Toast';
import { SoundEffectContext } from '../../context/SoundEffectProvider';
import { BRAND, GameIcon, confirmGame, type GameIconName } from '../../ui';
import useUiReducedMotion from '../../ui/useUiReducedMotion';
import { PressScale } from './socialLook';

const OPEN = require('../../../assets/sounds/modal_open.mp3');

export interface MenuTarget {
  readonly kind: 'thread' | 'comment';
  readonly id: number;
  readonly authorId: number | null;
  readonly authorName: string;
  readonly mine: boolean;
}

const REASONS: readonly { reason: ReportReason; label: string; icon: GameIconName }[] = [
  { reason: 'disrespectful', label: 'Mean or bullying', icon: 'heart' },
  { reason: 'swearing', label: 'Bad words', icon: 'close' },
  { reason: 'personal_info', label: 'Personal info', icon: 'lock' },
  { reason: 'spam', label: 'Spam or selling', icon: 'coins' },
  { reason: 'unrelated', label: 'Not about parks', icon: 'map' },
];

function Row({ icon, label, danger, onPress }: { readonly icon: GameIconName; readonly label: string; readonly danger?: boolean; readonly onPress: () => void }) {
  return (
    <PressScale onPress={onPress} scaleTo={0.97} style={[styles.row, danger && styles.rowDanger]} accessibilityLabel={label}>
      <View style={[styles.rowIcon, danger && { backgroundColor: '#ffe1de' }]}>
        <GameIcon name={icon} size={26} />
      </View>
      <Text style={[styles.rowText, danger && { color: BRAND.redLip }]}>{label}</Text>
    </PressScale>
  );
}

export default function PostMenu({
  target,
  onClose,
  onEdit,
  onGone,
}: {
  readonly target: MenuTarget | null;
  readonly onClose: () => void;
  readonly onEdit?: () => void;
  /** The item should leave the screen (deleted, reported or author blocked). */
  readonly onGone: (why: 'deleted' | 'reported' | 'blocked', target: MenuTarget) => void;
}) {
  const insets = useSafeAreaInsets();
  const reduced = useUiReducedMotion();
  const { showToast } = useToast();
  const { playSound } = useContext(SoundEffectContext);
  const [step, setStep] = useState<'menu' | 'report'>('menu');
  const [busy, setBusy] = useState(false);
  const noun = target?.kind === 'thread' ? 'post' : 'reply';

  const close = () => {
    onClose();
    setTimeout(() => setStep('menu'), 300);
  };

  const run = async (item: MenuTarget, work: () => Promise<void>, why: 'deleted' | 'reported' | 'blocked', toast: string) => {
    if (busy) return;
    setBusy(true);
    try {
      await work();
      onGone(why, item);
      showToast({ type: 'success', message: toast, icon: why === 'deleted' ? 'check' : 'shark' });
    } catch {
      showToast({ type: 'error', message: "That didn't work. Try again in a moment." });
    } finally {
      setBusy(false);
    }
  };

  /** Dialogs live under this sheet, so close it before asking. */
  const closeThen = (next: () => void) => {
    close();
    setTimeout(next, 380);
  };

  const doDelete = () => {
    if (!target) return;
    const item = target;
    closeThen(async () => {
      const yes = await confirmGame({ title: `Delete ${noun}?`, message: 'It will be gone for everyone.', confirmLabel: 'Delete', destructive: true });
      if (yes) await run(item, () => (item.kind === 'thread' ? removeThread(item.id) : removeComment(item.id)), 'deleted', `Your ${noun} is deleted.`);
    });
  };

  const doBlock = () => {
    if (!target?.authorId) return;
    const item = target;
    closeThen(async () => {
      const yes = await confirmGame({
        title: 'Block player?',
        message: `You won't see ${item.authorName} anymore, and they can't reply to you.`,
        confirmLabel: 'Block',
        destructive: true,
      });
      if (yes) await run(item, () => blockPlayer(item.authorId as number), 'blocked', `${item.authorName} is blocked.`);
    });
  };

  const doReport = (reason: ReportReason) => {
    if (!target) return;
    const item = target;
    closeThen(() => run(item, () => report(item.kind, item.id, reason), 'reported', 'Thanks for telling us! A grown-up will check it.'));
  };

  return (
    <Modal
      isVisible={target !== null}
      onBackdropPress={close}
      onBackButtonPress={close}
      onSwipeComplete={close}
      swipeDirection="down"
      onModalWillShow={() => playSound(OPEN, { volume: 0.5 })}
      style={styles.modal}
      backdropColor={BRAND.navy}
      backdropOpacity={0.35}
      animationIn={reduced ? 'fadeIn' : 'slideInUp'}
      animationOut={reduced ? 'fadeOut' : 'slideOutDown'}
      useNativeDriverForBackdrop
      hideModalContentWhileAnimating
    >
      <View style={[styles.sheet, { paddingBottom: Math.max(insets.bottom, 16) }]}>
        <View style={styles.handle} />
        {step === 'menu' ? (
          <>
            <Text style={styles.title} accessibilityRole="header">{target?.mine ? `Your ${noun}` : `${target?.authorName ?? ''}'s ${noun}`}</Text>
            {target?.mine ? (
              <>
                {target.kind === 'thread' && onEdit && <Row icon="edit" label="Edit" onPress={() => { close(); setTimeout(onEdit, 350); }} />}
                <Row icon="close" label="Delete" danger onPress={doDelete} />
              </>
            ) : (
              <>
                <Row icon="info" label="Report" onPress={() => setStep('report')} />
                {target?.authorId ? <Row icon="lock" label={`Block ${target.authorName}`} danger onPress={doBlock} /> : null}
              </>
            )}
            <PressScale onPress={close} style={styles.cancel} accessibilityLabel="Cancel" haptic="none">
              <Text style={styles.cancelText}>Cancel</Text>
            </PressScale>
          </>
        ) : (
          <>
            <Text style={styles.title} accessibilityRole="header">What's wrong?</Text>
            <Text style={styles.sub}>A grown-up from Theme Park Shark will check it.</Text>
            {REASONS.map((item) => (
              <Row
                key={item.reason}
                icon={item.icon}
                label={item.label}
                onPress={() => doReport(item.reason)}
              />
            ))}
            <PressScale onPress={() => setStep('menu')} style={styles.cancel} accessibilityLabel="Back" haptic="none">
              <Text style={styles.cancelText}>Back</Text>
            </PressScale>
          </>
        )}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  modal: { margin: 0, justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: BRAND.cream,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    borderWidth: 3,
    borderBottomWidth: 0,
    borderColor: BRAND.navy,
    paddingHorizontal: 16,
    paddingTop: 10,
    gap: 10,
  },
  handle: { alignSelf: 'center', width: 48, height: 6, borderRadius: 3, backgroundColor: '#d9c99b', marginBottom: 4 },
  title: { fontFamily: 'Shark', fontSize: 24, color: BRAND.navy, textAlign: 'center', marginBottom: 2 },
  sub: { fontFamily: 'Knockout', fontSize: 17, color: BRAND.navySoft, textAlign: 'center', marginTop: -6, marginBottom: 4 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    backgroundColor: BRAND.white,
    borderRadius: 18,
    borderWidth: 3,
    borderBottomWidth: 5,
    borderColor: '#0a4f9c',
    paddingVertical: 8,
    paddingHorizontal: 12,
    minHeight: 60,
  },
  rowDanger: { borderColor: BRAND.redLip },
  rowIcon: { width: 40, height: 40, borderRadius: 20, backgroundColor: '#e8f4ff', alignItems: 'center', justifyContent: 'center' },
  rowText: { fontFamily: 'Shark', fontSize: 20, color: BRAND.navy, marginTop: 3 },
  cancel: { alignSelf: 'center', minHeight: 48, justifyContent: 'center', paddingHorizontal: 24 },
  cancelText: { fontFamily: 'Shark', fontSize: 18, color: BRAND.navySoft, marginTop: 3 },
});

