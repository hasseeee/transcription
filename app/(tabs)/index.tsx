import { StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context'; // ← ここから呼び出す

import { AudioTranscriber } from '@/components/AudioTranscriber';

export default function HomeScreen() {
  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.container}>
        <AudioTranscriber />
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#fff',
  },
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
});