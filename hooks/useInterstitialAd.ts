import { useEffect, useRef, useCallback, useState } from 'react';
import { Platform } from 'react-native';
import { InterstitialAd, AdEventType, TestIds } from 'react-native-google-mobile-ads';

const INTERSTITIAL_AD_UNIT_ID = __DEV__
  ? TestIds.INTERSTITIAL
  : Platform.select({
      ios: 'ca-app-pub-XXXXXXXXXXXXXXXX/XXXXXXXXXX',
      android: 'ca-app-pub-XXXXXXXXXXXXXXXX/XXXXXXXXXX',
    }) || TestIds.INTERSTITIAL;

export function useInterstitialAd() {
  const interstitialRef = useRef<InterstitialAd | null>(null);
  const [isLoaded, setIsLoaded] = useState(false);
  const onCloseCallbackRef = useRef<(() => void) | null>(null);

  const loadAd = useCallback(() => {
    if (interstitialRef.current) {
      interstitialRef.current.load();
    }
  }, []);

  useEffect(() => {
    const interstitial = InterstitialAd.createForAdRequest(INTERSTITIAL_AD_UNIT_ID, {
      requestNonPersonalizedAdsOnly: true,
    });

    interstitialRef.current = interstitial;

    const loadedUnsubscribe = interstitial.addAdEventListener(AdEventType.LOADED, () => {
      setIsLoaded(true);
    });

    const closedUnsubscribe = interstitial.addAdEventListener(AdEventType.CLOSED, () => {
      setIsLoaded(false);
      if (onCloseCallbackRef.current) {
        onCloseCallbackRef.current();
        onCloseCallbackRef.current = null;
      }
      interstitial.load();
    });

    const errorUnsubscribe = interstitial.addAdEventListener(AdEventType.ERROR, () => {
      setIsLoaded(false);
      if (onCloseCallbackRef.current) {
        onCloseCallbackRef.current();
        onCloseCallbackRef.current = null;
      }
    });

    interstitial.load();

    return () => {
      loadedUnsubscribe();
      closedUnsubscribe();
      errorUnsubscribe();
    };
  }, []);

  const showAd = useCallback((): Promise<void> => {
    return new Promise((resolve) => {
      if (!interstitialRef.current || !isLoaded) {
        resolve();
        return;
      }

      onCloseCallbackRef.current = resolve;
      interstitialRef.current.show().catch(() => {
        onCloseCallbackRef.current = null;
        resolve();
      });
    });
  }, [isLoaded]);

  return {
    isLoaded,
    loadAd,
    showAd,
    isVisible: false,
    handleClose: () => {},
  };
}
