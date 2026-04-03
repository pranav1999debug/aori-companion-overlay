declare interface PuterAI {
  chat(
    prompt: string,
    imageUrlOrFile?: string | File | Blob,
    options?: { model?: string }
  ): Promise<string>;
}

declare interface Puter {
  ai: PuterAI;
}

declare const puter: Puter;
