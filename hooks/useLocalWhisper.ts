import { useState, useEffect } from 'react';
import { Audio } from 'expo-av';
import * as FileSystem from 'expo-file-system';
import { initWhisper, WhisperContext } from 'whisper.rn';

export function useLocalWhisper() {
  const [whisperContext, setWhisperContext] = useState<WhisperContext | null>(null);
  const [recording, setRecording] = useState<Audio.Recording | undefined>();
  const [transcription, setTranscription] = useState<string>('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [isInitializing, setIsInitializing] = useState(true);

  useEffect(() => {
    setupModel();
  }, []);

  async function setupModel() {
    try {
      const modelUrl = 'https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-tiny.bin';
      const modelPath = `${FileSystem.documentDirectory}ggml-tiny.bin`;
      const fileInfo = await FileSystem.getInfoAsync(modelPath);
      
      if (!fileInfo.exists) {
        console.log('モデルをダウンロード中...');
        await FileSystem.downloadAsync(modelUrl, modelPath);
      }
      const context = await initWhisper({ filePath: modelPath });
      setWhisperContext(context);
    } catch (error) {
      console.error('モデルの準備に失敗', error);
    } finally {
      setIsInitializing(false);
    }
  }

  // 1. 録音開始（★ここでフォーマットを強制する）
  async function startRecording() {
    try {
      // マイクの権限をOSに要求
      await Audio.requestPermissionsAsync();
      await Audio.setAudioModeAsync({ allowsRecordingIOS: true, playsInSilentModeIOS: true });
      
      // AIが直接読める形式（16kHz, モノラル, WAV）を指定して録音開始
      const { recording } = await Audio.Recording.createAsync({
        isMeteringEnabled: true,
        android: {
          extension: '.wav',
          outputFormat: Audio.AndroidOutputFormat.DEFAULT,
          audioEncoder: Audio.AndroidAudioEncoder.DEFAULT,
          sampleRate: 16000,
          numberOfChannels: 1,
        },
        ios: { // 後でMacチームに渡すためのiOS設定も併記しておく
          extension: '.wav',
          audioQuality: Audio.IOSAudioQuality.HIGH,
          sampleRate: 16000,
          numberOfChannels: 1,
          bitRate: 128000,
          linearPCMBitDepth: 16,
          linearPCMIsBigEndian: false,
          linearPCMIsFloat: false,
        },
        web: { mimeType: 'audio/webm', bitsPerSecond: 128000 }
      });
      setRecording(recording);
    } catch (err) {
      console.error('録音開始失敗', err);
    }
  }

  // 2. 録音停止と文字起こし（変換不要でそのまま渡す）
  async function stopAndTranscribe() {
    if (!recording || !whisperContext) return;
    setIsProcessing(true);
    setTranscription('文字起こし中...');
    
    try {
      // 録音を停止し、ファイルを確定させる
      setRecording(undefined);
      await recording.stopAndUnloadAsync();
      
      // 保存されたWAVファイルのパスを取得
      const uri = recording.getURI();
      
      if (uri) {
        // パスを直接AIに渡す（形式が合っているため一瞬で読み込める）
        const { result } = await whisperContext.transcribe(uri, {
          language: 'ja',
        });
        setTranscription(result);
      }
    } catch (error) {
      console.error('推論失敗', error);
      setTranscription('エラーが発生しました');
    } finally {
      setIsProcessing(false);
    }
  }

  return {
    isInitializing,
    isRecording: !!recording,
    isProcessing,
    transcription,
    startRecording,
    stopAndTranscribe,
    isModelReady: !!whisperContext
  };
}   