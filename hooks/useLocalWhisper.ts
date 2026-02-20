/* eslint-disable import/namespace */
import { useState, useEffect } from 'react';
import { Audio } from 'expo-av';
import AudioRecord from 'react-native-audio-record';
import { initWhisper, WhisperContext } from 'whisper.rn';
import * as FileSystem from 'expo-file-system'; // 公式推奨の全体インポートに戻す

export function useLocalWhisper() {
  const [whisperContext, setWhisperContext] = useState<WhisperContext | null>(null);
  const [isRecording, setIsRecording] = useState(false);
  const [transcription, setTranscription] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);

  useEffect(() => {
    async function loadModel() {
      try {
        // TypeScriptの型エラーを封じ込めるNullチェック
        if (!FileSystem.documentDirectory) {
          throw new Error('端末の保存領域にアクセスできません');
        }

        // スマホの内部ストレージ（ドキュメントフォルダ）の絶対パスを定義
        const modelPath = FileSystem.documentDirectory + 'ggml-tiny.bin';
        const fileInfo = await FileSystem.getInfoAsync(modelPath);

        // モデルが存在しない場合（初回起動時）のみ、直接ダウンロード（OTA）
        if (!fileInfo.exists) {
          setTranscription('初回設定：AIの脳みそをダウンロード中...(約75MB) しばらくお待ちください。');
          
          const modelUrl = 'https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-tiny.bin';
          await FileSystem.downloadAsync(modelUrl, modelPath);
          
          setTranscription('ダウンロード完了！AIの準備が整いました。');
        }

        // ローカルに保存されたモデルの絶対パスを渡してAIエンジンを初期化
        const context = await initWhisper({ filePath: modelPath });
        setWhisperContext(context);

      } catch (error) {
        console.error('モデルのロードに失敗', error);
        setTranscription('エラー：AIモデルの準備に失敗しました');
      }
    }
    loadModel();
  }, []);

  async function startRecording() {
    try {
      const permission = await Audio.requestPermissionsAsync();
      if (permission.status !== 'granted') return;

      AudioRecord.init({
        sampleRate: 16000,
        channels: 1,
        bitsPerSample: 16,
        audioSource: 6,
        wavFile: 'whisper_audio.wav',
      });

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
      const audioFileAbsolutePath = await AudioRecord.stop();
      setIsRecording(false);

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