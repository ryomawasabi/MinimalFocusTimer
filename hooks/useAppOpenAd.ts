import { useEffect, useRef, useCallback, useState } from 'react';
import { Platform } from 'react-native';
import { AppOpenAd, AdEventType, TestIds } from 'react-native-google-mobile-ads';
import { AdManager } from '../utils/AdManager';

const APP_OPEN_AD_UNIT_ID = __DEV__
  ? TestIds.APP_OPEN
  : Platform.select({
      ios: 'ca-app-pub-XXXXXXXXXXXXXXXX/XXXXXXXXXX',
      android: 'ca-app-pub-XXXXXXXXXXXXXXXX/XXXXXXXXXX',
    }) || TestIds.APP_OPEN;

export function useAppOpenAd() {
  const appOpenAdRef = useRef<AppOpenAd | null>(null);
  const [isLoaded, setIsLoaded] = useState(false);
  const [hasShownOnColdStart, setHasShownOnColdStart] = useState(false);
  const onCloseCallbackRef = useRef<(() => void) | null>(null);

  const showAdIfReady = useCallback(async (): Promise<boolean> => {
    if (hasShownOnColdStart) return false;

    const shouldShow = await AdManager.shouldShowAppOpenAd();
    if (!shouldShow) return false;

    if (!appOpenAdRef.current || !isLoaded) return false;

    return new Promise((resolve) => {
      onCloseCallbackRef.current = () => {
        setHasShownOnColdStart(true);
        AdManager.markAppOpenShown();
        resolve(true);
      };

      appOpenAdRef.current!.show().catch(() => {
        onCloseCallbackRef.current = null;
        resolve(false);
      });
    });
  }, [isLoaded, hasShownOnColdStart]);

  useEffect(() => {
    const appOpenAd = AppOpenAd.createForAdRequest(APP_OPEN_AD_UNIT_ID, {
      requestNonPersonalizedAdsOnly: true,
    });

    appOpenAdRef.current = appOpenAd;

    const loadedUnsubscribe = appOpenAd.addAdEventListener(AdEventType.LOADED, () => {
      setIsLoaded(true);
    });

    const closedUnsubscribe = appOpenAd.addAdEventListener(AdEventType.CLOSED, () => {
      setIsLoaded(false);
      if (onCloseCallbackRef.current) {
        onCloseCallbackRef.current();
        onCloseCallbackRef.current = null;
      }
    });

    const errorUnsubscribe = appOpenAd.addAdEventListener(AdEventType.ERROR, () => {
      setIsLoaded(false);
      if (onCloseCallbackRef.current) {
        onCloseCallbackRef.current();
        onCloseCallbackRef.current = null;
      }
    });

    appOpenAd.load();

    return () => {
      loadedUnsubscribe();
      closedUnsubscribe();
      errorUnsubscribe();
    };
  }, []);

  return {
    isLoaded,
    showAdIfReady,
    isVisible: false,
    handleClose: () => {},
  };
}
