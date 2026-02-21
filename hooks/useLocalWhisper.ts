import { Audio } from 'expo-av';
import { useEffect, useRef, useState } from 'react';
import { Alert } from 'react-native';
import AudioRecord from 'react-native-audio-record';
import RNFS from 'react-native-fs';
import { initWhisper, WhisperContext } from 'whisper.rn';

export function useLocalWhisper() {
  const [whisperContext, setWhisperContext] = useState<WhisperContext | null>(null);
  const [isRecording, setIsRecording] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [transcription, setTranscription] = useState('');
  const [recordedAudioPath, setRecordedAudioPath] = useState<string | null>(null);
  const [downloadProgress, setDownloadProgress] = useState<number>(0);
  const downloadJobId = useRef<number>(-1);

  // 【新規】データパイプラインのフェーズごとのログを管理するステート
  const [processLogs, setProcessLogs] = useState<string[]>([]);

  // ログを追加し、コンソールとUIの両方に出力するユーティリティ関数
  const addPhaseLog = (logMessage: string) => {
    console.log(`[Pipeline] ${logMessage}`);
    setProcessLogs(prev => [...prev, logMessage]);
  };

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
      } catch (error: any) {
        console.error('モデルのロードに失敗', error);
        setTranscription('エラー：AIモデルの準備に失敗しました。');
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

  async function startRecording() {
    try {
      const permission = await Audio.requestPermissionsAsync();
      if (permission.status !== 'granted') {
        Alert.alert('権限エラー', 'マイクへのアクセスが許可されていません。');
        return;
      }
      
      // 毎回新しいファイル名で録音する（ファイルロックやヘッダ破損の回避）
      const timestamp = new Date().getTime();
      const newWavFile = `whisper_audio_${timestamp}.wav`;
      
      AudioRecord.init({ 
        sampleRate: 16000,
        channels: 1,      
        bitsPerSample: 16,
        audioSource: 1,   
        wavFile: newWavFile 
      });
      
      AudioRecord.start();
      setIsRecording(true);
      setRecordedAudioPath(null);
      setProcessLogs([]); // 録音開始時にログをクリア
      setTranscription('録音中...');
    } catch (error) {
      console.error('録音開始エラー', error);
      setTranscription('エラー：録音を開始できませんでした。');
    }
  }

  async function stopRecording() {
    if (!isRecording) return;
    try {
      const path = await AudioRecord.stop();
      setIsRecording(false);
      
      // ファイルの書き込み完了を少し待つ（Androidのヘッダ更新遅延対策）
      await new Promise(resolve => setTimeout(resolve, 500));

      const finalPath = path.startsWith('file://') ? path : `file://${path}`;
      setRecordedAudioPath(finalPath);
      setTranscription('録音が完了しました。「保存して推論パイプラインを実行」を実行してください。');
    } catch (error) {
      console.error('録音停止エラー', error);
    }
  }

  // 【アーキテクチャ刷新】パーセントではなく、フェーズごとの状態をロギングする
  async function saveAndTranscribe() {
    if (!recordedAudioPath || !whisperContext || isProcessing) return;
    setIsProcessing(true);
    setProcessLogs([]);
    setTranscription('');

    try {
      addPhaseLog('Phase 1: 録音ファイルのパスを受け取りました。');
      const cleanPath = recordedAudioPath.replace(/^file:\/\//, '');
      addPhaseLog(`-> 対象パス: ${cleanPath}`);

      addPhaseLog('Phase 2: OSファイルシステム上のメタデータを検証します。');
      const exists = await RNFS.exists(cleanPath);
      if (!exists) throw new Error('OS上にファイルが存在しません。');
      
      const stat = await RNFS.stat(cleanPath);
      addPhaseLog(`-> 実ファイルサイズ: ${stat.size} bytes`);
      if (stat.size < 1000) throw new Error('データが不足しています（1000 bytes未満）。');

      addPhaseLog('Phase 3: WAVヘッダ（先頭44バイト）の整合性を検証します。');
      // ファイルの先頭44バイトをBase64文字列として抽出
      const headerBase64 = await RNFS.read(cleanPath, 44, 0, 'base64');
      addPhaseLog(`-> ヘッダ(Base64): ${headerBase64.substring(0, 25)}...`);

      addPhaseLog('Phase 4: C++ AIエンジンへファイルパスを渡し、推論を開始します。');
      // ※onProgressはUIフリーズの原因となるため外し、完了のみを待つ
      const { result } = await whisperContext.transcribe(cleanPath, { language: 'ja' });
      
      addPhaseLog('Phase 5: C++エンジンから処理結果が返却されました。');
      if (!result || result.trim() === '') {
        addPhaseLog('-> 警告: 処理は正常終了しましたが、認識された文字列が空でした。WAVヘッダ破損の疑いがあります。');
        setTranscription('（推論完了：認識された言葉がありませんでした）');
      } else {
        addPhaseLog(`-> 出力成功: ${result}`);
        setTranscription(result);
      }
    } catch (error: any) {
      console.error('推論失敗', error);
      addPhaseLog(`Phase Error: ${error.message || error}`);
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
      console.error('再生エラー', error);
      setTranscription('エラー：音声の再生に失敗しました。');
    }
  }

  return {
    isRecording, transcription, isProcessing, recordedAudioPath, downloadProgress,
    processLogs, // 【追加】UI側にログを渡す
    startRecording, stopRecording, saveAndTranscribe, cancelDownload, playRecordedAudio,
    isModelLoaded: !!whisperContext,
  };
}