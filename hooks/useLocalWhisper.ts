import { useState, useEffect } from 'react';
import { Audio } from 'expo-av';
import { documentDirectory, getInfoAsync, downloadAsync, deleteAsync } from 'expo-file-system/legacy';
// @ts-ignore を撤廃し、先ほど定義した型を適用してインポート
import { initWhisper, WhisperContext } from 'whisper.rn';
import { FFmpegKit, ReturnCode } from '@sheehanmunim/react-native-ffmpeg';

export function useLocalWhisper() {
  // any を撤廃し、自作した WhisperContext 型を厳格に適用
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
      
      // パス取得の異常系ハンドリング（これは安全のために残します）
      if (!documentDirectory) {
        throw new Error('ローカルストレージのパスが取得できませんでした');
      }
      
      const modelPath = `${documentDirectory}ggml-tiny.bin`;
      const fileInfo = await getInfoAsync(modelPath);
      
      if (!fileInfo.exists) {
        console.log('モデルをダウンロード中...');
        await downloadAsync(modelUrl, modelPath);
      }
      const context = await initWhisper({ filePath: modelPath });
      setWhisperContext(context);
    } catch (error) {
      console.error('モデルの準備に失敗', error);
    } finally {
      setIsInitializing(false);
    }
  }

  async function startRecording() {
    try {
      await Audio.requestPermissionsAsync();
      await Audio.setAudioModeAsync({ allowsRecordingIOS: true, playsInSilentModeIOS: true });
      
      const { recording } = await Audio.Recording.createAsync({
        isMeteringEnabled: true,
        android: {
          extension: '.wav',
          outputFormat: Audio.AndroidOutputFormat.DEFAULT,
          audioEncoder: Audio.AndroidAudioEncoder.DEFAULT,
          sampleRate: 16000,
          numberOfChannels: 1,
        },
        ios: { 
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

  async function stopAndTranscribe() {
    if (!recording || !whisperContext) return;
    setIsProcessing(true);
    setTranscription('音声ファイルをAI用に変換中...');
    
    try {
      setRecording(undefined);
      await recording.stopAndUnloadAsync();
      const originalUri = recording.getURI();
      
      if (originalUri) {
        // --- 変換パイプライン ---
        // 変換後の本物WAVファイルの保存先を定義
        const wavUri = `${documentDirectory}converted_audio.wav`;
        
        // 前回の古いファイルが残っていれば削除
        const fileInfo = await getInfoAsync(wavUri);
        if (fileInfo.exists) {
          await deleteAsync(wavUri);
        }

        // FFmpegで 16kHz(-ar), モノラル(-ac), 16-bit PCM(-c:a pcm_s16le) に強制変換
        const ffmpegCommand = `-i ${originalUri} -ar 16000 -ac 1 -c:a pcm_s16le ${wavUri}`;
        const session = await FFmpegKit.execute(ffmpegCommand);
        const returnCode = await session.getReturnCode();

        // 変換成功時の処理
        if (ReturnCode.isSuccess(returnCode)) {
          setTranscription('文字起こし中（AIが推論しています）...');
          
          // 変換された「本物のWAV」をWhisperエンジンに渡す
          const { result } = await whisperContext.transcribe(wavUri, {
            language: 'ja',
          });
          setTranscription(result || "（聞き取れませんでした）");
        } else {
          throw new Error('音声フォーマットの変換に失敗しました');
        }
      }
    } catch (error) {
      console.error('推論失敗', error);
      setTranscription('エラーが発生しました（コンソールを確認してください）');
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
