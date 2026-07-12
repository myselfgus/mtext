# mtext · stt

> ⚠️ **DEPLOY CONGELADO.** O worker `stt` em produção está à frente deste
> source e do GitHub — alterações foram aplicadas diretamente em produção e
> não existem neste repositório. `wrangler deploy` a partir daqui faria
> downgrade silencioso. Este repositório é referência histórica e
> documentação do comportamento em produção. Alterações de transcrição
> devem ser feitas em outro worker.

Worker de transcrição de áudio: converte os áudios do bucket R2
`inbox-audio` em texto via ElevenLabs Scribe (com diarização) e grava os
resultados ao lado do arquivo de origem.

## Posição no sistema

```mermaid
flowchart LR
    AS[agents-start] -- "service binding fetch()<br/>(sem RPC tipado)" --> MT[stt]
    MT --- R2[("R2 inbox-audio<br/>binding direto")]
    MT -- "RPC addAnnotation (InboxRPC)" --> HD[inbox-audio-api]
    MT --> EL[ElevenLabs Scribe]
    R2 -- ".txt novo → queue" --> CT[cleantxt]
```

## Fluxo (worker em produção)

```mermaid
sequenceDiagram
    participant C as Caller (agents-start)
    participant MT as stt
    participant R2 as R2 inbox-audio
    participant EL as ElevenLabs
    participant HD as inbox-audio-api

    C->>MT: POST /api/transcribe {key | url}
    MT->>R2: get áudio
    MT->>EL: speech-to-text (diarização,<br/>additional_formats: txt/segmented/srt)
    EL-->>MT: transcript
    MT->>R2: grava no diretório do áudio:<br/>base.txt · base.segmented.json · base.transcript.json
    MT->>HD: addAnnotation(kind=transcription)
    MT-->>C: JSON com keys gravadas
    Note over R2: base.txt dispara o cleantxt<br/>(R2 event notification → queue)
```

Notas:

- Layout do bucket é contrato (`Paciente/Cx - DDMMAA/arquivo`); os outputs
  ficam sempre no mesmo diretório do áudio de origem.
- `*.transcript.json` contém o retorno bruto do ElevenLabs, incluindo
  `additional_formats`. Serve de fonte de recuperação (já usado para
  restaurar arquivos corrompidos por pipeline downstream). Não remover.
- O frontend React presente neste template não é usado em produção.

## Operação

```bash
npx wrangler tail stt    # observação; único comando seguro neste repo
# npx wrangler deploy    # NÃO EXECUTAR — ver aviso no topo
```
