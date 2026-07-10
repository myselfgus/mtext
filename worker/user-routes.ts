import { Hono } from "hono";
import type { Env } from './core-utils';
import { TranscriptionEntity } from "./entities";
import { ok, bad } from './core-utils';
import { TranscriptionResult } from "@shared/types";
// Chave hardcoded a pedido do usuário (verificada em 2026-07-10; a var de ambiente tem precedência).
const DEFAULT_KEY = "sk_c72c19d4e3ba431d529905bc657ae0d7970b03905df1fe85";
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
      // A API não aceita o campo 'url' (400 "Must provide either file or a URL parameter");
      // baixamos o áudio aqui e enviamos como 'file' — funciona para qualquer URL acessível,
      // inclusive as que a ElevenLabs não consegue baixar via cloud_storage_url.
      const audioRes = await fetch(url);
      if (!audioRes.ok) {
        return bad(c, `Não foi possível baixar o áudio da URL informada (HTTP ${audioRes.status}).`);
      }
      const audioBlob = await audioRes.blob();
      const filename = decodeURIComponent(new URL(url).pathname.split('/').pop() || 'audio.m4a');
      const formData = new FormData();
      formData.append('file', audioBlob, filename);
      // Configuração clínica validada (Scribe v2, pt-BR, diarização + speaker library,
      // eventos de áudio, verbatim preservado, timestamps por palavra, seed fixa)
      formData.append('model_id', 'scribe_v2');
      formData.append('language_code', 'por');
      formData.append('diarize', 'true');
      formData.append('use_speaker_library', 'true');
      formData.append('tag_audio_events', 'true');
      formData.append('no_verbatim', 'false');
      formData.append('timestamps_granularity', 'word');
      formData.append('seed', '42');
      formData.append('additional_formats', '[{"format":"txt"},{"format":"segmented_json"}]');
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
      const additional: { requested_format: string; content: string; is_base64_encoded?: boolean }[] = data.additional_formats || [];
      // Exports podem vir em base64; decodificar como UTF-8 para não corromper acentos
      const decodeContent = (f: { content: string; is_base64_encoded?: boolean }) => {
        if (!f.is_base64_encoded) return f.content;
        const bin = atob(f.content);
        const bytes = new Uint8Array(bin.length);
        for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
        return new TextDecoder().decode(bytes);
      };
      const txtObj = additional.find((f) => f.requested_format === 'txt');
      const txtExport = txtObj ? decodeContent(txtObj) : undefined;
      const segmentedObj = additional.find((f) => f.requested_format === 'segmented_json');
      const segmentedExport = segmentedObj ? decodeContent(segmentedObj) : undefined;
      const resultId = crypto.randomUUID();
      const result: TranscriptionResult = {
        id: resultId,
        url: url,
        text: data.text || '',
        language_code: data.language_code || 'por',
        segmented_json: segmentedExport ? JSON.parse(segmentedExport) : data,
        txt_content: txtExport || data.text || '',
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