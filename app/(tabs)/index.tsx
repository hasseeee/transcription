import React from 'react';
import { View, Text, Button, StyleSheet, ActivityIndicator } from 'react-native';
import { useLocalWhisper } from '@/hooks/useLocalWhisper';

export default function AppScreen() {
  const {
    isRecording,
    transcription,
    isProcessing,
    recordedAudioPath,
    downloadProgress,
    startRecording,
    stopRecording,
    saveAndTranscribe,
    cancelDownload,
    playRecordedAudio, // 【修正】バックエンドから関数を正しく受け取る
    isModelLoaded,
  } = useLocalWhisper();

  return (
    <View style={styles.container}>
      <Text style={styles.title}>高精度ローカルAI 音声保存システム</Text>
      
      <View style={styles.statusBox}>
        <Text style={styles.statusText}>{transcription || '待機中...'}</Text>
      </View>

      {downloadProgress > 0 && !isModelLoaded && (
        <View style={styles.progressContainer}>
          <Text style={styles.progressText}>ダウンロード進捗: {downloadProgress}%</Text>
          <View style={styles.progressBarBackground}>
            <View style={[styles.progressBarFill, { width: `${downloadProgress}%` }]} />
          </View>
          <Button title="ダウンロードを中断する" onPress={cancelDownload} color="#d9534f" />
        </View>
      )}

      {isProcessing ? (
        <View style={styles.processingContainer}>
          <ActivityIndicator size="large" color="#d9534f" />
          <Text style={{ marginTop: 10, color: '#d9534f' }}>計算中...アプリを閉じないでください</Text>
        </View>
      ) : !isModelLoaded && downloadProgress === 0 ? (
        <ActivityIndicator size="large" color="#0000ff" />
      ) : isModelLoaded ? (
        <View style={styles.buttonContainer}>
          {!recordedAudioPath ? (
            <Button
              title={isRecording ? '■ 録音を終了する' : '● 録音を開始する'}
              onPress={isRecording ? stopRecording : startRecording}
              color={isRecording ? '#d9534f' : '#0275d8'}
            />
          ) : (
            <View style={{ gap: 10 }}>
              {/* デバッグ用テスト再生ボタン */}
              <Button title="🔊 録音した音声をテスト再生する" onPress={playRecordedAudio} color="#f0ad4e" />
              
              <Button title="💾 音声を保存して文字起こしを実行" onPress={saveAndTranscribe} color="#5cb85c" />
              <Button title="やり直す（破棄）" onPress={() => startRecording()} color="#777" />
            </View>
          )}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 20 },
  title: { fontSize: 20, fontWeight: 'bold', marginBottom: 30, color: '#333' },
  statusBox: { width: '100%', minHeight: 150, padding: 15, borderRadius: 8, borderWidth: 1, borderColor: '#ddd', marginBottom: 30, justifyContent: 'center' },
  statusText: { fontSize: 16, color: '#444', textAlign: 'center', lineHeight: 24 },
  buttonContainer: { width: '90%', borderRadius: 8 },
  processingContainer: { alignItems: 'center' },
  progressContainer: { width: '90%', alignItems: 'center', marginBottom: 20 },
  progressText: { fontSize: 16, marginBottom: 10, color: '#333' },
  progressBarBackground: { width: '100%', height: 20, backgroundColor: '#e0e0e0', borderRadius: 10, overflow: 'hidden', marginBottom: 15 },
  progressBarFill: { height: '100%', backgroundColor: '#5cb85c' },
});