declare interface PuterAI {
  chat(
    prompt: string,
    imageUrlOrFile?: string | File | Blob,
    options?: { model?: string }
  ): Promise<string>;
  txt2img(
    prompt: string,
    options?: { model?: string; quality?: string; size?: string } | boolean
  ): Promise<HTMLImageElement>;
}

declare interface Puter {
  ai: PuterAI;
}

declare const puter: Puter;
