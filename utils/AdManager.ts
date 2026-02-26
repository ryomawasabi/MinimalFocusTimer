import AsyncStorage from '@react-native-async-storage/async-storage';

const APP_OPEN_AD_KEY = 'lastAppOpenAdAt';
const APP_OPEN_AD_INTERVAL_MS = 3 * 60 * 60 * 1000;

class AdManagerClass {
  private bannerEnabled: boolean = true;
  private endInterstitialEnabled: boolean = true;
  private endInterstitialCount: number = 0;
  private appOpenAdEnabled: boolean = true;

  shouldShowBanner(): boolean {
    return this.bannerEnabled;
  }

  setBannerEnabled(enabled: boolean): void {
    this.bannerEnabled = enabled;
  }

  shouldShowEndInterstitial(): boolean {
    if (!this.endInterstitialEnabled) return false;
    return true;
  }

  setEndInterstitialEnabled(enabled: boolean): void {
    this.endInterstitialEnabled = enabled;
  }

  recordEndInterstitialShown(): void {
    this.endInterstitialCount++;
  }

  getEndInterstitialCount(): number {
    return this.endInterstitialCount;
  }

  setAppOpenAdEnabled(enabled: boolean): void {
    this.appOpenAdEnabled = enabled;
  }

  async shouldShowAppOpenAd(): Promise<boolean> {
    if (!this.appOpenAdEnabled) return false;

    try {
      const lastShownStr = await AsyncStorage.getItem(APP_OPEN_AD_KEY);
      if (!lastShownStr) return true;

      const lastShown = parseInt(lastShownStr, 10);
      if (isNaN(lastShown)) return true;

      const elapsed = Date.now() - lastShown;
      return elapsed >= APP_OPEN_AD_INTERVAL_MS;
    } catch {
      return false;
    }
  }

  async markAppOpenShown(): Promise<void> {
    try {
      await AsyncStorage.setItem(APP_OPEN_AD_KEY, Date.now().toString());
    } catch {
      // Fail silently
    }
  }
}

export const AdManager = new AdManagerClass();
