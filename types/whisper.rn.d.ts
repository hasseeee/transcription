// whisper.rn モジュールの型定義（インターフェース）をシステムに教える
declare module 'whisper.rn' {
  // 文字起こし時のオプション
  export interface TranscribeOptions {
    language?: string;
    maxLen?: number;
    tokenTimestamps?: boolean;
    weight_thold?: number;
    word_thold?: number;
  }

  // 文字起こしの結果
  export interface TranscribeResult {
    result: string;
  }

  // 推論エンジンのコンテキスト（インスタンス）
  export interface WhisperContext {
    transcribe: (audioPath: string, options?: TranscribeOptions) => Promise<TranscribeResult>;
    release?: () => Promise<void>;
  }

  // 初期化時のオプション
  export interface InitOptions {
    filePath: string;
  }

  // モジュールが公開する初期化関数
  export function initWhisper(options: InitOptions): Promise<WhisperContext>;
}