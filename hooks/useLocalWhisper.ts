import { useState, useEffect } from 'react';
import { Audio } from 'expo-av'; // 権限リクエスト用としてのみ残す
import AudioRecord from 'react-native-audio-record'; // 新しい純粋WAV録音ライブラリ
import { initWhisper, WhisperContext } from 'whisper.rn';

export function useLocalWhisper() {
  const [whisperContext, setWhisperContext] = useState<WhisperContext | null>(null);
  const [isRecording, setIsRecording] = useState(false);
  const [transcription, setTranscription] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);

  useEffect(() => {
    async function loadModel() {
      try {
        const context = await initWhisper({
          filePath: require('@/assets/ggml-tiny.bin'),
        });
        setWhisperContext(context);
      } catch (error) {
        console.error('モデルのロードに失敗', error);
      }
    }
    loadModel();
  }, []);

  async function startRecording() {
    try {
      // 1. マイク権限の確認
      const permission = await Audio.requestPermissionsAsync();
      if (permission.status !== 'granted') return;

      // 2. Whisper専用の純粋WAV（16kHz, モノラル, 16-bit PCM）として録音機を初期化
      AudioRecord.init({
        sampleRate: 16000,
        channels: 1,
        bitsPerSample: 16,
        audioSource: 6, // 6 = VOICE_RECOGNITION（音声認識に最適化されたマイク設定）
        wavFile: 'whisper_audio.wav', // 保存されるファイル名
      });

      // 3. 録音開始
      AudioRecord.start();
      setIsRecording(true);
      setTranscription('');
    } catch (error) {
      console.error('録音開始エラー', error);
    }
  }

  async function stopAndTranscribe() {
    if (!isRecording || !whisperContext) return;
    setIsProcessing(true);
    setTranscription('録音完了。AIが推論しています...');

    try {
      // 1. 録音を停止し、生成された「本物のWAV」の絶対パスを取得
      const audioFileAbsolutePath = await AudioRecord.stop();
      setIsRecording(false);

      // 2. FFmpegでの変換は不要！直接Whisperに渡す
      const { result } = await whisperContext.transcribe(audioFileAbsolutePath, {
        language: 'ja',
      });
      setTranscription(result || "（聞き取れませんでした）");

    } catch (error) {
      console.error('推論失敗', error);
      setTranscription('エラーが発生しました');
      setIsRecording(false);
    } finally {
      setIsProcessing(false);
    }
  }

  return {
    isRecording,
    transcription,
    isProcessing,
    startRecording,
    stopAndTranscribe,
    isModelLoaded: !!whisperContext,
  };
}