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
  AlertCircle
} from 'lucide-react';
import { ThemeToggle } from '@/components/ThemeToggle';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Toaster, toast } from '@/components/ui/sonner';
import { useTranscriptionStore } from '@/store/transcription';
import { api } from '@/lib/api-client';
import { TranscriptionResult } from '@shared/types';
const steps = [
  { id: 'submitting', label: 'Enviando URL', icon: Send },
  { id: 'transcribing', label: 'Transcrevendo Áudio', icon: FileAudio },
  { id: 'saving', label: 'Salvando Artefatos', icon: CheckCircle2 },
  { id: 'complete', label: 'Concluído', icon: FileText },
];
export function HomePage() {
  const status = useTranscriptionStore((s) => s.status);
  const url = useTranscriptionStore((s) => s.url);
  const result = useTranscriptionStore((s) => s.result);
  const error = useTranscriptionStore((s) => s.error);
  const setStatus = useTranscriptionStore((s) => s.setStatus);
  const setUrl = useTranscriptionStore((s) => s.setUrl);
  const setResult = useTranscriptionStore((s) => s.setResult);
  const setError = useTranscriptionStore((s) => s.setError);
  const reset = useTranscriptionStore((s) => s.reset);
  const [inputUrl, setInputUrl] = useState('');
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
      // Simulate steps for UI polish
      setTimeout(() => setStatus('transcribing'), 1500);
      const response = await api<TranscriptionResult>('/api/transcribe', {
        method: 'POST',
        body: JSON.stringify({ url: inputUrl }),
      });
      setStatus('saving');
      setTimeout(() => {
        setResult(response);
        setStatus('complete');
        toast.success('Transcrição concluída com sucesso!');
      }, 1000);
    } catch (err: any) {
      setError(err.message || 'Erro ao processar áudio');
      setStatus('error');
      toast.error('Erro na transcrição');
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
        <ThemeToggle />
        {/* Hero Section */}
        <header className="text-center space-y-4 max-w-3xl mx-auto pt-8">
          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="inline-block p-2 px-4 rounded-full bg-sky-50 dark:bg-sky-950 text-sky-600 dark:text-sky-400 text-sm font-medium mb-2"
          >
            ElevenLabs Scribe v2
          </motion.div>
          <motion.h1 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="text-4xl md:text-5xl lg:text-6xl font-display font-bold tracking-tight"
          >
            Med<span className="text-sky-500">Scribe</span>
          </motion.h1>
          <motion.p 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
            className="text-lg text-muted-foreground"
          >
            Transcrição clínica inteligente para consultas médicas em Português.
          </motion.p>
        </header>
        {/* Input Section */}
        <section className="max-w-2xl mx-auto">
          <Card className="border-none shadow-soft overflow-hidden">
            <CardContent className="p-1">
              <form onSubmit={handleTranscribe} className="flex flex-col sm:flex-row gap-2">
                <Input 
                  placeholder="Cole a URL pública do áudio (.mp3, .wav...)" 
                  className="h-12 border-none bg-secondary/50 focus-visible:ring-sky-500"
                  value={inputUrl}
                  onChange={(e) => setInputUrl(e.target.value)}
                  disabled={status !== 'idle' && status !== 'complete' && status !== 'error'}
                />
                <Button 
                  type="submit" 
                  size="lg"
                  className="bg-sky-600 hover:bg-sky-700 text-white h-12 px-8 transition-all hover:scale-[1.02]"
                  disabled={status !== 'idle' && status !== 'complete' && status !== 'error'}
                >
                  {status === 'idle' || status === 'complete' || status === 'error' ? (
                    <>
                      <Send className="w-4 h-4 mr-2" /> Transcrever
                    </>
                  ) : (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" /> Processando
                    </>
                  )}
                </Button>
              </form>
            </CardContent>
          </Card>
        </section>
        {/* Status Stepper */}
        <AnimatePresence>
          {(status !== 'idle' && status !== 'complete' && status !== 'error') && (
            <motion.section 
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              className="max-w-2xl mx-auto space-y-6"
            >
              <div className="space-y-2">
                <div className="flex justify-between text-sm font-medium">
                  <span className="text-sky-600">Status do Processo</span>
                  <span>{getProgressValue()}%</span>
                </div>
                <Progress value={getProgressValue()} className="h-2 bg-secondary" />
              </div>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                {steps.map((step) => {
                  const Icon = step.icon;
                  const isActive = status === step.id;
                  const isPast = getProgressValue() > (steps.indexOf(step) * 25 + 25) || status === 'complete';
                  return (
                    <div 
                      key={step.id} 
                      className={`flex flex-col items-center gap-2 p-4 rounded-xl transition-colors ${
                        isActive ? 'bg-sky-50 dark:bg-sky-950 ring-1 ring-sky-200 dark:ring-sky-800' : 'bg-transparent'
                      }`}
                    >
                      <div className={`p-2 rounded-full ${
                        isPast ? 'bg-green-100 text-green-600' : isActive ? 'bg-sky-100 text-sky-600' : 'bg-secondary text-muted-foreground'
                      }`}>
                        {isActive && !isPast ? <Loader2 className="w-5 h-5 animate-spin" /> : <Icon className="w-5 h-5" />}
                      </div>
                      <span className={`text-xs font-medium text-center ${isActive ? 'text-sky-600' : 'text-muted-foreground'}`}>
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
          <section className="max-w-2xl mx-auto">
            <div className="p-4 rounded-xl bg-destructive/10 border border-destructive/20 flex items-center gap-3 text-destructive">
              <AlertCircle className="w-5 h-5 flex-shrink-0" />
              <p className="text-sm font-medium">{error || 'Ocorreu um erro inesperado.'}</p>
              <Button variant="ghost" size="sm" onClick={reset} className="ml-auto text-destructive hover:bg-destructive/10">
                Tentar novamente
              </Button>
            </div>
          </section>
        )}
        {/* Results Section */}
        <AnimatePresence>
          {status === 'complete' && result && (
            <motion.section 
              initial={{ opacity: 0, y: 40 }}
              animate={{ opacity: 1, y: 0 }}
              className="space-y-8"
            >
              <div className="flex items-center justify-between">
                <h2 className="text-2xl font-bold">Resultados da Transcrição</h2>
                <Button variant="outline" size="sm" onClick={reset} className="rounded-full">
                  <RefreshCcw className="w-4 h-4 mr-2" /> Nova Consulta
                </Button>
              </div>
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* Full Transcript Card */}
                <Card className="lg:col-span-2 border-none shadow-soft flex flex-col">
                  <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                    <div>
                      <CardTitle className="text-lg">Transcrição Completa</CardTitle>
                      <CardDescription>Texto corrido extraído do áudio</CardDescription>
                    </div>
                    <div className="flex gap-2">
                      <Button variant="ghost" size="icon" onClick={() => copyToClipboard(result.text)}>
                        <Copy className="w-4 h-4" />
                      </Button>
                      <Button variant="ghost" size="icon" onClick={() => downloadFile(result.text, 'transcricao.txt', 'text/plain')}>
                        <Download className="w-4 h-4" />
                      </Button>
                    </div>
                  </CardHeader>
                  <CardContent className="flex-1">
                    <div className="bg-secondary/30 rounded-lg p-6 max-h-[500px] overflow-y-auto text-sm leading-relaxed whitespace-pre-wrap font-sans">
                      {result.text || "Nenhuma fala detectada."}
                    </div>
                  </CardContent>
                </Card>
                {/* Right Column Cards */}
                <div className="space-y-6">
                  {/* JSON Artifact */}
                  <Card className="border-none shadow-soft">
                    <CardHeader className="pb-3">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <Code className="w-4 h-4 text-sky-600" />
                          <CardTitle className="text-sm font-semibold">Segmented JSON</CardTitle>
                        </div>
                        <Button variant="ghost" size="icon" onClick={() => downloadFile(JSON.stringify(result.segmented_json, null, 2), 'segmentos.json', 'application/json')}>
                          <Download className="w-4 h-4" />
                        </Button>
                      </div>
                    </CardHeader>
                    <CardContent>
                      <p className="text-xs text-muted-foreground mb-4">Dados brutos com timestamps, oradores e marcações de eventos clínicos.</p>
                      <div className="bg-secondary/30 rounded p-3 h-32 overflow-hidden relative">
                        <pre className="text-[10px] text-muted-foreground opacity-60">
                          {JSON.stringify(result.segmented_json, null, 2).substring(0, 300)}...
                        </pre>
                        <div className="absolute inset-0 bg-gradient-to-t from-background/10 to-transparent pointer-events-none" />
                      </div>
                    </CardContent>
                  </Card>
                  {/* Summary Card */}
                  <Card className="border-none shadow-soft bg-sky-600 text-white">
                    <CardHeader className="pb-3">
                      <CardTitle className="text-sm font-semibold">Resumo da Consulta</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <div className="grid grid-cols-2 gap-4 text-xs">
                        <div className="p-3 bg-white/10 rounded-lg">
                          <p className="opacity-70">Idioma</p>
                          <p className="font-bold text-sm uppercase">{result.language_code}</p>
                        </div>
                        <div className="p-3 bg-white/10 rounded-lg">
                          <p className="opacity-70">Status</p>
                          <p className="font-bold text-sm">Processado</p>
                        </div>
                      </div>
                      <p className="text-xs opacity-90 leading-relaxed italic">
                        "Documento gerado automaticamente via ElevenLabs Scribe v2 com parametrização clínica."
                      </p>
                    </CardContent>
                  </Card>
                </div>
              </div>
            </motion.section>
          )}
        </AnimatePresence>
      </div>
      <footer className="py-8 text-center border-t text-sm text-muted-foreground">
        <p>© {new Date().getFullYear()} MedScribe - Clinical Audio Intelligence. Powered by Cloudflare Workers.</p>
      </footer>
      <Toaster richColors position="bottom-right" />
    </div>
  );
}