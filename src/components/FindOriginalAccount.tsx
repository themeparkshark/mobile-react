/**
 * Find my original account: the dialog a returning player uses to bring back
 * the account they had in the original Theme Park Shark app. Opened from the
 * Welcome screen (first sign-in) and Settings, Account.
 *
 * Built on the UI kit's GameDialog (his ribbon, the house blue card, his yellow
 * buttons). The flow model lives in src/services/accountRecovery/model.ts; the
 * server decides everything about accounts.
 */
import { useContext, useEffect, useRef, useState } from 'react';
import { Linking, StyleSheet, TextInput, View } from 'react-native';
import {
  requestRecoveryCode, verifyRecoveryCode,
} from '../api/endpoints/me/account-recovery';
import { AuthContext } from '../context/AuthProvider';
import * as RootNavigation from '../RootNavigation';
import {
  afterRequest, afterVerify, checkIdentifier, CODE_LENGTH, INITIAL_RECOVERY, isCompleteCode, linkedMessage,
  noCode, normalizeCode, RECOVERY_COPY, recoverySupportMailto, supportMessage, type RecoveryState,
} from '../services/accountRecovery/model';
import { SUPPORT_EMAIL } from '../screens/Settings/accountDeletion';
import { BRAND, FONT, GameButton, GameDialog, GameText, OUTLINE, RADIUS, SPACE, gameAlert } from '../ui';

type Props = {
  readonly visible: boolean;
  readonly onClose: () => void;
};

export default function FindOriginalAccount({ visible, onClose }: Props) {
  const { player, adoptSession, logout } = useContext(AuthContext);
  const [state, setState] = useState<RecoveryState>(INITIAL_RECOVERY);
  const [identifier, setIdentifier] = useState('');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const stepRef = useRef(state.step);
  stepRef.current = state.step;
  // The player id for support, kept after the link replaces the session.
  const playerId = useRef<number | null>(player?.id ?? null);

  useEffect(() => {
    if (visible) {
      setState(INITIAL_RECOVERY);
      setIdentifier('');
      setCode('');
      setBusy(false);
      playerId.current = player?.id ?? null;
    }
    // Reset only when the dialog opens.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  const sendCode = async () => {
    if (busy) return;
    const checked = checkIdentifier(identifier);
    if (checked.error) {
      setState(current => ({ ...current, error: checked.error }));
      return;
    }
    setBusy(true);
    const result = await requestRecoveryCode(checked.value);
    setBusy(false);
    setCode('');
    setState(current => afterRequest(current, result));
  };

  const checkCode = async () => {
    if (busy) return;
    if (!isCompleteCode(code)) {
      setState(current => ({ ...current, error: `Enter all ${CODE_LENGTH} digits from the email.` }));
      return;
    }
    setBusy(true);
    const result = await verifyRecoveryCode(normalizeCode(code));
    if (result.kind === 'linked') {
      try {
        // Switch now: the account this session belonged to was merged away.
        await adoptSession(result.token, { navigate: false });
      } catch {
        // The link is done on the server; a fresh Apple sign-in opens the original account.
        setBusy(false);
        onClose();
        gameAlert('Your account is back', 'Sign in with Apple again to open it.', undefined, { icon: 'check' });
        await logout();
        return;
      }
    }
    setBusy(false);
    setState(current => afterVerify(current, result));
  };

  const emailSupport = async () => {
    const url = recoverySupportMailto(SUPPORT_EMAIL, {
      playerId: playerId.current,
      typedIdentifier: identifier,
      reason: state.supportReason ?? 'other',
    });
    try {
      if (await Linking.canOpenURL(url)) {
        await Linking.openURL(url);
        return;
      }
    } catch { /* show the address instead */ }
    gameAlert('Email support', `Write to ${SUPPORT_EMAIL} with your new player ID.`, undefined, { icon: 'info' });
  };

  const finish = (index: number | null) => {
    onClose();
    if (stepRef.current === 'linked' && index !== null) RootNavigation.navigate('Loading');
  };

  const title = state.step === 'identify' ? RECOVERY_COPY.identifyTitle
    : state.step === 'code' ? RECOVERY_COPY.codeTitle
      : state.step === 'support' ? RECOVERY_COPY.supportTitle
        : RECOVERY_COPY.linkedTitle;
  const message = state.step === 'identify' ? RECOVERY_COPY.identifyMessage
    : state.step === 'code' ? RECOVERY_COPY.codeMessage
      : state.step === 'support' ? supportMessage(state.supportReason ?? 'other', playerId.current)
        : linkedMessage(state.screenName);

  return (
    <GameDialog
      visible={visible}
      title={title}
      message={message}
      icon={state.step === 'linked' ? 'check' : undefined}
      haptic={state.step === 'linked' ? 'success' : 'none'}
      dismissible={!busy && state.step !== 'linked'}
      buttons={state.step === 'linked'
        ? [{ text: RECOVERY_COPY.done }]
        : [{ text: RECOVERY_COPY.close, style: 'cancel' }]}
      onAnswer={finish}
      avoidKeyboard
      testID="find-original-account"
    >
      {state.step === 'identify' && (
        <View style={styles.body}>
          <TextInput
            style={styles.input}
            value={identifier}
            onChangeText={text => { setIdentifier(text); if (state.error) setState(current => ({ ...current, error: null })); }}
            placeholder={RECOVERY_COPY.identifyPlaceholder}
            placeholderTextColor={BRAND.navySoft}
            autoCapitalize="none"
            autoCorrect={false}
            autoComplete="off"
            keyboardType="email-address"
            returnKeyType="send"
            maxLength={255}
            editable={!busy}
            onSubmitEditing={() => void sendCode()}
            accessibilityLabel="Original username or email"
            testID="recovery-identifier"
          />
          {!!state.error && <GameText preset="bodySmall" tone="onBlue" align="center" style={styles.error}>{state.error}</GameText>}
          <GameButton label={RECOVERY_COPY.identifyButton} loading={busy} onPress={() => void sendCode()}
            accessibilityHint="Emails a code to your original account" />
        </View>
      )}

      {state.step === 'code' && (
        <View style={styles.body}>
          <TextInput
            style={[styles.input, styles.code]}
            value={code}
            onChangeText={text => { setCode(normalizeCode(text)); if (state.error) setState(current => ({ ...current, error: null })); }}
            placeholder="000000"
            placeholderTextColor={BRAND.skyDeep}
            keyboardType="number-pad"
            textContentType="oneTimeCode"
            autoComplete="one-time-code"
            maxLength={CODE_LENGTH}
            editable={!busy}
            returnKeyType="done"
            onSubmitEditing={() => void checkCode()}
            accessibilityLabel="6-digit code"
            testID="recovery-code"
          />
          {!!state.error && <GameText preset="bodySmall" tone="onBlue" align="center" style={styles.error}>{state.error}</GameText>}
          <GameButton label={RECOVERY_COPY.codeButton} loading={busy} onPress={() => void checkCode()}
            accessibilityHint="Checks the code and brings back your original account" />
          <View style={styles.row}>
            <GameButton label={RECOVERY_COPY.noCode} variant="ghost" tone="onBlue" fullWidth={false}
              onPress={() => setState(noCode)} />
            <GameButton label={RECOVERY_COPY.differentAccount} variant="ghost" tone="onBlue" fullWidth={false}
              onPress={() => setState({ ...INITIAL_RECOVERY })} />
          </View>
        </View>
      )}

      {state.step === 'support' && (
        <View style={styles.body}>
          <GameButton label={RECOVERY_COPY.emailSupport} icon="info" onPress={() => void emailSupport()}
            accessibilityHint={`Opens an email to ${SUPPORT_EMAIL} with your player ID`} />
        </View>
      )}
    </GameDialog>
  );
}

const styles = StyleSheet.create({
  body: { alignSelf: 'stretch', gap: SPACE.sm },
  input: {
    backgroundColor: BRAND.cream,
    borderRadius: RADIUS.md,
    borderWidth: OUTLINE.thick,
    borderColor: BRAND.navy,
    color: BRAND.navy,
    fontFamily: FONT.body,
    fontSize: 20,
    paddingHorizontal: SPACE.md,
    paddingVertical: SPACE.sm + 2,
    textAlign: 'center',
  },
  code: { fontFamily: FONT.display, fontSize: 32, letterSpacing: 8 },
  error: { color: BRAND.goldLight },
  row: { flexDirection: 'row', justifyContent: 'space-between' },
});
