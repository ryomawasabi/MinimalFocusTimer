export function useInterstitialAd() {
  const showAd = async () => {
    return false;
  };

  return {
    isLoaded: false,
    showAd,
  };
}