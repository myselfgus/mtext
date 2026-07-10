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
  Activity,
  ShieldCheck
} from 'lucide-react';
import { ThemeToggle } from '@/components/ThemeToggle';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Toaster, toast } from 'sonner';
import { useTranscriptionStore } from '@/store/transcription';
import { api } from '@/lib/api-client';
import { TranscriptionResult } from '@shared/types';
import { cn } from '@/lib/utils';
import { AppLayout } from '@/components/layout/AppLayout';
const steps = [
  { id: 'submitting', label: 'Protocolo', icon: Send },
  { id: 'transcribing', label: 'Scribe V2', icon: FileAudio },
  { id: 'saving', label: 'Persistência', icon: ShieldCheck },
  { id: 'complete', label: 'Pronto', icon: FileText },
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
      toast.error('Por favor, insira uma URL de áudio válida.');
      return;
    }
    reset();
    setUrl(inputUrl);
    setStatus('submitting');
    try {
      // Small delay for UI feedback on submission
      await new Promise(resolve => setTimeout(resolve, 800));
      setStatus('transcribing');
      const response = await api<TranscriptionResult>('/api/transcribe', {
        method: 'POST',
        body: JSON.stringify({ url: inputUrl }),
      });
      setStatus('saving');
      await new Promise(resolve => setTimeout(resolve, 600));
      setResult(response);
      setStatus('complete');
      toast.success('Análise clínica concluída.');
    } catch (err: any) {
      setError(err.message || 'Erro ao processar áudio');
      setStatus('error');
      toast.error('Falha na transcrição');
    }
  };
  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    toast.success('Copiado');
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
    <AppLayout>
      <div className="space-y-12">
        <ThemeToggle className="fixed top-6 right-6" />
        {/* Branding Hero */}
        <header className="text-center space-y-4 max-w-3xl mx-auto pt-4">
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            className="inline-flex items-center gap-2 p-1 px-4 rounded-full bg-sky-50 dark:bg-sky-950 text-sky-600 dark:text-sky-400 text-[10px] font-bold uppercase tracking-widest mb-2 border border-sky-100 dark:border-sky-900 shadow-sm"
          >
            <Activity className="w-3 h-3" />
            MText Clinical Intelligence • Scribe V2 Engine
          </motion.div>
          <motion.h1
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="text-6xl md:text-7xl font-display font-bold tracking-tighter text-foreground"
          >
            M<span className="text-sky-500">Text</span>
          </motion.h1>
          <motion.p
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="text-lg md:text-xl text-muted-foreground font-medium text-pretty"
          >
            Transcrição clínica automatizada para telemedicina e consultórios.
          </motion.p>
        </header>
        {/* Action Form */}
        <section className="max-w-3xl mx-auto">
          <Card className="border shadow-soft overflow-hidden p-1 bg-card/50 backdrop-blur-sm transition-all hover:shadow-glow">
            <CardContent className="p-0">
              <form onSubmit={handleTranscribe} className="flex flex-col sm:flex-row gap-2">
                <Input
                  placeholder="URL do arquivo de áudio para processamento..."
                  className="h-14 border-none bg-transparent focus-visible:ring-0 text-base"
                  value={inputUrl}
                  onChange={(e) => setInputUrl(e.target.value)}
                  disabled={!isIdle}
                />
                <Button
                  type="submit"
                  size="lg"
                  className="bg-sky-600 hover:bg-sky-700 text-white h-14 px-10 transition-all font-semibold rounded-lg"
                  disabled={!isIdle}
                >
                  {!isIdle ? (
                    <Loader2 className="w-5 h-5 animate-spin" />
                  ) : (
                    <>
                      <Send className="w-4 h-4 mr-2" /> Analisar
                    </>
                  )}
                </Button>
              </form>
            </CardContent>
          </Card>
        </section>
        {/* Live Stepper */}
        <AnimatePresence mode="wait">
          {!isIdle && status !== 'error' && (
            <motion.section
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="max-w-3xl mx-auto space-y-8"
            >
              <div className="space-y-3">
                <div className="flex justify-between text-[10px] font-bold tracking-widest uppercase text-muted-foreground">
                  <span>Engine Pipeline</span>
                  <span className="text-sky-600">{getProgressValue()}%</span>
                </div>
                <Progress value={getProgressValue()} className="h-1.5 bg-secondary" />
              </div>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                {steps.map((step, idx) => {
                  const Icon = step.icon;
                  const isActive = status === step.id;
                  const isPast = getProgressValue() > (idx * 25 + 25) || status === 'complete';
                  return (
                    <div
                      key={step.id}
                      className={cn(
                        "flex flex-col items-center gap-3 p-5 rounded-2xl border transition-all duration-300",
                        isActive ? "bg-sky-50/50 dark:bg-sky-950/30 border-sky-200 dark:border-sky-800 shadow-sm" : "bg-transparent border-transparent"
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
                        "text-[9px] font-bold uppercase tracking-widest text-center",
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
        {/* Error State */}
        {status === 'error' && (
          <section className="max-w-3xl mx-auto">
            <div className="p-6 rounded-2xl bg-destructive/5 border border-destructive/20 flex items-center gap-5 text-destructive">
              <div className="p-3 bg-destructive/10 rounded-full">
                <AlertCircle className="w-6 h-6" />
              </div>
              <div className="flex-1">
                <p className="text-sm font-bold uppercase tracking-tight">Falha no Processamento</p>
                <p className="text-xs opacity-80">{error || 'O servidor de transcrição não pôde completar a requisição.'}</p>
              </div>
              <Button variant="outline" size="sm" onClick={() => { setInputUrl(''); reset(); }} className="border-destructive/20 text-destructive hover:bg-destructive/10">
                Reiniciar
              </Button>
            </div>
          </section>
        )}
        {/* Complete Results Display */}
        <AnimatePresence>
          {status === 'complete' && result && (
            <motion.section
              initial={{ opacity: 0, y: 30 }}
              animate={{ opacity: 1, y: 0 }}
              className="space-y-8"
            >
              <div className="flex flex-col md:flex-row md:items-center justify-between border-b pb-6 gap-4">
                <div>
                  <h2 className="text-2xl font-bold tracking-tight">Documento de Consulta</h2>
                  <p className="text-sm text-muted-foreground">Transcrição gerada com diarização e timestamps Scribe v2.</p>
                </div>
                <div className="flex items-center gap-3">
                   <Button variant="outline" size="sm" onClick={() => { setInputUrl(''); reset(); }} className="rounded-full h-10 px-6 shadow-sm border-sky-200 text-sky-600 hover:bg-sky-50">
                    <RefreshCcw className="w-4 h-4 mr-2" /> Nova Análise
                  </Button>
                </div>
              </div>
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                {/* Main Content Area */}
                <Card className="lg:col-span-2 border shadow-soft flex flex-col bg-card/40 backdrop-blur-sm">
                  <CardHeader className="flex flex-row items-center justify-between border-b bg-muted/20 px-6 py-4">
                    <CardTitle className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Corpo da Transcrição</CardTitle>
                    <div className="flex gap-2">
                      <Button variant="ghost" size="icon" className="h-8 w-8 hover:bg-sky-100" onClick={() => copyToClipboard(result.text)}>
                        <Copy className="w-4 h-4 text-sky-600" />
                      </Button>
                      <Button variant="ghost" size="icon" className="h-8 w-8 hover:bg-sky-100" onClick={() => downloadFile(result.text, 'mtext_transcript.txt', 'text/plain')}>
                        <Download className="w-4 h-4 text-sky-600" />
                      </Button>
                    </div>
                  </CardHeader>
                  <CardContent className="p-0 flex-1 overflow-hidden">
                    <div className="p-8 md:p-10 max-h-[600px] overflow-y-auto text-sm leading-relaxed whitespace-pre-wrap font-sans text-foreground/90 selection:bg-sky-100">
                      {result.text || "Sem conteúdo detectado no arquivo de áudio."}
                    </div>
                  </CardContent>
                </Card>
                {/* Meta-information Sidebar */}
                <div className="space-y-6">
                  <Card className="border-none shadow-soft bg-sky-600 text-white overflow-hidden relative">
                    <div className="absolute top-0 right-0 p-4 opacity-10">
                      <Activity className="w-24 h-24 rotate-12" />
                    </div>
                    <CardHeader className="pb-4 pt-6 relative">
                      <CardTitle className="text-[10px] font-bold uppercase tracking-[0.2em] opacity-80">Metadata Pro</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-5 relative">
                      <div className="grid grid-cols-2 gap-3">
                        <div className="p-4 bg-white/10 rounded-2xl border border-white/10 backdrop-blur-sm">
                          <p className="text-[9px] font-bold uppercase opacity-60 mb-1">Idioma</p>
                          <p className="font-bold text-lg leading-none uppercase">{result.language_code}</p>
                        </div>
                        <div className="p-4 bg-white/10 rounded-2xl border border-white/10 backdrop-blur-sm">
                          <p className="text-[9px] font-bold uppercase opacity-60 mb-1">Engine</p>
                          <p className="font-bold text-lg leading-none">Scribe V2</p>
                        </div>
                      </div>
                      <div className="p-4 bg-black/10 rounded-2xl text-[10px] leading-relaxed italic border border-white/5 opacity-80">
                        Certificado de conformidade clínica processado em {new Date(result.timestamp).toLocaleDateString('pt-BR')} às {new Date(result.timestamp).toLocaleTimeString('pt-BR')}.
                      </div>
                    </CardContent>
                  </Card>
                  <Card className="border shadow-sm bg-card/40 backdrop-blur-sm">
                    <CardHeader className="pb-3 border-b px-5 py-3">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <Code className="w-3.5 h-3.5 text-sky-600" />
                          <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Payload Bruto</span>
                        </div>
                        <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => downloadFile(JSON.stringify(result.segmented_json, null, 2), 'mtext_payload.json', 'application/json')}>
                          <Download className="w-3.5 h-3.5" />
                        </Button>
                      </div>
                    </CardHeader>
                    <CardContent className="p-5">
                      <div className="bg-muted/30 rounded-xl p-4 h-48 overflow-hidden relative border border-border/50">
                        <pre className="text-[9px] text-muted-foreground/80 font-mono">
                          {JSON.stringify(result.segmented_json, null, 2).substring(0, 600)}...
                        </pre>
                        <div className="absolute inset-0 bg-gradient-to-t from-card/90 to-transparent pointer-events-none" />
                      </div>
                      <p className="text-[9px] mt-4 text-muted-foreground text-center font-semibold italic">Incluso: Timestamps por palavra, tags e identificação de orador.</p>
                    </CardContent>
                  </Card>
                </div>
              </div>
            </motion.section>
          )}
        </AnimatePresence>
        <footer className="py-12 text-center border-t border-border/50 text-[10px] font-bold uppercase tracking-widest text-muted-foreground/60">
          <div className="flex flex-col items-center gap-2">
            <p className="flex items-center gap-2">
              <ShieldCheck className="w-3 h-3 text-sky-500" />
              MText • Clinical Intelligence System
            </p>
            <p>© {new Date().getFullYear()} Precision Transcription Engine.</p>
          </div>
        </footer>
      </div>
      <Toaster position="bottom-right" theme="light" className="font-sans" />
    </AppLayout>
  );
}