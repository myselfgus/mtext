/**
 * inbox-audio-stt — Transcrição de consultas médicas com ElevenLabs Scribe v2.
 *
 * Fluxo de serviço:
 *   frontend (servido por este worker) → POST /api/transcribe { source }
 *     → resolve a origem (key do bucket `inbox-audio`, URL do worker
 *       inbox-audio-api `/objects/<key>` ou URL pública)
 *     → lê o áudio (binding R2 direto; sem cópia intermediária)
 *     → envia à ElevenLabs (config clínica validada, ver STT_FIELDS)
 *     → salva `<base>.txt`, `<base>.segmented.json` e `<base>.transcript.json`
 *       no MESMO diretório do áudio no bucket
 *     → registra anotação `transcription` no catálogo D1 via RPC do
 *       worker inbox-audio-api (service binding INBOX_API)
 *   O progresso é transmitido em tempo real por SSE e persistido em
 *   `.stt/jobs/<id>.json` no bucket (o frontend também pode fazer polling).
 *
 * Modo alternativo por webhook (assíncrono): POST /api/transcribe com
 * { mode: "webhook" } envia `webhook=true` à ElevenLabs; o resultado chega em
 * POST /api/webhook/elevenlabs (assinatura HMAC validada quando
 * ELEVENLABS_WEBHOOK_SECRET estiver configurado) e é salvo no mesmo lugar.
 */

export interface Env {
  INBOX: R2Bucket;
  INBOX_API?: {
    addAnnotation(objectKey: string, content: string, kind: string, author: string): Promise<{ id: number }>;
  };
  ELEVENLABS_API_KEY: string;
  STT_APP_KEY: string;
  ELEVENLABS_WEBHOOK_SECRET?: string;
}

const ELEVEN_STT_URL = 'https://api.elevenlabs.io/v1/speech-to-text';

/** Configuração clínica validada (ver skill speech-to-text). */
const STT_FIELDS: Record<string, string> = {
  model_id: 'scribe_v2',
  language_code: 'por',
  diarize: 'true',                 // separa falantes
  use_speaker_library: 'true',     // casa vozes com perfis registrados no workspace
  tag_audio_events: 'true',        // mantém (risos), (choro), etc.
  no_verbatim: 'false',            // mantém hesitações/falsos inícios (clinicamente relevantes)
  timestamps_granularity: 'word',
  seed: '42',                      // reprodutibilidade/auditabilidade
  additional_formats: '[{"format":"txt"},{"format":"segmented_json"}]',
};

const AUDIO_EXTS = ['m4a', 'mp3', 'wav', 'ogg', 'webm', 'flac', 'aac', 'mp4', 'opus', 'aiff', 'mov'];

const JOBS_PREFIX = '.stt/jobs/';
const PENDING_PREFIX = '.stt/pending/';

type JobStep = { t: number; step: string; detail?: string };
type Job = {
  id: string;
  source: string;
  audioKey: string | null;
  status: 'running' | 'awaiting_webhook' | 'done' | 'error';
  steps: JobStep[];
  outputs: { key: string; size: number; label: string }[];
  error?: string;
  transcriptionId?: string;
  createdAt: number;
  finishedAt?: number;
};

const json = (data: unknown, status = 200, extra: Record<string, string> = {}) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', ...extra },
  });

const err = (message: string, status = 400) => json({ success: false, error: message }, status);

function authorized(req: Request, env: Env, url: URL): boolean {
  const auth = req.headers.get('authorization') ?? '';
  const bearer = auth.startsWith('Bearer ') ? auth.slice(7) : '';
  const token = bearer || url.searchParams.get('token') || '';
  return token.length > 0 && token === env.STT_APP_KEY;
}

/** Aceita: key do bucket, URL do inbox-audio-api (/objects/<key>) ou URL pública. */
function resolveSource(source: string): { kind: 'r2'; key: string } | { kind: 'url'; url: string } {
  const s = source.trim();
  if (/^https?:\/\//i.test(s)) {
    const u = new URL(s);
    const idx = u.pathname.indexOf('/objects/');
    if (idx !== -1) {
      const key = decodeURIComponent(u.pathname.slice(idx + '/objects/'.length));
      if (key) return { kind: 'r2', key };
    }
    return { kind: 'url', url: s };
  }
  return { kind: 'r2', key: s.replace(/^\/+/, '') };
}

function splitKey(key: string): { dir: string; base: string; ext: string } {
  const slash = key.lastIndexOf('/');
  const dir = slash === -1 ? '' : key.slice(0, slash + 1);
  const file = slash === -1 ? key : key.slice(slash + 1);
  const dot = file.lastIndexOf('.');
  return { dir, base: dot === -1 ? file : file.slice(0, dot), ext: dot === -1 ? '' : file.slice(dot + 1) };
}

const jobKey = (id: string) => `${JOBS_PREFIX}${id}.json`;

async function saveJob(env: Env, job: Job): Promise<void> {
  await env.INBOX.put(jobKey(job.id), JSON.stringify(job, null, 2), {
    httpMetadata: { contentType: 'application/json' },
  });
}

async function loadJob(env: Env, id: string): Promise<Job | null> {
  const obj = await env.INBOX.get(jobKey(id));
  return obj ? ((await obj.json()) as Job) : null;
}

/** Salva os 3 artefatos de transcrição no mesmo diretório do áudio. */
async function saveOutputs(
  env: Env,
  job: Job,
  data: Record<string, unknown>,
  emit: (step: string, detail?: string) => Promise<void>,
): Promise<void> {
  const outDirBase = job.audioKey
    ? (() => {
        const { dir, base } = splitKey(job.audioKey!);
        return dir + base;
      })()
    : `external/${job.id}/transcricao`;

  const meta = { source: job.audioKey ?? job.source, stt_job: job.id };
  const puts: { key: string; body: string; type: string; label: string }[] = [
    {
      key: `${outDirBase}.transcript.json`,
      body: JSON.stringify(data, null, 2),
      type: 'application/json',
      label: 'Resposta completa (palavras, falantes, timestamps)',
    },
  ];
  const additional = (data.additional_formats ?? []) as {
    requested_format: string;
    content: string;
    is_base64_encoded?: boolean;
  }[];
  for (const f of additional) {
    const content = f.is_base64_encoded ? atob(f.content) : f.content;
    if (f.requested_format === 'txt') {
      puts.push({ key: `${outDirBase}.txt`, body: content, type: 'text/plain; charset=utf-8', label: 'Texto puro' });
    } else if (f.requested_format === 'segmented_json') {
      puts.push({
        key: `${outDirBase}.segmented.json`,
        body: content,
        type: 'application/json',
        label: 'Segmentos por falante',
      });
    }
  }

  for (const p of puts) {
    await emit('saving', p.key);
    const put = await env.INBOX.put(p.key, p.body, {
      httpMetadata: { contentType: p.type },
      customMetadata: meta,
    });
    job.outputs.push({ key: p.key, size: put.size, label: p.label });
    await emit('saved', `${p.key} (${put.size} bytes)`);
  }

  // Conecta ao catálogo do inbox-audio-api (D1) — transcrição vira anotação pesquisável.
  if (env.INBOX_API && job.audioKey && typeof data.text === 'string') {
    try {
      await emit('annotating', job.audioKey);
      const text = (data.text as string).slice(0, 100_000);
      await env.INBOX_API.addAnnotation(job.audioKey, text, 'transcription', 'inbox-audio-stt');
      await emit('annotated', 'anotação registrada no catálogo D1');
    } catch (e) {
      await emit('annotate_failed', String(e));
    }
  }

  if (typeof data.transcription_id === 'string') job.transcriptionId = data.transcription_id;
}

async function runTranscription(
  env: Env,
  job: Job,
  mode: 'sync' | 'webhook',
  emitRaw: (event: Record<string, unknown>) => Promise<void>,
): Promise<void> {
  const emit = async (step: string, detail?: string) => {
    job.steps.push({ t: Date.now(), step, detail });
    await saveJob(env, job);
    await emitRaw({ type: 'step', step, detail, job });
  };

  try {
    const resolved = resolveSource(job.source);
    let blob: Blob;
    let filename: string;

    if (resolved.kind === 'r2') {
      job.audioKey = resolved.key;
      await emit('resolve', `bucket inbox-audio → ${resolved.key}`);
      const obj = await env.INBOX.get(resolved.key);
      if (!obj) throw new Error(`Áudio não encontrado no bucket: ${resolved.key}`);
      await emit('download', `lendo ${obj.size} bytes do R2`);
      blob = await obj.blob();
      filename = splitKey(resolved.key).base + '.' + (splitKey(resolved.key).ext || 'm4a');
    } else {
      await emit('resolve', `URL externa → ${resolved.url}`);
      // Alguns hosts (ex.: Wikimedia) rejeitam requisições sem User-Agent
      const res = await fetch(resolved.url, { headers: { 'user-agent': 'inbox-audio-stt/1.0 (Cloudflare Worker)' } });
      if (!res.ok) throw new Error(`Falha ao baixar o áudio (HTTP ${res.status})`);
      blob = await res.blob();
      const path = new URL(resolved.url).pathname;
      filename = decodeURIComponent(path.slice(path.lastIndexOf('/') + 1)) || 'audio';
      await emit('download', `baixados ${blob.size} bytes`);
    }

    const form = new FormData();
    form.append('file', blob, filename);
    for (const [k, v] of Object.entries(STT_FIELDS)) form.append(k, v);
    if (mode === 'webhook') form.append('webhook', 'true');

    await emit('elevenlabs', `enviando ${blob.size} bytes para Scribe v2 (diarização + timestamps)`);
    const res = await fetch(ELEVEN_STT_URL, {
      method: 'POST',
      headers: { 'xi-api-key': env.ELEVENLABS_API_KEY },
      body: form,
    });
    if (!res.ok) {
      const detail = await res.text();
      throw new Error(`ElevenLabs HTTP ${res.status}: ${detail.slice(0, 400)}`);
    }
    const data = (await res.json()) as Record<string, unknown>;

    if (mode === 'webhook') {
      const requestId =
        (data.request_id as string) || (data.transcription_id as string) || res.headers.get('request-id') || job.id;
      await env.INBOX.put(
        `${PENDING_PREFIX}${requestId}.json`,
        JSON.stringify({ jobId: job.id, audioKey: job.audioKey, source: job.source }),
        { httpMetadata: { contentType: 'application/json' } },
      );
      job.status = 'awaiting_webhook';
      await emit('webhook_pending', `aguardando webhook da ElevenLabs (request ${requestId})`);
      await emitRaw({ type: 'awaiting_webhook', job });
      return;
    }

    await emit('transcribed', `idioma ${data.language_code} · ${(data.text as string | undefined)?.length ?? 0} caracteres`);
    await saveOutputs(env, job, data, emit);

    job.status = 'done';
    job.finishedAt = Date.now();
    await saveJob(env, job);
    await emitRaw({ type: 'done', job });
  } catch (e) {
    job.status = 'error';
    job.error = e instanceof Error ? e.message : String(e);
    job.finishedAt = Date.now();
    await saveJob(env, job);
    await emitRaw({ type: 'error', error: job.error, job });
  }
}

/** Valida a assinatura HMAC do webhook da ElevenLabs (formato: t=...,v0=hex). */
async function validWebhookSignature(env: Env, req: Request, body: string): Promise<boolean> {
  const secret = env.ELEVENLABS_WEBHOOK_SECRET;
  if (!secret) return true; // sem secret configurado, aceita (ambiente de teste)
  const sig = req.headers.get('elevenlabs-signature') ?? '';
  const parts = Object.fromEntries(sig.split(',').map((p) => p.split('=') as [string, string]));
  if (!parts.t || !parts.v0) return false;
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const mac = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(`${parts.t}.${body}`));
  const hex = [...new Uint8Array(mac)].map((b) => b.toString(16).padStart(2, '0')).join('');
  return hex === parts.v0.replace(/^v0=/, '');
}

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);
    const path = url.pathname;

    if (path === '/' && request.method === 'GET') {
      return new Response(FRONTEND_HTML, { headers: { 'content-type': 'text/html; charset=utf-8' } });
    }
    if (path === '/api/health') {
      return json({ ok: true, service: 'inbox-audio-stt', engine: 'ElevenLabs Scribe v2' });
    }

    // Webhook da ElevenLabs (autenticado por HMAC, não pelo app key)
    if (path === '/api/webhook/elevenlabs' && request.method === 'POST') {
      const body = await request.text();
      if (!(await validWebhookSignature(env, request, body))) return err('assinatura inválida', 401);
      const payload = JSON.parse(body) as { type?: string; data?: Record<string, unknown> };
      const data = (payload.data ?? payload) as Record<string, unknown>;
      const requestId = (data.request_id as string) || (data.transcription_id as string) || '';
      if (!requestId) return err('payload sem request_id/transcription_id', 400);
      const pendingObj = await env.INBOX.get(`${PENDING_PREFIX}${requestId}.json`);
      if (!pendingObj) return json({ ok: true, note: 'nenhum job pendente para este request' });
      const pending = (await pendingObj.json()) as { jobId: string };
      const job = (await loadJob(env, pending.jobId))!;
      const transcription = (data.transcription ?? data) as Record<string, unknown>;
      const emit = async (step: string, detail?: string) => {
        job.steps.push({ t: Date.now(), step, detail });
        await saveJob(env, job);
      };
      await emit('webhook_received', `webhook ElevenLabs (request ${requestId})`);
      await saveOutputs(env, job, transcription, emit);
      job.status = 'done';
      job.finishedAt = Date.now();
      await saveJob(env, job);
      await env.INBOX.delete(`${PENDING_PREFIX}${requestId}.json`);
      return json({ ok: true, jobId: job.id });
    }

    if (path.startsWith('/api/')) {
      if (!authorized(request, env, url)) {
        return err('não autorizado: envie Authorization: Bearer <chave> (ou ?token=)', 401);
      }
    } else {
      return err('não encontrado', 404);
    }

    // Navegação do bucket (estilo pastas) para escolher o áudio
    if (path === '/api/browse' && request.method === 'GET') {
      const prefix = url.searchParams.get('prefix') ?? '';
      const listed = await env.INBOX.list({ prefix, delimiter: '/', limit: 500, include: ['httpMetadata'] });
      return json({
        prefix,
        folders: listed.delimitedPrefixes.filter((p) => !p.startsWith('.stt/')),
        files: listed.objects
          .filter((o) => !o.key.startsWith('.stt/'))
          .map((o) => ({
            key: o.key,
            size: o.size,
            uploaded: o.uploaded,
            isAudio: AUDIO_EXTS.includes(splitKey(o.key).ext.toLowerCase()),
          })),
      });
    }

    // Upload direto de áudio para o bucket (ex.: curl -T arquivo '/api/object?key=Paciente/C1/x.m4a')
    if (path === '/api/object' && request.method === 'PUT') {
      const key = url.searchParams.get('key');
      if (!key || key.startsWith('.stt/')) return err('faltou ?key= (ou key reservada)');
      const put = await env.INBOX.put(key, request.body, {
        httpMetadata: { contentType: request.headers.get('content-type') ?? 'application/octet-stream' },
      });
      return json({ uploaded: { key, size: put.size } }, 201);
    }

    // Proxy de leitura do bucket (áudio/transcrições) para o frontend
    if (path === '/api/object' && request.method === 'GET') {
      const key = url.searchParams.get('key');
      if (!key) return err('faltou ?key=');
      const obj = await env.INBOX.get(key);
      if (!obj) return err(`não encontrado: ${key}`, 404);
      const headers = new Headers();
      obj.writeHttpMetadata(headers);
      headers.set('content-length', String(obj.size));
      headers.set('cache-control', 'no-store');
      return new Response(obj.body, { headers });
    }

    if (path === '/api/jobs' && request.method === 'GET') {
      const listed = await env.INBOX.list({ prefix: JOBS_PREFIX, limit: 1000 });
      const keys = listed.objects.map((o) => o.key).sort().reverse().slice(0, 25);
      const jobs = (await Promise.all(
        keys.map(async (k) => {
          const o = await env.INBOX.get(k);
          return o ? ((await o.json()) as Job) : null;
        }),
      )).filter(Boolean);
      return json({ jobs });
    }

    const jobMatch = path.match(/^\/api\/jobs\/([\w-]+)$/);
    if (jobMatch && request.method === 'GET') {
      const job = await loadJob(env, jobMatch[1]);
      return job ? json({ job }) : err('job não encontrado', 404);
    }

    // Dispara a transcrição; resposta é um stream SSE com o progresso real.
    if (path === '/api/transcribe' && request.method === 'POST') {
      const body = (await request.json().catch(() => null)) as { source?: string; mode?: string } | null;
      if (!body?.source) return err('body deve ser {"source": "<key do bucket ou URL de áudio>"}');
      const mode: 'sync' | 'webhook' = body.mode === 'webhook' ? 'webhook' : 'sync';

      const job: Job = {
        id: `${Date.now()}-${crypto.randomUUID().slice(0, 8)}`,
        source: body.source,
        audioKey: null,
        status: 'running',
        steps: [],
        outputs: [],
        createdAt: Date.now(),
      };
      await saveJob(env, job);

      const { readable, writable } = new TransformStream();
      const writer = writable.getWriter();
      const encoder = new TextEncoder();
      const send = async (event: Record<string, unknown>) => {
        try {
          await writer.write(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
        } catch {
          /* cliente desconectou — o job continua e fica consultável em /api/jobs/:id */
        }
      };
      const ping = setInterval(() => {
        writer.write(encoder.encode(`: ping\n\n`)).catch(() => clearInterval(ping));
      }, 10_000);

      ctx.waitUntil(
        (async () => {
          await send({ type: 'created', job });
          await runTranscription(env, job, mode, send);
          clearInterval(ping);
          await writer.close().catch(() => {});
        })(),
      );

      return new Response(readable, {
        headers: {
          'content-type': 'text/event-stream; charset=utf-8',
          'cache-control': 'no-store',
          'x-job-id': job.id,
        },
      });
    }

    return err('não encontrado', 404);
  },
} satisfies ExportedHandler<Env>;

// ---------------------------------------------------------------------------
// Frontend
// ---------------------------------------------------------------------------

const FRONTEND_HTML = `<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>MText · Transcrição Clínica</title>
<style>
  :root { --bg:#0e1116; --panel:#161b23; --line:#252d39; --txt:#dbe3ee; --dim:#8494ab;
          --acc:#4da3ff; --ok:#3ecf8e; --err:#ff6b6b; --warn:#ffc76b; }
  * { box-sizing:border-box; }
  body { margin:0; background:var(--bg); color:var(--txt);
         font:15px/1.5 system-ui,-apple-system,'Segoe UI',sans-serif; }
  header { padding:18px 26px; border-bottom:1px solid var(--line);
           display:flex; align-items:center; gap:14px; flex-wrap:wrap; }
  header h1 { font-size:17px; margin:0; font-weight:600; }
  header .sub { color:var(--dim); font-size:13px; }
  header input { margin-left:auto; }
  main { display:grid; grid-template-columns:minmax(300px,420px) 1fr; gap:20px;
         padding:20px 26px; max-width:1280px; margin:0 auto; }
  @media (max-width:900px){ main { grid-template-columns:1fr; } }
  .panel { background:var(--panel); border:1px solid var(--line); border-radius:12px; padding:16px; }
  .panel h2 { font-size:13px; text-transform:uppercase; letter-spacing:.08em;
              color:var(--dim); margin:0 0 12px; }
  input[type=text], input[type=password] { width:100%; background:#0b0e13; color:var(--txt);
    border:1px solid var(--line); border-radius:8px; padding:9px 11px; font-size:14px; }
  header input[type=password]{ width:230px; }
  button { background:var(--acc); border:0; color:#04101f; font-weight:600; font-size:14px;
           border-radius:8px; padding:10px 16px; cursor:pointer; }
  button:disabled { opacity:.5; cursor:default; }
  button.ghost { background:transparent; color:var(--acc); border:1px solid var(--acc); }
  .browser { max-height:340px; overflow:auto; border:1px solid var(--line); border-radius:8px;
             margin-top:10px; font-size:13.5px; }
  .browser .row { padding:7px 10px; border-bottom:1px solid var(--line); cursor:pointer;
                  display:flex; gap:8px; align-items:center; }
  .browser .row:hover { background:#1b2330; }
  .browser .row .size { margin-left:auto; color:var(--dim); font-size:12px; white-space:nowrap; }
  .crumb { font-size:12.5px; color:var(--dim); margin-top:10px; cursor:pointer; }
  .crumb b { color:var(--acc); }
  .steps { list-style:none; margin:0; padding:0; }
  .steps li { display:flex; gap:10px; padding:8px 4px; border-bottom:1px dashed var(--line);
              font-size:14px; align-items:baseline; }
  .steps .icon { width:20px; text-align:center; }
  .steps .detail { color:var(--dim); font-size:12.5px; word-break:break-all; }
  .steps .time { margin-left:auto; color:var(--dim); font-size:11.5px; white-space:nowrap; }
  .status-running { color:var(--warn); } .status-done { color:var(--ok); } .status-error { color:var(--err); }
  .outputs a { color:var(--acc); text-decoration:none; word-break:break-all; }
  .outputs li { padding:6px 0; font-size:13.5px; }
  pre.transcript { background:#0b0e13; border:1px solid var(--line); border-radius:8px;
       padding:12px; white-space:pre-wrap; max-height:320px; overflow:auto; font-size:13px; }
  .muted { color:var(--dim); font-size:13px; }
  .jobrow { padding:7px 10px; border-bottom:1px solid var(--line); cursor:pointer;
            font-size:12.5px; display:flex; gap:8px; }
  .jobrow:hover { background:#1b2330; }
  .pill { border-radius:99px; padding:1px 9px; font-size:11px; border:1px solid var(--line); }
  label.chk { font-size:13px; color:var(--dim); display:flex; gap:6px; align-items:center; margin:10px 0; }
  .actions { display:flex; gap:10px; align-items:center; margin-top:12px; }
  audio { width:100%; margin-top:10px; }
</style>
</head>
<body>
<header>
  <h1>MText · Transcrição Clínica</h1>
  <span class="sub">ElevenLabs Scribe v2 · bucket R2 <b>inbox-audio</b></span>
  <input id="appkey" type="password" placeholder="Chave de acesso" title="Chave de acesso deste serviço (STT_APP_KEY)">
</header>
<main>
  <section>
    <div class="panel">
      <h2>1 · Origem do áudio</h2>
      <input id="source" type="text"
        placeholder="URL do áudio ou key do bucket (ex.: Paciente/C1 - 020426/arquivo.m4a)">
      <label class="chk"><input id="modeWebhook" type="checkbox"> Assíncrono via webhook ElevenLabs</label>
      <div class="actions">
        <button id="go">Transcrever</button>
        <span id="selinfo" class="muted"></span>
      </div>
      <div class="crumb" id="crumb"></div>
      <div class="browser" id="browser"></div>
    </div>
    <div class="panel" style="margin-top:20px">
      <h2>Histórico</h2>
      <div id="jobs" class="muted">—</div>
    </div>
  </section>
  <section>
    <div class="panel">
      <h2>2 · Progresso <span id="jobstatus"></span></h2>
      <ul class="steps" id="steps"><li class="muted">Aguardando envio…</li></ul>
    </div>
    <div class="panel" style="margin-top:20px">
      <h2>3 · Resultado salvo no bucket</h2>
      <ul class="outputs" id="outputs"><li class="muted">—</li></ul>
      <audio id="player" controls style="display:none"></audio>
      <pre class="transcript" id="transcript" style="display:none"></pre>
    </div>
  </section>
</main>
<script>
const $ = (id) => document.getElementById(id);
const keyInput = $('appkey');
keyInput.value = localStorage.getItem('stt_app_key') || '';
keyInput.addEventListener('change', () => { localStorage.setItem('stt_app_key', keyInput.value); loadBrowser(''); loadJobs(); });
const H = () => ({ 'authorization': 'Bearer ' + keyInput.value });
const objUrl = (k) => '/api/object?key=' + encodeURIComponent(k) + '&token=' + encodeURIComponent(keyInput.value);
const fmtSize = (n) => n > 1048576 ? (n/1048576).toFixed(1)+' MB' : n > 1024 ? (n/1024).toFixed(0)+' KB' : n+' B';
const STEP_LABELS = {
  resolve:'Origem resolvida', download:'Áudio carregado', elevenlabs:'Enviado à ElevenLabs (Scribe v2)',
  transcribed:'Transcrição concluída', saving:'Salvando no bucket…', saved:'Salvo no bucket',
  annotating:'Registrando anotação no catálogo…', annotated:'Anotação registrada no catálogo D1',
  annotate_failed:'Anotação falhou (não bloqueante)', webhook_pending:'Aguardando webhook da ElevenLabs',
  webhook_received:'Webhook recebido',
};

let currentPrefix = '';
async function loadBrowser(prefix) {
  currentPrefix = prefix;
  $('crumb').innerHTML = prefix
    ? '⬑ <b>' + prefix + '</b> (clique para voltar à raiz)' : 'Raiz do bucket — clique numa pasta';
  $('crumb').onclick = () => loadBrowser('');
  try {
    const r = await fetch('/api/browse?prefix=' + encodeURIComponent(prefix), { headers: H() });
    if (!r.ok) { $('browser').innerHTML = '<div class="row">' + (r.status === 401 ? 'Informe a chave de acesso acima.' : 'Erro ' + r.status) + '</div>'; return; }
    const d = await r.json();
    let html = '';
    for (const f of d.folders) {
      const name = f.slice(prefix.length).replace(/\\/$/, '');
      html += '<div class="row" data-folder="' + encodeURIComponent(f) + '">📁 ' + name + '</div>';
    }
    for (const o of d.files) {
      const name = o.key.slice(prefix.length);
      html += '<div class="row" data-file="' + encodeURIComponent(o.key) + '">' + (o.isAudio ? '🎙️' : '📄')
            + ' ' + name + '<span class="size">' + fmtSize(o.size) + '</span></div>';
    }
    $('browser').innerHTML = html || '<div class="row">vazio</div>';
    for (const el of $('browser').querySelectorAll('[data-folder]'))
      el.onclick = () => loadBrowser(decodeURIComponent(el.dataset.folder));
    for (const el of $('browser').querySelectorAll('[data-file]'))
      el.onclick = () => {
        const k = decodeURIComponent(el.dataset.file);
        $('source').value = k;
        $('selinfo').textContent = 'selecionado do bucket';
      };
  } catch (e) { $('browser').innerHTML = '<div class="row">' + e + '</div>'; }
}

function renderJob(job) {
  const cls = job.status === 'done' ? 'status-done' : job.status === 'error' ? 'status-error' : 'status-running';
  $('jobstatus').innerHTML = '· <span class="' + cls + '">' + job.status + '</span> <span class="muted">' + job.id + '</span>';
  const t0 = job.createdAt;
  $('steps').innerHTML = job.steps.map(s =>
    '<li><span class="icon">' + (s.step === 'annotate_failed' ? '⚠️' : s.step === 'saving' || s.step === 'annotating' ? '⏳' : '✅')
    + '</span><span>' + (STEP_LABELS[s.step] || s.step)
    + (s.detail ? '<div class="detail">' + s.detail + '</div>' : '') + '</span>'
    + '<span class="time">+' + ((s.t - t0)/1000).toFixed(1) + 's</span></li>'
  ).join('') || '<li class="muted">—</li>';
  if (job.error) $('steps').innerHTML += '<li><span class="icon">❌</span><span class="status-error">' + job.error + '</span></li>';

  if (job.outputs.length) {
    $('outputs').innerHTML = job.outputs.map(o =>
      '<li>✅ <a target="_blank" href="' + objUrl(o.key) + '">' + o.key + '</a>'
      + ' <span class="muted">(' + fmtSize(o.size) + ' · ' + o.label + ')</span></li>').join('');
  } else {
    $('outputs').innerHTML = '<li class="muted">' + (job.status === 'running' ? 'processando…' : '—') + '</li>';
  }
  if (job.audioKey) { $('player').src = objUrl(job.audioKey); $('player').style.display = 'block'; }
  const txt = job.outputs.find(o => o.key.endsWith('.txt'));
  if (txt && job.status === 'done') {
    fetch(objUrl(txt.key)).then(r => r.text()).then(t => {
      $('transcript').textContent = t; $('transcript').style.display = 'block';
    });
  }
}

let pollTimer = null;
function pollJob(id) {
  clearInterval(pollTimer);
  pollTimer = setInterval(async () => {
    const r = await fetch('/api/jobs/' + id, { headers: H() });
    if (!r.ok) return;
    const { job } = await r.json();
    renderJob(job);
    if (job.status === 'done' || job.status === 'error') { clearInterval(pollTimer); loadJobs(); }
  }, 2000);
}

$('go').onclick = async () => {
  const source = $('source').value.trim();
  if (!source) { alert('Informe uma URL de áudio ou uma key do bucket.'); return; }
  $('go').disabled = true;
  $('steps').innerHTML = '<li class="muted">Iniciando…</li>';
  $('outputs').innerHTML = '<li class="muted">—</li>';
  $('transcript').style.display = 'none';
  try {
    const res = await fetch('/api/transcribe', {
      method: 'POST',
      headers: { ...H(), 'content-type': 'application/json' },
      body: JSON.stringify({ source, mode: $('modeWebhook').checked ? 'webhook' : 'sync' }),
    });
    if (!res.ok || !res.body) {
      const e = await res.json().catch(() => ({}));
      throw new Error(e.error || ('HTTP ' + res.status));
    }
    const reader = res.body.getReader();
    const dec = new TextDecoder();
    let buf = '';
    let lastJob = null;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += dec.decode(value, { stream: true });
      let i;
      while ((i = buf.indexOf('\\n\\n')) !== -1) {
        const chunk = buf.slice(0, i); buf = buf.slice(i + 2);
        if (!chunk.startsWith('data: ')) continue;
        const ev = JSON.parse(chunk.slice(6));
        if (ev.job) { lastJob = ev.job; renderJob(ev.job); }
      }
    }
    if (lastJob && lastJob.status === 'awaiting_webhook') pollJob(lastJob.id);
  } catch (e) {
    $('steps').innerHTML += '<li><span class="icon">❌</span><span class="status-error">' + e.message + '</span></li>';
  } finally {
    $('go').disabled = false;
    loadJobs();
  }
};

async function loadJobs() {
  try {
    const r = await fetch('/api/jobs', { headers: H() });
    if (!r.ok) return;
    const { jobs } = await r.json();
    $('jobs').innerHTML = jobs.map(j =>
      '<div class="jobrow" data-id="' + j.id + '"><span class="pill status-'
      + (j.status === 'done' ? 'done' : j.status === 'error' ? 'error' : 'running') + '">' + j.status + '</span>'
      + '<span style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap">'
      + (j.audioKey || j.source) + '</span></div>').join('') || '—';
    for (const el of $('jobs').querySelectorAll('[data-id]'))
      el.onclick = async () => {
        const r2 = await fetch('/api/jobs/' + el.dataset.id, { headers: H() });
        if (r2.ok) renderJob((await r2.json()).job);
      };
  } catch { /* ignore */ }
}

if (keyInput.value) { loadBrowser(''); loadJobs(); }
</script>
</body>
</html>`;
