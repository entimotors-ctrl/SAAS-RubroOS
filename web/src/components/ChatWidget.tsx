import { useEffect, useRef, useState } from 'react';
import { Bot, Check, History, Loader2, Plus, Send, X, XCircle } from 'lucide-react';
import type { BusinessTypeConfig } from '../lib/business-types';
import { ApiError } from '../lib/api';
import {
  cancelAction,
  confirmAction,
  getConversationMessages,
  listConversations,
  sendChatMessage,
  type ChatResponse,
  type ConversationSummary,
} from '../lib/ai-api';

interface UiMessage {
  role: 'user' | 'assistant';
  content: string;
  pendingActionId?: number;
  resolved?: boolean;
}

/**
 * Asistente de IA flotante, disponible en todos los rubros (se monta una
 * sola vez en DashboardShell). Todo el estado de negocio vive en el
 * backend — este componente solo manda texto y muestra lo que responde
 * /api/ai/chat, /confirm y /cancel.
 */
export function ChatWidget({ business }: { business: BusinessTypeConfig }) {
  const storageKey = `rubroos_ai_conversation_${business.id}`;
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<UiMessage[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [conversationId, setConversationId] = useState<number | undefined>(() => {
    const saved = localStorage.getItem(storageKey);
    return saved ? Number(saved) : undefined;
  });
  const [showHistory, setShowHistory] = useState(false);
  const [conversations, setConversations] = useState<ConversationSummary[]>([]);
  const listRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (conversationId) localStorage.setItem(storageKey, String(conversationId));
    else localStorage.removeItem(storageKey);
  }, [conversationId, storageKey]);

  useEffect(() => {
    if (!open || !conversationId || messages.length > 0) return;
    getConversationMessages(conversationId)
      .then((msgs) => setMessages(msgs.map((m) => ({ role: m.role, content: m.content }))))
      .catch(() => setConversationId(undefined));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages, loading]);

  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  function applyResponse(res: ChatResponse) {
    setConversationId(res.conversationId);
    setMessages((prev) => [...prev, { role: 'assistant', content: res.message, pendingActionId: res.type === 'confirmation_required' ? res.actionId : undefined }]);
  }

  async function handleSend() {
    const text = input.trim();
    if (!text || loading) return;
    setInput('');
    setMessages((prev) => [...prev, { role: 'user', content: text }]);
    setLoading(true);
    try {
      const res = await sendChatMessage(conversationId, text);
      applyResponse(res);
    } catch (err) {
      const msg = err instanceof ApiError ? err.message : 'No fue posible conectar con el asistente en este momento.';
      setMessages((prev) => [...prev, { role: 'assistant', content: msg }]);
    } finally {
      setLoading(false);
    }
  }

  async function resolvePending(actionId: number, action: 'confirm' | 'cancel') {
    setLoading(true);
    setMessages((prev) => prev.map((m) => (m.pendingActionId === actionId ? { ...m, resolved: true } : m)));
    try {
      const res = action === 'confirm' ? await confirmAction(actionId) : await cancelAction(actionId);
      applyResponse(res);
    } catch (err) {
      const msg = err instanceof ApiError ? err.message : 'No se pudo procesar la confirmación.';
      setMessages((prev) => [...prev, { role: 'assistant', content: msg }]);
    } finally {
      setLoading(false);
    }
  }

  function startNewConversation() {
    setConversationId(undefined);
    setMessages([]);
    setShowHistory(false);
  }

  async function openHistory() {
    setShowHistory((v) => !v);
    if (!showHistory) {
      try {
        setConversations(await listConversations());
      } catch {
        setConversations([]);
      }
    }
  }

  function openConversation(id: number) {
    setConversationId(id);
    setMessages([]);
    setShowHistory(false);
  }

  return (
    <>
      <button
        onClick={() => setOpen((v) => !v)}
        aria-label={open ? 'Cerrar asistente' : 'Abrir asistente de RubroOS'}
        className="fixed bottom-5 right-4 z-40 flex h-14 w-14 items-center justify-center rounded-full text-slate-950 shadow-lg shadow-black/40 transition hover:scale-105 sm:right-6"
        style={{ backgroundColor: business.accent }}
      >
        {open ? <X className="h-6 w-6" /> : <Bot className="h-6 w-6" />}
      </button>

      {open && (
        <div className="fixed inset-x-3 bottom-24 top-16 z-40 flex flex-col overflow-hidden rounded-2xl border border-white/10 bg-slate-900 shadow-2xl sm:inset-x-auto sm:bottom-24 sm:right-6 sm:top-auto sm:h-[32rem] sm:w-96">
          <div className="flex items-center justify-between border-b border-white/10 px-4 py-3">
            <div className="flex items-center gap-2 min-w-0">
              <Bot className="h-4 w-4 shrink-0" style={{ color: business.accent }} />
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-white">Asistente RubroOS</p>
                <p className="truncate text-[11px] text-slate-500">{business.label}</p>
              </div>
            </div>
            <div className="flex shrink-0 items-center gap-1">
              <button onClick={openHistory} title="Conversaciones anteriores" className="rounded-lg p-1.5 text-slate-400 hover:bg-white/5 hover:text-white">
                <History className="h-4 w-4" />
              </button>
              <button onClick={startNewConversation} title="Nueva conversación" className="rounded-lg p-1.5 text-slate-400 hover:bg-white/5 hover:text-white">
                <Plus className="h-4 w-4" />
              </button>
            </div>
          </div>

          {showHistory ? (
            <div className="flex-1 overflow-y-auto p-3">
              {conversations.length === 0 && <p className="p-3 text-center text-xs text-slate-500">Todavía no tienes conversaciones.</p>}
              <ul className="space-y-1">
                {conversations.map((c) => (
                  <li key={c.id}>
                    <button
                      onClick={() => openConversation(c.id)}
                      className={`w-full rounded-lg px-3 py-2 text-left text-xs ${c.id === conversationId ? 'bg-white/10 text-white' : 'text-slate-300 hover:bg-white/5'}`}
                    >
                      Conversación del {new Date(c.updated_at.replace(' ', 'T')).toLocaleString('es-HN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          ) : (
            <>
              <div ref={listRef} className="flex-1 space-y-3 overflow-y-auto p-3">
                {messages.length === 0 && (
                  <p className="mt-6 px-4 text-center text-xs text-slate-500">
                    Pregúntame sobre tu negocio: inventario, clientes, ventas, citas… También puedo registrar cosas por ti.
                  </p>
                )}
                {messages.map((m, i) => (
                  <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                    <div className="max-w-[85%]">
                      <div
                        className={`rounded-2xl px-3 py-2 text-sm ${m.role === 'user' ? 'text-slate-950' : 'bg-white/5 text-slate-100'}`}
                        style={m.role === 'user' ? { backgroundColor: business.accent } : undefined}
                      >
                        {m.content}
                      </div>
                      {m.pendingActionId && !m.resolved && (
                        <div className="mt-2 flex gap-2">
                          <button
                            onClick={() => resolvePending(m.pendingActionId!, 'confirm')}
                            disabled={loading}
                            className="flex items-center gap-1 rounded-lg bg-emerald-500 px-3 py-1.5 text-xs font-semibold text-slate-950 hover:bg-emerald-400 disabled:opacity-50"
                          >
                            <Check className="h-3.5 w-3.5" /> Confirmar
                          </button>
                          <button
                            onClick={() => resolvePending(m.pendingActionId!, 'cancel')}
                            disabled={loading}
                            className="flex items-center gap-1 rounded-lg border border-white/15 px-3 py-1.5 text-xs font-semibold text-slate-300 hover:bg-white/5 disabled:opacity-50"
                          >
                            <XCircle className="h-3.5 w-3.5" /> Cancelar
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                ))}
                {loading && (
                  <div className="flex items-center gap-2 px-1 text-xs text-slate-500">
                    <Loader2 className="h-3.5 w-3.5 animate-spin" /> Pensando…
                  </div>
                )}
              </div>

              <div className="flex items-center gap-2 border-t border-white/10 p-3">
                <input
                  ref={inputRef}
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault();
                      handleSend();
                    }
                  }}
                  placeholder="Escribe tu mensaje…"
                  disabled={loading}
                  maxLength={2000}
                  className="min-w-0 flex-1 rounded-xl border border-white/15 bg-slate-950/60 px-3 py-2 text-sm text-white placeholder:text-slate-500 outline-none focus:border-emerald-400 disabled:opacity-50"
                />
                <button
                  onClick={handleSend}
                  disabled={loading || !input.trim()}
                  aria-label="Enviar"
                  className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-slate-950 disabled:opacity-40"
                  style={{ backgroundColor: business.accent }}
                >
                  <Send className="h-4 w-4" />
                </button>
              </div>
            </>
          )}
        </div>
      )}
    </>
  );
}
