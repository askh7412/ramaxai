import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Archive,
  Check,
  ChevronDown,
  Copy,
  Edit3,
  Menu,
  Paperclip,
  Plus,
  RefreshCw,
  Search,
  Send,
  Square,
  Trash2,
  X,
} from 'lucide-react';
import { apiFetch, formatFaDateTime, formatFaNumber, navigateTo } from '../lib/api';
import type {
  AiChatMessage,
  AiChatThread,
  PublicModelInfo,
  SessionUser,
  TrialQuotaStatus,
} from '../shared/types';

interface AiChatPageProps {
  user: SessionUser | null;
}

/**
 * Renders markdown-lite text with clean LTR code blocks and copy buttons.
 */
const MessageContent: React.FC<{ content: string }> = ({ content }) => {
  const [copiedIdx, setCopiedIdx] = useState<number | null>(null);
  const parts = content.split(/(```[\s\S]*?```)/g);

  return (
    <div className="space-y-3 text-sm leading-7 text-slate-800">
      {parts.map((part, idx) => {
        if (part.startsWith('```') && part.endsWith('```')) {
          const inner = part.slice(3, -3);
          const firstNewline = inner.indexOf('\n');
          const lang = firstNewline > -1 ? inner.slice(0, firstNewline).trim() : 'code';
          const code = firstNewline > -1 ? inner.slice(firstNewline + 1) : inner;
          return (
            <div key={idx} className="overflow-hidden rounded-lg border border-slate-200 bg-slate-950 text-slate-100">
              <div className="flex items-center justify-between border-b border-slate-800 px-3 py-1.5 text-[11px] text-slate-400">
                <span className="font-mono ltr">{lang || 'code'}</span>
                <button
                  type="button"
                  onClick={() => {
                    navigator.clipboard?.writeText(code);
                    setCopiedIdx(idx);
                    window.setTimeout(() => setCopiedIdx(null), 1500);
                  }}
                  className="inline-flex items-center gap-1 text-slate-200 hover:text-white"
                >
                  {copiedIdx === idx ? <Check className="h-3.5 w-3.5 text-emerald-400" /> : <Copy className="h-3.5 w-3.5" />}
                  <span>{copiedIdx === idx ? 'کپی شد' : 'کپی'}</span>
                </button>
              </div>
              <pre className="ltr overflow-x-auto p-3.5 text-left text-xs leading-6 font-mono text-slate-100">
                <code>{code}</code>
              </pre>
            </div>
          );
        }
        return (
          <p key={idx} className="whitespace-pre-wrap break-words">
            {part}
          </p>
        );
      })}
    </div>
  );
};

export const AiChatPage: React.FC<AiChatPageProps> = ({ user }) => {
  const [models, setModels] = useState<PublicModelInfo[]>([]);
  const [quota, setQuota] = useState<TrialQuotaStatus | null>(null);
  const [threads, setThreads] = useState<AiChatThread[]>([]);
  const [activeThreadId, setActiveThreadId] = useState<string | null>(null);
  const [selectedModelId, setSelectedModelId] = useState<string>('ramax-fast');
  const [modelPickerOpen, setModelPickerOpen] = useState(false);

  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [showArchived, setShowArchived] = useState(false);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameText, setRenameText] = useState('');

  const [input, setInput] = useState('');
  const [attachment, setAttachment] = useState<{
    name: string;
    mimeType: string;
    base64Data: string;
  } | null>(null);
  const [streaming, setStreaming] = useState(false);
  const [streamingText, setStreamingText] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [copiedMsgId, setCopiedMsgId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const abortRef = useRef<AbortController | null>(null);
  const endRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!user) {
      setLoading(false);
      return;
    }
    setLoading(true);
    apiFetch<{ models: PublicModelInfo[]; quota: TrialQuotaStatus; threads: AiChatThread[] }>(
      '/api/ai/bootstrap'
    )
      .then((res) => {
        setModels(res.models);
        setQuota(res.quota);
        setThreads(res.threads);
        if (res.threads.length > 0) {
          setActiveThreadId(res.threads[0].id);
          setSelectedModelId(res.threads[0].modelId || 'ramax-fast');
        }
      })
      .catch((err) => setError(err instanceof Error ? err.message : 'خطا در بارگذاری محیط AI'))
      .finally(() => setLoading(false));
  }, [user]);

  const activeThread = useMemo(
    () => threads.find((t) => t.id === activeThreadId) || null,
    [threads, activeThreadId]
  );

  const selectedModel = useMemo(
    () => models.find((m) => m.id === selectedModelId) || models[0] || null,
    [models, selectedModelId]
  );

  const filteredThreads = useMemo(() => {
    return threads.filter((t) => {
      if (t.archived !== showArchived) return false;
      if (searchQuery.trim() && !t.title.toLowerCase().includes(searchQuery.trim().toLowerCase())) {
        return false;
      }
      return true;
    });
  }, [threads, showArchived, searchQuery]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [activeThread?.messages.length, streamingText]);

  async function createNewThread(modelOverride?: string): Promise<AiChatThread | null> {
    try {
      const res = await apiFetch<{ thread: AiChatThread }>('/api/ai/threads', {
        method: 'POST',
        body: JSON.stringify({ title: 'گفتگوی جدید', modelId: modelOverride || selectedModelId }),
      });
      setThreads((prev) => [res.thread, ...prev]);
      setActiveThreadId(res.thread.id);
      setSidebarOpen(false);
      return res.thread;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'خطا در ساخت گفتگوی جدید');
      return null;
    }
  }

  async function saveRename(threadId: string) {
    if (!renameText.trim()) {
      setRenamingId(null);
      return;
    }
    try {
      const res = await apiFetch<{ thread: AiChatThread }>(`/api/ai/threads/${threadId}`, {
        method: 'PATCH',
        body: JSON.stringify({ title: renameText.trim() }),
      });
      setThreads((prev) => prev.map((t) => (t.id === threadId ? res.thread : t)));
    } finally {
      setRenamingId(null);
    }
  }

  async function toggleArchive(thread: AiChatThread) {
    const res = await apiFetch<{ thread: AiChatThread }>(`/api/ai/threads/${thread.id}`, {
      method: 'PATCH',
      body: JSON.stringify({ archived: !thread.archived }),
    });
    setThreads((prev) => prev.map((t) => (t.id === thread.id ? res.thread : t)));
  }

  async function deleteThread(threadId: string) {
    await apiFetch(`/api/ai/threads/${threadId}`, { method: 'DELETE' });
    setThreads((prev) => prev.filter((t) => t.id !== threadId));
    if (activeThreadId === threadId) setActiveThreadId(null);
  }

  function handleAttachFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) {
      setError('حداکثر حجم فایل پیوست ۵ مگابایت است.');
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const result = String(reader.result || '');
      const base64Data = result.includes(',') ? result.split(',')[1] : result;
      setAttachment({
        name: file.name,
        mimeType: file.type || 'application/octet-stream',
        base64Data,
      });
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  }

  async function sendPrompt(promptOverride?: string) {
    const text = (promptOverride ?? input).trim();
    if (!text || streaming) return;
    setError(null);

    if (selectedModel && (!selectedModel.pipelineReady || !selectedModel.enabled)) {
      setError(
        selectedModel.pipelineNoteFa ||
          'این مدل در حال حاضر به سرویس پردازش واقعی متصل نیست. لطفاً یکی از مدل‌های فعال متنی/سندخوان/تصویرخوان را انتخاب کنید.'
      );
      return;
    }

    let targetThread = activeThread;
    if (!targetThread) {
      targetThread = await createNewThread(selectedModelId);
      if (!targetThread) return;
    }

    const currentAttachment = attachment;
    if (!promptOverride) {
      setInput('');
      setAttachment(null);
    }

    // Optimistically display user message
    const tempUserMsg: AiChatMessage = {
      id: `tmp_u_${Date.now()}`,
      role: 'user',
      content: text,
      attachmentName: currentAttachment?.name,
      attachmentMime: currentAttachment?.mimeType,
      createdAt: new Date().toISOString(),
    };

    const threadId = targetThread.id;
    setThreads((prev) =>
      prev.map((t) =>
        t.id === threadId
          ? {
              ...t,
              title: t.messages.length === 0 ? text.slice(0, 42) : t.title,
              modelId: selectedModelId,
              messages: [...t.messages, tempUserMsg],
            }
          : t
      )
    );

    setStreaming(true);
    setStreamingText('');
    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const res = await fetch(`/api/ai/threads/${threadId}/stream`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          content: text,
          modelId: selectedModelId,
          attachment: currentAttachment,
        }),
        signal: controller.signal,
      });

      if (!res.ok) {
        const errBody = await res.json().catch(() => ({}));
        throw new Error(errBody.message || `خطای سرور (کد ${res.status})`);
      }

      const reader = res.body?.getReader();
      if (!reader) throw new Error('پاسخ استریم در دسترس نیست.');

      const decoder = new TextDecoder('utf-8');
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const events = buffer.split('\n\n');
        buffer = events.pop() || '';

        for (const ev of events) {
          const line = ev.trim();
          if (!line.startsWith('data:')) continue;
          const payload = JSON.parse(line.slice(5).trim());
          if (payload.type === 'chunk') {
            setStreamingText((prev) => prev + payload.text);
          } else if (payload.type === 'done') {
            if (payload.quota) setQuota(payload.quota);
            setThreads((prev) =>
              prev.map((t) =>
                t.id === threadId
                  ? { ...t, messages: [...t.messages, payload.message as AiChatMessage] }
                  : t
              )
            );
            setStreamingText('');
          } else if (payload.type === 'error') {
            if (payload.quota) setQuota(payload.quota);
            setError(payload.error || 'خطای ارتباط با مدل؛ سهمیه رزروشده آزاد شد.');
          }
        }
      }
    } catch (err) {
      if ((err as Error).name !== 'AbortError') {
        setError(err instanceof Error ? err.message : 'خطا در ارسال پیام.');
      }
    } finally {
      setStreaming(false);
      setStreamingText('');
      abortRef.current = null;
    }
  }

  function stopStreaming() {
    abortRef.current?.abort();
    setStreaming(false);
  }

  if (!user) {
    return (
      <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center p-6 text-center">
        <div className="max-w-md rounded-xl border border-slate-200 bg-white p-8 space-y-4">
          <div className="text-lg font-extrabold text-slate-950">راماکس AI</div>
          <h1 className="text-xl font-bold text-slate-900">ورود برای استفاده از محیط گفتگوی هوش مصنوعی</h1>
          <p className="text-sm leading-7 text-slate-600">
            با ساخت حساب کاربری، دوره آزمایشی ۱۴ روزه با سهمیه روزانه ۲۰ پیام متنی مستقل از فعالسازی حساب تجاری برای
            شما فعال می‌شود.
          </p>
          <div className="flex flex-wrap justify-center gap-3 pt-2">
            <button
              type="button"
              onClick={() => navigateTo('/login')}
              className="rounded-lg bg-blue-700 px-5 py-2.5 text-sm font-semibold text-white hover:bg-blue-800"
            >
              ورود به حساب
            </button>
            <button
              type="button"
              onClick={() => navigateTo('/register')}
              className="rounded-lg border border-slate-300 px-5 py-2.5 text-sm font-medium text-slate-800 hover:bg-slate-50"
            >
              ثبت‌نام رایگان
            </button>
          </div>
        </div>
      </div>
    );
  }

  const canAttach = Boolean(
    selectedModel && (selectedModel.inputTypes.includes('image') || selectedModel.inputTypes.includes('document'))
  );
  const trialExpiredReadOnly = Boolean(quota?.trialExpired && !quota?.hasCommercialAccess);

  return (
    <div className="flex h-screen overflow-hidden bg-white text-slate-900">
      {/* Sidebar Overlay for Mobile */}
      {sidebarOpen && (
        <div
          onClick={() => setSidebarOpen(false)}
          className="fixed inset-0 z-30 bg-slate-950/30 lg:hidden"
        />
      )}

      {/* Calm RTL Sidebar */}
      <aside
        className={`fixed inset-y-0 right-0 z-40 flex w-72 flex-col border-l border-slate-200 bg-slate-50 transition-transform lg:static lg:translate-x-0 ${
          sidebarOpen ? 'translate-x-0' : 'translate-x-full'
        }`}
      >
        <div className="flex h-14 items-center justify-between border-b border-slate-200 px-4">
          <button
            type="button"
            onClick={() => navigateTo('/')}
            className="text-base font-extrabold text-slate-950"
          >
            راماکس AI
          </button>
          <button
            type="button"
            onClick={() => void createNewThread()}
            className="inline-flex items-center gap-1 rounded-lg bg-slate-950 px-2.5 py-1.5 text-xs font-semibold text-white hover:bg-slate-800"
          >
            <Plus className="h-3.5 w-3.5" />
            گفتگوی جدید
          </button>
        </div>

        {/* Search & Archive Filter */}
        <div className="p-3 space-y-2 border-b border-slate-200">
          <div className="relative">
            <Search className="pointer-events-none absolute right-2.5 top-2.5 h-3.5 w-3.5 text-slate-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="جستجو در گفتگوها..."
              className="w-full rounded-lg border border-slate-200 bg-white py-1.5 pr-8 pl-3 text-xs focus:border-blue-600 focus:outline-none"
            />
          </div>
          <div className="flex items-center gap-1 rounded-lg bg-slate-200/70 p-0.5 text-[11px]">
            <button
              type="button"
              onClick={() => setShowArchived(false)}
              className={`flex-1 rounded-md py-1 font-medium ${
                !showArchived ? 'bg-white text-slate-950 shadow-sm' : 'text-slate-600'
              }`}
            >
              فعال
            </button>
            <button
              type="button"
              onClick={() => setShowArchived(true)}
              className={`flex-1 rounded-md py-1 font-medium ${
                showArchived ? 'bg-white text-slate-950 shadow-sm' : 'text-slate-600'
              }`}
            >
              بایگانی
            </button>
          </div>
        </div>

        {/* Thread list */}
        <div className="flex-1 overflow-y-auto p-2 space-y-1">
          {filteredThreads.length === 0 && (
            <div className="p-4 text-center text-xs text-slate-400">
              {showArchived ? 'گفتگوی بایگانی‌شده‌ای وجود ندارد.' : 'هنوز گفتگویی ثبت نشده است.'}
            </div>
          )}
          {filteredThreads.map((t) => {
            const isActive = t.id === activeThreadId;
            return (
              <div
                key={t.id}
                className={`group flex items-center justify-between gap-1 rounded-lg px-2.5 py-2 text-xs transition-colors ${
                  isActive ? 'bg-white text-slate-950 font-semibold border border-slate-200' : 'text-slate-700 hover:bg-slate-200/50'
                }`}
              >
                {renamingId === t.id ? (
                  <form
                    onSubmit={(e) => {
                      e.preventDefault();
                      void saveRename(t.id);
                    }}
                    className="flex flex-1 items-center gap-1"
                  >
                    <input
                      type="text"
                      autoFocus
                      value={renameText}
                      onChange={(e) => setRenameText(e.target.value)}
                      onBlur={() => void saveRename(t.id)}
                      className="min-w-0 flex-1 rounded border border-blue-500 bg-white px-1.5 py-0.5 text-xs"
                    />
                  </form>
                ) : (
                  <button
                    type="button"
                    onClick={() => {
                      setActiveThreadId(t.id);
                      setSelectedModelId(t.modelId || 'ramax-fast');
                      setSidebarOpen(false);
                    }}
                    className="min-w-0 flex-1 truncate text-right"
                  >
                    {t.title}
                  </button>
                )}
                <div className="flex items-center gap-0.5 opacity-70 group-hover:opacity-100 shrink-0">
                  <button
                    type="button"
                    title="تغییر نام"
                    onClick={() => {
                      setRenamingId(t.id);
                      setRenameText(t.title);
                    }}
                    className="rounded p-1 hover:bg-slate-200"
                  >
                    <Edit3 className="h-3 w-3" />
                  </button>
                  <button
                    type="button"
                    title={t.archived ? 'خروج از بایگانی' : 'بایگانی'}
                    onClick={() => void toggleArchive(t)}
                    className="rounded p-1 hover:bg-slate-200"
                  >
                    <Archive className="h-3 w-3" />
                  </button>
                  <button
                    type="button"
                    title="حذف"
                    onClick={() => void deleteThread(t.id)}
                    className="rounded p-1 text-red-600 hover:bg-red-50"
                  >
                    <Trash2 className="h-3 w-3" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>

        {/* Trial & Quota Status Box */}
        {quota && (
          <div className="border-t border-slate-200 bg-white p-3.5 space-y-2 text-xs">
            <div className="flex items-center justify-between font-semibold text-slate-900">
              <span>دوره آزمایشی چت AI</span>
              <span className="tabular-nums text-blue-700">
                {quota.trialExpired ? 'پایان‌یافته' : `${formatFaNumber(quota.daysRemaining)} روز باقیمانده`}
              </span>
            </div>
            <div className="space-y-1 text-[11px] text-slate-600 tabular-nums">
              <div className="flex justify-between">
                <span>پیام متنی امروز</span>
                <span>
                  {formatFaNumber(quota.dailyTextUsed)} از {formatFaNumber(quota.dailyTextLimit)}
                </span>
              </div>
              <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-100">
                <div
                  className="h-full bg-blue-700 transition-all"
                  style={{
                    width: `${Math.min(100, (quota.dailyTextUsed / Math.max(1, quota.dailyTextLimit)) * 100)}%`,
                  }}
                />
              </div>
              <div className="flex justify-between pt-1">
                <span>عملیات تصویری امروز</span>
                <span>
                  {formatFaNumber(quota.dailyImageUsed)} از {formatFaNumber(quota.dailyImageLimit)}
                </span>
              </div>
              <div className="text-[10px] text-slate-400 pt-1">
                شارژ مجدد سهمیه: {formatFaDateTime(quota.nextResetAt)}
              </div>
            </div>
            <button
              type="button"
              onClick={() => navigateTo('/panel')}
              className="w-full rounded-lg border border-slate-200 py-1.5 text-center text-[11px] font-medium text-slate-700 hover:bg-slate-50"
            >
              ورود به پنل تجاری سایت‌ها
            </button>
          </div>
        )}
      </aside>

      {/* Main Focused Conversation Area */}
      <div className="flex min-w-0 flex-1 flex-col">
        {/* Minimal Top Header */}
        <header className="flex h-14 items-center justify-between gap-3 border-b border-slate-200 bg-white px-4">
          <div className="flex items-center gap-2 min-w-0">
            <button
              type="button"
              onClick={() => setSidebarOpen(true)}
              aria-label="باز کردن فهرست گفتگوها"
              className="rounded-lg border border-slate-200 p-2 text-slate-700 lg:hidden"
            >
              <Menu className="h-4 w-4" />
            </button>

            {/* Categorized Model Selector */}
            <div className="relative">
              <button
                type="button"
                onClick={() => setModelPickerOpen((v) => !v)}
                className="flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-semibold text-slate-900 hover:bg-slate-100 whitespace-nowrap"
              >
                <span>
                  {selectedModel ? `${selectedModel.icon} ${selectedModel.publicName}` : 'انتخاب مدل راماکس'}
                </span>
                <span className="text-slate-400 font-normal hidden sm:inline">
                  · {selectedModel?.pricingTierFa}
                </span>
                <ChevronDown className="h-3.5 w-3.5 text-slate-500" />
              </button>

              {modelPickerOpen && (
                <div className="absolute right-0 top-11 z-50 w-[340px] max-w-[calc(100vw-2rem)] rounded-xl border border-slate-200 bg-white p-2 shadow-xl">
                  <div className="px-2.5 py-1.5 text-[11px] font-semibold text-slate-500">
                    انتخاب مدل بر اساس عملکرد (بدون نمایش نام تأمین‌کننده)
                  </div>
                  <div className="max-h-96 overflow-y-auto divide-y divide-slate-100">
                    {models.map((m) => (
                      <button
                        key={m.id}
                        type="button"
                        onClick={() => {
                          setSelectedModelId(m.id);
                          setModelPickerOpen(false);
                        }}
                        className={`w-full rounded-lg p-2.5 text-right transition-colors ${
                          m.id === selectedModelId ? 'bg-blue-50/70' : 'hover:bg-slate-50'
                        }`}
                      >
                        <div className="flex items-center justify-between gap-2 text-xs">
                          <span className="font-bold text-slate-950">
                            {m.icon} {m.publicName}
                          </span>
                          <span className="text-[11px] text-slate-500">
                            {m.pricingTierFa} · {m.quotaType === 'text' ? 'سهمیه متنی' : 'سهمیه تصویری'}
                          </span>
                        </div>
                        <p className="mt-1 text-[11px] leading-5 text-slate-600">{m.descriptionFa}</p>
                        <div className="mt-1.5 flex flex-wrap items-center gap-2 text-[10px]">
                          <span className="text-slate-500">ورودی: {m.inputTypes.join(' / ')}</span>
                          <span className="text-slate-300">·</span>
                          {m.pipelineReady && m.enabled ? (
                            <span className="font-medium text-emerald-700">فعال</span>
                          ) : (
                            <span className="font-medium text-amber-700">نیازمند اتصال سرویس تصویر</span>
                          )}
                        </div>
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>

          <div className="flex items-center gap-3 text-xs text-slate-500 shrink-0">
            <span className="hidden sm:inline">{user.name}</span>
            <button
              type="button"
              onClick={() => navigateTo('/panel')}
              className="rounded-lg border border-slate-200 px-3 py-1.5 font-medium text-slate-700 hover:bg-slate-50 whitespace-nowrap"
            >
              پنل مشتری
            </button>
          </div>
        </header>

        {/* Conversation Stream */}
        <div className="flex-1 overflow-y-auto px-4 py-6">
          <div className="mx-auto max-w-3xl space-y-6">
            {loading && <div className="text-center text-sm text-slate-400">در حال بارگذاری...</div>}

            {!loading && (!activeThread || activeThread.messages.length === 0) && (
              <div className="py-12 text-center space-y-5">
                <h1 className="text-2xl font-bold text-slate-950">چطور می‌توانم کمکتان کنم؟</h1>
                <p className="mx-auto max-w-md text-sm leading-7 text-slate-500">
                  مدل مناسب کارتان را از بالای صفحه انتخاب کنید. در مدل‌های «سندخوان» و «تصویرخوان» می‌توانید فایل یا
                  تصویر پیوست کنید.
                </p>
                <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 text-right">
                  {[
                    'یک متن معرفی فروشگاهی حرفه‌ای برای دستگاه قهوه‌ساز با تمرکز بر گارانتی بنویس.',
                    'سه قانون اتوماسیون کاربردی برای کاهش زمان پاسخگویی پشتیبانی یک فروشگاه آنلاین پیشنهاد بده.',
                    'یک نمونه کد Webhook Signature با HMAC-SHA256 در TypeScript بنویس.',
                    'چک‌لیست بررسی قرارداد فروش سازمانی تجهیزات اداری را خلاصه کن.',
                  ].map((prompt) => (
                    <button
                      key={prompt}
                      type="button"
                      onClick={() => void sendPrompt(prompt)}
                      className="rounded-xl border border-slate-200 p-3.5 text-xs leading-6 text-slate-700 hover:border-blue-400 hover:bg-slate-50 transition-colors text-right"
                    >
                      {prompt}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {activeThread?.messages.map((msg) => (
              <div
                key={msg.id}
                className={`flex flex-col ${msg.role === 'user' ? 'items-start' : 'items-stretch'}`}
              >
                {msg.role === 'user' ? (
                  <div className="max-w-[85%] rounded-2xl bg-slate-100 px-4 py-3 text-sm leading-7 text-slate-900">
                    {msg.attachmentName && (
                      <div className="mb-1.5 flex items-center gap-1.5 text-xs text-blue-700">
                        <Paperclip className="h-3.5 w-3.5" />
                        <span>{msg.attachmentName}</span>
                      </div>
                    )}
                    <p className="whitespace-pre-wrap break-words">{msg.content}</p>
                  </div>
                ) : (
                  <div className="border-b border-slate-100 pb-5 space-y-2.5">
                    <div className="flex items-center justify-between text-xs text-slate-500">
                      <span className="font-semibold text-slate-900">
                        {msg.modelPublicName || 'راماکس'}
                      </span>
                      <div className="flex items-center gap-2">
                        {msg.tokensEstimate && (
                          <span className="tabular-nums text-[11px] text-slate-400">
                            ~{formatFaNumber(msg.tokensEstimate)} توکن
                          </span>
                        )}
                        <button
                          type="button"
                          onClick={() => {
                            navigator.clipboard?.writeText(msg.content);
                            setCopiedMsgId(msg.id);
                            window.setTimeout(() => setCopiedMsgId(null), 1500);
                          }}
                          className="inline-flex items-center gap-1 rounded px-2 py-0.5 hover:bg-slate-100"
                        >
                          {copiedMsgId === msg.id ? (
                            <Check className="h-3.5 w-3.5 text-emerald-600" />
                          ) : (
                            <Copy className="h-3.5 w-3.5" />
                          )}
                          <span>{copiedMsgId === msg.id ? 'کپی شد' : 'کپی متن'}</span>
                        </button>
                      </div>
                    </div>
                    <MessageContent content={msg.content} />
                  </div>
                )}
              </div>
            ))}

            {streaming && (
              <div className="border-b border-slate-100 pb-5 space-y-2">
                <div className="text-xs font-semibold text-blue-700">
                  {selectedModel?.icon} {selectedModel?.publicName} · در حال دریافت پاسخ...
                </div>
                {streamingText ? (
                  <MessageContent content={streamingText} />
                ) : (
                  <div className="text-xs text-slate-400">در حال پردازش درخواست شما...</div>
                )}
              </div>
            )}

            {error && (
              <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-red-200 bg-red-50 p-3.5 text-xs text-red-800">
                <span>{error}</span>
                {activeThread && activeThread.messages.length > 0 && (
                  <button
                    type="button"
                    onClick={() => {
                      const lastUser = [...activeThread.messages].reverse().find((m) => m.role === 'user');
                      if (lastUser) void sendPrompt(lastUser.content);
                    }}
                    className="inline-flex items-center gap-1 font-semibold underline"
                  >
                    <RefreshCw className="h-3.5 w-3.5" />
                    تلاش مجدد
                  </button>
                )}
              </div>
            )}

            <div ref={endRef} />
          </div>
        </div>

        {/* Bottom Composer */}
        <div className="border-t border-slate-200 bg-white px-4 py-3">
          <div className="mx-auto max-w-3xl space-y-2">
            {trialExpiredReadOnly && (
              <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-950">
                دوره آزمایشی ۱۴ روزه شما به پایان رسیده است. تاریخچه گفتگوهای قبلی همچنان قابل مشاهده است؛ برای ارسال
                پیام جدید حساب تجاری خود را فعال نمایید.
              </div>
            )}

            {selectedModel && !selectedModel.pipelineReady && (
              <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-950">
                {selectedModel.pipelineNoteFa}
              </div>
            )}

            {attachment && (
              <div className="flex items-center justify-between rounded-lg border border-blue-200 bg-blue-50 px-3 py-1.5 text-xs text-blue-900">
                <span className="flex items-center gap-1.5 truncate">
                  <Paperclip className="h-3.5 w-3.5 shrink-0" />
                  <span className="truncate">{attachment.name}</span>
                </span>
                <button type="button" onClick={() => setAttachment(null)} className="p-0.5 hover:text-red-700">
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            )}

            <form
              onSubmit={(e) => {
                e.preventDefault();
                void sendPrompt();
              }}
              className="flex items-end gap-2 rounded-xl border border-slate-300 bg-white p-2 focus-within:border-blue-600"
            >
              <input
                ref={fileRef}
                type="file"
                onChange={handleAttachFile}
                className="hidden"
                accept={
                  selectedModel?.inputTypes.includes('image')
                    ? 'image/*'
                    : '.pdf,.txt,.csv,.md'
                }
              />
              <button
                type="button"
                disabled={!canAttach || streaming || trialExpiredReadOnly}
                onClick={() => fileRef.current?.click()}
                title={
                  canAttach
                    ? 'پیوست تصویر یا سند'
                    : 'برای پیوست فایل، مدل «راماکس سندخوان» یا «راماکس تصویرخوان» را انتخاب کنید'
                }
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-slate-600 hover:bg-slate-100 disabled:opacity-35"
              >
                <Paperclip className="h-4 w-4" />
              </button>

              <textarea
                rows={1}
                disabled={trialExpiredReadOnly}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    void sendPrompt();
                  }
                }}
                placeholder="پیام خود را برای راماکس بنویسید..."
                className="max-h-36 min-h-[40px] flex-1 resize-none bg-transparent py-2 text-sm focus:outline-none disabled:opacity-50"
              />

              {streaming ? (
                <button
                  type="button"
                  onClick={stopStreaming}
                  className="flex h-10 shrink-0 items-center gap-1.5 rounded-lg bg-red-600 px-3.5 text-xs font-semibold text-white hover:bg-red-700"
                >
                  <Square className="h-3.5 w-3.5" />
                  توقف
                </button>
              ) : (
                <button
                  type="submit"
                  disabled={!input.trim() || trialExpiredReadOnly || !selectedModel?.pipelineReady}
                  className="flex h-10 shrink-0 items-center gap-1.5 rounded-lg bg-blue-700 px-4 text-xs font-semibold text-white hover:bg-blue-800 disabled:opacity-40"
                >
                  <Send className="h-3.5 w-3.5" />
                  ارسال
                </button>
              )}
            </form>
          </div>
        </div>
      </div>
    </div>
  );
};
