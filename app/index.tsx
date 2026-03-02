import { useEffect, useState, useRef } from 'react';
import { View, ScrollView, Text, TouchableOpacity, StyleSheet, Platform, TextInput, Modal, Pressable, Button, AppState } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Svg, { Circle, Defs, RadialGradient, Stop, Rect } from 'react-native-svg';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, { useAnimatedStyle, useSharedValue, withRepeat, withTiming, Easing } from 'react-native-reanimated';
import AdMobBanner from '../components/AdMobBanner';
import { useInterstitialAd } from '../hooks/useInterstitialAd';
import { useAppOpenAd } from '../hooks/useAppOpenAd';
import { AdManager } from '../utils/AdManager';
import * as Notifications from 'expo-notifications';

const DEBUG_MODE = false; // true にするとデバッグUIが表示される
const DAILY_BUDGET = 240;
const MAX_SESSION = 90;
const STORAGE_KEY = 'focus_timer_data';
const HISTORY_DATE_KEY = 'historyDate';
const HISTORY_DATA_KEY = 'todayHistory';

interface ActiveSession {
  duration: number;
  startTime: number;
  pausedAt: number | null;
  accumulatedRunningSeconds: number;
  endTime: number; // 終了予定時刻 (timestamp ms)
  notificationId: string | null;
}

interface TimerData {
  remainingMinutes: number;
  lastResetDate: string;
  activeSession: ActiveSession | null;
}

interface HistoryEntry {
  id: string;
  endedAt: string;
  label: string;
  minutes: number;
  reason: 'ended' | 'completed';
}

export default function FocusTimer() {
  // 通知許可を取る
const requestPermission = async () => {
  const { status } = await Notifications.getPermissionsAsync();
  if (status !== "granted") {
    await Notifications.requestPermissionsAsync();
  }
};

// 5秒テスト通知（デバッグ付き）
const testNotification = async () => {
  try {console.log("pressed at", Date.now());
    

    // 以前の予約通知が残ってると「即時に来た」ように見えるので全部消す
    await Notifications.cancelAllScheduledNotificationsAsync();

    const id = await Notifications.scheduleNotificationAsync({
      content: {
        title: "テスト通知",
        body: "5秒後に出るはず",
        sound: true,
      },
      trigger: { type: "date", date: new Date(Date.now() + 5000) },
      // もしまだ即時なら、上をコメントアウトして ↓ に切替
      // trigger: new Date(Date.now() + 5000),
    });

    const scheduled = await Notifications.getAllScheduledNotificationsAsync();
    console.log("scheduled id", id);
    console.log("scheduled count", scheduled.length, scheduled);
  } catch (e) {
    console.log("testNotification error:", e);
  }
};
   
    
  const [remainingMinutes, setRemainingMinutes] = useState(DAILY_BUDGET);
  const [activeSession, setActiveSession] = useState<ActiveSession | null>(null);
  const [countdown, setCountdown] = useState(0);
  const [selectedDuration, setSelectedDuration] = useState(25);
  const [taskLabel, setTaskLabel] = useState('');
  const [showResetModal, setShowResetModal] = useState(false);
  const [showEndModal, setShowEndModal] = useState(false);
  const [showEndConfirmModal, setShowEndConfirmModal] = useState(false);
  const [showHistoryModal, setShowHistoryModal] = useState(false);
  const [showClearHistoryModal, setShowClearHistoryModal] = useState(false);
  const [showEditLabelModal, setShowEditLabelModal] = useState(false);
  const [editingEntry, setEditingEntry] = useState<HistoryEntry | null>(null);
  const [editedLabel, setEditedLabel] = useState('');
  const [todayHistory, setTodayHistory] = useState<HistoryEntry[]>([]);
  const [debugToast, setDebugToast] = useState<string | null>(null);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);
  const { showAd: showInterstitialAd } = useInterstitialAd();
  useAppOpenAd();

  // 通知権限の確認＆取得
  const ensureNotificationPermissions = async () => {
    const { status: existingStatus } = await Notifications.getPermissionsAsync();
    let finalStatus = existingStatus;

    if (existingStatus !== 'granted') {
      const { status } = await Notifications.requestPermissionsAsync();
      finalStatus = status;
    }

    return finalStatus === 'granted';
  };

  // ActiveSession から endTime ベースで残り秒数を算出
  const getRemainingSecondsForSession = (session: ActiveSession): number => {
    if (session.pausedAt !== null) {
      // 一時停止中は、停止時点での残り時間を固定
      return Math.max(0, Math.round((session.endTime - session.pausedAt) / 1000));
    }
    return Math.max(0, Math.round((session.endTime - Date.now()) / 1000));
  };

  // セッション終了通知を予約
  const scheduleEndNotification = async (endTime: number, label: string): Promise<string | null> => {
    const hasPermission = await ensureNotificationPermissions();
    if (!hasPermission) {
      console.log('Notifications: permission not granted');
      return null;
    }

    // 既存の予約を全キャンセル → 同セッションにつき常に1件
    await Notifications.cancelAllScheduledNotificationsAsync();

    // safeDate: 必ず未来（最低+1秒）にする → 即時発火を防止
    const safeDate = new Date(Math.max(endTime, Date.now() + 1000));

    try {
      const id = await Notifications.scheduleNotificationAsync({
        content: {
          title: 'Session complete',
          body: label.trim()
            ? `「${label.trim()}」が終了しました`
            : 'Your focus session is complete.',
          sound: true,
        },
        trigger: {
          type: Notifications.SchedulableTriggerInputTypes.DATE,
          date: safeDate,
        },
      });

      console.log('Notifications: scheduled id=', id, 'at', safeDate.toISOString());
      return id;
    } catch (e) {
      console.log('Notifications: schedule error', e);
      return null;
    }
  };

  // 通知キャンセル（全予約を消す → 二重防止）
  const cancelEndNotification = async (_notificationId?: string | null) => {
    try {
      await Notifications.cancelAllScheduledNotificationsAsync();
    } catch (e) {
      console.log('Notifications: cancel error', e);
    }
  };

  useEffect(() => {
    loadData();
    checkHistoryRollover();

    // 通知ハンドラ設定（フォアグラウンド時もアラート＆サウンドを有効化）
    Notifications.setNotificationHandler({
      handleNotification: async () => ({
        shouldShowAlert: true,
        shouldPlaySound: true,
        shouldSetBadge: false,
      }),
    });

    // Android 用通知チャンネル
    if (Platform.OS === 'android') {
      Notifications.setNotificationChannelAsync('timer-finish', {
        name: 'Timer Finish',
        importance: Notifications.AndroidImportance.HIGH,
        sound: 'default',
      });
    }

    const subscription = AppState.addEventListener('change', (nextAppState) => {
      if (nextAppState === 'active') {
        checkHistoryRollover();
      }
    });

    return () => {
      subscription.remove();
    };
  }, []);

  useEffect(() => {
    if (activeSession && activeSession.pausedAt === null) {
      startCountdown();
    } else {
      stopCountdown();
    }

    return () => stopCountdown();
  }, [activeSession]);

  const getTodayDate = () => {
    return new Date().toISOString().split('T')[0];
  };

  const calculateTotalRunningSeconds = (session: {
    startTime: number;
    pausedAt: number | null;
    accumulatedRunningSeconds: number;
  }): number => {
    if (session.pausedAt !== null) {
      // Session is paused, only count accumulated
      return session.accumulatedRunningSeconds;
    } else {
      // Session is running, add current run time
      const currentRunSeconds = Math.floor((Date.now() - session.startTime) / 1000);
      return session.accumulatedRunningSeconds + currentRunSeconds;
    }
  };

  const checkHistoryRollover = async () => {
    try {
      const localTodayKey = getTodayDate();
      const storedHistoryDate = await AsyncStorage.getItem(HISTORY_DATE_KEY);

      if (storedHistoryDate !== localTodayKey) {
        await AsyncStorage.setItem(HISTORY_DATE_KEY, localTodayKey);
        await AsyncStorage.setItem(HISTORY_DATA_KEY, JSON.stringify([]));
        setTodayHistory([]);
      } else {
        await loadHistory();
      }
    } catch (error) {
      console.error('Failed to check history rollover:', error);
    }
  };

  const loadHistory = async () => {
    try {
      const stored = await AsyncStorage.getItem(HISTORY_DATA_KEY);
      if (stored) {
        const history: HistoryEntry[] = JSON.parse(stored);
        setTodayHistory(history);
      }
    } catch (error) {
      console.error('Failed to load history:', error);
    }
  };

  const saveHistory = async (history: HistoryEntry[]) => {
    try {
      await AsyncStorage.setItem(HISTORY_DATA_KEY, JSON.stringify(history));
    } catch (error) {
      console.error('Failed to save history:', error);
    }
  };

  const recordHistoryEntry = async (minutes: number, reason: 'ended' | 'completed') => {
    const entry: HistoryEntry = {
      id: Date.now().toString(),
      endedAt: new Date().toISOString(),
      label: taskLabel.trim() || 'Untitled',
      minutes,
      reason,
    };

    const updatedHistory = [entry, ...todayHistory];
    setTodayHistory(updatedHistory);
    await saveHistory(updatedHistory);
  };

  const clearHistory = async () => {
    setTodayHistory([]);
    await saveHistory([]);
    setShowClearHistoryModal(false);
    setShowHistoryModal(false); // 両方閉じる
  };

  const startEditingEntry = (entry: HistoryEntry) => {
    setShowHistoryModal(false); // 先に History を閉じてからサブモーダルを開く
    setEditingEntry(entry);
    setEditedLabel(entry.label);
    setTimeout(() => setShowEditLabelModal(true), 300);
  };

  const saveEditedLabel = async () => {
    if (!editingEntry) return;

    const trimmedLabel = editedLabel.trim();
    const finalLabel = trimmedLabel || 'Untitled';

    const updatedHistory = todayHistory.map((entry) =>
      entry.id === editingEntry.id
        ? { ...entry, label: finalLabel }
        : entry
    );

    setTodayHistory(updatedHistory);
    await saveHistory(updatedHistory);
    setShowEditLabelModal(false);
    setEditingEntry(null);
    setEditedLabel('');
  };

  const cancelEditLabel = () => {
    setShowEditLabelModal(false);
    setEditingEntry(null);
    setEditedLabel('');
  };

  const loadData = async () => {
    try {
      const stored = await AsyncStorage.getItem(STORAGE_KEY);
      if (stored) {
        const data: TimerData = JSON.parse(stored);
        const today = getTodayDate();

        if (data.lastResetDate !== today) {
          resetDaily();
        } else {
          setRemainingMinutes(data.remainingMinutes);
          if (data.activeSession) {
            // 旧フォーマットからのマイグレーション
            const legacy: any = data.activeSession;

            if (legacy.pausedAt === undefined) {
              legacy.pausedAt = null;
            }
            if (legacy.accumulatedRunningSeconds === undefined) {
              legacy.accumulatedRunningSeconds = 0;
            }
            if (legacy.endTime === undefined) {
              const totalRunningSeconds = calculateTotalRunningSeconds(legacy);
              const sessionSeconds = legacy.duration * 60;
              const remainingSecondsInitial = Math.max(0, sessionSeconds - totalRunningSeconds);
              legacy.endTime = Date.now() + remainingSecondsInitial * 1000;
            }
            if (legacy.notificationId === undefined) {
              legacy.notificationId = null;
            }

            const session: ActiveSession = {
              duration: legacy.duration,
              startTime: legacy.startTime,
              pausedAt: legacy.pausedAt,
              accumulatedRunningSeconds: legacy.accumulatedRunningSeconds,
              endTime: legacy.endTime,
              notificationId: legacy.notificationId,
            };

            const remainingSeconds = getRemainingSecondsForSession(session);

            if (remainingSeconds <= 0) {
              await endSessionWithData(session, 'completed');
            } else {
              let restoredSession = session;

              if (session.pausedAt === null) {
                // 実行中のセッションは、再起動後に通知を再スケジュール
                const newEndTime = Date.now() + remainingSeconds * 1000;
                const notificationId = await scheduleEndNotification(newEndTime, '');
                restoredSession = {
                  ...session,
                  endTime: newEndTime,
                  notificationId,
                };
              }

              setActiveSession(restoredSession);
              await saveData({ activeSession: restoredSession });
            }
          }
        }
      } else {
        resetDaily();
      }
    } catch (error) {
      console.error('Failed to load data:', error);
      resetDaily();
    }
  };

  const saveData = async (data: Partial<TimerData>) => {
    try {
      const stored = await AsyncStorage.getItem(STORAGE_KEY);
      const current: TimerData = stored ? JSON.parse(stored) : {
        remainingMinutes: DAILY_BUDGET,
        lastResetDate: getTodayDate(),
        activeSession: null,
      };

      const updated = { ...current, ...data };
      await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
    } catch (error) {
      console.error('Failed to save data:', error);
    }
  };

  const resetDaily = async () => {
    const data: TimerData = {
      remainingMinutes: DAILY_BUDGET,
      lastResetDate: getTodayDate(),
      activeSession: null,
    };
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    setRemainingMinutes(DAILY_BUDGET);
    setActiveSession(null);
  };

  const handleResetConfirm = async () => {
    setShowResetModal(false);
    if (activeSession) {
      await endSession();
    }
    await resetDaily();
  };

  const handleEndStep1 = () => {
    setShowEndModal(false);
    setShowEndConfirmModal(true);
  };

  const handleFinishSession = () => {
    setShowEndConfirmModal(false);
  };

  const showEndInterstitialIfNeeded = async (): Promise<void> => {
    if (!AdManager.shouldShowEndInterstitial()) {
      return;
    }
    AdManager.recordEndInterstitialShown();
    await showInterstitialAd();
  };

  const handleQuitSession = async () => {
    setShowEndConfirmModal(false);
    await showEndInterstitialIfNeeded();
    await endSession();
  };

  const startSession = async () => {
    if (!selectedDuration) return;

    const startTime = Date.now();
    const endTime = startTime + selectedDuration * 60 * 1000;
    const notificationId = await scheduleEndNotification(endTime, taskLabel);

    const session: ActiveSession = {
      duration: selectedDuration,
      startTime,
      pausedAt: null,
      accumulatedRunningSeconds: 0,
      endTime,
      notificationId,
    };

    setActiveSession(session);
    await saveData({ activeSession: session });
  };

  const pauseSession = async () => {
    if (!activeSession || activeSession.pausedAt !== null) return;

    await cancelEndNotification(activeSession.notificationId);

    const currentRunSeconds = Math.floor((Date.now() - activeSession.startTime) / 1000);
    const updatedSession: ActiveSession = {
      ...activeSession,
      pausedAt: Date.now(),
      accumulatedRunningSeconds: activeSession.accumulatedRunningSeconds + currentRunSeconds,
    };

    setActiveSession(updatedSession);
    await saveData({ activeSession: updatedSession });
  };

  const resumeSession = async () => {
    if (!activeSession || activeSession.pausedAt === null) return;

    const remainingSeconds = getRemainingSecondsForSession(activeSession);
    if (remainingSeconds <= 0) {
      await endSessionWithData(activeSession, 'completed');
      return;
    }

    const startTime = Date.now();
    const newEndTime = startTime + remainingSeconds * 1000;
    const notificationId = await scheduleEndNotification(newEndTime, taskLabel);

    const updatedSession: ActiveSession = {
      ...activeSession,
      startTime,
      pausedAt: null,
      endTime: newEndTime,
      notificationId,
    };

    setActiveSession(updatedSession);
    await saveData({ activeSession: updatedSession });
  };

  const endSessionWithData = async (
    session: ActiveSession,
    reason: 'ended' | 'completed' = 'ended'
  ) => {
    const plannedSessionMinutes = session.duration;
    const beforeRemaining = remainingMinutes;
    const afterRemaining = Math.max(0, beforeRemaining - plannedSessionMinutes);

    console.log('=== END SESSION DEBUG ===');
    console.log('plannedSessionMinutes (deducted):', plannedSessionMinutes);
    console.log('beforeRemaining:', beforeRemaining);
    console.log('afterRemaining:', afterRemaining);
    console.log('========================');

    await recordHistoryEntry(plannedSessionMinutes, reason);

    setRemainingMinutes(afterRemaining);
    setActiveSession(null);
    setTaskLabel('');

    await saveData({
      remainingMinutes: afterRemaining,
      activeSession: null,
    });

    const toastMessage = `Deducted ${plannedSessionMinutes} min — Remaining ${afterRemaining} min`;
    setDebugToast(toastMessage);
    setTimeout(() => setDebugToast(null), 1200);
  };

  const endSession = async () => {
    if (!activeSession) return;

    await cancelEndNotification(activeSession.notificationId);
    await endSessionWithData(activeSession, 'ended');
  };

  const startCountdown = () => {
    if (!activeSession) return;

    const session = activeSession;

    const updateCountdown = () => {
      if (!session) return;

      const remaining = getRemainingSecondsForSession(session);

      setCountdown(remaining);

      if (remaining === 0) {
        endSessionWithData(session, 'completed');
        if (intervalRef.current) {
          clearInterval(intervalRef.current);
          intervalRef.current = null;
        }
      }
    };

    updateCountdown();
    intervalRef.current = setInterval(updateCountdown, 1000);
  };

  const stopCountdown = () => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  };

  const formatTime = (seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const isDepleted = remainingMinutes === 0 && !activeSession;

  const adjustDuration = (change: number) => {
    const newDuration = selectedDuration + change;
    const maxAllowed = Math.min(MAX_SESSION, remainingMinutes);
    const clamped = Math.max(5, Math.min(newDuration, maxAllowed));
    setSelectedDuration(clamped);
  };

  const progressPercentage = (remainingMinutes / DAILY_BUDGET) * 100;

  return (
    <SafeAreaView style={styles.safeArea}>
      <LinearGradient
        colors={['#0A1628', '#1A2B4A', '#0F1B35']}
        locations={[0, 0.5, 1]}
        style={styles.container}
      >
        <View style={styles.visualLayer} pointerEvents="none">
          <FloatingParticles />
          <Svg width="100%" height="100%" style={styles.fogOverlay}>
            <Defs>
              <RadialGradient id="fog" cx="50%" cy="50%" r="50%">
                <Stop offset="0%" stopColor="#000000" stopOpacity="0.4" />
                <Stop offset="70%" stopColor="#000000" stopOpacity="0.1" />
                <Stop offset="100%" stopColor="#000000" stopOpacity="0" />
              </RadialGradient>
            </Defs>
            <Rect width="100%" height="100%" fill="url(#fog)" />
          </Svg>
          {!isDepleted && (
            <CircularProgress
              percentage={progressPercentage}
              size={280}
              strokeWidth={3}
              color="#68D7FF"
            />
          )}
        </View>

        <View style={styles.interactiveLayer} pointerEvents="box-none">
          {activeSession ? (
            <Pressable
              style={({ pressed }) => [
                styles.endButton,
                pressed && styles.endButtonPressed,
              ]}
              onPress={() => setShowEndModal(true)}
              hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
            >
              <Text style={styles.endButtonText}>End</Text>
            </Pressable>
          ) : (
            <Pressable
              style={({ pressed }) => [
                styles.historyButton,
                pressed && styles.historyButtonPressed,
              ]}
              onPress={() => setShowHistoryModal(true)}
              hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
            >
              <Text style={styles.historyButtonText}>History</Text>
            </Pressable>
          )}

          <Pressable
            style={({ pressed }) => [
              styles.resetButton,
              pressed && styles.resetButtonPressed,
            ]}
            onPress={() => setShowResetModal(true)}
            hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
          >
            <Text style={styles.resetButtonText}>Reset</Text>
          </Pressable>

          {DEBUG_MODE && (
            <Pressable
              style={({ pressed }) => [
                styles.testSoundButton,
                pressed && styles.testSoundButtonPressed,
              ]}
              onPress={testNotification}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <Text style={styles.testSoundButtonText}>Test Notify</Text>
            </Pressable>
          )}

          {!activeSession && !isDepleted && (
            <View style={styles.taskInputContainer} pointerEvents="auto">
              <TextInput
                style={styles.taskInput}
                placeholder="What are you focusing on?"
                placeholderTextColor="rgba(234, 242, 255, 0.3)"
                value={taskLabel}
                onChangeText={setTaskLabel}
                maxLength={40}
                returnKeyType="done"
              />
            </View>
          )}

          {activeSession && taskLabel.length > 0 && (
            <View style={styles.activeTaskContainer} pointerEvents="none">
              <Text style={styles.activeTaskText}>{taskLabel}</Text>
            </View>
          )}

          <View style={styles.centerContent} pointerEvents="box-none">
            {isDepleted ? (
              <View style={styles.depletedContainer} pointerEvents="none">
                <Text style={styles.depletedText}>You're done{'\n'}for today.</Text>
              </View>
            ) : (
              <TouchableOpacity
                style={styles.centerButton}
                onPress={
                  activeSession
                    ? activeSession.pausedAt !== null
                      ? resumeSession
                      : pauseSession
                    : startSession
                }
                activeOpacity={0.8}
                pointerEvents="auto"
              >
                {activeSession ? (
                  <View style={styles.centerButtonContent}>
                    <Text style={styles.countdownTime}>{formatTime(countdown)}</Text>
                    <Text style={styles.centerButtonLabel}>
                      {activeSession.pausedAt !== null ? 'Resume' : 'Stop'}
                    </Text>
                  </View>
                ) : (
                  <View style={styles.centerButtonContent}>
                    <Text style={styles.centerButtonText}>Start</Text>
                  </View>
                )}
              </TouchableOpacity>
            )}
          </View>

          {!activeSession && !isDepleted && (
            <View style={styles.durationControls} pointerEvents="auto">
              <TouchableOpacity
                style={styles.adjustButton}
                onPress={() => adjustDuration(-5)}
                activeOpacity={0.6}
              >
                <Text style={styles.adjustButtonText}>−</Text>
              </TouchableOpacity>

              <View style={styles.durationDisplay}>
                <Text style={styles.durationNumber}>{selectedDuration}</Text>
                <Text style={styles.durationLabel}>minutes</Text>
              </View>

              <TouchableOpacity
                style={styles.adjustButton}
                onPress={() => adjustDuration(5)}
                activeOpacity={0.6}
              >
                <Text style={styles.adjustButtonText}>+</Text>
              </TouchableOpacity>
            </View>
          )}

          <View style={styles.budgetContainer} pointerEvents="none">
            <Text style={styles.budgetText}>
              {remainingMinutes} of {DAILY_BUDGET} min
            </Text>
          </View>

          {debugToast && (
            <View style={styles.debugToast} pointerEvents="none">
              <Text style={styles.debugToastText}>{debugToast}</Text>
            </View>
          )}
        </View>

        <Modal
          visible={showResetModal}
          transparent={true}
          animationType="fade"
          onRequestClose={() => setShowResetModal(false)}
        >
          <View style={styles.modalOverlay}>
            <View style={styles.modalContainer}>
              <Text style={styles.modalTitle}>Reset for today?</Text>
              <Text style={styles.modalBody}>This sets remaining minutes back to 240.</Text>

              <View style={styles.modalButtons}>
                <TouchableOpacity
                  style={styles.modalButtonCancel}
                  onPress={() => setShowResetModal(false)}
                  activeOpacity={0.7}
                >
                  <Text style={styles.modalButtonCancelText}>Cancel</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={styles.modalButtonReset}
                  onPress={handleResetConfirm}
                  activeOpacity={0.7}
                >
                  <Text style={styles.modalButtonResetText}>Reset</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </Modal>

        <Modal
          visible={showEndModal}
          transparent={true}
          animationType="fade"
          onRequestClose={() => setShowEndModal(false)}
        >
          <View style={styles.modalOverlay}>
            <View style={styles.modalContainer}>
              <Text style={styles.modalTitle}>Are you quitting?</Text>
              <View style={styles.realityCheckBody}>
                <Text style={styles.realityCheckLine}>
                  You planned <Text style={styles.realityCheckHighlight}>{activeSession?.duration || 0}</Text> minutes.
                </Text>
                <Text style={styles.realityCheckLine}>
                  You've only done <Text style={styles.realityCheckHighlight}>
                    {activeSession ? Math.floor(calculateTotalRunningSeconds(activeSession) / 60) : 0}
                  </Text> minutes.
                </Text>
                <Text style={styles.realityCheckStoic}>That's not who you said you'd be.</Text>
                <Text style={styles.realityCheckStoicSecondary}>Discipline builds results.</Text>
              </View>

              <View style={styles.endConfirmButtons}>
                <TouchableOpacity
                  style={styles.keepGoingButton}
                  onPress={() => setShowEndModal(false)}
                  activeOpacity={0.7}
                >
                  <Text style={styles.keepGoingButtonText}>Keep Going</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={styles.quitAnywayButton}
                  onPress={handleEndStep1}
                  activeOpacity={0.7}
                >
                  <Text style={styles.quitAnywayButtonText}>Quit Anyway</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </Modal>

        <Modal
          visible={showEndConfirmModal}
          transparent={true}
          animationType="fade"
          onRequestClose={() => setShowEndConfirmModal(false)}
        >
          <View style={styles.modalOverlay}>
            <View style={styles.modalContainer}>
              <Text style={styles.modalTitleWithEmoji}>Last chance 🔥</Text>
              <View style={styles.finalChallengeBody}>
                <Text style={styles.finalChallengeLine}>Winners finish.</Text>
                <Text style={styles.finalChallengeLine}>Losers quit.</Text>
                <Text style={styles.finalChallengeQuestion}>Which one are you?</Text>
              </View>

              <View style={styles.endConfirmButtons}>
                <TouchableOpacity
                  style={styles.finishSessionButton}
                  onPress={handleFinishSession}
                  activeOpacity={0.7}
                >
                  <Text style={styles.finishSessionButtonText}>Finish Session</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={styles.quitButton}
                  onPress={handleQuitSession}
                  activeOpacity={0.7}
                >
                  <Text style={styles.quitButtonText}>Quit</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </Modal>

        <Modal
          visible={showHistoryModal}
          transparent={true}
          animationType="slide"
          onRequestClose={() => setShowHistoryModal(false)}
        >
          <View style={styles.modalOverlay}>
            <View style={[styles.modalContainer, styles.historyModalContainer]}>
              <View style={styles.historyHeader}>
                <Text style={styles.modalTitle}>Today</Text>
                <TouchableOpacity
                  onPress={() => setShowHistoryModal(false)}
                  hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
                >
                  <Text style={styles.historyCloseText}>Close</Text>
                </TouchableOpacity>
              </View>

              {todayHistory.length > 0 && (
                <View style={styles.historyTotalContainer}>
                  <Text style={styles.historyTotalText}>
                    Total: {todayHistory.reduce((sum, entry) => sum + entry.minutes, 0)} min
                  </Text>
                </View>
              )}

              <ScrollView style={styles.historyList} showsVerticalScrollIndicator={false}>
                {todayHistory.length === 0 ? (
                  <Text style={styles.historyEmptyText}>No sessions yet.</Text>
                ) : (
                  todayHistory.map((entry) => (
                    <TouchableOpacity
                      key={entry.id}
                      style={styles.historyEntry}
                      onPress={() => startEditingEntry(entry)}
                      activeOpacity={0.7}
                    >
                      <View style={styles.historyEntryRow}>
                        <View
                          style={[
                            styles.historyStatusDot,
                            entry.reason === 'completed'
                              ? styles.historyStatusDotCompleted
                              : styles.historyStatusDotEnded,
                          ]}
                        />
                        <View style={styles.historyEntryContent}>
                          <View style={styles.historyEntryMain}>
                            <Text style={styles.historyEntryLabel}>{entry.label}</Text>
                            <Text style={styles.historyEntryMinutes}>{entry.minutes} min</Text>
                          </View>
                          <Text style={styles.historyEntryTime}>
                            {new Date(entry.endedAt).toLocaleTimeString([], {
                              hour: '2-digit',
                              minute: '2-digit',
                            })}
                          </Text>
                        </View>
                      </View>
                    </TouchableOpacity>
                  ))
                )}
              </ScrollView>

              {todayHistory.length > 0 && (
                <TouchableOpacity
                  style={styles.historyClearButton}
                  onPress={() => {
                    setShowHistoryModal(false);
                    setTimeout(() => setShowClearHistoryModal(true), 300);
                  }}
                  activeOpacity={0.7}
                >
                  <Text style={styles.historyClearButtonText}>Clear History</Text>
                </TouchableOpacity>
              )}
            </View>
          </View>
        </Modal>

        <Modal
          visible={showClearHistoryModal}
          transparent={true}
          animationType="fade"
          onRequestClose={() => setShowClearHistoryModal(false)}
        >
          <View style={styles.modalOverlay}>
            <View style={styles.modalContainer}>
              <Text style={styles.modalTitle}>Clear history?</Text>
              <Text style={styles.modalBody}>
                This will remove all today's session records. Your remaining minutes won't be affected.
              </Text>

              <View style={styles.modalButtons}>
                <TouchableOpacity
                  style={styles.modalButtonCancel}
                  onPress={() => {
                    setShowClearHistoryModal(false);
                    setTimeout(() => setShowHistoryModal(true), 300);
                  }}
                  activeOpacity={0.7}
                >
                  <Text style={styles.modalButtonCancelText}>Cancel</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={styles.modalButtonEnd}
                  onPress={clearHistory}
                  activeOpacity={0.7}
                >
                  <Text style={styles.modalButtonEndText}>Clear</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </Modal>

        <Modal
          visible={showEditLabelModal}
          transparent={true}
          animationType="fade"
          onRequestClose={cancelEditLabel}
        >
          <View style={styles.modalOverlay}>
            <View style={styles.modalContainer}>
              <Text style={styles.modalTitle}>Edit label</Text>

              <TextInput
                style={styles.editLabelInput}
                placeholder="Session label"
                placeholderTextColor="rgba(234, 242, 255, 0.3)"
                value={editedLabel}
                onChangeText={setEditedLabel}
                maxLength={40}
                returnKeyType="done"
                onSubmitEditing={saveEditedLabel}
                autoFocus={true}
              />

              <View style={styles.modalButtons}>
                <TouchableOpacity
                  style={styles.modalButtonCancel}
                  onPress={cancelEditLabel}
                  activeOpacity={0.7}
                >
                  <Text style={styles.modalButtonCancelText}>Cancel</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={styles.modalButtonReset}
                  onPress={saveEditedLabel}
                  activeOpacity={0.7}
                >
                  <Text style={styles.modalButtonResetText}>Save</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </Modal>

        {Platform.OS !== 'web' && (
          <View style={styles.bannerContainer}>
            <AdMobBanner />
          </View>
        )}
      </LinearGradient>
    </SafeAreaView>
  );
}

function FloatingParticles() {
  const particles = useRef(
    Array.from({ length: 20 }, (_, i) => ({
      id: i,
      size: Math.random() * 7 + 3,
      startX: Math.random() * 100,
      startY: Math.random() * 100,
      duration: Math.random() * 12 + 8,
      opacity: Math.random() * 0.1 + 0.08,
      delay: Math.random() * -20,
    }))
  ).current;

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      {particles.map((particle) => (
        <Particle key={particle.id} {...particle} />
      ))}
    </View>
  );
}

function Particle({
  size,
  startX,
  startY,
  duration,
  opacity,
  delay,
}: {
  size: number;
  startX: number;
  startY: number;
  duration: number;
  opacity: number;
  delay: number;
}) {
  const translateY = useSharedValue(0);
  const translateX = useSharedValue(0);

  useEffect(() => {
    translateY.value = withRepeat(
      withTiming(-100, {
        duration: duration * 1000,
        easing: Easing.linear,
      }),
      -1,
      false
    );

    translateX.value = withRepeat(
      withTiming(Math.random() > 0.5 ? 20 : -20, {
        duration: (duration / 2) * 1000,
        easing: Easing.inOut(Easing.ease),
      }),
      -1,
      true
    );
  }, []);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [
      { translateY: translateY.value },
      { translateX: translateX.value },
    ],
  }));

  return (
    <Animated.View
      style={[
        {
          position: 'absolute',
          left: `${startX}%`,
          top: `${startY}%`,
          width: size,
          height: size,
          borderRadius: size / 2,
          backgroundColor: '#68D7FF',
          opacity,
          shadowColor: '#68D7FF',
          shadowOffset: { width: 0, height: 0 },
          shadowOpacity: 0.8,
          shadowRadius: size * 2,
        },
        animatedStyle,
      ]}
    />
  );
}

function CircularProgress({
  percentage,
  size,
  strokeWidth,
  color,
}: {
  percentage: number;
  size: number;
  strokeWidth: number;
  color: string;
}) {
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference - (circumference * percentage) / 100;

  return (
    <Svg width={size} height={size}>
      <Circle
        cx={size / 2}
        cy={size / 2}
        r={radius}
        stroke="#0F1B35"
        strokeWidth={strokeWidth}
        fill="none"
      />
      <Circle
        cx={size / 2}
        cy={size / 2}
        r={radius}
        stroke={color}
        strokeWidth={strokeWidth}
        fill="none"
        strokeDasharray={circumference}
        strokeDashoffset={strokeDashoffset}
        strokeLinecap="round"
        rotation="-90"
        origin={`${size / 2}, ${size / 2}`}
      />
    </Svg>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#0A1628',
  },
  container: {
    flex: 1,
  },
  fogOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
  visualLayer: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    justifyContent: 'center',
    alignItems: 'center',
  },
  interactiveLayer: {
    flex: 1,
  },
  endButton: {
    position: 'absolute',
    top: Platform.OS === 'ios' ? 10 : 20,
    left: 20,
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 8,
    minWidth: 44,
    minHeight: 44,
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 100,
  },
  endButtonPressed: {
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
  },
  endButtonText: {
    fontSize: 14,
    color: '#FF8A8A',
    opacity: 0.45,
    fontWeight: '500',
  },
  historyButton: {
    position: 'absolute',
    top: Platform.OS === 'ios' ? 10 : 20,
    left: 20,
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 8,
    minWidth: 44,
    minHeight: 44,
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 100,
  },
  historyButtonPressed: {
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
  },
  historyButtonText: {
    fontSize: 14,
    color: '#68D7FF',
    opacity: 0.5,
    fontWeight: '500',
  },
  resetButton: {
    position: 'absolute',
    top: Platform.OS === 'ios' ? 10 : 20,
    right: 20,
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 8,
    minWidth: 44,
    minHeight: 44,
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 100,
  },
  resetButtonPressed: {
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
  },
  resetButtonText: {
    fontSize: 14,
    color: '#EAF2FF',
    opacity: 0.5,
    fontWeight: '500',
  },
  testSoundButton: {
    position: 'absolute',
    top: Platform.OS === 'ios' ? 55 : 65,
    right: 20,
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 6,
    backgroundColor: 'rgba(104, 215, 255, 0.15)',
    zIndex: 100,
  },
  testSoundButtonPressed: {
    backgroundColor: 'rgba(104, 215, 255, 0.3)',
  },
  testSoundButtonText: {
    fontSize: 11,
    color: '#68D7FF',
    fontWeight: '500',
  },
  taskInputContainer: {
    position: 'absolute',
    top: Platform.OS === 'ios' ? 90 : 100,
    left: 0,
    right: 0,
    paddingHorizontal: 40,
  },
  taskInput: {
    fontSize: 16,
    color: '#EAF2FF',
    textAlign: 'center',
    paddingVertical: 12,
    fontWeight: '400',
  },
  activeTaskContainer: {
    position: 'absolute',
    top: Platform.OS === 'ios' ? 90 : 100,
    left: 0,
    right: 0,
    paddingHorizontal: 40,
  },
  activeTaskText: {
    fontSize: 16,
    color: '#EAF2FF',
    textAlign: 'center',
    opacity: 0.55,
    fontWeight: '400',
  },
  centerContent: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    justifyContent: 'center',
    alignItems: 'center',
  },
  centerButton: {
    width: 200,
    height: 200,
    borderRadius: 100,
    backgroundColor: '#0A1220',
    justifyContent: 'center',
    alignItems: 'center',
  },
  centerButtonContent: {
    alignItems: 'center',
  },
  centerButtonText: {
    fontSize: 32,
    color: '#EAF2FF',
    fontWeight: '300',
  },
  countdownTime: {
    fontSize: 48,
    color: '#68D7FF',
    fontWeight: '200',
    letterSpacing: -1,
    marginBottom: 4,
  },
  centerButtonLabel: {
    fontSize: 14,
    color: '#EAF2FF',
    opacity: 0.5,
    fontWeight: '400',
  },
  durationControls: {
    position: 'absolute',
    bottom: 200,
    left: 0,
    right: 0,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 40,
  },
  adjustButton: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#1A2840',
    justifyContent: 'center',
    alignItems: 'center',
  },
  adjustButtonText: {
    fontSize: 32,
    color: '#EAF2FF',
    fontWeight: '200',
  },
  durationDisplay: {
    alignItems: 'center',
  },
  durationNumber: {
    fontSize: 40,
    color: '#EAF2FF',
    fontWeight: '200',
    marginBottom: 4,
  },
  durationLabel: {
    fontSize: 13,
    color: '#EAF2FF',
    opacity: 0.5,
    fontWeight: '400',
  },
  budgetContainer: {
    position: 'absolute',
    bottom: 120,
    left: 0,
    right: 0,
    alignItems: 'center',
  },
  budgetText: {
    fontSize: 13,
    color: '#EAF2FF',
    opacity: 0.4,
    fontWeight: '400',
  },
  debugToast: {
    position: 'absolute',
    bottom: 180,
    left: 0,
    right: 0,
    alignItems: 'center',
  },
  debugToastText: {
    fontSize: 14,
    color: '#68D7FF',
    backgroundColor: 'rgba(104, 215, 255, 0.15)',
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 20,
    fontWeight: '500',
    overflow: 'hidden',
  },
  depletedContainer: {
    width: 280,
    height: 280,
    justifyContent: 'center',
    alignItems: 'center',
  },
  depletedText: {
    fontSize: 26,
    color: '#EAF2FF',
    textAlign: 'center',
    opacity: 0.5,
    fontWeight: '300',
    lineHeight: 36,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.85)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 40,
  },
  modalContainer: {
    backgroundColor: '#152238',
    borderRadius: 20,
    padding: 32,
    width: '100%',
    maxWidth: 400,
  },
  modalTitle: {
    fontSize: 22,
    color: '#EAF2FF',
    fontWeight: '500',
    marginBottom: 12,
    textAlign: 'center',
  },
  modalBody: {
    fontSize: 15,
    color: '#EAF2FF',
    opacity: 0.65,
    fontWeight: '400',
    lineHeight: 22,
    textAlign: 'center',
    marginBottom: 32,
  },
  modalButtons: {
    flexDirection: 'row',
    gap: 12,
  },
  modalButtonCancel: {
    flex: 1,
    height: 50,
    backgroundColor: '#0A1220',
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalButtonCancelText: {
    fontSize: 16,
    color: '#EAF2FF',
    fontWeight: '500',
  },
  modalButtonReset: {
    flex: 1,
    height: 50,
    backgroundColor: '#68D7FF',
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalButtonResetText: {
    fontSize: 16,
    color: '#000000',
    fontWeight: '600',
  },
  modalButtonEnd: {
    flex: 1,
    height: 50,
    backgroundColor: '#FF6B6B',
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalButtonEndText: {
    fontSize: 16,
    color: '#000000',
    fontWeight: '600',
  },
  endModalBody: {
    marginBottom: 28,
  },
  endModalLine: {
    fontSize: 16,
    color: '#EAF2FF',
    opacity: 0.7,
    fontWeight: '400',
    lineHeight: 28,
    textAlign: 'center',
  },
  endModalHighlight: {
    color: '#68D7FF',
    fontWeight: '600',
    opacity: 1,
  },
  endModalMotivation: {
    fontSize: 17,
    color: '#EAF2FF',
    fontWeight: '500',
    textAlign: 'center',
    marginTop: 16,
    opacity: 0.9,
  },
  modalButtonKeepGoing: {
    flex: 1,
    height: 50,
    backgroundColor: '#3B82F6',
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalButtonKeepGoingText: {
    fontSize: 16,
    color: '#FFFFFF',
    fontWeight: '600',
  },
  modalButtonEndAnyway: {
    flex: 1,
    height: 50,
    backgroundColor: 'rgba(255, 107, 107, 0.15)',
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255, 107, 107, 0.3)',
  },
  modalButtonEndAnywayText: {
    fontSize: 16,
    color: '#FF8A8A',
    fontWeight: '500',
  },
  modalTitleWithEmoji: {
    fontSize: 24,
    color: '#EAF2FF',
    fontWeight: '600',
    marginBottom: 20,
    textAlign: 'center',
  },
  endConfirmBody: {
    marginBottom: 28,
  },
  endConfirmLine: {
    fontSize: 16,
    color: '#EAF2FF',
    opacity: 0.75,
    fontWeight: '400',
    lineHeight: 30,
    textAlign: 'center',
  },
  endConfirmHighlight: {
    color: '#68D7FF',
    fontWeight: '600',
    opacity: 1,
  },
  endConfirmStoic: {
    fontSize: 18,
    color: '#EAF2FF',
    fontWeight: '500',
    textAlign: 'center',
    marginTop: 20,
    opacity: 1,
  },
  realityCheckBody: {
    marginBottom: 28,
  },
  realityCheckLine: {
    fontSize: 16,
    color: '#EAF2FF',
    opacity: 0.8,
    fontWeight: '400',
    lineHeight: 32,
    textAlign: 'center',
  },
  realityCheckHighlight: {
    color: '#68D7FF',
    fontWeight: '700',
    opacity: 1,
  },
  realityCheckStoic: {
    fontSize: 17,
    color: '#FFFFFF',
    fontWeight: '500',
    textAlign: 'center',
    marginTop: 24,
    opacity: 1,
  },
  realityCheckStoicSecondary: {
    fontSize: 15,
    color: '#EAF2FF',
    fontWeight: '400',
    textAlign: 'center',
    marginTop: 8,
    opacity: 0.6,
  },
  keepGoingButton: {
    height: 54,
    backgroundColor: '#3B82F6',
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  keepGoingButtonText: {
    fontSize: 17,
    color: '#FFFFFF',
    fontWeight: '600',
  },
  quitAnywayButton: {
    height: 48,
    backgroundColor: 'transparent',
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  quitAnywayButtonText: {
    fontSize: 15,
    color: '#EAF2FF',
    opacity: 0.35,
    fontWeight: '400',
  },
  finalChallengeBody: {
    marginBottom: 32,
    paddingTop: 8,
  },
  finalChallengeLine: {
    fontSize: 20,
    color: '#FFFFFF',
    fontWeight: '500',
    textAlign: 'center',
    lineHeight: 32,
  },
  finalChallengeQuestion: {
    fontSize: 18,
    color: '#68D7FF',
    fontWeight: '500',
    textAlign: 'center',
    marginTop: 20,
  },
  endConfirmButtons: {
    flexDirection: 'column',
    gap: 12,
  },
  finishSessionButton: {
    height: 52,
    backgroundColor: '#3B82F6',
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  finishSessionButtonText: {
    fontSize: 17,
    color: '#FFFFFF',
    fontWeight: '600',
  },
  quitButton: {
    height: 48,
    backgroundColor: 'transparent',
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  quitButtonText: {
    fontSize: 15,
    color: '#EAF2FF',
    opacity: 0.4,
    fontWeight: '400',
  },
  historyModalContainer: {
    maxHeight: '80%',
    paddingBottom: 24,
  },
  historyHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
  },
  historyCloseText: {
    fontSize: 14,
    color: '#68D7FF',
    fontWeight: '500',
  },
  historyTotalContainer: {
    backgroundColor: 'rgba(104, 215, 255, 0.1)',
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 12,
    marginBottom: 20,
  },
  historyTotalText: {
    fontSize: 15,
    color: '#68D7FF',
    fontWeight: '500',
    textAlign: 'center',
  },
  historyList: {
    maxHeight: 400,
  },
  historyEntry: {
    backgroundColor: 'rgba(255, 255, 255, 0.03)',
    paddingVertical: 16,
    paddingHorizontal: 16,
    borderRadius: 12,
    marginBottom: 12,
  },
  historyEntryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  historyStatusDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  historyStatusDotCompleted: {
    backgroundColor: 'rgba(96, 165, 250, 0.4)',
  },
  historyStatusDotEnded: {
    backgroundColor: 'rgba(239, 68, 68, 0.35)',
  },
  historyEntryContent: {
    flex: 1,
  },
  historyEntryMain: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  historyEntryLabel: {
    fontSize: 16,
    color: '#EAF2FF',
    fontWeight: '400',
    flex: 1,
    marginRight: 12,
  },
  historyEntryMinutes: {
    fontSize: 15,
    color: '#68D7FF',
    fontWeight: '500',
  },
  historyEntryTime: {
    fontSize: 13,
    color: '#EAF2FF',
    opacity: 0.4,
    fontWeight: '400',
  },
  historyEmptyText: {
    fontSize: 15,
    color: '#EAF2FF',
    opacity: 0.5,
    textAlign: 'center',
    paddingVertical: 40,
  },
  historyClearButton: {
    marginTop: 20,
    paddingVertical: 14,
    backgroundColor: 'rgba(255, 107, 107, 0.1)',
    borderRadius: 12,
    alignItems: 'center',
  },
  historyClearButtonText: {
    fontSize: 14,
    color: '#FF6B6B',
    fontWeight: '500',
  },
  editLabelInput: {
    fontSize: 16,
    color: '#EAF2FF',
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderRadius: 12,
    marginBottom: 24,
    fontWeight: '400',
  },
  bannerContainer: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    paddingBottom: Platform.OS === 'ios' ? 20 : 10,
    backgroundColor: 'transparent',
  },
});
