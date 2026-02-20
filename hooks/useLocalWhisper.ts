/* eslint-disable import/namespace */
import { useState, useEffect } from 'react';
import { Audio } from 'expo-av';
import AudioRecord from 'react-native-audio-record';
import { initWhisper, WhisperContext } from 'whisper.rn';
import * as FileSystem from 'expo-file-system';

export function useLocalWhisper() {
  const [whisperContext, setWhisperContext] = useState<WhisperContext | null>(null);
  const [isRecording, setIsRecording] = useState(false);
  const [transcription, setTranscription] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);

  useEffect(() => {
    async function loadModel() {
      try {
        // --- ここから修正 ---
        // ライブラリの型定義バグを回避するため、any型にキャストして強制抽出
        const documentDirectory = (FileSystem as any).documentDirectory;

        if (!documentDirectory) {
          throw new Error('端末の保存領域にアクセスできません');
        }

        // スマホの内部ストレージの絶対パスを定義
        const modelPath = documentDirectory + 'ggml-tiny.bin';
        const fileInfo = await FileSystem.getInfoAsync(modelPath);
        // --- ここまで修正 ---

        if (!fileInfo.exists) {
          setTranscription('初回設定：AIの脳みそをダウンロード中...(約75MB) しばらくお待ちください。');
          
          const modelUrl = 'https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-tiny.bin';
          await FileSystem.downloadAsync(modelUrl, modelPath);
          
          setTranscription('ダウンロード完了！AIの準備が整いました。');
        }

        const context = await initWhisper({ filePath: modelPath });
        setWhisperContext(context);

      } catch (error) {
        console.error('モデルのロードに失敗', error);
        setTranscription('エラー：AIモデルの準備に失敗しました');
      }
    }
    loadModel();
  }, []);
}