import { View, Text, StyleSheet } from 'react-native';

export default function FakeBannerAd() {
  return (
    <View style={styles.container}>
      <View style={styles.banner}>
        <Text style={styles.adText}>Ad (Test Banner)</Text>
        <Text style={styles.subText}>Powered by AdMob (placeholder)</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    width: '100%',
    paddingHorizontal: 12,
    paddingBottom: 8,
  },
  banner: {
    height: 50,
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  adText: {
    fontSize: 12,
    color: '#EAF2FF',
    opacity: 0.5,
    fontWeight: '500',
  },
  subText: {
    fontSize: 10,
    color: '#EAF2FF',
    opacity: 0.3,
    marginTop: 2,
  },
});
