export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
}
export interface TranscriptionResult {
  id: string;
  url: string;
  text: string;
  language_code: string;
  segmented_json: any;
  txt_content: string;
  timestamp: number;
}
export interface User {
  id: string;
  name: string;
}
export interface Chat {
  id: string;
  title: string;
}
export interface ChatMessage {
  id: string;
  chatId: string;
  userId: string;
  text: string;
  ts: number;
}