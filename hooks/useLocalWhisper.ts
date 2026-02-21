import { useState, useEffect, useRef } from 'react';
import { Alert, Platform } from 'react-native';
import { Audio } from 'expo-av';
import { initWhisper, WhisperContext } from 'whisper.rn';
import RNFS from 'react-native-fs';

export function useLocalWhisper() {
  const [whisperContext, setWhisperContext] = useState<WhisperContext | null>(null);
  
  // 【新規】expo-avの録音インスタンスを保持するステート
  const [recording, setRecording] = useState<Audio.Recording | null>(null);
  
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

        if (await RNFS.exists(tmpPath)) {
          await RNFS.unlink(tmpPath);
        }

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
              const percentage = (res.bytesWritten / res.contentLength) * 100;
              setDownloadProgress(Math.round(percentage));
            }
          });
          
          downloadJobId.current = ret.jobId;

          const downloadResult = await ret.promise;
          
          if (downloadResult.statusCode === 200) {
            await RNFS.moveFile(tmpPath, finalPath);
            setDownloadProgress(0);
            setTranscription('高精度AIの準備が完了しました。');
          } else {
             throw new Error(`ダウンロード通信失敗: HTTP ${downloadResult.statusCode}`);
          }
        }

        const context = await initWhisper({ filePath: finalPath });
        setWhisperContext(context);

      } catch (error: any) {
        if (error.message === 'Download has been aborted') {
          console.log('ユーザーによってダウンロードが中断されました');
        } else {
          console.error('モデルのロードに失敗', error);
          setTranscription('エラー：AIモデルの準備に失敗しました。アプリを再起動してください。');
        }
      }
    }
    loadModel();
  }, []);

  function cancelDownload() {
    if (downloadJobId.current !== -1) {
      RNFS.stopDownload(downloadJobId.current);
      setDownloadProgress(0);
      setTranscription('ダウンロードを中断しました。アプリを再起動すると最初からやり直せます。');
    }
  }

  // 【アーキテクチャ刷新】expo-avによる堅牢な録音ロジック（Whisper専用フォーマット）
  async function startRecording() {
    try {
      const permission = await Audio.requestPermissionsAsync();
      if (permission.status !== 'granted') {
        Alert.alert('権限エラー', 'マイクへのアクセスが許可されていません。');
        return;
      }
      
      await Audio.setAudioModeAsync({
        allowsRecordingIOS: true,
        playsInSilentModeIOS: true,
      });

      // 【修正】高音質プリセットを捨て、Whisperが要求する厳格なフォーマットをカスタム指定
      const whisperOptions = {
        android: {
          extension: '.m4a',
          outputFormat: Audio.AndroidOutputFormat.MPEG_4,
          audioEncoder: Audio.AndroidAudioEncoder.AAC,
          sampleRate: 16000, // 【最重要】AIの耳と同じ周波数（16kHz）に固定
          numberOfChannels: 1, // ステレオ(2)ではなくモノラル(1)に固定
          bitRate: 64000,
        },
        ios: {
          extension: '.wav',
          audioQuality: Audio.IOSAudioQuality.HIGH,
          sampleRate: 16000,
          numberOfChannels: 1,
          bitRate: 256000,
          linearPCMBitDepth: 16,
          linearPCMIsBigEndian: false,
          linearPCMIsFloat: false,
        },
        web: {
          mimeType: 'audio/webm',
          bitsPerSecond: 128000,
        },
      };

      // カスタムオプションを使って、最初からAIが読める形で録音を開始する
      const { recording: newRecording } = await Audio.Recording.createAsync(whisperOptions);
      
      setRecording(newRecording);
      setIsRecording(true);
      setRecordedAudioPath(null);
      setTranscription('録音中...');
    } catch (error) {
      console.error('録音開始エラー', error);
      setTranscription('エラー：録音を開始できませんでした。');
    }
  }

  async function stopRecording() {
    if (!recording) return;
    try {
      await recording.stopAndUnloadAsync();
      const uri = recording.getURI();
      if (!uri) throw new Error('音声URIが取得できませんでした');

      // C++エンジンが読み込めるよう、Androidの場合は file:// プレフィックスを安全に除去
      let path = uri;
      if (Platform.OS === 'android' && path.startsWith('file://')) {
        path = path.replace('file://', '');
      }

      setRecording(null);
      setIsRecording(false);
      setRecordedAudioPath(path);
      setTranscription('録音が完了しました。「保存して文字起こし」を実行してください。');
    } catch (error) {
      console.error('録音停止エラー', error);
    }
  }

  async function saveAndTranscribe() {
    if (!recordedAudioPath || !whisperContext || isProcessing) return;
    setIsProcessing(true);
    setTranscription('音声をデコードし、高精度AIが推論しています...\n（数十秒かかります。アプリを閉じないでください）');
    
    try {
      // OS標準のデコーダが自動解凍するため、破損の心配なしに直接推論を実行できる
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
      const uri = recordedAudioPath.startsWith('file://') ? recordedAudioPath : `file://${recordedAudioPath}`;
      const { sound } = await Audio.Sound.createAsync({ uri });
      await sound.playAsync();
    } catch (error) {
      console.error('再生エラー', error);
      setTranscription('エラー：音声の再生に失敗しました。');
    }
  }

  return {
    isRecording,
    transcription,
    isProcessing,
    recordedAudioPath,
    downloadProgress,
    startRecording,
    stopRecording,
    saveAndTranscribe,
    cancelDownload,
    playRecordedAudio,
    isModelLoaded: !!whisperContext,
  };
}