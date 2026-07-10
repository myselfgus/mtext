import { create } from 'zustand';
import { TranscriptionResult } from '@shared/types';
type TranscriptionStatus = 'idle' | 'submitting' | 'transcribing' | 'saving' | 'complete' | 'error';
interface TranscriptionState {
  status: TranscriptionStatus;
  url: string;
  result: TranscriptionResult | null;
  error: string | null;
  setStatus: (status: TranscriptionStatus) => void;
  setUrl: (url: string) => void;
  setResult: (result: TranscriptionResult | null) => void;
  setError: (error: string | null) => void;
  reset: () => void;
}
export const useTranscriptionStore = create<TranscriptionState>((set) => ({
  status: 'idle',
  url: '',
  result: null,
  error: null,
  setStatus: (status) => set({ status }),
  setUrl: (url) => set({ url }),
  setResult: (result) => set({ result }),
  setError: (error) => set({ error }),
  reset: () => set({ 
    status: 'idle', 
    url: '', 
    result: null, 
    error: null 
  }),
}));