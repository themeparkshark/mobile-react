import { Image } from 'expo-image';
import * as Haptics from 'expo-haptics';
import { useContext, useEffect, useRef, useState } from 'react';
import {
  Animated,
  Dimensions,
  Easing,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import Modal from 'react-native-modal';
import * as RootNavigation from '../RootNavigation';
import createThread from '../api/endpoints/threads/create';
import useCrumbs from '../hooks/useCrumbs';
import usePermissions from '../hooks/usePermissions';
import { PermissionEnums } from '../models/permission-enums';
import { AuthContext } from '../context/AuthProvider';
import { isTeam, TEAMS } from '../constants/teams';
import { gameAlert, GameIcon } from '../ui';
import Button from './Button';
import config from '../config';
import Svg, { Circle } from 'react-native-svg';

const { height: SCREEN_HEIGHT } = Dimensions.get('window');
const SHEET_HEIGHT = SCREEN_HEIGHT * 0.78;


// ── Character Count Ring ──────────────────────────────────
function CharCountRing({ count, max }: { count: number; max: number }) {
  const size = 28;
  const stroke = 3;
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const progress = Math.min(count / max, 1);
  const strokeDashoffset = circumference * (1 - progress);
  const isWarning = count > max * 0.9;
  const isOver = count > max;
  const color = isOver ? '#ef4444' : isWarning ? '#f59e0b' : config.secondary;
  const remaining = max - count;

  return (
    <View style={{ alignItems: 'center', justifyContent: 'center', width: size, height: size }}>
      <Svg width={size} height={size} style={{ transform: [{ rotate: '-90deg' }] }}>
        <Circle cx={size / 2} cy={size / 2} r={radius} stroke="#e8ecf0" strokeWidth={stroke} fill="none" />
        <Circle
          cx={size / 2} cy={size / 2} r={radius}
          stroke={color} strokeWidth={stroke} fill="none"
          strokeDasharray={`${circumference}`}
          strokeDashoffset={strokeDashoffset}
          strokeLinecap="round"
        />
      </Svg>
      {isWarning && (
        <Text style={{ position: 'absolute', fontFamily: 'Shark', fontSize: 8, color }}>
          {remaining}
        </Text>
      )}
    </View>
  );
}


export default function CreateThreadModal({
  visible,
  onClose,
}: {
  visible?: boolean;
  onClose?: () => void;
}) {
  const [internalVisible, setInternalVisible] = useState(false);
  const modalVisible = visible !== undefined ? visible : internalVisible;
  const closeModal = () => {
    if (onClose) onClose();
    else setInternalVisible(false);
  };

  const [content, setContent] = useState<string>('');
  const [postType, setPostType] = useState<'public' | 'team'>('public');
  const { checkPermission, hasPermission } = usePermissions();
  const { labels } = useCrumbs();
  const [hasPressed, setHasPressed] = useState<boolean>(false);
  const { player } = useContext(AuthContext);
  const inputRef = useRef<TextInput>(null);

  const playerTeam = (player as any)?.team?.team as string | undefined;
  const teamInfo = isTeam(playerTeam) ? TEAMS[playerTeam] : null;
  const confirmDiscard = () => {
    gameAlert('Discard this post?', 'Your draft will not be saved.', [
      { text: 'Keep writing', style: 'cancel' },
      { text: 'Discard', style: 'destructive', onPress: () => closeModal() },
    ]);
  };

  useEffect(() => {
    if (!modalVisible) {
      setContent('');
      setPostType('public');
      setHasPressed(false);
    }
  }, [modalVisible]);

  return (
    <>
      {visible === undefined && (
        <Button
          hasPermission={hasPermission(PermissionEnums.CreateThreads)}
          onPress={() => {
            if (checkPermission(PermissionEnums.CreateThreads)) {
              setInternalVisible(true);
            }
          }}
        >
          <Image
            style={{ width: 35, height: 35, alignSelf: 'center' }}
            contentFit="contain"
            source={require('../../assets/images/screens/social/create_thread.png')}
          />
        </Button>
      )}
      <Modal
        isVisible={modalVisible}
        onBackdropPress={() => {
          if (content.length) {
            confirmDiscard();
          } else {
            closeModal();
          }
        }}
        onSwipeComplete={() => {
          if (!content.length) closeModal();
        }}
        swipeDirection={content.length ? undefined : 'down'}
        swipeThreshold={50}
        style={{ margin: 0, justifyContent: 'flex-end' }}
        backdropOpacity={0.4}
        animationIn="slideInUp"
        animationOut="slideOutDown"
        animationInTiming={300}
        animationOutTiming={200}
        useNativeDriverForBackdrop
        statusBarTranslucent
        avoidKeyboard
      >
        <View
          style={{
            height: SHEET_HEIGHT,
            backgroundColor: '#f0f4f8',
            borderTopLeftRadius: 24,
            borderTopRightRadius: 24,
            overflow: 'hidden',
          }}
        >
          {/* Handle bar */}
          <View style={createStyles.topBar}>
            <View style={{ flex: 1 }}>
              <TouchableOpacity onPress={() => {
                if (content.length) {
                  confirmDiscard();
                } else {
                  closeModal();
                }
              }} style={createStyles.closeBtn} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
                <GameIcon name="close" size={26} accessibilityLabel="Close" />
              </TouchableOpacity>
            </View>
            <View style={createStyles.handle} />
            <View style={{ flex: 1, alignItems: 'flex-end', flexDirection: 'row', justifyContent: 'flex-end', gap: 12 }}>
              <CharCountRing count={content.length} max={2000} />
              <TouchableOpacity
                disabled={!content.trim().length || hasPressed}
                onPress={async () => {
                  if (hasPressed) return;
                  setHasPressed(true);
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                  const trimmed = content.trim();
                  const autoTitle = trimmed.split('\n')[0].slice(0, 140);
                  try {
                    const newThread = await createThread({
                      title: autoTitle,
                      content: trimmed,
                      team: postType === 'team' && playerTeam ? playerTeam as any : null,
                    });
                    if (newThread) {
                      RootNavigation.navigate('Thread', { thread: newThread.id });
                    }
                    closeModal();
                  } catch {
                    // Keep the draft so nothing the player wrote is lost.
                    setHasPressed(false);
                    gameAlert("Couldn't post", 'Your post is still here. Check your connection and try again.');
                  }
                }}
                style={[createStyles.submitBtn, !content.trim().length && { opacity: 0.4 }]}
              >
                <Text style={createStyles.submitText}>Post</Text>
              </TouchableOpacity>
            </View>
          </View>

            {/* Post type toggle */}
            {playerTeam && teamInfo && (
              <View style={createStyles.toggleRow}>
                <Pressable
                  onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); setPostType('public'); }}
                  style={[createStyles.togglePill, postType === 'public' && createStyles.toggleActive]}
                >
                  <GameIcon name="map" size={18} />
                  <Text style={[createStyles.toggleText, postType === 'public' && { color: '#0d1b2a' }]}>Public</Text>
                </Pressable>
                <Pressable
                  onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); setPostType('team'); }}
                  style={[createStyles.togglePill, postType === 'team' && { ...createStyles.toggleActive, backgroundColor: teamInfo.color + '18' }]}
                >
                  <Image source={teamInfo.badge} style={{ width: 18, height: 18 }} contentFit="contain" />
                  <Text style={[createStyles.toggleText, postType === 'team' && { color: teamInfo.color }]}>{teamInfo.name}</Text>
                </Pressable>
              </View>
            )}

            {postType === 'team' && teamInfo && (
              <View style={createStyles.teamHint}>
                <GameIcon name="lock" size={14} />
                <Text style={[createStyles.teamHintText, { color: teamInfo.color }]}>
                  Only {teamInfo.name} members will see this post
                </Text>
              </View>
            )}

            {/* Content card */}
            <View style={createStyles.contentCard}>
              <ScrollView contentContainerStyle={{ flexGrow: 1 }} keyboardShouldPersistTaps="handled">
                <TextInput
                  ref={inputRef}
                  style={createStyles.bodyInput}
                  autoFocus
                  multiline
                  autoCapitalize="sentences"
                  onChangeText={setContent}
                  value={content}
                  placeholder="What's on your mind?"
                  placeholderTextColor="#a0aec0"
                  maxLength={2000}
                />
              </ScrollView>
            </View>

        </View>
      </Modal>
    </>
  );
}

const createStyles = StyleSheet.create({
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingTop: 10,
    paddingBottom: 6,
    paddingHorizontal: 16,
  },
  handle: { width: 40, height: 5, borderRadius: 3, backgroundColor: '#d0d5dd' },
  closeBtn: { width: 32, height: 32, borderRadius: 16, backgroundColor: '#f0f4f8', alignItems: 'center', justifyContent: 'center' },
  submitBtn: {
    backgroundColor: config.secondary,
    borderRadius: 14,
    paddingHorizontal: 22,
    paddingVertical: 10,
  },
  submitText: {
    fontFamily: 'Shark',
    fontSize: 14,
    color: 'white',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  toggleRow: {
    flexDirection: 'row',
    marginHorizontal: 16,
    marginBottom: 8,
    backgroundColor: 'white',
    borderRadius: 12,
    padding: 3,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 3,
    elevation: 1,
  },
  togglePill: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 8,
    borderRadius: 10,
  },
  toggleActive: {
    backgroundColor: '#f0f4f8',
  },
  toggleText: {
    fontFamily: 'Shark',
    fontSize: 12,
    color: '#a0aec0',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  teamHint: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginHorizontal: 16,
    marginBottom: 8,
    paddingHorizontal: 12,
    paddingVertical: 6,
    backgroundColor: 'white',
    borderRadius: 10,
  },
  teamHintText: {
    fontFamily: 'Shark',
    fontSize: 11,
    letterSpacing: 0.3,
  },
  contentCard: {
    flex: 1,
    marginHorizontal: 16,
    backgroundColor: 'white',
    borderRadius: 16,
    padding: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 3,
  },
  bodyInput: {
    fontSize: 17,
    color: '#1a2332',
    lineHeight: 24,
    width: '100%',
    flex: 1,
  },
});
