import { Hono } from "hono";
import type { Env } from './core-utils';
import { ChatBoardEntity } from "./entities";
import { ok, bad, notFound } from './core-utils';
import { TranscriptionResult } from "@shared/types";
// Replace with actual key or ensure it is provided via environment
const ELEVENLABS_API_KEY = "sk_9486c8f42095a0242278e35272a9df273a25c11025531d05"; 
export function userRoutes(app: Hono<{ Bindings: Env }>) {
  app.post('/api/transcribe', async (c) => {
    try {
      const { url } = (await c.req.json()) as { url?: string };
      if (!url || !url.startsWith('http')) {
        return bad(c, 'Uma URL de áudio válida é obrigatória.');
      }
      // 1. Call ElevenLabs Scribe API
      // Note: In a real environment, we'd use a more robust multipart/form-data approach
      // Scribe v1/v2 expects specific parameters for medical clinical audio
      const formData = new FormData();
      formData.append('url', url);
      formData.append('model_id', 'scribe_v1'); // or v2 if available
      formData.append('tag_audio_events', 'true');
      formData.append('language_code', 'pt'); // Portuguese as requested
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
        return bad(c, `Erro na transcrição: ${response.statusText}`);
      }
      const data: any = await response.json();
      // 2. Prepare Result Artifacts
      const result: TranscriptionResult = {
        id: crypto.randomUUID(),
        url: url,
        text: data.text || '',
        language_code: data.language_code || 'pt',
        segmented_json: data,
        txt_content: data.text || '',
        timestamp: Date.now(),
      };
      // 3. Persist via Entity (Simulating R2/DO save)
      // Using ChatBoardEntity as a generic state holder for this demo
      const storageId = `transcription:${result.id}`;
      const entity = new ChatBoardEntity(c.env, storageId);
      await entity.save({
        id: result.id,
        title: `Transcrição - ${new Date().toLocaleDateString()}`,
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
      return bad(c, 'Falha interna ao processar a transcrição.');
    }
  });
  // Keep existing demo routes if needed, but primary focus is the transcribe endpoint
  app.get('/api/test', (c) => ok(c, { name: 'MedScribe API Active' }));
}