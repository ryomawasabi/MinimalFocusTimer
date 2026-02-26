import { useState } from 'react';
import { View, Text, StyleSheet, Platform } from 'react-native';
import { BannerAd, BannerAdSize, TestIds } from 'react-native-google-mobile-ads';

const BANNER_HEIGHT = 50;

interface AdMobBannerProps {
  onAdLoaded?: () => void;
  onAdFailedToLoad?: (error: Error) => void;
}

export default function AdMobBanner({ onAdLoaded, onAdFailedToLoad }: AdMobBannerProps) {
  const [adError, setAdError] = useState(false);

  const handleAdFailedToLoad = (error: Error) => {
    setAdError(true);
    onAdFailedToLoad?.(error);
  };

  if (adError) {
    return (
      <View style={styles.container}>
        <View style={styles.placeholder}>
          <Text style={styles.placeholderText}>Ad (Test Banner)</Text>
          <Text style={styles.subText}>Powered by AdMob (placeholder)</Text>
        </View>
      </View>
    );
  }

  const adUnitId = __DEV__
    ? TestIds.ADAPTIVE_BANNER
    : Platform.select({
        ios: 'ca-app-pub-XXXXXXXXXXXXXXXX/XXXXXXXXXX',
        android: 'ca-app-pub-XXXXXXXXXXXXXXXX/XXXXXXXXXX',
        default: TestIds.ADAPTIVE_BANNER,
      });

  return (
    <View style={styles.container}>
      <BannerAd
        unitId={adUnitId}
        size={BannerAdSize.ANCHORED_ADAPTIVE_BANNER}
        requestOptions={{
          requestNonPersonalizedAdsOnly: true,
        }}
        onAdLoaded={onAdLoaded}
        onAdFailedToLoad={handleAdFailedToLoad}
      />
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
