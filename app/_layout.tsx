import { useEffect } from 'react';
import { Platform } from 'react-native';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useFrameworkReady } from '@/hooks/useFrameworkReady';
import { useAppOpenAd } from '@/hooks/useAppOpenAd';
import FakeAppOpenAd from '@/components/FakeAppOpenAd';

export default function RootLayout() {
  useFrameworkReady();
  const { showAdIfReady, isVisible, handleClose } = useAppOpenAd();

  useEffect(() => {
    showAdIfReady();
  }, [showAdIfReady]);

  return (
    <>
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="index" />
        <Stack.Screen name="+not-found" />
      </Stack>
      <StatusBar style="light" />
      {Platform.OS === 'web' && (
        <FakeAppOpenAd visible={isVisible} onClose={handleClose} />
      )}
    </>
  );
}
