import { Hono } from "hono";
import type { Env } from './core-utils';
import { TranscriptionEntity } from "./entities";
import { ok, bad } from './core-utils';
import { TranscriptionResult } from "@shared/types";
const DEFAULT_KEY = "sk_9486c8f42095a0242278e35272a9df273a25c11025531d05";
export function userRoutes(app: Hono<{ Bindings: Env & { ELEVENLABS_API_KEY?: string } }>) {
  app.post('/api/transcribe', async (c) => {
    try {
      const { url } = (await c.req.json()) as { url?: string };
      if (!url || !url.startsWith('http')) {
        return bad(c, 'Uma URL de áudio válida (começando com http/https) é necessária para o processamento.');
      }
      const apiKey = c.env.ELEVENLABS_API_KEY || DEFAULT_KEY;
      if (!c.env.ELEVENLABS_API_KEY) {
        console.warn('[SERVER] ELEVENLABS_API_KEY não configurada. Usando chave de fallback para demonstração.');
      }
      const formData = new FormData();
      formData.append('url', url);
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
        console.error(`[ElevenLabs API Error] Status: ${response.status}`, errorDetail);
        if (response.status === 401) return bad(c, 'Erro de autenticação no motor clínico. Verifique as credenciais.');
        if (response.status === 429) return bad(c, 'Limite de processamento atingido. Por favor, aguarde alguns minutos.');
        if (response.status === 413) return bad(c, 'O arquivo de áudio é muito grande para o processamento imediato.');
        return bad(c, 'Não foi possível transcrever este áudio. Certifique-se de que a URL aponta diretamente para um arquivo de mídia público (mp3, wav, m4a).');
      }
      const data: any = await response.json();
      const resultId = crypto.randomUUID();
      const result: TranscriptionResult = {
        id: resultId,
        url: url,
        text: data.text || '',
        language_code: data.language_code || 'pt',
        segmented_json: data,
        txt_content: data.text || '',
        timestamp: Date.now(),
      };
      // Persist in Durable Object storage for potential later retrieval or analysis tracking
      try {
        await TranscriptionEntity.create(c.env, result);
      } catch (saveErr) {
        console.error('[Storage Error] Falha ao persistir registro da transcrição:', saveErr);
        // We still return the result even if storage fails, as the primary goal is the immediate response
      }
      return ok(c, result);
    } catch (err) {
      console.error('[Critical Failure] Request Error:', err);
      return bad(c, 'Ocorreu um erro interno ao processar a solicitação clínica. Tente novamente em breve.');
    }
  });
  app.get('/api/health-check', (c) => ok(c, { 
    status: 'MText Core Production Active', 
    version: '2.0.1',
    engine: 'ElevenLabs Scribe V2'
  }));
}