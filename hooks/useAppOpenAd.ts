export function useAppOpenAd() {
  const showAdIfReady = async (): Promise<boolean> => {
    return false;
  };

  return {
    isLoaded: false,
    showAdIfReady,
    isVisible: false,
    handleClose: () => {},
  };
}