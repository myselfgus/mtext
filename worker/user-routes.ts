import { Hono } from "hono";
import type { Env } from './core-utils';
import { TranscriptionEntity } from "./entities";
import { ok, bad } from './core-utils';
import { TranscriptionResult } from "@shared/types";
// Primary API Key source is Environment Bindings
const DEFAULT_KEY = "sk_9486c8f42095a0242278e35272a9df273a25c11025531d05";
export function userRoutes(app: Hono<{ Bindings: Env & { ELEVENLABS_API_KEY?: string } }>) {
  app.post('/api/transcribe', async (c) => {
    try {
      const { url } = (await c.req.json()) as { url?: string };
      if (!url || !url.startsWith('http')) {
        return bad(c, 'Uma URL de áudio válida (HTTP/HTTPS) é obrigatória.');
      }
      const apiKey = c.env.ELEVENLABS_API_KEY || DEFAULT_KEY;
      if (!c.env.ELEVENLABS_API_KEY) {
        console.warn('Warning: Using fallback API key. Set ELEVENLABS_API_KEY in environment.');
      }
      const formData = new FormData();
      formData.append('url', url);
      // Upgraded to scribe_v2 for production clinical accuracy
      formData.append('model_id', 'scribe_v2');
      formData.append('tag_audio_events', 'true');
      formData.append('language_code', 'pt');
      formData.append('diarize', 'true');
      const response = await fetch('https://api.elevenlabs.io/v1/speech-to-text', {
        method: 'POST',
        headers: {
          'xi-api-key': apiKey,
        },
        body: formData,
      });
      if (!response.ok) {
        const errorDetail = await response.text();
        console.error(`ElevenLabs API Error [${response.status}]:`, errorDetail);
        if (response.status === 401) return bad(c, 'Erro de autenticação com o motor de transcrição.');
        if (response.status === 429) return bad(c, 'Limite de transcrições excedido. Tente mais tarde.');
        return bad(c, 'Não foi possível processar o áudio. Verifique se o arquivo é compatível e público.');
      }
      const data: any = await response.json();
      const result: TranscriptionResult = {
        id: crypto.randomUUID(),
        url: url,
        text: data.text || '',
        language_code: data.language_code || 'pt',
        segmented_json: data,
        txt_content: data.text || '',
        timestamp: Date.now(),
      };
      // Persist using specialized TranscriptionEntity
      await TranscriptionEntity.create(c.env, result);
      return ok(c, result);
    } catch (err) {
      console.error('Critical Transcription Failure:', err);
      return bad(c, 'Erro interno crítico ao processar a transcrição.');
    }
  });
  app.get('/api/health-check', (c) => ok(c, { status: 'MText Core Production Active', version: '2.0.0' }));
}