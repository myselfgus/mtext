export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
}
/**
 * Enhanced TranscriptionResult optimized for Scribe v2 clinical output.
 */
export interface TranscriptionResult {
  id: string;
  url: string;
  text: string;
  language_code: string;
  segmented_json: any; // Raw payload containing word-level timestamps and speaker labels
  txt_content: string;
  timestamp: number;
}
/**
 * TranscriptionStatus represents the lifecycle of a medical audio analysis.
 */
export type TranscriptionStatus = 'idle' | 'submitting' | 'transcribing' | 'saving' | 'complete' | 'error';