import { useEffect, useState, useCallback, useRef } from 'react';
import { Platform, AppState } from 'react-native';
import {
  AppOpenAd,
  AdEventType,
  TestIds,
} from 'react-native-google-mobile-ads';
import AsyncStorage from '@react-native-async-storage/async-storage';

const APP_OPEN_AD_UNIT_ID = __DEV__
  ? TestIds.APP_OPEN
  : 'ca-app-pub-1819532998036158/6053394416';

const APP_OPEN_COOLDOWN_KEY = 'lastAppOpenAdAt';
const COOLDOWN_MS = 3 * 60 * 60 * 1000; // 3 hours

export function useAppOpenAd() {
  const [isLoaded, setIsLoaded] = useState(false);
  const adRef = useRef<AppOpenAd | null>(null);
  const hasShownInitial = useRef(false);

  const loadAd = useCallback(() => {
    if (Platform.OS === 'web') return;

    const ad = AppOpenAd.createForAdRequest(APP_OPEN_AD_UNIT_ID, {
      requestNonPersonalizedAdsOnly: false,
    });

    const unsubLoaded = ad.addAdEventListener(AdEventType.LOADED, () => {
      setIsLoaded(true);
    });

    const unsubClosed = ad.addAdEventListener(AdEventType.CLOSED, () => {
      setIsLoaded(false);
      // Preload next ad
      loadAd();
    });

    const unsubError = ad.addAdEventListener(AdEventType.ERROR, (error) => {
      console.log('App open ad error:', error);
      setIsLoaded(false);
    });

    ad.load();
    adRef.current = ad;

    return () => {
      unsubLoaded();
      unsubClosed();
      unsubError();
    };
  }, []);

  // Check cooldown
  const canShowAd = useCallback(async (): Promise<boolean> => {
    try {
      const lastShownStr = await AsyncStorage.getItem(APP_OPEN_COOLDOWN_KEY);
      if (!lastShownStr) return true;
      const lastShown = parseInt(lastShownStr, 10);
      if (isNaN(lastShown)) return true;
      return Date.now() - lastShown >= COOLDOWN_MS;
    } catch {
      return true;
    }
  }, []);

  const markShown = useCallback(async () => {
    try {
      await AsyncStorage.setItem(APP_OPEN_COOLDOWN_KEY, Date.now().toString());
    } catch {}
  }, []);

  const showAdIfReady = useCallback(async (): Promise<boolean> => {
    if (!isLoaded || !adRef.current) return false;

    const allowed = await canShowAd();
    if (!allowed) return false;

    try {
      adRef.current.show();
      await markShown();
      return true;
    } catch (e) {
      console.log('Failed to show app open ad:', e);
      return false;
    }
  }, [isLoaded, canShowAd, markShown]);

  // Load on mount
  useEffect(() => {
    const cleanup = loadAd();
    return cleanup;
  }, [loadAd]);

  // Show on app open (initial launch)
  useEffect(() => {
    if (isLoaded && !hasShownInitial.current) {
      hasShownInitial.current = true;
      showAdIfReady();
    }
  }, [isLoaded, showAdIfReady]);

  // Show when app comes to foreground
  useEffect(() => {
    if (Platform.OS === 'web') return;

    const subscription = AppState.addEventListener('change', (nextState) => {
      if (nextState === 'active' && isLoaded) {
        showAdIfReady();
      }
    });

    return () => subscription.remove();
  }, [isLoaded, showAdIfReady]);

  return {
    isLoaded,
    showAdIfReady,
  };
}
