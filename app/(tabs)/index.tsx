import { useLocalWhisper } from '@/hooks/useLocalWhisper';
import React from 'react';
import { ActivityIndicator, Button, ScrollView, StyleSheet, Text, View } from 'react-native';

export default function AppScreen() {
  const {
    isRecording, transcription, isProcessing, recordedAudioPath, downloadProgress,
    processLogs, // フックからログ配列を受け取る
    startRecording, stopRecording, saveAndTranscribe, cancelDownload, playRecordedAudio,
    isModelLoaded,
  } = useLocalWhisper();

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.title}>高精度ローカルAI 音声保存システム</Text>
      
      <View style={styles.statusBox}>
        <Text style={styles.statusText}>{transcription || '待機中...'}</Text>
      </View>

      {/* 【新規】データパイプラインのフェーズ別ログ出力エリア（開発環境のみ表示） */}
      {__DEV__ && processLogs.length > 0 && (
        <View style={styles.logBox}>
          <Text style={styles.logTitle}>バックエンド処理ログ (テスト用):</Text>
          {processLogs.map((log, index) => (
            <Text key={index} style={styles.logText}>{log}</Text>
          ))}
        </View>
      )}

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
              <Button title="🔊 録音した音声をテスト再生する" onPress={playRecordedAudio} color="#f0ad4e" />
              <Button title="💾 音声を保存して推論パイプラインを実行" onPress={saveAndTranscribe} color="#5cb85c" />
              <Button title="やり直す（破棄）" onPress={() => startRecording()} color="#777" />
            </View>
          )}
        </View>
      ) : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flexGrow: 1, justifyContent: 'center', alignItems: 'center', padding: 20 },
  title: { fontSize: 20, fontWeight: 'bold', marginBottom: 20, color: '#333' },
  statusBox: { width: '100%', minHeight: 100, padding: 15, borderRadius: 8, borderWidth: 1, borderColor: '#ddd', marginBottom: 20, justifyContent: 'center' },
  statusText: { fontSize: 16, color: '#444', textAlign: 'center', lineHeight: 24 },
  logBox: { width: '100%', backgroundColor: '#1e1e1e', padding: 10, borderRadius: 8, marginBottom: 20 },
  logTitle: { color: '#4af626', fontWeight: 'bold', marginBottom: 5 },
  logText: { color: '#d4d4d4', fontSize: 12, fontFamily: 'monospace', marginBottom: 2 },
  buttonContainer: { width: '90%', borderRadius: 8 },
  processingContainer: { alignItems: 'center', marginVertical: 20 },
  progressContainer: { width: '90%', alignItems: 'center', marginBottom: 20 },
  progressText: { fontSize: 16, marginBottom: 10, color: '#333' },
  progressBarBackground: { width: '100%', height: 20, backgroundColor: '#e0e0e0', borderRadius: 10, overflow: 'hidden', marginBottom: 15 },
  progressBarFill: { height: '100%', backgroundColor: '#5cb85c' },
});