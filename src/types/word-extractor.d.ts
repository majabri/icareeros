declare module "word-extractor" {
  class WordDocument {
    getBody(): string;
    getFootnotes(): string;
    getEndnotes(): string;
    getHeaders(options?: { even?: boolean; first?: boolean }): string;
    getFooters(options?: { even?: boolean; first?: boolean }): string;
    getAnnotations(): string;
    getTextboxes(options?: { main?: boolean; header?: boolean; footer?: boolean }): string;
  }

  class WordExtractor {
    extract(filename: string): Promise<WordDocument>;
  }

  export default WordExtractor;
}
