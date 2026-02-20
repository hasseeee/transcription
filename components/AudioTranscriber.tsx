import { View, Button, Text, StyleSheet, ActivityIndicator } from 'react-native';
import { useLocalWhisper } from '../hooks/useLocalWhisper';

export function AudioTranscriber() {
  const { 
    isInitializing, 
    isRecording, 
    isProcessing,
    transcription, 
    startRecording, 
    stopAndTranscribe,
    isModelReady
  } = useLocalWhisper();

  if (isInitializing) {
    return (
      <View style={styles.container}>
        <ActivityIndicator size="large" />
        <Text style={styles.text}>AIモデルを準備中...</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Button
        title={isRecording ? '録音を停止して文字起こし' : '音声を録音'}
        onPress={isRecording ? stopAndTranscribe : startRecording}
        disabled={!isModelReady || isProcessing}
        color={isRecording ? 'red' : '#2196F3'}
      />
      {isProcessing && <Text style={styles.text}>解析中（数秒かかります）...</Text>}
      <Text style={styles.resultText}>{transcription}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { padding: 20, alignItems: 'center' },
  text: { marginTop: 20, fontSize: 16, textAlign: 'center' },
  resultText: { marginTop: 20, fontSize: 18, fontWeight: 'bold', textAlign: 'center' },
});