// types/react-native-ffmpeg.d.ts

declare module '@sheehanmunim/react-native-ffmpeg' {
  export interface FFmpegSession {
    getReturnCode(): Promise<any>;
  }

  export class FFmpegKit {
    static execute(command: string): Promise<FFmpegSession>;
  }

  export class ReturnCode {
    static isSuccess(returnCode: any): boolean;
  }
}