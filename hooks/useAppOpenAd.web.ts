import { useState, useCallback, useRef } from 'react';
import { AdManager } from '../utils/AdManager';

export function useAppOpenAd() {
  const [isVisible, setIsVisible] = useState(false);
  const [hasShownOnColdStart, setHasShownOnColdStart] = useState(false);
  const onCloseCallbackRef = useRef<(() => void) | null>(null);

  const showAdIfReady = useCallback(async (): Promise<boolean> => {
    if (hasShownOnColdStart) return false;

    const shouldShow = await AdManager.shouldShowAppOpenAd();
    if (!shouldShow) return false;

    return new Promise((resolve) => {
      onCloseCallbackRef.current = () => {
        setHasShownOnColdStart(true);
        AdManager.markAppOpenShown();
        resolve(true);
      };
      setIsVisible(true);
    });
  }, [hasShownOnColdStart]);

  const handleClose = useCallback(() => {
    setIsVisible(false);
    if (onCloseCallbackRef.current) {
      onCloseCallbackRef.current();
      onCloseCallbackRef.current = null;
    }
  }, []);

  return {
    isLoaded: true,
    showAdIfReady,
    isVisible,
    handleClose,
  };
}
