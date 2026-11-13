'use client';

import { useEffect, useMemo, useState } from 'react';
import { BookOpen, Bot, ChevronDown, Loader2, Send, X } from 'lucide-react';
import { api } from '@/lib/api';
import { PM_GUIDE_PAGES } from '@/lib/pm-guide-pages';
import { useAuthStore } from '@/stores/authStore';
import { useNavigationStore } from '@/stores/navigationStore';
import { pageHasPermission, pageModuleIsEnabled } from '@/lib/page-access';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

type Message = { role: 'assistant' | 'user'; text: string };

/** Always-available page guide, with verified local instructions and optional configured AI help. */
export function PmPageGuideAssistant({ page }: { page: string }) {
  const guide = PM_GUIDE_PAGES[page];
  const navigate = useNavigationStore((state) => state.navigate);
  const enabledModules = useNavigationStore((state) => state.enabledModules);
  const { hasPermission, isAdmin } = useAuthStore();
  const [open, setOpen] = useState(false);
  const [question, setQuestion] = useState('');
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(false);
  const allowedRelated = useMemo(() =>
    (guide?.related || []).filter((candidate) =>
      pageHasPermission(candidate, hasPermission, isAdmin()) &&
      pageModuleIsEnabled(candidate, enabledModules)), [guide, hasPermission, isAdmin, enabledModules]);

  useEffect(() => {
    setQuestion('');
    setMessages([]);
    setLoading(false);
  }, [page]);

  if (!guide) return null;

  const ask = async (text: string) => {
    const q = text.trim().slice(0, 600);
    if (!q || loading) return;
    setQuestion('');
    setMessages((prev) => [...prev, { role: 'user', text: q }]);
    const lower = q.toLowerCase();
    const matchedPage = Object.values(PM_GUIDE_PAGES).find((item) => lower.includes(item.title.toLowerCase()));
    const helpPage = matchedPage ?? guide;
    const asksAboutPage = /what (is|does)|how (do|does|to)|where (do|can)|guide|help|navigate|start|use this page|this screen|explain/.test(lower);
    if (asksAboutPage) {
      setMessages((prev) => [...prev, {
        role: 'assistant',
        text: helpPage.title + ': ' + helpPage.purpose +
          '\n\nWhen to use: ' + helpPage.whenToUse +
          '\n\nHow it works:\n' + helpPage.details.map((detail) => '• ' + detail).join('\n') +
          '\n\nSteps:\n' + helpPage.steps.map((step, index) => String(index + 1) + '. ' + step).join('\n') +
          '\n\nExample: ' + helpPage.example + '\n\nImportant: ' + helpPage.caution,
      }]);
      return;
    }
    setLoading(true);
    try {
      const reply = await api.post<{ reply: string }>('/api/pm-guide/ask', { page, question: q });
      if (!reply.success || !reply.data?.reply) throw new Error(reply.error || 'AI help unavailable');
      setMessages((prev) => [...prev, { role: 'assistant', text: reply.data!.reply }]);
    } catch {
      setMessages((prev) => [...prev, {
        role: 'assistant',
        text: 'The configured AI service is unavailable. Here is the verified guide for ' + guide.title + ':\n' +
          guide.purpose + '\n\n' + guide.whenToUse +
          '\n\n' + guide.details.join('\n') +
          '\n\n' + guide.steps.map((step, index) => String(index + 1) + '. ' + step).join('\n') +
          '\n\nExample: ' + guide.example,
      }]);
    } finally {
      setLoading(false);
    }
  };

  return <div className="pointer-events-none fixed bottom-20 right-3 z-[60] flex max-w-[calc(100vw-1.5rem)] flex-col items-end lg:bottom-5 lg:right-6" data-testid="pm-page-guide">
    {open && <section aria-label="PM page assistant" role="dialog" className="pointer-events-auto mb-2 flex max-h-[min(72vh,640px)] w-[min(380px,calc(100vw-1.5rem))] flex-col overflow-hidden rounded-xl border bg-card shadow-xl">
      <div className="flex items-center justify-between gap-2 border-b bg-muted/30 px-4 py-3">
        <div className="min-w-0"><h2 className="flex items-center gap-2 text-sm font-semibold"><BookOpen className="h-4 w-4 text-emerald-600"/>PM Page Guide</h2><p className="truncate text-xs text-muted-foreground">{guide.title}</p></div>
        <Button type="button" size="icon" variant="ghost" aria-label="Close PM guide" onClick={() => setOpen(false)}><X className="h-4 w-4"/></Button>
      </div>
      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-3 text-sm">
        <p className="text-sm">{guide.purpose}</p>
        <div className="space-y-1 rounded-lg bg-muted/30 p-3">
          <p className="text-xs font-semibold">When should I use this page?</p>
          <p className="text-xs text-muted-foreground">{guide.whenToUse}</p>
        </div>
        <div className="space-y-1 rounded-lg border p-3">
          <p className="text-xs font-semibold">Understanding the information</p>
          <ul className="list-disc space-y-1.5 pl-4 text-xs text-muted-foreground">
            {guide.details.map((detail) => <li key={detail}>{detail}</li>)}
          </ul>
        </div>
        <div className="rounded-lg bg-muted/30 p-3"><p className="mb-2 font-medium">How to use this page</p>
          <ol className="list-inside list-decimal space-y-1.5 text-xs text-muted-foreground">
            {guide.steps.map((step) => <li key={step}>{step}</li>)}
          </ol>
        </div>
        <div className="space-y-1 rounded-lg border p-3">
          <p className="text-xs font-semibold">Industrial example</p>
          <p className="text-xs text-muted-foreground">{guide.example}</p>
        </div>
        <p className="rounded-md border border-amber-200 p-2 text-xs text-muted-foreground dark:border-amber-900">
          <strong>Important:</strong> {guide.caution}
        </p>
        {allowedRelated.length > 0 && <div className="space-y-2"><p className="text-xs font-semibold">Go to related workspace</p>
          <div className="flex flex-wrap gap-2">{allowedRelated.map((id) =>
            <Button key={id} type="button" variant="outline" size="sm" className="h-auto min-h-8 whitespace-normal text-left text-xs" onClick={() => { navigate(id as Parameters<typeof navigate>[0]); setMessages([]); }}>{PM_GUIDE_PAGES[id].title}</Button>)}
          </div>
        </div>}
        {messages.length > 0 && <div className="space-y-2 border-t pt-3" aria-live="polite">
          {messages.map((message, index) => <p key={index} className={message.role === 'user' ? 'whitespace-pre-wrap rounded-md bg-muted p-2 text-xs' : 'whitespace-pre-wrap rounded-md border p-2 text-xs'}><strong>{message.role === 'user' ? 'You: ' : 'Guide: '}</strong>{message.text}</p>)}
        </div>}
        {loading && <p role="status" className="flex items-center gap-2 text-xs text-muted-foreground"><Loader2 className="h-3.5 w-3.5 animate-spin"/>Asking configured AI…</p>}
      </div>
      <form className="flex gap-2 border-t p-3" onSubmit={(event) => { event.preventDefault(); void ask(question); }}>
        <Input aria-label="Ask PM guide" value={question} onChange={(event) => setQuestion(event.target.value)} placeholder="Ask how this page works…" maxLength={600} disabled={loading} className="min-w-0"/>
        <Button type="submit" size="icon" aria-label="Send PM guide question" disabled={!question.trim() || loading}><Send className="h-4 w-4"/></Button>
      </form>
      <p className="px-3 pb-2 text-[10px] text-muted-foreground">Navigation help is verified locally. Other questions use the configured AI provider when available.</p>
    </section>}
    <Button type="button" aria-expanded={open} aria-label={open ? 'Minimize PM page guide' : 'Open PM page guide'} onClick={() => setOpen((value) => !value)} className="pointer-events-auto h-11 gap-2 rounded-full px-4 shadow-lg">
      <Bot className="h-5 w-5"/>{open ? 'Minimize guide' : 'PM Guide'}{open && <ChevronDown className="h-4 w-4"/>}
    </Button>
  </div>;
}
