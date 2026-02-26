import { View, Text, StyleSheet } from 'react-native';

const BANNER_HEIGHT = 50;

interface AdMobBannerProps {
  onAdLoaded?: () => void;
  onAdFailedToLoad?: (error: Error) => void;
}

export default function AdMobBanner(_props: AdMobBannerProps) {
  return (
    <View style={styles.container}>
      <View style={styles.placeholder}>
        <Text style={styles.placeholderText}>Ad (Banner - Web Preview)</Text>
        <Text style={styles.subText}>AdMob loads on iOS/Android</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    width: '100%',
    paddingHorizontal: 12,
    paddingBottom: 8,
    alignItems: 'center',
  },
  placeholder: {
    height: BANNER_HEIGHT,
    width: '100%',
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  placeholderText: {
    fontSize: 12,
    color: '#EAF2FF',
    opacity: 0.5,
    fontWeight: '500',
  },
  subText: {
    fontSize: 10,
    color: '#EAF2FF',
    opacity: 0.3,
    marginTop: 2,
  },
});
