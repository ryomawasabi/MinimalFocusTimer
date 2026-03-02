import { useEffect, useState, useCallback, useRef } from 'react';
import { Platform } from 'react-native';
import {
  InterstitialAd,
  AdEventType,
  TestIds,
} from 'react-native-google-mobile-ads';

const INTERSTITIAL_AD_UNIT_ID = __DEV__
  ? TestIds.INTERSTITIAL
  : 'ca-app-pub-1819532998036158/5995207179';

export function useInterstitialAd() {
  const [isLoaded, setIsLoaded] = useState(false);
  const adRef = useRef<InterstitialAd | null>(null);
  const resolveRef = useRef<(() => void) | null>(null);

  const loadAd = useCallback(() => {
    if (Platform.OS === 'web') return;

    const ad = InterstitialAd.createForAdRequest(INTERSTITIAL_AD_UNIT_ID, {
      requestNonPersonalizedAdsOnly: false,
    });

    const unsubLoaded = ad.addAdEventListener(AdEventType.LOADED, () => {
      setIsLoaded(true);
    });

    const unsubClosed = ad.addAdEventListener(AdEventType.CLOSED, () => {
      setIsLoaded(false);
      if (resolveRef.current) {
        resolveRef.current();
        resolveRef.current = null;
      }
      // Preload next ad
      loadAd();
    });

    const unsubError = ad.addAdEventListener(AdEventType.ERROR, (error) => {
      console.log('Interstitial ad error:', error);
      setIsLoaded(false);
      if (resolveRef.current) {
        resolveRef.current();
        resolveRef.current = null;
      }
    });

    ad.load();
    adRef.current = ad;

    return () => {
      unsubLoaded();
      unsubClosed();
      unsubError();
    };
  }, []);

  useEffect(() => {
    const cleanup = loadAd();
    return cleanup;
  }, [loadAd]);

  const showAd = useCallback(async (): Promise<boolean> => {
    if (!isLoaded || !adRef.current) return false;

    return new Promise<boolean>((resolve) => {
      resolveRef.current = () => resolve(true);
      try {
        adRef.current!.show();
      } catch (e) {
        console.log('Failed to show interstitial:', e);
        resolveRef.current = null;
        resolve(false);
      }
    });
  }, [isLoaded]);

  return {
    isLoaded,
    showAd,
  };
}
