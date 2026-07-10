import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  FileAudio,
  Send,
  Loader2,
  CheckCircle2,
  FileText,
  Code,
  Download,
  Copy,
  RefreshCcw,
  AlertCircle,
  Activity
} from 'lucide-react';
import { ThemeToggle } from '@/components/ThemeToggle';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Toaster, toast } from 'sonner';
import { useTranscriptionStore } from '@/store/transcription';
import { api } from '@/lib/api-client';
import { TranscriptionResult } from '@shared/types';
import { cn } from '@/lib/utils';
const steps = [
  { id: 'submitting', label: 'Enviando URL', icon: Send },
  { id: 'transcribing', label: 'Transcrevendo', icon: FileAudio },
  { id: 'saving', label: 'Armazenando', icon: CheckCircle2 },
  { id: 'complete', label: 'Finalizado', icon: FileText },
] as const;
export function HomePage() {
  const status = useTranscriptionStore((s) => s.status);
  const result = useTranscriptionStore((s) => s.result);
  const error = useTranscriptionStore((s) => s.error);
  const setStatus = useTranscriptionStore((s) => s.setStatus);
  const setUrl = useTranscriptionStore((s) => s.setUrl);
  const setResult = useTranscriptionStore((s) => s.setResult);
  const setError = useTranscriptionStore((s) => s.setError);
  const reset = useTranscriptionStore((s) => s.reset);
  const [inputUrl, setInputUrl] = useState('');
  const isIdle = ['idle', 'complete', 'error'].includes(status);
  const handleTranscribe = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputUrl.trim() || !inputUrl.startsWith('http')) {
      toast.error('Por favor, insira uma URL válida.');
      return;
    }
    reset();
    setUrl(inputUrl);
    setStatus('submitting');
    try {
      setTimeout(() => setStatus('transcribing'), 1200);
      const response = await api<TranscriptionResult>('/api/transcribe', {
        method: 'POST',
        body: JSON.stringify({ url: inputUrl }),
      });
      setStatus('saving');
      setTimeout(() => {
        setResult(response);
        setStatus('complete');
        toast.success('Transcrição MText finalizada!');
      }, 800);
    } catch (err: any) {
      setError(err.message || 'Erro ao processar áudio');
      setStatus('error');
      toast.error('Falha na operação');
    }
  };
  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    toast.success('Copiado para a área de transferência');
  };
  const downloadFile = (content: string, filename: string, type: string) => {
    const blob = new Blob([content], { type });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  };
  const getProgressValue = () => {
    switch (status) {
      case 'submitting': return 25;
      case 'transcribing': return 50;
      case 'saving': return 75;
      case 'complete': return 100;
      default: return 0;
    }
  };
  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
      <div className="py-8 md:py-10 lg:py-12 min-h-screen space-y-12">
        <ThemeToggle className="fixed top-6 right-6" />
        {/* Hero Section */}
        <header className="text-center space-y-4 max-w-3xl mx-auto pt-8">
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            className="inline-flex items-center gap-2 p-1 px-4 rounded-full bg-sky-50 dark:bg-sky-950 text-sky-600 dark:text-sky-400 text-xs font-semibold mb-2 border border-sky-100 dark:border-sky-900"
          >
            <Activity className="w-3 h-3" />
            MText Clinical Intelligence
          </motion.div>
          <motion.h1
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="text-5xl md:text-6xl lg:text-7xl font-display font-bold tracking-tight text-foreground"
          >
            M<span className="text-sky-500">Text</span>
          </motion.h1>
          <motion.p
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="text-lg md:text-xl text-muted-foreground font-medium"
          >
            Transcrição clínica de alta precisão para consultas médicas.
          </motion.p>
        </header>
        {/* Input Card */}
        <section className="max-w-3xl mx-auto">
          <Card className="border shadow-soft overflow-hidden p-1 bg-card/50 backdrop-blur-sm">
            <CardContent className="p-0">
              <form onSubmit={handleTranscribe} className="flex flex-col sm:flex-row gap-2">
                <Input
                  placeholder="URL do arquivo de áudio (.mp3, .wav, .m4a)..."
                  className="h-14 border-none bg-transparent focus-visible:ring-0 text-base"
                  value={inputUrl}
                  onChange={(e) => setInputUrl(e.target.value)}
                  disabled={!isIdle}
                />
                <Button
                  type="submit"
                  size="lg"
                  className="bg-sky-600 hover:bg-sky-700 text-white h-14 px-10 transition-all font-semibold rounded-lg shadow-primary"
                  disabled={!isIdle}
                >
                  {!isIdle ? (
                    <Loader2 className="w-5 h-5 animate-spin" />
                  ) : (
                    <>
                      <Send className="w-4 h-4 mr-2" /> Transcrever
                    </>
                  )}
                </Button>
              </form>
            </CardContent>
          </Card>
        </section>
        {/* Progress Tracker */}
        <AnimatePresence mode="wait">
          {!isIdle && status !== 'error' && (
            <motion.section
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="max-w-3xl mx-auto space-y-8"
            >
              <div className="space-y-3">
                <div className="flex justify-between text-xs font-bold tracking-widest uppercase text-muted-foreground">
                  <span>Status do Processamento</span>
                  <span className="text-sky-600">{getProgressValue()}%</span>
                </div>
                <Progress value={getProgressValue()} className="h-2.5 bg-secondary" />
              </div>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                {steps.map((step) => {
                  const Icon = step.icon;
                  const isActive = status === step.id;
                  const isPast = getProgressValue() > (steps.indexOf(step as any) * 25 + 25) || status === 'complete';
                  return (
                    <div
                      key={step.id}
                      className={cn(
                        "flex flex-col items-center gap-3 p-5 rounded-2xl border transition-all duration-300",
                        isActive ? "bg-sky-50/50 dark:bg-sky-950/30 border-sky-200 dark:border-sky-800 shadow-sm" : "bg-transparent border-transparent",
                        isActive && "animate-pulse"
                      )}
                    >
                      <div className={cn(
                        "p-3 rounded-xl transition-colors",
                        isPast ? "bg-green-100 text-green-600 dark:bg-green-900/30 dark:text-green-400" : 
                        isActive ? "bg-sky-100 text-sky-600 dark:bg-sky-900/40 dark:text-sky-300" : 
                        "bg-secondary text-muted-foreground"
                      )}>
                        {isActive && !isPast ? <Loader2 className="w-5 h-5 animate-spin" /> : <Icon className="w-5 h-5" />}
                      </div>
                      <span className={cn(
                        "text-[10px] font-bold uppercase tracking-wider text-center",
                        isActive ? "text-sky-600 dark:text-sky-400" : "text-muted-foreground"
                      )}>
                        {step.label}
                      </span>
                    </div>
                  );
                })}
              </div>
            </motion.section>
          )}
        </AnimatePresence>
        {/* Error Notification */}
        {status === 'error' && (
          <section className="max-w-3xl mx-auto">
            <div className="p-5 rounded-2xl bg-destructive/5 border border-destructive/20 flex items-center gap-4 text-destructive shadow-sm">
              <div className="p-2 bg-destructive/10 rounded-full">
                <AlertCircle className="w-5 h-5" />
              </div>
              <div className="flex-1">
                <p className="text-sm font-bold">Ocorreu um problema</p>
                <p className="text-xs opacity-80">{error || 'Falha desconhecida no servidor.'}</p>
              </div>
              <Button variant="outline" size="sm" onClick={reset} className="border-destructive/20 text-destructive hover:bg-destructive/10">
                Reiniciar
              </Button>
            </div>
          </section>
        )}
        {/* Results Panel */}
        <AnimatePresence>
          {status === 'complete' && result && (
            <motion.section
              initial={{ opacity: 0, y: 30 }}
              animate={{ opacity: 1, y: 0 }}
              className="space-y-8"
            >
              <div className="flex items-center justify-between border-b pb-4">
                <div>
                  <h2 className="text-2xl font-bold tracking-tight">Resultado da Análise</h2>
                  <p className="text-sm text-muted-foreground">Documento clínico gerado pelo motor MText.</p>
                </div>
                <Button variant="outline" size="sm" onClick={reset} className="rounded-full h-9 px-5 shadow-sm">
                  <RefreshCcw className="w-4 h-4 mr-2" /> Nova Transcrição
                </Button>
              </div>
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                {/* Transcript Body */}
                <Card className="lg:col-span-2 border shadow-soft flex flex-col bg-card/40">
                  <CardHeader className="flex flex-row items-center justify-between border-b bg-muted/30 px-6 py-4">
                    <div>
                      <CardTitle className="text-base">Transcrição Médica</CardTitle>
                    </div>
                    <div className="flex gap-1">
                      <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => copyToClipboard(result.text)}>
                        <Copy className="w-4 h-4" />
                      </Button>
                      <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => downloadFile(result.text, 'mtext_transcricao.txt', 'text/plain')}>
                        <Download className="w-4 h-4" />
                      </Button>
                    </div>
                  </CardHeader>
                  <CardContent className="p-0 flex-1 overflow-hidden">
                    <div className="p-8 max-h-[600px] overflow-y-auto text-sm leading-relaxed whitespace-pre-wrap font-sans text-foreground/90">
                      {result.text || "O áudio processado não conteve falas detectáveis."}
                    </div>
                  </CardContent>
                </Card>
                {/* Metadata Column */}
                <div className="space-y-6">
                  <Card className="border shadow-soft bg-sky-600 text-white overflow-hidden">
                    <CardHeader className="pb-4 pt-6">
                      <CardTitle className="text-sm font-bold uppercase tracking-widest opacity-90">Resumo da Consulta</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-5">
                      <div className="grid grid-cols-2 gap-3">
                        <div className="p-4 bg-white/10 rounded-2xl border border-white/10 backdrop-blur-sm">
                          <p className="text-[10px] font-bold uppercase opacity-60 mb-1">Idioma</p>
                          <p className="font-bold text-lg leading-none uppercase">{result.language_code}</p>
                        </div>
                        <div className="p-4 bg-white/10 rounded-2xl border border-white/10 backdrop-blur-sm">
                          <p className="text-[10px] font-bold uppercase opacity-60 mb-1">Status</p>
                          <p className="font-bold text-lg leading-none">V2 OK</p>
                        </div>
                      </div>
                      <div className="p-4 bg-black/10 rounded-2xl text-[11px] leading-relaxed italic border border-white/5">
                        "Documento médico proprietário processado via MText Clinical Intelligence em {new Date(result.timestamp).toLocaleString('pt-BR')}."
                      </div>
                    </CardContent>
                  </Card>
                  <Card className="border shadow-sm bg-card/40">
                    <CardHeader className="pb-3 border-b px-5 py-3">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <Code className="w-3.5 h-3.5 text-sky-600" />
                          <CardTitle className="text-[11px] font-bold uppercase tracking-wider">Artefato JSON</CardTitle>
                        </div>
                        <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => downloadFile(JSON.stringify(result.segmented_json, null, 2), 'mtext_data.json', 'application/json')}>
                          <Download className="w-3.5 h-3.5" />
                        </Button>
                      </div>
                    </CardHeader>
                    <CardContent className="p-5">
                      <div className="bg-secondary/40 rounded-xl p-4 h-40 overflow-hidden relative border border-muted/50">
                        <pre className="text-[10px] text-muted-foreground/80 font-mono">
                          {JSON.stringify(result.segmented_json, null, 2).substring(0, 400)}...
                        </pre>
                        <div className="absolute inset-0 bg-gradient-to-t from-card/80 to-transparent pointer-events-none" />
                      </div>
                      <p className="text-[9px] mt-3 text-muted-foreground text-center font-medium italic">Timestamps, diarização e tags inclusos no payload.</p>
                    </CardContent>
                  </Card>
                </div>
              </div>
            </motion.section>
          )}
        </AnimatePresence>
      </div>
      <footer className="py-12 text-center border-t border-border/50 text-xs font-medium text-muted-foreground">
        <div className="flex flex-col items-center gap-2">
          <p className="tracking-widest uppercase">MText • Clinical Intelligence</p>
          <p>© {new Date().getFullYear()} MText. Todos os direitos reservados.</p>
        </div>
      </footer>
      <Toaster position="bottom-right" theme="light" />
    </div>
  );
}