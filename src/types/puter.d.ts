declare interface PuterAI {
  chat(
    prompt: string,
    imageUrlOrFile?: string | File,
    options?: { model?: string }
  ): Promise<string>;
}

declare interface Puter {
  ai: PuterAI;
}

declare const puter: Puter;
