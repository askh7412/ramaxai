import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  Archive,
  BookOpen,
  Download,
  FileText,
  Lock,
  Paperclip,
  RotateCcw,
  Search,
  Send,
  Sparkles,
  UserCheck,
} from 'lucide-react';
import {
  apiFetch,
  CONV_STATUS_LABELS_FA,
  formatFaDateTime,
  PRIORITY_LABELS_FA,
} from '../lib/api';
import type {
  ConversationRecord,
  ConversationStatus,
  DepartmentRecord,
  ReplyMode,
  SessionUser,
} from '../shared/types';

interface SupportCommandCenterProps {
  siteId: string;
  currentUser: SessionUser;
  onCreateContractFromConv: (conv: ConversationRecord) => void;
}

const CANNED_RESPONSES = [
  {
    title: 'پیگیری کد رهگیری ارسال',
    text: 'سلام وقت شما بخیر. سفارش شما بررسی شد و در صف تحویل به باربری قرار دارد؛ کد رهگیری به محض صدور همینجا ارسال می‌شود.',
  },
  {
    title: 'درخواست ارسال رسید واریز',
    text: 'لطفاً تصویر واضح رسید واریز یا شماره پیگیری بانکی را از طریق دکمه پیوست همین گفتگو ارسال فرمایید تا همکاران مالی بررسی کنند.',
  },
  {
    title: 'آماده‌سازی پیش‌نویس قرارداد',
    text: 'مشخصات درخواست شما ثبت شد. پیش‌نویس قرارداد رسمی آماده و پس از تأیید مدیر برای شما ارسال می‌گردد.',
  },
];

const KB_ARTICLES = [
  {
    title: 'سیاست گارانتی ۱۸ ماهه و عودت کالا',
    snippet: 'کالاهای دارای گارانتی رسمی تا ۷ روز امکان تعویض در صورت نقص فنی کارخانه‌ای دارند.',
  },
  {
    title: 'زمان‌بندی ارسال تهران و شهرستان',
    snippet: 'سفارش‌های تهران زیر ۲۴ ساعت با پیک و شهرستان ۲ تا ۴ روز کاری با تیپاکس ارسال می‌شوند.',
  },
  {
    title: 'شرایط صدور قرارداد فروش سازمانی',
    snippet: 'برای سفارش‌های سازمانی بالای ۲۰ میلیون تومان، پیش‌نویس قرارداد نسخه‌بندی‌شده با خروجی PDF فارسی صادر می‌شود.',
  },
];

export const SupportCommandCenter: React.FC<SupportCommandCenterProps> = ({
  siteId,
  currentUser,
  onCreateContractFromConv,
}) => {
  const [conversations, setConversations] = useState<ConversationRecord[]>([]);
  const [departments, setDepartments] = useState<DepartmentRecord[]>([]);
  const [members, setMembers] = useState<SessionUser[]>([]);
  const [selectedConvId, setSelectedConvId] = useState<string | null>(null);
  const [mobilePane, setMobilePane] = useState<'list' | 'chat' | 'details'>('list');

  // Filters
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [depFilter, setDepFilter] = useState<string>('all');
  const [priorityFilter, setPriorityFilter] = useState<string>('all');
  const [unreadOnly, setUnreadOnly] = useState(false);
  const [searchQ, setSearchQ] = useState('');

  // Composer & AI Assist
  const [replyText, setReplyText] = useState('');
  const [isInternalNote, setIsInternalNote] = useState(false);
  const [sending, setSending] = useState(false);
  const [aiSuggestion, setAiSuggestion] = useState<string | null>(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [kbQuery, setKbQuery] = useState('');
  const [showCanned, setShowCanned] = useState(false);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  async function loadQueue(silent = false) {
    if (!silent) setLoading(true);
    setError(null);
    try {
      const qs = new URLSearchParams();
      if (statusFilter !== 'all') qs.set('status', statusFilter);
      if (depFilter !== 'all') qs.set('departmentId', depFilter);
      if (priorityFilter !== 'all') qs.set('priority', priorityFilter);
      if (unreadOnly) qs.set('unreadOnly', 'true');
      if (searchQ.trim()) qs.set('q', searchQ.trim());

      const res = await apiFetch<{
        conversations: ConversationRecord[];
        departments: DepartmentRecord[];
        members: SessionUser[];
      }>(`/api/support/${siteId}/conversations?${qs.toString()}`);

      setConversations(res.conversations);
      setDepartments(res.departments);
      setMembers(res.members);

      if (res.conversations.length > 0) {
        setSelectedConvId((prev) =>
          prev && res.conversations.some((c) => c.id === prev) ? prev : res.conversations[0].id
        );
      } else {
        setSelectedConvId(null);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'خطا در دریافت صف گفتگوها.');
    } finally {
      if (!silent) setLoading(false);
    }
  }

  useEffect(() => {
    void loadQueue();
    const timer = window.setInterval(() => void loadQueue(true), 5000);
    return () => window.clearInterval(timer);
  }, [siteId, statusFilter, depFilter, priorityFilter, unreadOnly, searchQ]);

  const activeConv = useMemo(
    () => conversations.find((c) => c.id === selectedConvId) || null,
    [conversations, selectedConvId]
  );

  const filteredKb = useMemo(() => {
    if (!kbQuery.trim()) return KB_ARTICLES;
    return KB_ARTICLES.filter(
      (k) => k.title.includes(kbQuery.trim()) || k.snippet.includes(kbQuery.trim())
    );
  }, [kbQuery]);

  async function sendReply(e: React.FormEvent) {
    e.preventDefault();
    if (!activeConv || !replyText.trim()) return;
    setSending(true);
    setError(null);
    try {
      const res = await apiFetch<{ conversation: ConversationRecord }>(
        `/api/support/${siteId}/conversations/${activeConv.id}/reply`,
        {
          method: 'POST',
          body: JSON.stringify({
            body: replyText.trim(),
            isInternalNote,
            clientMessageId: `op_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
          }),
        }
      );
      setConversations((prev) => prev.map((c) => (c.id === activeConv.id ? res.conversation : c)));
      setReplyText('');
      setAiSuggestion(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'خطا در ارسال پیام.');
    } finally {
      setSending(false);
    }
  }

  async function updateConv(patch: Record<string, unknown>) {
    if (!activeConv) return;
    setError(null);
    try {
      const res = await apiFetch<{ conversation: ConversationRecord }>(
        `/api/support/${siteId}/conversations/${activeConv.id}`,
        {
          method: 'PATCH',
          body: JSON.stringify(patch),
        }
      );
      setConversations((prev) => prev.map((c) => (c.id === activeConv.id ? res.conversation : c)));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'خطا در به‌روزرسانی گفتگو.');
    }
  }

  async function runAiAssist(action: 'suggest_reply' | 'summarize') {
    if (!activeConv) return;
    setAiLoading(true);
    setError(null);
    try {
      const res = await apiFetch<{
        suggestion?: string;
        summaryFa?: string;
        conversation?: ConversationRecord;
      }>(`/api/support/${siteId}/conversations/${activeConv.id}/ai-assist`, {
        method: 'POST',
        body: JSON.stringify({ action }),
      });
      if (res.suggestion) setAiSuggestion(res.suggestion);
      if (res.conversation) {
        setConversations((prev) => prev.map((c) => (c.id === activeConv.id ? res.conversation! : c)));
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'خطا در دریافت کمک هوشمند.');
    } finally {
      setAiLoading(false);
    }
  }

  async function handleOperatorUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || !activeConv) return;
    const form = new FormData();
    form.append('file', file);
    form.append('isInternalNote', String(isInternalNote));
    form.append('caption', `فایل پیوست: ${file.name}`);
    try {
      const res = await apiFetch<{ conversation: ConversationRecord }>(
        `/api/support/${siteId}/conversations/${activeConv.id}/upload`,
        { method: 'POST', body: form }
      );
      setConversations((prev) => prev.map((c) => (c.id === activeConv.id ? res.conversation : c)));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'خطا در بارگذاری فایل.');
    } finally {
      e.target.value = '';
    }
  }

  async function downloadPrivateFile(fileId: string) {
    try {
      const res = await apiFetch<{ downloadUrl: string }>(
        `/api/files/${siteId}/${fileId}/sign-download`,
        { method: 'POST' }
      );
      const a = document.createElement('a');
      a.href = res.downloadUrl;
      a.download = '';
      document.body.appendChild(a);
      a.click();
      a.remove();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'امکان دانلود فایل وجود ندارد.');
    }
  }

  const replyModeLabels: Record<ReplyMode, string> = {
    human_only: 'فقط انسان',
    ai_suggest: 'پیشنهاد AI با تأیید اپراتور',
    auto_reply: 'پاسخ خودکار ربات',
  };

  return (
    <div className="flex h-[calc(100vh-11rem)] min-h-[580px] flex-col overflow-hidden rounded-xl border border-slate-200 bg-white">
      {/* Mobile Pane Switcher */}
      <div className="flex items-center border-b border-slate-200 bg-slate-50 p-1.5 lg:hidden text-xs">
        {[
          { id: 'list' as const, label: `صف (${conversations.length})` },
          { id: 'chat' as const, label: 'متن گفتگو' },
          { id: 'details' as const, label: 'اطلاعات مشتری' },
        ].map((p) => (
          <button
            key={p.id}
            type="button"
            onClick={() => setMobilePane(p.id)}
            className={`flex-1 rounded-md py-1.5 font-medium ${
              mobilePane === p.id ? 'bg-white text-slate-950 shadow-sm' : 'text-slate-600'
            }`}
          >
            {p.label}
          </button>
        ))}
      </div>

      {error && (
        <div className="border-b border-red-200 bg-red-50 px-4 py-2 text-xs text-red-700">
          {error}
        </div>
      )}

      {/* 3-Column Desktop Layout */}
      <div className="grid flex-1 min-h-0 grid-cols-1 lg:grid-cols-12 divide-y lg:divide-y-0 lg:divide-x lg:divide-x-reverse divide-slate-200">
        {/* Column 1: Queue List + Filters */}
        <div
          className={`lg:col-span-3 flex flex-col min-h-0 ${
            mobilePane === 'list' ? 'flex' : 'hidden lg:flex'
          }`}
        >
          <div className="p-3 space-y-2 border-b border-slate-200 bg-slate-50/70">
            <div className="relative">
              <Search className="pointer-events-none absolute right-2.5 top-2.5 h-3.5 w-3.5 text-slate-400" />
              <input
                type="text"
                value={searchQ}
                onChange={(e) => setSearchQ(e.target.value)}
                placeholder="جستجو در نام، متن یا شماره گفتگو..."
                className="w-full rounded-lg border border-slate-200 bg-white py-1.5 pr-8 pl-2.5 text-xs focus:border-blue-600 focus:outline-none"
              />
            </div>
            <div className="grid grid-cols-2 gap-1.5 text-[11px]">
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="rounded-md border border-slate-200 bg-white px-2 py-1"
              >
                <option value="all">همه وضعیت‌ها (بجز بایگانی)</option>
                <option value="new">جدید</option>
                <option value="queued">در صف</option>
                <option value="in_progress">در حال رسیدگی</option>
                <option value="waiting_customer">منتظر مشتری</option>
                <option value="resolved">حل‌شده</option>
                <option value="archived">بایگانی‌شده</option>
              </select>
              <select
                value={depFilter}
                onChange={(e) => setDepFilter(e.target.value)}
                className="rounded-md border border-slate-200 bg-white px-2 py-1"
              >
                <option value="all">همه دپارتمان‌ها</option>
                {departments.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex items-center justify-between text-[11px] text-slate-600">
              <label className="flex items-center gap-1.5 cursor-pointer">
                <input
                  type="checkbox"
                  checked={unreadOnly}
                  onChange={(e) => setUnreadOnly(e.target.checked)}
                />
                <span>فقط خوانده‌نشده</span>
              </label>
              <select
                value={priorityFilter}
                onChange={(e) => setPriorityFilter(e.target.value)}
                className="rounded border border-slate-200 bg-white px-1.5 py-0.5"
              >
                <option value="all">همه اولویت‌ها</option>
                <option value="urgent">فوری</option>
                <option value="high">زیاد</option>
                <option value="normal">عادی</option>
                <option value="low">کم</option>
              </select>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto divide-y divide-slate-100">
            {loading && <div className="p-4 text-xs text-slate-400 text-center">در حال دریافت صف...</div>}
            {!loading && conversations.length === 0 && (
              <div className="p-6 text-center text-xs text-slate-500">
                گفتگویی با این فیلتر یافت نشد.
              </div>
            )}
            {conversations.map((conv) => {
              const selected = conv.id === selectedConvId;
              const depName = departments.find((d) => d.id === conv.departmentId)?.name || 'صف';
              return (
                <button
                  key={conv.id}
                  type="button"
                  onClick={() => {
                    setSelectedConvId(conv.id);
                    setAiSuggestion(null);
                    setMobilePane('chat');
                  }}
                  className={`w-full p-3 text-right transition-colors ${
                    selected ? 'bg-blue-50/70' : 'hover:bg-slate-50'
                  }`}
                >
                  <div className="flex items-center justify-between gap-2 text-xs">
                    <span className="font-bold text-slate-950 truncate">{conv.visitorName}</span>
                    <span className="font-mono text-[11px] text-slate-500 shrink-0">
                      {conv.ticketNumber}
                    </span>
                  </div>
                  <p className="mt-1 truncate text-xs text-slate-700">{conv.subject}</p>
                  <div className="mt-1.5 flex flex-wrap items-center gap-1.5 text-[11px] text-slate-500">
                    <span>{CONV_STATUS_LABELS_FA[conv.status]}</span>
                    <span>·</span>
                    <span>{depName}</span>
                    <span>·</span>
                    <span
                      className={
                        conv.priority === 'urgent' || conv.priority === 'high'
                          ? 'font-semibold text-red-700'
                          : ''
                      }
                    >
                      {PRIORITY_LABELS_FA[conv.priority]}
                    </span>
                    {conv.unreadCount > 0 && (
                      <>
                        <span>·</span>
                        <span className="font-bold text-blue-700 tabular-nums">
                          {conv.unreadCount} جدید
                        </span>
                      </>
                    )}
                  </div>
                  {conv.sentimentAlert === 'unhappy' && (
                    <div className="mt-1 flex items-center gap-1 text-[11px] font-medium text-red-700">
                      <AlertTriangle className="h-3 w-3" />
                      <span>هشدار مشتری ناراضی</span>
                    </div>
                  )}
                </button>
              );
            })}
          </div>
        </div>

        {/* Column 2: Active Conversation Thread & Composer */}
        <div
          className={`lg:col-span-6 flex flex-col min-h-0 ${
            mobilePane === 'chat' ? 'flex' : 'hidden lg:flex'
          }`}
        >
          {!activeConv ? (
            <div className="flex flex-1 items-center justify-center p-6 text-sm text-slate-400">
              یک گفتگو از صف انتخاب کنید.
            </div>
          ) : (
            <>
              {/* Thread Top Action Bar */}
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 px-4 py-2.5 bg-white">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 text-sm font-bold text-slate-950">
                    <span className="truncate">{activeConv.visitorName}</span>
                    <span className="font-mono text-xs font-normal text-slate-500">
                      {activeConv.ticketNumber}
                    </span>
                  </div>
                  <div className="text-xs text-slate-500 truncate">{activeConv.subject}</div>
                </div>
                <div className="flex flex-wrap items-center gap-1.5 shrink-0">
                  <button
                    type="button"
                    onClick={() =>
                      void updateConv({
                        assignedUserId: currentUser.id,
                        status: 'in_progress',
                        replyMode: 'human_only',
                      })
                    }
                    className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs font-medium text-slate-800 hover:bg-slate-50"
                  >
                    <UserCheck className="h-3.5 w-3.5 text-blue-700" />
                    برداشتن گفتگو
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      void updateConv({
                        status: activeConv.status === 'archived' ? 'in_progress' : 'archived',
                      })
                    }
                    className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
                  >
                    {activeConv.status === 'archived' ? (
                      <>
                        <RotateCcw className="h-3.5 w-3.5" />
                        بازگردانی از بایگانی
                      </>
                    ) : (
                      <>
                        <Archive className="h-3.5 w-3.5" />
                        بایگانی
                      </>
                    )}
                  </button>
                </div>
              </div>

              {/* Messages Stream */}
              <div className="flex-1 overflow-y-auto bg-slate-50/40 p-4 space-y-3">
                {activeConv.messages.map((msg) => {
                  const isVisitor = msg.senderType === 'visitor';
                  const isNote = msg.isInternalNote;
                  return (
                    <div
                      key={msg.id}
                      className={`flex flex-col ${
                        isNote ? 'items-stretch' : isVisitor ? 'items-start' : 'items-end'
                      }`}
                    >
                      <div
                        className={`rounded-xl px-3.5 py-2.5 text-sm leading-6 ${
                          isNote
                            ? 'border border-amber-300 bg-amber-50 text-amber-950'
                            : isVisitor
                            ? 'max-w-[85%] border border-slate-200 bg-white text-slate-900'
                            : msg.senderType === 'ai'
                            ? 'max-w-[85%] border border-blue-200 bg-blue-50 text-slate-900'
                            : 'max-w-[85%] bg-slate-900 text-white'
                        }`}
                      >
                        <div
                          className={`mb-1 flex items-center gap-1.5 text-[11px] ${
                            isNote
                              ? 'font-semibold text-amber-900'
                              : isVisitor || msg.senderType === 'ai'
                              ? 'text-slate-500'
                              : 'text-slate-300'
                          }`}
                        >
                          {isNote && <Lock className="h-3 w-3" />}
                          <span>
                            {msg.senderName}
                            {isNote ? ' · یادداشت داخلی (هرگز برای مشتری ارسال نمی‌شود)' : ''}
                          </span>
                        </div>
                        <p className="whitespace-pre-wrap break-words">{msg.body}</p>
                        {msg.attachments && msg.attachments.length > 0 && (
                          <div className="mt-2 space-y-1 border-t border-slate-200/40 pt-2 text-xs">
                            {msg.attachments.map((att) => (
                              <div key={att.id} className="flex items-center justify-between gap-3">
                                <span className="truncate">
                                  {att.originalName} ({att.scanStatus === 'clean' ? 'سالم' : 'قرنطینه'})
                                </span>
                                {att.scanStatus === 'clean' && (
                                  <button
                                    type="button"
                                    onClick={() => void downloadPrivateFile(att.id)}
                                    className="inline-flex items-center gap-1 font-semibold underline shrink-0"
                                  >
                                    <Download className="h-3 w-3" />
                                    دانلود امن
                                  </button>
                                )}
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                      <div className="mt-1 text-[11px] text-slate-400 tabular-nums">
                        {formatFaDateTime(msg.createdAt)} · {msg.deliveryStatus === 'delivered' ? 'تحویل‌شد' : msg.deliveryStatus}
                      </div>
                    </div>
                  );
                })}

                {/* AI Suggested Reply Card */}
                {aiSuggestion && (
                  <div className="rounded-xl border border-blue-200 bg-blue-50/70 p-3.5 space-y-2">
                    <div className="text-xs font-semibold text-blue-900">
                      پیشنهاد هوش مصنوعی راماکس (پیش از ارسال می‌توانید ویرایش کنید)
                    </div>
                    <p className="whitespace-pre-wrap text-xs leading-6 text-slate-800">{aiSuggestion}</p>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          setIsInternalNote(false);
                          setReplyText(aiSuggestion);
                          setAiSuggestion(null);
                        }}
                        className="rounded-md bg-blue-700 px-3 py-1.5 text-xs font-semibold text-white hover:bg-blue-800"
                      >
                        تأیید و انتقال به کادر پاسخ
                      </button>
                      <button
                        type="button"
                        onClick={() => setAiSuggestion(null)}
                        className="text-xs text-slate-600 hover:text-slate-950"
                      >
                        رد پیشنهاد
                      </button>
                    </div>
                  </div>
                )}
              </div>

              {/* Composer + Reply Mode Indicator */}
              <div className="border-t border-slate-200 bg-white p-3 space-y-2">
                <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                  <div className="flex items-center gap-1.5">
                    <span className="text-slate-500">حالت پاسخگویی:</span>
                    <select
                      value={activeConv.replyMode}
                      onChange={(e) => void updateConv({ replyMode: e.target.value })}
                      className="rounded-md border border-slate-200 bg-slate-50 px-2 py-1 text-xs font-semibold text-slate-900"
                    >
                      {(['human_only', 'ai_suggest', 'auto_reply'] as ReplyMode[]).map((rm) => (
                        <option key={rm} value={rm}>
                          {replyModeLabels[rm]}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="flex flex-wrap items-center gap-1.5">
                    <button
                      type="button"
                      disabled={aiLoading}
                      onClick={() => void runAiAssist('suggest_reply')}
                      className="inline-flex items-center gap-1 rounded-md border border-blue-200 bg-blue-50/70 px-2.5 py-1 text-xs font-medium text-blue-800 hover:bg-blue-100 disabled:opacity-50"
                    >
                      <Sparkles className="h-3.5 w-3.5" />
                      {aiLoading ? 'در حال تولید...' : 'پیشنهاد پاسخ AI'}
                    </button>
                    <button
                      type="button"
                      onClick={() => setShowCanned((v) => !v)}
                      className="rounded-md border border-slate-200 px-2.5 py-1 text-xs text-slate-700 hover:bg-slate-50"
                    >
                      پاسخ آماده
                    </button>
                    <label className="inline-flex items-center gap-1.5 rounded-md border border-slate-200 px-2.5 py-1 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={isInternalNote}
                        onChange={(e) => setIsInternalNote(e.target.checked)}
                      />
                      <span className={isInternalNote ? 'font-semibold text-amber-800' : 'text-slate-700'}>
                        یادداشت داخلی
                      </span>
                    </label>
                  </div>
                </div>

                {showCanned && (
                  <div className="grid grid-cols-1 gap-1.5 rounded-lg border border-slate-200 bg-slate-50 p-2 sm:grid-cols-3">
                    {CANNED_RESPONSES.map((c) => (
                      <button
                        key={c.title}
                        type="button"
                        onClick={() => {
                          setReplyText(c.text);
                          setShowCanned(false);
                        }}
                        className="rounded-md bg-white p-2 text-right text-[11px] border border-slate-200 hover:border-blue-400"
                      >
                        <div className="font-semibold text-slate-900">{c.title}</div>
                        <div className="mt-0.5 truncate text-slate-500">{c.text}</div>
                      </button>
                    ))}
                  </div>
                )}

                <form onSubmit={sendReply} className="flex items-end gap-2">
                  <input
                    ref={fileRef}
                    type="file"
                    onChange={handleOperatorUpload}
                    className="hidden"
                    accept=".jpg,.jpeg,.png,.webp,.pdf,.txt,.csv"
                  />
                  <button
                    type="button"
                    onClick={() => fileRef.current?.click()}
                    title="پیوست فایل خصوصی"
                    className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50"
                  >
                    <Paperclip className="h-4 w-4" />
                  </button>
                  <textarea
                    rows={2}
                    value={replyText}
                    onChange={(e) => setReplyText(e.target.value)}
                    placeholder={
                      isInternalNote
                        ? 'یادداشت داخلی برای همکاران (هرگز به مشتری ارسال نمی‌شود)...'
                        : 'پاسخ خود را برای مشتری بنویسید (با ارسال پاسخ، ربات خودکار متوقف می‌شود)...'
                    }
                    className={`flex-1 resize-none rounded-lg border px-3 py-2 text-sm focus:outline-none ${
                      isInternalNote
                        ? 'border-amber-300 bg-amber-50/40 focus:border-amber-500'
                        : 'border-slate-200 focus:border-blue-600'
                    }`}
                  />
                  <button
                    type="submit"
                    disabled={sending || !replyText.trim()}
                    className={`flex h-10 shrink-0 items-center gap-1.5 rounded-lg px-4 text-xs font-semibold text-white disabled:opacity-40 ${
                      isInternalNote ? 'bg-amber-700 hover:bg-amber-800' : 'bg-blue-700 hover:bg-blue-800'
                    }`}
                  >
                    <Send className="h-3.5 w-3.5" />
                    {isInternalNote ? 'ثبت یادداشت' : 'ارسال پاسخ'}
                  </button>
                </form>
              </div>
            </>
          )}
        </div>

        {/* Column 3: Customer Inspector, Transfer, Summary, KB, Create Contract */}
        <div
          className={`lg:col-span-3 flex flex-col min-h-0 overflow-y-auto p-3.5 space-y-4 bg-slate-50/40 ${
            mobilePane === 'details' ? 'flex' : 'hidden lg:flex'
          }`}
        >
          {!activeConv ? (
            <div className="text-xs text-slate-400">جزئیات گفتگو اینجا نمایش داده می‌شود.</div>
          ) : (
            <>
              <div className="space-y-2 border-b border-slate-200 pb-3.5 text-xs">
                <div className="font-bold text-slate-950">مشخصات و کنترل گفتگو</div>
                <div className="text-slate-600">مشتری: {activeConv.visitorName}</div>
                {activeConv.visitorContact && (
                  <div className="font-mono ltr text-right text-slate-600">{activeConv.visitorContact}</div>
                )}
                {activeConv.firstResponseSeconds !== undefined && (
                  <div className="text-slate-600 tabular-nums">
                    زمان اولین پاسخ: {activeConv.firstResponseSeconds} ثانیه
                  </div>
                )}

                <div className="pt-1 space-y-2">
                  <div>
                    <label className="mb-1 block text-[11px] text-slate-500">وضعیت</label>
                    <select
                      value={activeConv.status}
                      onChange={(e) => void updateConv({ status: e.target.value as ConversationStatus })}
                      className="w-full rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs"
                    >
                      {(['new', 'queued', 'in_progress', 'waiting_customer', 'resolved', 'archived'] as ConversationStatus[]).map(
                        (st) => (
                          <option key={st} value={st}>
                            {CONV_STATUS_LABELS_FA[st]}
                          </option>
                        )
                      )}
                    </select>
                  </div>

                  <div>
                    <label className="mb-1 block text-[11px] text-slate-500">انتقال به دپارتمان</label>
                    <select
                      value={activeConv.departmentId}
                      onChange={(e) => void updateConv({ departmentId: e.target.value })}
                      className="w-full rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs"
                    >
                      {departments.map((d) => (
                        <option key={d.id} value={d.id}>
                          {d.name}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="mb-1 block text-[11px] text-slate-500">انتقال به اپراتور / مسئول</label>
                    <select
                      value={activeConv.assignedUserId || ''}
                      onChange={(e) => void updateConv({ assignedUserId: e.target.value })}
                      className="w-full rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs"
                    >
                      <option value="">بدون مسئول (در صف)</option>
                      {members.map((m) => (
                        <option key={m.id} value={m.id}>
                          {m.name}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="mb-1 block text-[11px] text-slate-500">اولویت</label>
                    <select
                      value={activeConv.priority}
                      onChange={(e) => void updateConv({ priority: e.target.value })}
                      className="w-full rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs"
                    >
                      <option value="low">کم</option>
                      <option value="normal">عادی</option>
                      <option value="high">زیاد</option>
                      <option value="urgent">فوری</option>
                    </select>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => onCreateContractFromConv(activeConv)}
                  className="mt-2 flex w-full items-center justify-center gap-1.5 rounded-lg bg-slate-950 px-3 py-2 text-xs font-semibold text-white hover:bg-slate-800"
                >
                  <FileText className="h-3.5 w-3.5" />
                  ایجاد قرارداد از این گفتگو
                </button>
              </div>

              {/* AI Summary & Sentiment */}
              <div className="space-y-2 border-b border-slate-200 pb-3.5 text-xs">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-slate-950">خلاصه هوشمند گفتگو</span>
                  <button
                    type="button"
                    disabled={aiLoading}
                    onClick={() => void runAiAssist('summarize')}
                    className="text-blue-700 hover:underline disabled:opacity-50"
                  >
                    به‌روزرسانی خلاصه
                  </button>
                </div>
                <p className="leading-6 text-slate-600">
                  {activeConv.summaryFa || 'برای تولید خلاصه و تشخیص رضایت مشتری، روی «به‌روزرسانی خلاصه» کلیک کنید.'}
                </p>
              </div>

              {/* Quick Knowledge Base Search */}
              <div className="space-y-2 border-b border-slate-200 pb-3.5 text-xs">
                <div className="flex items-center gap-1.5 font-bold text-slate-950">
                  <BookOpen className="h-3.5 w-3.5 text-slate-500" />
                  <span>جستجوی سریع دانشنامه</span>
                </div>
                <input
                  type="text"
                  value={kbQuery}
                  onChange={(e) => setKbQuery(e.target.value)}
                  placeholder="مثلاً گارانتی، ارسال، قرارداد..."
                  className="w-full rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs"
                />
                <div className="space-y-1.5">
                  {filteredKb.map((k) => (
                    <button
                      key={k.title}
                      type="button"
                      onClick={() => setReplyText((prev) => (prev ? `${prev}\n${k.snippet}` : k.snippet))}
                      className="w-full rounded-lg border border-slate-200 bg-white p-2 text-right hover:border-blue-400"
                    >
                      <div className="font-semibold text-slate-900">{k.title}</div>
                      <div className="mt-0.5 text-[11px] text-slate-500 leading-5">{k.snippet}</div>
                    </button>
                  ))}
                </div>
              </div>

              {/* Transfer & Status Audit History */}
              <div className="space-y-2 text-xs">
                <div className="font-bold text-slate-950">تاریخچه انتقال و تغییر وضعیت</div>
                <div className="space-y-2">
                  {activeConv.history.map((ev) => (
                    <div key={ev.id} className="rounded-lg border border-slate-200 bg-white p-2 text-[11px] leading-5">
                      <div className="font-semibold text-slate-800">{ev.actionFa}</div>
                      <div className="text-slate-500">
                        {ev.actorName} · {formatFaDateTime(ev.timestamp)}
                        {ev.toValue ? ` · ← ${ev.toValue}` : ''}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
};
