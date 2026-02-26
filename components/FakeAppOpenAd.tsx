import { useEffect, useState } from 'react';
import { View, Text, StyleSheet, Modal, TouchableOpacity, Pressable } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';

interface FakeAppOpenAdProps {
  visible: boolean;
  onClose: () => void;
}

const COUNTDOWN_SECONDS = 3;

export default function FakeAppOpenAd({ visible, onClose }: FakeAppOpenAdProps) {
  const [countdown, setCountdown] = useState(COUNTDOWN_SECONDS);
  const [canClose, setCanClose] = useState(false);

  useEffect(() => {
    if (!visible) {
      setCountdown(COUNTDOWN_SECONDS);
      setCanClose(false);
      return;
    }

    if (countdown <= 0) {
      setCanClose(true);
      return;
    }

    const timer = setTimeout(() => {
      setCountdown(countdown - 1);
    }, 1000);

    return () => clearTimeout(timer);
  }, [visible, countdown]);

  return (
    <Modal
      visible={visible}
      transparent={false}
      animationType="fade"
      onRequestClose={() => {
        if (canClose) onClose();
      }}
    >
      <LinearGradient
        colors={['#0A1628', '#0F1B35', '#162544']}
        style={styles.container}
      >
        <View style={styles.adBadge}>
          <Text style={styles.adBadgeText}>AD</Text>
        </View>

        <View style={styles.content}>
          <View style={styles.placeholderImage}>
            <Text style={styles.placeholderIcon}>📱</Text>
          </View>

          <Text style={styles.title}>Ad (Test App Open)</Text>
          <Text style={styles.subtext}>Powered by AdMob (placeholder)</Text>

          <Pressable style={styles.learnMoreContainer}>
            <Text style={styles.learnMoreText}>Learn more</Text>
          </Pressable>
        </View>

        <View style={styles.footer}>
          {canClose ? (
            <TouchableOpacity
              style={styles.closeButton}
              onPress={onClose}
              activeOpacity={0.7}
            >
              <Text style={styles.closeButtonText}>Close</Text>
            </TouchableOpacity>
          ) : (
            <View style={styles.countdownContainer}>
              <Text style={styles.countdownText}>Close in {countdown}...</Text>
            </View>
          )}
        </View>
      </LinearGradient>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  adBadge: {
    position: 'absolute',
    top: 48,
    left: 20,
    backgroundColor: 'rgba(255, 200, 87, 0.2)',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 4,
    zIndex: 1,
  },
  adBadgeText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#FFC857',
    letterSpacing: 1,
  },
  content: {
    alignItems: 'center',
    paddingHorizontal: 32,
  },
  placeholderImage: {
    width: 140,
    height: 140,
    borderRadius: 24,
    backgroundColor: 'rgba(104, 215, 255, 0.1)',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 32,
    borderWidth: 1,
    borderColor: 'rgba(104, 215, 255, 0.2)',
  },
  placeholderIcon: {
    fontSize: 56,
  },
  title: {
    fontSize: 22,
    fontWeight: '600',
    color: '#EAF2FF',
    marginBottom: 12,
    textAlign: 'center',
  },
  subtext: {
    fontSize: 14,
    color: '#EAF2FF',
    opacity: 0.5,
    marginBottom: 20,
    textAlign: 'center',
  },
  learnMoreContainer: {
    paddingVertical: 10,
    paddingHorizontal: 20,
  },
  learnMoreText: {
    fontSize: 15,
    color: '#68D7FF',
    textDecorationLine: 'underline',
  },
  footer: {
    position: 'absolute',
    bottom: 60,
    alignItems: 'center',
  },
  countdownContainer: {
    paddingVertical: 14,
    paddingHorizontal: 28,
  },
  countdownText: {
    fontSize: 15,
    color: '#EAF2FF',
    opacity: 0.6,
  },
  closeButton: {
    backgroundColor: 'rgba(104, 215, 255, 0.15)',
    paddingVertical: 14,
    paddingHorizontal: 40,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(104, 215, 255, 0.3)',
  },
  closeButtonText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#68D7FF',
  },
});
