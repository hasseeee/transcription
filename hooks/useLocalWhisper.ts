import { useState, useEffect, useRef } from 'react';
import { Alert } from 'react-native';
import { Audio } from 'expo-av'; // 権限とテスト再生用としてのみ残します
import AudioRecord from 'react-native-audio-record'; // 最高のWAV生成ツールに帰還します
import { initWhisper, WhisperContext } from 'whisper.rn';
import RNFS from 'react-native-fs';

export function useLocalWhisper() {
  const [whisperContext, setWhisperContext] = useState<WhisperContext | null>(null);
  const [isRecording, setIsRecording] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [transcription, setTranscription] = useState('');
  const [recordedAudioPath, setRecordedAudioPath] = useState<string | null>(null);
  const [downloadProgress, setDownloadProgress] = useState<number>(0);
  const downloadJobId = useRef<number>(-1);

  useEffect(() => {
    async function loadModel() {
      try {
        const documentDirectory = RNFS.DocumentDirectoryPath;
        if (!documentDirectory) throw new Error('端末の保存領域にアクセスできません。');

        const finalPath = `${documentDirectory}/ggml-base.bin`;
        const tmpPath = `${documentDirectory}/ggml-base.tmp`;

        if (await RNFS.exists(tmpPath)) await RNFS.unlink(tmpPath);

        let needsDownload = true;
        if (await RNFS.exists(finalPath)) {
          const stat = await RNFS.stat(finalPath);
          if (stat.size / (1024 * 1024) > 100) {
            needsDownload = false;
            setTranscription('AIの準備が完了しています。');
          } else {
            await RNFS.unlink(finalPath);
          }
        }

        if (needsDownload) {
          setTranscription('高精度AIモデルをダウンロードしています...');
          const modelUrl = 'https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-base.bin';
          
          const ret = RNFS.downloadFile({
            fromUrl: modelUrl,
            toFile: tmpPath,
            progressInterval: 200,
            progress: (res) => {
              setDownloadProgress(Math.round((res.bytesWritten / res.contentLength) * 100));
            }
          });
          downloadJobId.current = ret.jobId;

          const downloadResult = await ret.promise;
          if (downloadResult.statusCode === 200) {
            await RNFS.moveFile(tmpPath, finalPath);
            setDownloadProgress(0);
            setTranscription('高精度AIの準備が完了しました。');
          } else {
             throw new Error(`HTTP ${downloadResult.statusCode}`);
          }
        }

        const context = await initWhisper({ filePath: finalPath });
        setWhisperContext(context);
      } catch (error) {
        setTranscription('エラー：AIモデルの準備に失敗しました。アプリを再起動してください。');
      }
    }
    loadModel();
  }, []);

  function cancelDownload() {
    if (downloadJobId.current !== -1) {
      RNFS.stopDownload(downloadJobId.current);
      setDownloadProgress(0);
      setTranscription('ダウンロードを中断しました。');
    }
  }

  // 【修正】WAVファイルの生成に特化した AudioRecord を再び採用
  async function startRecording() {
    try {
      const permission = await Audio.requestPermissionsAsync();
      if (permission.status !== 'granted') {
        Alert.alert('権限エラー', 'マイクへのアクセスが許可されていません。');
        return;
      }
      
      AudioRecord.init({ 
        sampleRate: 16000, // AI必須の16kHz
        channels: 1,       // AI必須のモノラル
        bitsPerSample: 16, // AI必須の16ビット
        audioSource: 1,    // 標準マイク（無音化回避）
        wavFile: 'whisper_audio.wav' 
      });
      
      AudioRecord.start();
      setIsRecording(true);
      setRecordedAudioPath(null);
      setTranscription('録音中...');
    } catch (error) {
      setTranscription('エラー：録音を開始できませんでした。');
    }
  }

  async function stopRecording() {
    if (!isRecording) return;
    try {
      const path = await AudioRecord.stop();
      setIsRecording(false);

      // 【最重要】Android/iOS問わず、C++エンジンに絶対パスを伝えるための file:// プレフィックスを強制付与
      const finalPath = path.startsWith('file://') ? path : `file://${path}`;
      
      setRecordedAudioPath(finalPath);
      setTranscription('録音が完了しました。「保存して文字起こし」を実行してください。');
    } catch (error) {
      console.error('録音停止エラー', error);
    }
  }

  async function saveAndTranscribe() {
    if (!recordedAudioPath || !whisperContext || isProcessing) return;
    setIsProcessing(true);
    setTranscription('WAV音声をAIエンジンに送信し、推論しています...\n（数十秒かかります。アプリを閉じないでください）');
    
    try {
      // 純粋なWAVファイルと、言語指定のみで勝負する
      const { result } = await whisperContext.transcribe(recordedAudioPath, { language: 'ja' });
      setTranscription(result || "（推論完了しましたが、AIが言葉を認識できませんでした）");
    } catch (error) {
      console.error('推論失敗', error);
      setTranscription('エラーが発生しました');
    } finally {
      setIsProcessing(false);
      setRecordedAudioPath(null);
    }
  }

  async function playRecordedAudio() {
    if (!recordedAudioPath) return;
    try {
      setTranscription('🔊 録音データをスピーカーからテスト再生しています...');
      const { sound } = await Audio.Sound.createAsync({ uri: recordedAudioPath });
      await sound.playAsync();
    } catch (error) {
      setTranscription('エラー：音声の再生に失敗しました。');
    }
  }

  return {
    isRecording, transcription, isProcessing, recordedAudioPath, downloadProgress,
    startRecording, stopRecording, saveAndTranscribe, cancelDownload, playRecordedAudio,
    isModelLoaded: !!whisperContext,
  };
}