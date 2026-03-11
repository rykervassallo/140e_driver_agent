declare module "mic" {
  import { Readable } from "stream";

  interface MicOptions {
    rate?: string;
    channels?: string;
    bitwidth?: string;
    encoding?: string;
    device?: string;
    endian?: string;
    debug?: boolean;
    fileType?: string;
  }

  interface MicInstance {
    start(): void;
    stop(): void;
    pause(): void;
    resume(): void;
    getAudioStream(): Readable;
  }

  function mic(options?: MicOptions): MicInstance;
  export = mic;
}
