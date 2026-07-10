import { Hono } from "hono";
import type { Env } from './core-utils';
import { ChatBoardEntity } from "./entities";
import { ok, bad } from './core-utils';
import { TranscriptionResult } from "@shared/types";
const ELEVENLABS_API_KEY = "sk_9486c8f42095a0242278e35272a9df273a25c11025531d05";
export function userRoutes(app: Hono<{ Bindings: Env }>) {
  app.post('/api/transcribe', async (c) => {
    try {
      const { url } = (await c.req.json()) as { url?: string };
      if (!url || !url.startsWith('http')) {
        return bad(c, 'Uma URL de áudio válida (HTTP/HTTPS) é obrigatória.');
      }
      const formData = new FormData();
      formData.append('url', url);
      formData.append('model_id', 'scribe_v1');
      formData.append('tag_audio_events', 'true');
      formData.append('language_code', 'pt');
      formData.append('diarize', 'true');
      const response = await fetch('https://api.elevenlabs.io/v1/speech-to-text', {
        method: 'POST',
        headers: {
          'xi-api-key': ELEVENLABS_API_KEY,
        },
        body: formData,
      });
      if (!response.ok) {
        const errorText = await response.text();
        console.error('ElevenLabs API Error:', errorText);
        return bad(c, 'Não foi possível processar o áudio. Verifique se a URL está acessível.');
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
      const storageId = `transcription:${result.id}`;
      const entity = new ChatBoardEntity(c.env, storageId);
      await entity.save({
        id: result.id,
        title: `MText - Transcrição Clínica - ${new Date().toLocaleDateString('pt-BR')}`,
        messages: [{
            id: 'meta',
            chatId: storageId,
            userId: 'system',
            text: JSON.stringify(result),
            ts: Date.now()
        }]
      });
      return ok(c, result);
    } catch (err) {
      console.error('Transcription process failed:', err);
      return bad(c, 'Erro interno ao processar a transcrição. Tente novamente em instantes.');
    }
  });
  app.get('/api/test', (c) => ok(c, { name: 'MText API Active' }));
}