/**
 * In-app tester feedback. Mount <FeedbackHost /> once in Root, inside the
 * providers. Open it with openFeedbackReport('settings') (Settings > Report a
 * Problem) or by shaking the phone on the internal-tunnel channel or a dev
 * build. It takes a screenshot of the current screen first, then asks for an
 * optional note and sends both with the device context and the recent console
 * warnings and errors to POST /me/feedback.
 *
 * JS only: view-shot, expo-sensors, expo-device, expo-application and
 * expo-updates are all in the shipped binary, so this ships over the air.
 */
import * as Application from 'expo-application';
import * as Device from 'expo-device';
import { Accelerometer } from 'expo-sensors';
import * as Updates from 'expo-updates';
import { useCallback, useContext, useEffect, useRef, useState } from 'react';
import { AppState, Dimensions, Image, PixelRatio, Platform, Pressable, StyleSheet, TextInput, View } from 'react-native';
import { captureScreen } from 'react-native-view-shot';
import sendTesterFeedback from '../../api/endpoints/me/tester-feedback';
import { AuthContext } from '../../context/AuthProvider';
import { LocationStatusContext } from '../../context/LocationProvider';
import { navigationRef } from '../../RootNavigation';
import { recentLogLines } from '../../services/feedback/consoleRing';
import {
  createShakeDetector, FEEDBACK_COPY, feedbackCaptureSize, feedbackRequest, NOTE_MAX, shakeEnabled,
  type FeedbackSnapshot, type FeedbackTrigger,
} from '../../services/feedback/model';
import { addBreadcrumb } from '../../services/telemetry';
import { BRAND, FONT, GameButton, GameDialog, GameIcon, GameText, OUTLINE, RADIUS, SPACE } from '../../ui';

type Opener = (trigger: FeedbackTrigger) => void;
let opener: Opener | null = null;

/** Start a report from anywhere. A no-op until the host is mounted. */
export function openFeedbackReport(trigger: FeedbackTrigger = 'settings'): void {
  opener?.(trigger);
}

const SHAKE_INTERVAL_MS = 80;

type Draft = {
  readonly trigger: FeedbackTrigger;
  readonly screenshot: string | null;
  readonly snapshot: FeedbackSnapshot;
};

export default function FeedbackHost() {
  const { player } = useContext(AuthContext);
  const { park, latestLocationSampleRef } = useContext(LocationStatusContext);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [visible, setVisible] = useState(false);
  const [note, setNote] = useState('');
  const [includeShot, setIncludeShot] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const opening = useRef(false);
  const latest = useRef({ player, park });
  latest.current = { player, park };

  const open = useCallback(async (trigger: FeedbackTrigger) => {
    if (opening.current || !latest.current.player) return;
    opening.current = true;
    addBreadcrumb('feedback', `open:${trigger}`);
    // Capture before the dialog mounts, so the report shows what the tester saw.
    const size = feedbackCaptureSize(Platform.OS, PixelRatio.get(), Dimensions.get('window'));
    const screenshot = await captureScreen({ format: 'jpg', quality: 0.6, result: 'base64', ...size })
      .catch(() => null);
    const sample = latestLocationSampleRef?.current;
    const current = latest.current;
    setDraft({
      trigger,
      screenshot,
      snapshot: {
        route: navigationRef.isReady() ? navigationRef.getCurrentRoute()?.name : null,
        player: current.player,
        park: current.park ?? null,
        gps: sample ? { accuracyMeters: sample.accuracyMeters, timestamp: sample.timestamp } : null,
        app: { version: Application.nativeApplicationVersion, build: Application.nativeBuildVersion },
        updates: {
          updateId: Updates.updateId, channel: Updates.channel, runtimeVersion: Updates.runtimeVersion,
          isEmbeddedLaunch: Updates.isEmbeddedLaunch,
        },
        device: { modelName: Device.modelName, osName: Device.osName, osVersion: Device.osVersion },
        isDev: __DEV__,
        now: Date.now(),
      },
    });
    setIncludeShot(!!screenshot);
    setError(null);
    setSent(false);
    setVisible(true);
  }, [latestLocationSampleRef]);

  useEffect(() => {
    opener = trigger => { void open(trigger); };
    return () => { opener = null; };
  }, [open]);

  // Shake to report, internal channel and dev only, and only while the app is in front.
  const shakeOn = shakeEnabled({ channel: Updates.channel, isDev: __DEV__ }) && !!player && !visible;
  useEffect(() => {
    if (!shakeOn) return undefined;
    const detect = createShakeDetector();
    let subscription: { remove: () => void } | null = null;
    const start = () => {
      if (subscription) return;
      Accelerometer.setUpdateInterval(SHAKE_INTERVAL_MS);
      subscription = Accelerometer.addListener(sample => {
        if (detect(sample, Date.now())) void open('shake');
      });
    };
    const stop = () => { subscription?.remove(); subscription = null; };
    if (AppState.currentState === 'active') start();
    const appState = AppState.addEventListener('change', state => { if (state === 'active') start(); else stop(); });
    return () => { appState.remove(); stop(); };
  }, [shakeOn, open]);

  const submit = async () => {
    if (!draft || busy) return;
    const body = feedbackRequest({
      note, screenshot: draft.screenshot, includeScreenshot: includeShot, trigger: draft.trigger,
      snapshot: draft.snapshot, logs: recentLogLines(),
    });
    if (!body) {
      setError(FEEDBACK_COPY.needSomething);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await sendTesterFeedback(body);
      addBreadcrumb('feedback', 'sent');
      setNote('');
      setSent(true);
    } catch {
      setError(FEEDBACK_COPY.failed);
    } finally {
      setBusy(false);
    }
  };

  const finish = () => {
    setVisible(false);
    setDraft(null);
    setSent(false);
    setError(null);
    opening.current = false;
  };

  if (!draft) return null;

  if (sent) {
    return (
      <GameDialog visible={visible} title={FEEDBACK_COPY.sentTitle} message={FEEDBACK_COPY.sentMessage} icon="check"
        haptic="success" buttons={[{ text: FEEDBACK_COPY.sentButton }]} onAnswer={finish} testID="feedback-sent" />
    );
  }

  return (
    <GameDialog
      visible={visible}
      title={FEEDBACK_COPY.title}
      message={FEEDBACK_COPY.message}
      dismissible={!busy}
      buttons={[{ text: FEEDBACK_COPY.cancel, style: 'cancel' }]}
      onAnswer={finish}
      avoidKeyboard
      testID="feedback-report"
    >
      <View style={styles.body}>
        {draft.screenshot ? (
          <Pressable
            accessibilityRole="checkbox"
            accessibilityState={{ checked: includeShot }}
            accessibilityLabel="Attach screenshot"
            onPress={() => setIncludeShot(value => !value)}
            disabled={busy}
            style={styles.shotRow}
          >
            <Image source={{ uri: `data:image/jpeg;base64,${draft.screenshot}` }}
              style={[styles.thumb, !includeShot && styles.thumbOff]} resizeMode="cover" />
            <View style={styles.shotLabel}>
              <GameIcon name={includeShot ? 'check' : 'close'} size={22} />
              <GameText preset="bodySmall" tone="onBlue" style={styles.shotText}>
                {includeShot ? FEEDBACK_COPY.screenshotOn : FEEDBACK_COPY.screenshotOff}
              </GameText>
            </View>
          </Pressable>
        ) : (
          <GameText preset="bodySmall" tone="onBlue" align="center" style={styles.shotText}>{FEEDBACK_COPY.noScreenshot}</GameText>
        )}
        <TextInput
          style={styles.input}
          value={note}
          onChangeText={text => { setNote(text); if (error) setError(null); }}
          placeholder={FEEDBACK_COPY.placeholder}
          placeholderTextColor={BRAND.navySoft}
          multiline
          maxLength={NOTE_MAX}
          editable={!busy}
          textAlignVertical="top"
          accessibilityLabel="What happened"
          testID="feedback-note"
        />
        {!!error && <GameText preset="bodySmall" tone="onBlue" align="center" style={styles.error}>{error}</GameText>}
        <GameButton label={FEEDBACK_COPY.send} loading={busy} onPress={() => void submit()}
          accessibilityHint="Sends your note, the screenshot and device details to the team" />
      </View>
    </GameDialog>
  );
}

const styles = StyleSheet.create({
  body: { alignSelf: 'stretch', gap: SPACE.sm },
  shotRow: { flexDirection: 'row', alignItems: 'center', gap: SPACE.md },
  thumb: {
    width: 64, height: 112, borderRadius: RADIUS.sm, borderWidth: OUTLINE.thin, borderColor: BRAND.white,
    backgroundColor: BRAND.sky,
  },
  thumbOff: { opacity: 0.35 },
  shotLabel: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: SPACE.xs },
  shotText: { color: BRAND.white },
  input: {
    backgroundColor: BRAND.cream,
    borderRadius: RADIUS.md,
    borderWidth: OUTLINE.thick,
    borderColor: BRAND.navy,
    color: BRAND.navy,
    fontFamily: FONT.body,
    fontSize: 18,
    minHeight: 96,
    maxHeight: 160,
    paddingHorizontal: SPACE.md,
    paddingVertical: SPACE.sm,
  },
  error: { color: BRAND.goldLight },
});
