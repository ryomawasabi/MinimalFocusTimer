import { useState, useCallback, useRef } from 'react';

export function useInterstitialAd() {
  const [isVisible, setIsVisible] = useState(false);
  const onCloseCallbackRef = useRef<(() => void) | null>(null);

  const showAd = useCallback((): Promise<void> => {
    return new Promise((resolve) => {
      onCloseCallbackRef.current = resolve;
      setIsVisible(true);
    });
  }, []);

  const handleClose = useCallback(() => {
    setIsVisible(false);
    if (onCloseCallbackRef.current) {
      onCloseCallbackRef.current();
      onCloseCallbackRef.current = null;
    }
  }, []);

  return {
    isLoaded: true,
    loadAd: () => {},
    showAd,
    isVisible,
    handleClose,
  };
}
