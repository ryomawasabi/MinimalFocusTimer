import { useEffect, useState } from 'react';
import { View, Text, StyleSheet, Modal, TouchableOpacity, Pressable } from 'react-native';

interface FakeInterstitialAdProps {
  visible: boolean;
  onClose: () => void;
}

const COUNTDOWN_SECONDS = 3;

export default function FakeInterstitialAd({ visible, onClose }: FakeInterstitialAdProps) {
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
      transparent={true}
      animationType="fade"
      onRequestClose={() => {
        if (canClose) onClose();
      }}
    >
      <View style={styles.overlay}>
        <View style={styles.container}>
          <View style={styles.adBadge}>
            <Text style={styles.adBadgeText}>AD</Text>
          </View>

          <View style={styles.content}>
            <View style={styles.placeholderImage}>
              <Text style={styles.placeholderIcon}>🎯</Text>
            </View>

            <Text style={styles.title}>Ad (Test Interstitial)</Text>
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
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.95)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  container: {
    width: '90%',
    maxWidth: 360,
    backgroundColor: '#0F1B35',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
    overflow: 'hidden',
  },
  adBadge: {
    position: 'absolute',
    top: 12,
    left: 12,
    backgroundColor: 'rgba(255, 200, 87, 0.2)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4,
    zIndex: 1,
  },
  adBadgeText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#FFC857',
    letterSpacing: 1,
  },
  content: {
    paddingTop: 48,
    paddingHorizontal: 24,
    paddingBottom: 24,
    alignItems: 'center',
  },
  placeholderImage: {
    width: 120,
    height: 120,
    borderRadius: 16,
    backgroundColor: 'rgba(104, 215, 255, 0.1)',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 24,
  },
  placeholderIcon: {
    fontSize: 48,
  },
  title: {
    fontSize: 18,
    fontWeight: '600',
    color: '#EAF2FF',
    marginBottom: 8,
    textAlign: 'center',
  },
  subtext: {
    fontSize: 13,
    color: '#EAF2FF',
    opacity: 0.5,
    marginBottom: 16,
    textAlign: 'center',
  },
  learnMoreContainer: {
    paddingVertical: 8,
    paddingHorizontal: 16,
  },
  learnMoreText: {
    fontSize: 14,
    color: '#68D7FF',
    textDecorationLine: 'underline',
  },
  footer: {
    borderTopWidth: 1,
    borderTopColor: 'rgba(255, 255, 255, 0.1)',
    padding: 16,
    alignItems: 'center',
  },
  countdownContainer: {
    paddingVertical: 12,
    paddingHorizontal: 24,
  },
  countdownText: {
    fontSize: 14,
    color: '#EAF2FF',
    opacity: 0.6,
  },
  closeButton: {
    backgroundColor: 'rgba(104, 215, 255, 0.15)',
    paddingVertical: 12,
    paddingHorizontal: 32,
    borderRadius: 8,
  },
  closeButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#68D7FF',
  },
});
