# mtext · stt

> ⚠️ **DEPLOY CONGELADO — NUNCA rode `wrangler deploy` neste repo.**
> O worker `stt` em produção está **à frente** deste source (e do GitHub):
> mudanças foram feitas direto em produção e não existem aqui. Um redeploy
> a partir deste código faria **downgrade silencioso** da transcrição
> clínica. Este repositório serve apenas como referência histórica e
> documentação. Correções vão em outros órgãos (hdrive/cleantxt) ou num
> worker novo — nunca aqui.

Órgão de **transcrição** do CloudHealthSphere (CHS/healthOS · VOITHER):
converte os áudios clínicos do bucket `inbox-audio` em texto via
**ElevenLabs Scribe** com diarização. Sistema completo: README do
[`agents-start`](https://github.com/myselfgus/agents-start) (hub).

## Posição no organismo

```mermaid
flowchart LR
    AS[agents-start<br/>superfície] -- ".fetch() service binding<br/>(sem RPC — drift)" --> MT[mtext / stt]
    MT --- R2[("R2 inbox-audio<br/>binding direto")]
    MT -- "RPC addAnnotation<br/>(entrypoint InboxRPC)" --> HD[hdrive]
    MT --> EL[ElevenLabs Scribe]
    R2 -- ".txt novo → queue" --> CT[cleantxt<br/>normalização]
```

## Fluxo de transcrição (worker em produção)

```mermaid
sequenceDiagram
    participant C as Caller (agents-start / UI)
    participant MT as stt worker
    participant R2 as R2 inbox-audio
    participant EL as ElevenLabs
    participant HD as hdrive (InboxRPC)

    C->>MT: POST /api/transcribe {key | url}
    MT->>R2: lê o áudio (get)
    MT->>EL: speech-to-text (Scribe, diarização,<br/>additional_formats: txt/segmented/srt)
    EL-->>MT: transcript completo
    MT->>R2: grava no MESMO diretório do áudio:<br/>base.txt · base.segmented.json · base.transcript.json
    MT->>HD: addAnnotation(kind=transcription)
    MT-->>C: JSON com keys gravadas
    Note over R2: o base.txt novo dispara o cleantxt<br/>(R2 event notification → queue)
```

- **Layout do bucket é contrato**: `Paciente/Cx - DDMMAA/arquivo` — os
  outputs vão sempre ao lado do áudio de origem. Todo o resto do sistema
  (hdrive, cleantxt, explorer do agents-start) depende disso.
- `transcript.json` guarda o retorno bruto do ElevenLabs
  (`additional_formats` incluído) — foi ele que permitiu restaurar arquivos
  corrompidos num incidente do pipeline; **nunca apagar**.
- O frontend React deste template não é usado em produção; a interface real
  é o agents-start/hdrive.

## Operação

```bash
npx wrangler tail stt     # observar — o ÚNICO comando seguro
# npx wrangler deploy     # ❌ PROIBIDO (ver aviso no topo)
```

Evoluções de transcrição devem nascer fora deste worker (novo órgão ou
extensão do hdrive), consumindo o mesmo bucket e o mesmo InboxRPC.
