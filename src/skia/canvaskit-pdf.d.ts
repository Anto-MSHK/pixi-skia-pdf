/**
 * Дополнение типов canvaskit-wasm: PDF backend.
 *
 * Стандартный npm-пакет canvaskit-wasm НЕ содержит PDF API — он появляется
 * только в нашей кастомной WASM-сборке (build-canvaskit/). Здесь мы расширяем
 * официальные типы, чтобы TypeScript знал о MakePDFDocument / Document.
 *
 * Сигнатуры соответствуют PDF-биндингам Skia (pdf_bindings.cpp / pdf.js).
 */
import 'canvaskit-wasm';
import type { Canvas, EmbindObject, Rect } from 'canvaskit-wasm';

declare module 'canvaskit-wasm' {
  /** Уровень сжатия содержимого PDF (SkPDF::Metadata::CompressionLevel). */
  interface PDFCompressionLevelEnumValues {
    Default: object;
    None: object;
    LowButFast: object;
    Average: object;
    HighButSlow: object;
  }

  /** Метаданные PDF-документа (SkPDF::Metadata). */
  interface PDFMetadata {
    title?: string;
    author?: string;
    subject?: string;
    keywords?: string;
    creator?: string;
    producer?: string;
    language?: string;
    rasterDPI?: number;
    PDFA?: boolean;
    compressionLevel?: object;
  }

  /** PDF-документ Skia (SkDocument). */
  interface PDFDocument extends EmbindObject<'Document'> {
    /** Открыть новую страницу и получить связанный с ней Canvas. */
    beginPage(width: number, height: number, contentRect?: Rect): Canvas;
    /** Завершить текущую страницу. */
    endPage(): void;
    /** Закрыть документ и вернуть готовые байты PDF. */
    close(): Uint8Array;
    /** Прервать формирование документа. */
    abort(): void;
  }

  interface CanvasKit {
    /** true, если сборка включает PDF backend. */
    readonly pdf?: boolean;
    /** Создать PDF-документ (доступно только в сборке с PDF). */
    MakePDFDocument(metadata: PDFMetadata): PDFDocument;
    /** Назначить tag-id для тегированного (доступного) PDF. */
    SetPDFTagId?(canvas: Canvas, tagId: number): void;
    readonly PDFCompressionLevel: PDFCompressionLevelEnumValues;
  }
}
