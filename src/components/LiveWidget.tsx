import React, { useEffect, useRef, useState } from 'react';
import {
  CheckCheck,
  Paperclip,
  RefreshCw,
  Send,
  Star,
  WifiOff,
  X,
} from 'lucide-react';
import { apiFetch, formatFaDateTime } from '../lib/api';
import type { WidgetConfig } from '../shared/types';

interface VisitorMessage {
  id: string;
  senderType: 'visitor' | 'operator' | 'ai' | 'system';
  senderName: string;
  body: string;
  deliveryStatus: string;
  attachments?: {
    id: string;
    originalName: string;
    mimeType: string;
    sizeBytes: number;
    scanStatus: string;
  }[];
  createdAt: string;
}

interface VisitorConversation {
  id: string;
  ticketNumber: string;
  status: string;
  departmentId: string;
  visitorName: string;
  rating?: number;
  ratingComment?: string;
  messages: VisitorMessage[];
}

interface WidgetSessionData {
  widgetToken: string;
  siteName: string;
  widgetConfig: WidgetConfig;
  departments: { id: string; name: string; workingHours: string }[];
  conversation: VisitorConversation | null;
}

interface LiveWidgetProps {
  publicInstallKey: string;
  embeddedFrame?: boolean;
  isInstallTest?: boolean;
  isDemoBadge?: boolean;
  onClose?: () => void;
  onConversationUpdated?: () => void;
}

export const LiveWidget: React.FC<LiveWidgetProps> = ({
  publicInstallKey,
  embeddedFrame = false,
  isInstallTest = false,
  isDemoBadge = false,
  onClose,
  onConversationUpdated,
}) => {
  const [session, setSession] = useState<WidgetSessionData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [visitorName, setVisitorName] = useState('');
  const [visitorContact, setVisitorContact] = useState('');
  const [selectedDepId, setSelectedDepId] = useState('');
  const [started, setStarted] = useState(false);

  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [simulatedOffline, setSimulatedOffline] = useState(false);
  const [pendingRetryPayload, setPendingRetryPayload] = useState<{
    body: string;
    clientMessageId: string;
  } | null>(null);
  const [operatorTyping, setOperatorTyping] = useState(false);

  const [showRating, setShowRating] = useState(false);
  const [ratingVal, setRatingVal] = useState(5);
  const [ratingComment, setRatingComment] = useState('');
  const [ratingSaved, setRatingSaved] = useState(false);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const storageKey = `ramax_wtoken_${publicInstallKey}`;

  useEffect(() => {
    let active = true;
    async function init() {
      setLoading(true);
      setError(null);
      try {
        const existingToken = sessionStorage.getItem(storageKey) || undefined;
        const data = await apiFetch<WidgetSessionData>('/api/widget/session', {
          method: 'POST',
          body: JSON.stringify({ publicInstallKey, existingToken }),
        });
        if (!active) return;
        sessionStorage.setItem(storageKey, data.widgetToken);
        setSession(data);
        if (data.departments.length > 0) setSelectedDepId(data.departments[0].id);
        if (data.conversation && data.conversation.messages.length > 0) {
          setStarted(true);
          setVisitorName(data.conversation.visitorName);
        }
        // Notify parent host page if mounted inside isolated iframe
        if (embeddedFrame && window.parent !== window) {
          window.parent.postMessage(
            { type: 'RAMAX_WIDGET_CONFIG', config: data.widgetConfig },
            '*'
          );
        }
      } catch (err) {
        if (!active) return;
        setError(err instanceof Error ? err.message : 'امکان بارگذاری ویجت وجود ندارد.');
      } finally {
        if (active) setLoading(false);
      }
    }
    if (publicInstallKey) init();
    return () => {
      active = false;
    };
  }, [publicInstallKey, embeddedFrame, storageKey]);

  // Poll for real operator replies every 3.5 seconds while active
  useEffect(() => {
    if (!session?.widgetToken || !started || simulatedOffline) return;
    const timer = window.setInterval(async () => {
      try {
        const res = await apiFetch<{ conversation: VisitorConversation | null }>(
          `/api/widget/poll?token=${encodeURIComponent(session.widgetToken)}`
        );
        if (res.conversation) {
          setSession((prev) => (prev ? { ...prev, conversation: res.conversation } : prev));
        }
      } catch {
        // silent poll retry
      }
    }, 3500);
    return () => window.clearInterval(timer);
  }, [session?.widgetToken, started, simulatedOffline]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [session?.conversation?.messages?.length, operatorTyping]);

  async function sendMessage(textOverride?: string, existingClientId?: string) {
    const text = (textOverride ?? input).trim();
    if (!text || !session) return;
    const clientMessageId = existingClientId || `cmsg_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;

    if (simulatedOffline) {
      setPendingRetryPayload({ body: text, clientMessageId });
      setError('اتصال قطع شده است. پس از اتصال مجدد، پیام بدون ایجاد نسخه تکراری ارسال می‌شود.');
      return;
    }

    setSending(true);
    setError(null);
    if (!textOverride) setInput('');
    setStarted(true);

    try {
      const res = await apiFetch<{ conversation: VisitorConversation }>('/api/widget/message', {
        method: 'POST',
        headers: { 'x-ramax-widget-token': session.widgetToken },
        body: JSON.stringify({
          body: text,
          visitorName: visitorName.trim() || 'بازدیدکننده سایت',
          visitorContact: visitorContact.trim(),
          departmentId: selectedDepId,
          clientMessageId,
          isInstallTest,
        }),
      });
      setPendingRetryPayload(null);
      setSession((prev) => (prev ? { ...prev, conversation: res.conversation } : prev));
      onConversationUpdated?.();
      if (session.widgetConfig.autoReplyEnabled) {
        setOperatorTyping(true);
        window.setTimeout(() => setOperatorTyping(false), 700);
      }
    } catch (err) {
      setPendingRetryPayload({ body: text, clientMessageId });
      setError(err instanceof Error ? err.message : 'خطا در ارسال پیام.');
    } finally {
      setSending(false);
    }
  }

  async function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || !session) return;
    setUploading(true);
    setError(null);
    try {
      const form = new FormData();
      form.append('file', file);
      form.append('widgetToken', session.widgetToken);
      form.append('caption', `فایل پیوست: ${file.name}`);
      const res = await apiFetch<{ conversation: VisitorConversation; scanStatus: string }>(
        '/api/widget/upload',
        {
          method: 'POST',
          headers: { 'x-ramax-widget-token': session.widgetToken },
          body: form,
        }
      );
      setStarted(true);
      setSession((prev) => (prev ? { ...prev, conversation: res.conversation } : prev));
      onConversationUpdated?.();
      if (res.scanStatus === 'quarantined') {
        setError('فایل بارگذاری شد اما به دلیل بررسی امنیتی در قرنطینه قرار گرفت.');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'خطا در آپلود فایل.');
    } finally {
      setUploading(false);
      e.target.value = '';
    }
  }

  async function submitRating(e: React.FormEvent) {
    e.preventDefault();
    if (!session) return;
    try {
      await apiFetch('/api/widget/rate', {
        method: 'POST',
        body: JSON.stringify({
          widgetToken: session.widgetToken,
          rating: ratingVal,
          comment: ratingComment,
        }),
      });
      setRatingSaved(true);
      setShowRating(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'خطا در ثبت امتیاز.');
    }
  }

  const accent = session?.widgetConfig.primaryColor || '#1d4ed8';

  if (loading) {
    return (
      <div className="flex h-full min-h-[420px] flex-col items-center justify-center bg-white p-6 text-sm text-slate-500">
        در حال برقراری نشست امن ویجت...
      </div>
    );
  }

  if (!session) {
    return (
      <div className="flex h-full min-h-[420px] flex-col items-center justify-center gap-3 bg-white p-6 text-center">
        <p className="text-sm font-medium text-red-700">{error || 'شناسه ویجت معتبر نیست.'}</p>
      </div>
    );
  }

  const cfg = session.widgetConfig;
  const messages = session.conversation?.messages || [];

  return (
    <div className="flex h-full min-h-[480px] flex-col overflow-hidden bg-white text-slate-900">
      {/* Header */}
      <div
        className="flex items-center justify-between gap-3 px-4 py-3.5 text-white"
        style={{ backgroundColor: accent }}
      >
        <div className="min-w-0">
          <div className="flex items-center gap-2 text-sm font-semibold">
            <span className="truncate">{cfg.welcomeTitle}</span>
            {isDemoBadge && <span className="text-[11px] font-normal text-white/80">· نمونه</span>}
          </div>
          <div className="mt-0.5 text-xs text-white/80">
            {cfg.isWithinWorkingHours ? `ساعات پاسخگویی: ${cfg.workingHoursText}` : 'خارج از ساعت کاری · ثبت در صف'}
          </div>
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          <button
            type="button"
            onClick={() => {
              const nextOffline = !simulatedOffline;
              setSimulatedOffline(nextOffline);
              if (!nextOffline && pendingRetryPayload) {
                void sendMessage(pendingRetryPayload.body, pendingRetryPayload.clientMessageId);
              }
            }}
            title={simulatedOffline ? 'اتصال مجدد' : 'شبیه‌سازی قطع اتصال'}
            className="rounded-md px-2 py-1 text-[11px] text-white/90 hover:bg-white/15 transition-colors whitespace-nowrap"
          >
            {simulatedOffline ? 'اتصال مجدد' : 'تست قطعی'}
          </button>
          {onClose && (
            <button
              type="button"
              onClick={onClose}
              aria-label="بستن ویجت"
              className="rounded-md p-1.5 text-white/90 hover:bg-white/15 transition-colors"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
      </div>

      {/* Offline / Reconnect banner */}
      {simulatedOffline && (
        <div className="flex items-center justify-between gap-2 border-b border-amber-200 bg-amber-50 px-3.5 py-2 text-xs text-amber-900">
          <span className="flex items-center gap-1.5">
            <WifiOff className="h-3.5 w-3.5 shrink-0" />
            اتصال اینترنت قطع است. ارسال مجدد پیام تکراری نمی‌سازد.
          </span>
          <button
            type="button"
            onClick={() => {
              setSimulatedOffline(false);
              if (pendingRetryPayload) {
                void sendMessage(pendingRetryPayload.body, pendingRetryPayload.clientMessageId);
              }
            }}
            className="font-semibold underline whitespace-nowrap"
          >
            اتصال مجدد
          </button>
        </div>
      )}

      {!cfg.isWithinWorkingHours && (
        <div className="border-b border-slate-200 bg-slate-50 px-3.5 py-2 text-xs text-slate-600">
          {cfg.offlineMessage}
        </div>
      )}

      {error && (
        <div className="flex items-center justify-between gap-2 border-b border-red-200 bg-red-50 px-3.5 py-2 text-xs text-red-700">
          <span>{error}</span>
          {pendingRetryPayload && !simulatedOffline && (
            <button
              type="button"
              onClick={() => sendMessage(pendingRetryPayload.body, pendingRetryPayload.clientMessageId)}
              className="flex items-center gap-1 font-semibold underline shrink-0"
            >
              <RefreshCw className="h-3 w-3" />
              تلاش مجدد
            </button>
          )}
        </div>
      )}

      {/* Body: Pre-chat form OR live chat stream */}
      {!started ? (
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          <p className="text-sm leading-6 text-slate-700">{cfg.welcomeMessage}</p>

          <div className="space-y-3">
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-700">نام شما</label>
              <input
                type="text"
                value={visitorName}
                onChange={(e) => setVisitorName(e.target.value)}
                placeholder="مثلاً علی محمدی"
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-blue-600 focus:outline-none"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-700">شماره تماس یا ایمیل (اختیاری)</label>
              <input
                type="text"
                value={visitorContact}
                onChange={(e) => setVisitorContact(e.target.value)}
                placeholder="0912... یا email@example.ir"
                className="ltr w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-left focus:border-blue-600 focus:outline-none"
              />
            </div>
            {session.departments.length > 0 && (
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-700">انتخاب دپارتمان</label>
                <select
                  value={selectedDepId}
                  onChange={(e) => setSelectedDepId(e.target.value)}
                  className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm focus:border-blue-600 focus:outline-none"
                >
                  {session.departments.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.name} ({d.workingHours})
                    </option>
                  ))}
                </select>
              </div>
            )}
          </div>

          <button
            type="button"
            onClick={() => setStarted(true)}
            className="w-full rounded-lg px-4 py-2.5 text-sm font-semibold text-white transition-opacity hover:opacity-95"
            style={{ backgroundColor: accent }}
          >
            شروع گفتگو
          </button>

          {isInstallTest && (
            <button
              type="button"
              onClick={() => {
                setVisitorName('تست نصب مدیر سایت');
                void sendMessage('سلام! این یک پیام آزمایشی برای بررسی اتصال ویجت به مرکز پاسخگویی است.');
              }}
              className="w-full rounded-lg border border-slate-300 px-4 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50 transition-colors"
            >
              ارسال سریع پیام آزمایشی نصب
            </button>
          )}
        </div>
      ) : (
        <>
          {/* Queue / ticket subbar */}
          <div className="flex items-center justify-between border-b border-slate-100 bg-slate-50/80 px-3.5 py-2 text-xs text-slate-600">
            <span>
              {session.conversation
                ? `شماره گفتگو: ${session.conversation.ticketNumber} · وضعیت: ${
                    session.conversation.status === 'queued' || session.conversation.status === 'new'
                      ? 'در انتظار صف پاسخگویی'
                      : 'در حال گفتگو'
                  }`
                : 'آماده ارسال اولین پیام'}
            </span>
            {session.conversation && !ratingSaved && (
              <button
                type="button"
                onClick={() => setShowRating((v) => !v)}
                className="font-medium text-blue-700 hover:underline whitespace-nowrap"
              >
                ثبت امتیاز
              </button>
            )}
          </div>

          {/* Messages */}
          <div className="flex-1 overflow-y-auto p-3.5 space-y-3 bg-slate-50/40">
            {messages.length === 0 && (
              <div className="rounded-lg border border-slate-200 bg-white p-3 text-xs leading-6 text-slate-600">
                {cfg.welcomeMessage}
              </div>
            )}
            {messages.map((m) => {
              const isVisitor = m.senderType === 'visitor';
              return (
                <div
                  key={m.id}
                  className={`flex flex-col ${isVisitor ? 'items-start' : 'items-end'}`}
                >
                  <div
                    className={`max-w-[85%] rounded-xl px-3.5 py-2.5 text-sm leading-6 ${
                      isVisitor
                        ? 'text-white'
                        : m.senderType === 'system'
                        ? 'border border-amber-200 bg-amber-50 text-amber-950'
                        : 'border border-slate-200 bg-white text-slate-900'
                    }`}
                    style={isVisitor ? { backgroundColor: accent } : undefined}
                  >
                    <div className={`mb-1 text-[11px] ${isVisitor ? 'text-white/75' : 'text-slate-500'}`}>
                      {m.senderName}
                    </div>
                    <p className="whitespace-pre-wrap break-words">{m.body}</p>
                    {m.attachments && m.attachments.length > 0 && (
                      <div className="mt-2 space-y-1 border-t border-white/20 pt-1.5 text-xs">
                        {m.attachments.map((att) => (
                          <div key={att.id} className="flex items-center gap-1.5">
                            <Paperclip className="h-3.5 w-3.5 shrink-0" />
                            <span className="truncate">{att.originalName}</span>
                            <span className="opacity-80">
                              ({att.scanStatus === 'clean' ? 'تأیید امنیتی' : 'قرنطینه'})
                            </span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                  <div className="mt-1 flex items-center gap-1 text-[11px] text-slate-400 tabular-nums">
                    <span>{formatFaDateTime(m.createdAt)}</span>
                    {isVisitor && <CheckCheck className="h-3 w-3 text-blue-600" />}
                  </div>
                </div>
              );
            })}

            {operatorTyping && (
              <div className="flex justify-end">
                <div className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs text-slate-500">
                  در حال نوشتن پاسخ...
                </div>
              </div>
            )}

            {showRating && (
              <form
                onSubmit={submitRating}
                className="rounded-xl border border-slate-200 bg-white p-3.5 space-y-2.5"
              >
                <div className="text-xs font-semibold text-slate-800">
                  به کیفیت پاسخگویی این گفتگو امتیاز دهید
                </div>
                <div className="flex items-center gap-1">
                  {[1, 2, 3, 4, 5].map((star) => (
                    <button
                      key={star}
                      type="button"
                      onClick={() => setRatingVal(star)}
                      className="p-1"
                    >
                      <Star
                        className={`h-5 w-5 ${
                          star <= ratingVal ? 'fill-amber-400 text-amber-400' : 'text-slate-300'
                        }`}
                      />
                    </button>
                  ))}
                </div>
                <input
                  type="text"
                  value={ratingComment}
                  onChange={(e) => setRatingComment(e.target.value)}
                  placeholder="نظر کوتاه شما (اختیاری)"
                  className="w-full rounded-lg border border-slate-200 px-3 py-1.5 text-xs focus:border-blue-600 focus:outline-none"
                />
                <div className="flex items-center gap-2">
                  <button
                    type="submit"
                    className="rounded-lg bg-slate-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-slate-800"
                  >
                    ثبت امتیاز
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowRating(false)}
                    className="text-xs text-slate-500 hover:text-slate-800"
                  >
                    انصراف
                  </button>
                </div>
              </form>
            )}

            {ratingSaved && (
              <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-800">
                سپاس از شما؛ امتیاز گفتگو با موفقیت ثبت شد.
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>

          {/* Input composer */}
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void sendMessage();
            }}
            className="flex items-center gap-2 border-t border-slate-200 bg-white p-2.5"
          >
            <input
              ref={fileInputRef}
              type="file"
              onChange={handleFileUpload}
              className="hidden"
              accept=".jpg,.jpeg,.png,.webp,.pdf,.txt,.csv"
            />
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading}
              title="پیوست فایل یا رسید"
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 disabled:opacity-50"
            >
              <Paperclip className="h-4 w-4" />
            </button>
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder={uploading ? 'در حال بررسی و بارگذاری فایل...' : 'پیام خود را بنویسید...'}
              className="min-w-0 flex-1 rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-blue-600 focus:outline-none"
            />
            <button
              type="submit"
              disabled={sending || !input.trim()}
              className="flex h-10 shrink-0 items-center justify-center gap-1 rounded-lg px-3.5 text-sm font-medium text-white disabled:opacity-50"
              style={{ backgroundColor: accent }}
            >
              <Send className="h-4 w-4" />
            </button>
          </form>
        </>
      )}
    </div>
  );
};
