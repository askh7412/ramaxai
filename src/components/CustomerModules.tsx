import React, { useEffect, useState } from 'react';
import {
  Check,
  CheckCircle2,
  Copy,
  ExternalLink,
  FileText,
  KeyRound,
  Play,
  Plus,
  RefreshCw,
  Sparkles,
} from 'lucide-react';
import {
  apiFetch,
  ASSETS,
  CONTRACT_STATUS_LABELS_FA,
  formatFaDateTime,
  formatToman,
  PAYMENT_METHOD_LABELS_FA,
  ROLE_LABELS_FA,
} from '../lib/api';
import { LiveWidget } from './LiveWidget';
import { PLUGIN_GUIDES } from '../shared/openapi';
import {
  ROLE_PERMISSIONS,
  type AutomationRule,
  type AutomationRunLog,
  type ContractRecord,
  type ContractStatus,
  type ConversationRecord,
  type DepartmentRecord,
  type ManualPaymentRequest,
  type PublicModelInfo,
  type SessionUser,
  type SiteRecord,
  type UserRole,
  type WalletTransaction,
} from '../shared/types';

// ============================================================================
// 1. SITES & WIDGET CONFIG + 4-STEP LIVE INSTALL VERIFICATION
// ============================================================================
export const SitesAndWidgetView: React.FC<{
  sites: SiteRecord[];
  activeSite: SiteRecord | null;
  models: PublicModelInfo[];
  onRefreshSites: () => Promise<void>;
  onSelectSite: (id: string) => void;
}> = ({ sites, activeSite, models, onRefreshSites, onSelectSite }) => {
  const [showNewForm, setShowNewForm] = useState(sites.length === 0);
  const [newSiteForm, setNewSiteForm] = useState({
    name: '',
    domain: '',
    businessTopic: '',
    tone: 'محترمانه و دقیق',
    contentGoal: 'پاسخ سریع و افزایش فروش',
    responseRules: '',
    trustedSources: '',
    defaultModelId: 'ramax-fast',
  });
  const [oneTimeSecret, setOneTimeSecret] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);
  const [copiedKey, setCopiedKey] = useState(false);
  const [showInstallTester, setShowInstallTester] = useState(false);

  // Edit active site widget & rules
  const [editCfg, setEditCfg] = useState<SiteRecord | null>(activeSite);

  useEffect(() => {
    setEditCfg(activeSite);
  }, [activeSite]);

  async function handleCreateSite(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setMsg(null);
    try {
      const res = await apiFetch<{ site: SiteRecord; oneTimeServerApiKey: string }>('/api/sites', {
        method: 'POST',
        body: JSON.stringify(newSiteForm),
      });
      setOneTimeSecret(res.oneTimeServerApiKey);
      setShowNewForm(false);
      setNewSiteForm({
        name: '',
        domain: '',
        businessTopic: '',
        tone: 'محترمانه و دقیق',
        contentGoal: 'پاسخ سریع و افزایش فروش',
        responseRules: '',
        trustedSources: '',
        defaultModelId: 'ramax-fast',
      });
      await onRefreshSites();
      onSelectSite(res.site.id);
      setMsg({ type: 'ok', text: `سایت «${res.site.name}» با موفقیت ثبت شد.` });
    } catch (err) {
      setMsg({ type: 'err', text: err instanceof Error ? err.message : 'خطا در ثبت سایت.' });
    } finally {
      setSaving(false);
    }
  }

  async function handleUpdateSite(e: React.FormEvent) {
    e.preventDefault();
    if (!editCfg) return;
    setSaving(true);
    setMsg(null);
    try {
      await apiFetch(`/api/sites/${editCfg.id}`, {
        method: 'PUT',
        body: JSON.stringify({
          name: editCfg.name,
          businessTopic: editCfg.businessTopic,
          tone: editCfg.tone,
          contentGoal: editCfg.contentGoal,
          responseRules: editCfg.responseRules,
          trustedSources: editCfg.trustedSources,
          defaultModelId: editCfg.defaultModelId,
          widgetConfig: editCfg.widgetConfig,
        }),
      });
      await onRefreshSites();
      setMsg({ type: 'ok', text: 'تنظیمات سایت و ویجت با موفقیت ذخیره شد.' });
    } catch (err) {
      setMsg({ type: 'err', text: err instanceof Error ? err.message : 'خطا در ذخیره تنظیمات.' });
    } finally {
      setSaving(false);
    }
  }

  const embedCode = activeSite
    ? `<script async src="${window.location.origin}/widget/embed.js" data-ramax-key="${activeSite.publicInstallKey}"></script>`
    : '';

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold text-slate-950">مدیریت سایت‌ها، ویجت چت و آزمون نصب</h2>
          <p className="text-xs text-slate-500">
            پرامپت هر سایت با قوانین سراسری راماکس ترکیب می‌شود و نمی‌تواند کنترل دسترسی را تغییر دهد.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setShowNewForm((v) => !v)}
          className="inline-flex items-center gap-1.5 rounded-lg bg-blue-700 px-4 py-2 text-xs font-semibold text-white hover:bg-blue-800"
        >
          <Plus className="h-4 w-4" />
          ثبت سایت جدید
        </button>
      </div>

      {msg && (
        <div
          className={`rounded-lg border p-3 text-xs ${
            msg.type === 'ok'
              ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
              : 'border-red-200 bg-red-50 text-red-700'
          }`}
        >
          {msg.text}
        </div>
      )}

      {oneTimeSecret && (
        <div className="rounded-xl border border-amber-300 bg-amber-50 p-4 space-y-2 text-xs">
          <div className="font-bold text-amber-950">
            کلید محرمانه سرور سایت (فقط یک‌بار نمایش داده می‌شود — هرگز در HTML یا فرانت قرار ندهید):
          </div>
          <div className="ltr font-mono bg-white border border-amber-200 rounded p-2.5 text-left text-slate-900 select-all">
            {oneTimeSecret}
          </div>
        </div>
      )}

      {showNewForm && (
        <form
          onSubmit={handleCreateSite}
          className="rounded-xl border border-slate-200 bg-white p-5 space-y-4"
        >
          <div className="text-sm font-bold text-slate-950">فرم ثبت سایت یا فروشگاه جدید</div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-700">نام سایت / فروشگاه *</label>
              <input
                type="text"
                required
                value={newSiteForm.name}
                onChange={(e) => setNewSiteForm({ ...newSiteForm, name: e.target.value })}
                placeholder="مثلاً فروشگاه کتاب آریا"
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-700">دامنه سایت *</label>
              <input
                type="text"
                required
                value={newSiteForm.domain}
                onChange={(e) => setNewSiteForm({ ...newSiteForm, domain: e.target.value })}
                placeholder="ariabook.ir"
                className="ltr w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-left font-mono"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-700">موضوع کسب‌وکار</label>
              <input
                type="text"
                value={newSiteForm.businessTopic}
                onChange={(e) => setNewSiteForm({ ...newSiteForm, businessTopic: e.target.value })}
                placeholder="فروش کتاب و لوازم تحریر"
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-700">لحن پاسخگویی</label>
              <input
                type="text"
                value={newSiteForm.tone}
                onChange={(e) => setNewSiteForm({ ...newSiteForm, tone: e.target.value })}
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-700">هدف تولید محتوا</label>
              <input
                type="text"
                value={newSiteForm.contentGoal}
                onChange={(e) => setNewSiteForm({ ...newSiteForm, contentGoal: e.target.value })}
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-700">مدل پیش‌فرض راماکس</label>
              <select
                value={newSiteForm.defaultModelId}
                onChange={(e) => setNewSiteForm({ ...newSiteForm, defaultModelId: e.target.value })}
                className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm"
              >
                {models
                  .filter((m) => m.pipelineReady)
                  .map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.icon} {m.publicName}
                    </option>
                  ))}
              </select>
            </div>
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-700">قوانین پاسخگویی اختصاصی سایت</label>
            <textarea
              rows={2}
              value={newSiteForm.responseRules}
              onChange={(e) => setNewSiteForm({ ...newSiteForm, responseRules: e.target.value })}
              placeholder="مثلاً فقط درباره محصولات موجود پاسخ بده و تخفیف غیرمجاز قول نده."
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-700">منابع معتبر سایت (هر آدرس در یک خط)</label>
            <textarea
              rows={2}
              value={newSiteForm.trustedSources}
              onChange={(e) => setNewSiteForm({ ...newSiteForm, trustedSources: e.target.value })}
              placeholder="https://ariabook.ir/faq"
              className="ltr w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-left font-mono"
            />
          </div>
          <div className="flex items-center gap-3">
            <button
              type="submit"
              disabled={saving}
              className="rounded-lg bg-slate-950 px-5 py-2 text-xs font-semibold text-white hover:bg-slate-800 disabled:opacity-50"
            >
              {saving ? 'در حال ثبت...' : 'ذخیره و ثبت سایت'}
            </button>
            <button
              type="button"
              onClick={() => setShowNewForm(false)}
              className="text-xs text-slate-600 hover:text-slate-950"
            >
              انصراف
            </button>
          </div>
        </form>
      )}

      {editCfg && (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-12 items-start">
          {/* Site + Widget Configuration Form */}
          <form
            onSubmit={handleUpdateSite}
            className="lg:col-span-7 rounded-xl border border-slate-200 bg-white p-5 space-y-5"
          >
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div>
                <h3 className="text-sm font-bold text-slate-950">تنظیمات ویجت و هویت سایت فعال</h3>
                <div className="text-xs text-slate-500 font-mono ltr text-right">{editCfg.domain}</div>
              </div>
              <div className="flex items-center gap-4 text-xs">
                <label className="flex items-center gap-1.5 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={editCfg.widgetConfig.widgetEnabled}
                    onChange={(e) =>
                      setEditCfg({
                        ...editCfg,
                        widgetConfig: { ...editCfg.widgetConfig, widgetEnabled: e.target.checked },
                      })
                    }
                  />
                  <span>ویجت روشن</span>
                </label>
                <label className="flex items-center gap-1.5 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={editCfg.widgetConfig.autoReplyEnabled}
                    onChange={(e) =>
                      setEditCfg({
                        ...editCfg,
                        widgetConfig: { ...editCfg.widgetConfig, autoReplyEnabled: e.target.checked },
                      })
                    }
                  />
                  <span>پاسخ خودکار AI</span>
                </label>
              </div>
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-700">رنگ اصلی ویجت</label>
                <div className="flex items-center gap-2">
                  <input
                    type="color"
                    value={editCfg.widgetConfig.primaryColor}
                    onChange={(e) =>
                      setEditCfg({
                        ...editCfg,
                        widgetConfig: { ...editCfg.widgetConfig, primaryColor: e.target.value },
                      })
                    }
                    className="h-9 w-12 rounded border border-slate-200"
                  />
                  <input
                    type="text"
                    value={editCfg.widgetConfig.primaryColor}
                    onChange={(e) =>
                      setEditCfg({
                        ...editCfg,
                        widgetConfig: { ...editCfg.widgetConfig, primaryColor: e.target.value },
                      })
                    }
                    className="ltr flex-1 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-mono"
                  />
                </div>
              </div>

              <div>
                <label className="mb-1 block text-xs font-medium text-slate-700">محل نمایش روی سایت</label>
                <select
                  value={editCfg.widgetConfig.position}
                  onChange={(e) =>
                    setEditCfg({
                      ...editCfg,
                      widgetConfig: {
                        ...editCfg.widgetConfig,
                        position: e.target.value as 'bottom-right' | 'bottom-left',
                      },
                    })
                  }
                  className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs"
                >
                  <option value="bottom-right">پایین راست</option>
                  <option value="bottom-left">پایین چپ</option>
                </select>
              </div>

              <div>
                <label className="mb-1 block text-xs font-medium text-slate-700">عنوان خوشامد ویجت</label>
                <input
                  type="text"
                  value={editCfg.widgetConfig.welcomeTitle}
                  onChange={(e) =>
                    setEditCfg({
                      ...editCfg,
                      widgetConfig: { ...editCfg.widgetConfig, welcomeTitle: e.target.value },
                    })
                  }
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-xs"
                />
              </div>

              <div>
                <label className="mb-1 block text-xs font-medium text-slate-700">ساعات پاسخگویی</label>
                <input
                  type="text"
                  value={editCfg.widgetConfig.workingHoursText}
                  onChange={(e) =>
                    setEditCfg({
                      ...editCfg,
                      widgetConfig: { ...editCfg.widgetConfig, workingHoursText: e.target.value },
                    })
                  }
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-xs"
                />
              </div>
            </div>

            <div>
              <label className="mb-1 block text-xs font-medium text-slate-700">متن خوشامد</label>
              <textarea
                rows={2}
                value={editCfg.widgetConfig.welcomeMessage}
                onChange={(e) =>
                  setEditCfg({
                    ...editCfg,
                    widgetConfig: { ...editCfg.widgetConfig, welcomeMessage: e.target.value },
                  })
                }
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-xs"
              />
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-700">فاصله از لبه (پیکسل)</label>
                <input
                  type="number"
                  min={8}
                  max={80}
                  value={editCfg.widgetConfig.edgeOffsetPx}
                  onChange={(e) =>
                    setEditCfg({
                      ...editCfg,
                      widgetConfig: { ...editCfg.widgetConfig, edgeOffsetPx: Number(e.target.value) || 20 },
                    })
                  }
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-xs tabular-nums"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-700">صفحات مجاز نمایش ویجت</label>
                <input
                  type="text"
                  value={editCfg.widgetConfig.allowedPagePaths}
                  onChange={(e) =>
                    setEditCfg({
                      ...editCfg,
                      widgetConfig: { ...editCfg.widgetConfig, allowedPagePaths: e.target.value },
                    })
                  }
                  className="ltr w-full rounded-lg border border-slate-200 px-3 py-2 text-xs text-left font-mono"
                />
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-4 text-xs text-slate-700">
              <label className="flex items-center gap-1.5 cursor-pointer">
                <input
                  type="checkbox"
                  checked={editCfg.widgetConfig.showOnMobile}
                  onChange={(e) =>
                    setEditCfg({
                      ...editCfg,
                      widgetConfig: { ...editCfg.widgetConfig, showOnMobile: e.target.checked },
                    })
                  }
                />
                <span>نمایش روی موبایل</span>
              </label>
              <label className="flex items-center gap-1.5 cursor-pointer">
                <input
                  type="checkbox"
                  checked={editCfg.widgetConfig.isWithinWorkingHours}
                  onChange={(e) =>
                    setEditCfg({
                      ...editCfg,
                      widgetConfig: { ...editCfg.widgetConfig, isWithinWorkingHours: e.target.checked },
                    })
                  }
                />
                <span>درون ساعات کاری (خاموش = حالت پیام خارج از ساعت کاری)</span>
              </label>
            </div>

            <div className="border-t border-slate-100 pt-4 space-y-3">
              <div className="text-xs font-bold text-slate-900">قوانین و پرامپت اختصاصی سایت</div>
              <textarea
                rows={2}
                value={editCfg.responseRules}
                onChange={(e) => setEditCfg({ ...editCfg, responseRules: e.target.value })}
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-xs"
              />
            </div>

            <button
              type="submit"
              disabled={saving}
              className="rounded-lg bg-slate-950 px-5 py-2 text-xs font-semibold text-white hover:bg-slate-800 disabled:opacity-50"
            >
              {saving ? 'در حال ذخیره...' : 'ذخیره تنظیمات سایت و ویجت'}
            </button>
          </form>

          {/* Embed Code + 4-step Install Test */}
          <div className="lg:col-span-5 space-y-5">
            <div className="rounded-xl border border-slate-200 bg-white p-5 space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-bold text-slate-950">کد نصب ویجت (پیش از &lt;/body&gt;)</h3>
                <button
                  type="button"
                  onClick={() => {
                    navigator.clipboard?.writeText(embedCode);
                    setCopiedKey(true);
                    window.setTimeout(() => setCopiedKey(false), 1600);
                  }}
                  className="inline-flex items-center gap-1 text-xs font-semibold text-blue-700 hover:underline"
                >
                  {copiedKey ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                  {copiedKey ? 'کپی شد' : 'کپی کد'}
                </button>
              </div>
              <p className="text-xs leading-6 text-slate-600">
                این کد فقط شامل شناسه عمومی <span className="font-mono ltr">{editCfg.publicInstallKey}</span> است و
                هیچ کلید محرمانه‌ای در مرورگر کاربر قرار نمی‌گیرد.
              </p>
              <pre className="ltr overflow-x-auto rounded-lg bg-slate-950 p-3 text-left text-[11px] font-mono text-slate-200">
                <code>{embedCode}</code>
              </pre>
            </div>

            <div className="rounded-xl border border-slate-200 bg-white p-5 space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-bold text-slate-950">آزمون ۴ مرحله‌ای نصب ویجت</h3>
                <button
                  type="button"
                  onClick={() => setShowInstallTester((v) => !v)}
                  className="rounded-lg bg-blue-700 px-3 py-1.5 text-xs font-semibold text-white hover:bg-blue-800"
                >
                  {showInstallTester ? 'بستن پنجره تست' : 'اجرای تست زنده ویجت'}
                </button>
              </div>

              <div className="space-y-2 text-xs">
                {[
                  { ok: editCfg.installVerificationSteps.widgetSeen, label: '۱. ویجت در سایت دیده شد' },
                  { ok: editCfg.installVerificationSteps.testMessageSent, label: '۲. پیام آزمایشی ثبت شد' },
                  { ok: editCfg.installVerificationSteps.receivedInDesk, label: '۳. پیام در مرکز پاسخگویی رسید' },
                  { ok: editCfg.installVerificationSteps.operatorReplied, label: '۴. پاسخ اپراتور به همان پنجره برگشت' },
                ].map((st) => (
                  <div key={st.label} className="flex items-center justify-between rounded-lg border border-slate-100 bg-slate-50 px-3 py-2">
                    <span className={st.ok ? 'font-semibold text-slate-900' : 'text-slate-500'}>{st.label}</span>
                    <span className={st.ok ? 'text-emerald-700 font-semibold' : 'text-slate-400'}>
                      {st.ok ? 'تأیید شد' : 'در انتظار'}
                    </span>
                  </div>
                ))}
              </div>

              {showInstallTester && (
                <div className="overflow-hidden rounded-xl border border-slate-200">
                  <LiveWidget
                    publicInstallKey={editCfg.publicInstallKey}
                    isInstallTest
                    onConversationUpdated={() => void onRefreshSites()}
                  />
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

// ============================================================================
// 2. AUTOMATION RULES BUILDER (TRIGGER -> CONDITION -> ACTION + DRY-RUN)
// ============================================================================
export const AutomationView: React.FC<{ siteId: string }> = ({ siteId }) => {
  const [rules, setRules] = useState<AutomationRule[]>([]);
  const [runs, setRuns] = useState<AutomationRunLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [showBuilder, setShowBuilder] = useState(false);
  const [dryRunResult, setDryRunResult] = useState<string | null>(null);
  const [form, setForm] = useState({
    name: '',
    trigger: 'conversation_created' as AutomationRule['trigger'],
    conditionSummaryFa: 'اگر پیام مشتری شامل کلیدواژه «ارسال» یا «پیگیری» باشد',
    keywords: 'ارسال,پیگیری',
    actionType: 'route_department' as AutomationRule['actionType'],
    actionSummaryFa: 'انتقال گفتگو به دپارتمان مربوطه',
    requiresExplicitApproval: false,
  });

  async function load() {
    setLoading(true);
    try {
      const res = await apiFetch<{ rules: AutomationRule[]; runs: AutomationRunLog[] }>(
        `/api/automation/${siteId}`
      );
      setRules(res.rules);
      setRuns(res.runs);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, [siteId]);

  async function saveRule(e: React.FormEvent) {
    e.preventDefault();
    await apiFetch(`/api/automation/${siteId}/rules`, {
      method: 'POST',
      body: JSON.stringify({
        name: form.name,
        trigger: form.trigger,
        conditionSummaryFa: form.conditionSummaryFa,
        conditionConfig: { keywords: form.keywords },
        actionType: form.actionType,
        actionSummaryFa: form.actionSummaryFa,
        requiresExplicitApproval: form.requiresExplicitApproval,
      }),
    });
    setShowBuilder(false);
    setForm({ ...form, name: '' });
    await load();
  }

  async function runDryTest(ruleId: string) {
    const res = await apiFetch<{ run: AutomationRunLog }>(
      `/api/automation/${siteId}/rules/${ruleId}/dry-run`,
      { method: 'POST', body: JSON.stringify({ sampleInput: 'سلام وضعیت ارسال مرسوله و درخواست قرارداد چطور است؟' }) }
    );
    setDryRunResult(res.run.outputSummaryFa);
    await load();
  }

  async function toggleRule(ruleId: string) {
    await apiFetch(`/api/automation/${siteId}/rules/${ruleId}/toggle`, { method: 'POST' });
    await load();
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold text-slate-950">سازنده قوانین اتوماسیون</h2>
          <p className="text-xs text-slate-500">
            قوانین نسخه‌بندی می‌شوند، پیش از اجرا با کلید یکتا از حلقه جلوگیری می‌شود و اقدامات حساس نیازمند تأیید مدیر هستند.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setShowBuilder((v) => !v)}
          className="inline-flex items-center gap-1.5 rounded-lg bg-blue-700 px-4 py-2 text-xs font-semibold text-white hover:bg-blue-800"
        >
          <Plus className="h-4 w-4" />
          قانون جدید
        </button>
      </div>

      {dryRunResult && (
        <div className="rounded-lg border border-blue-200 bg-blue-50 p-3.5 text-xs text-blue-950">
          <strong>نتیجه اجرای آزمایشی (Dry-Run):</strong> {dryRunResult}
        </div>
      )}

      {showBuilder && (
        <form onSubmit={saveRule} className="rounded-xl border border-slate-200 bg-white p-5 space-y-4">
          <div className="text-sm font-bold text-slate-950">سازنده سه‌مرحله‌ای قانون (رویداد ← شرط ← اقدام)</div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-700">نام قانون *</label>
              <input
                type="text"
                required
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="مثلاً ارجاع شکایات فوری"
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-xs"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-700">۱. رویداد (Trigger)</label>
              <select
                value={form.trigger}
                onChange={(e) => setForm({ ...form, trigger: e.target.value as AutomationRule['trigger'] })}
                className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs"
              >
                <option value="conversation_created">ثبت گفتگوی جدید</option>
                <option value="file_uploaded">بارگذاری فایل رسید</option>
                <option value="unanswered_timeout">بی‌پاسخ ماندن پیام</option>
                <option value="contract_requested">درخواست قرارداد مشتری</option>
                <option value="after_hours">خارج از ساعات کاری</option>
                <option value="content_schedule">برنامه تولید محتوای سایت</option>
                <option value="price_sync_source">به‌روزرسانی قیمت از منبع تأییدشده</option>
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-700">۲. شرح شرط (Condition)</label>
              <input
                type="text"
                value={form.conditionSummaryFa}
                onChange={(e) => setForm({ ...form, conditionSummaryFa: e.target.value })}
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-xs"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-700">۳. نوع اقدام (Action)</label>
              <select
                value={form.actionType}
                onChange={(e) => setForm({ ...form, actionType: e.target.value as AutomationRule['actionType'] })}
                className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs"
              >
                <option value="route_department">ارجاع به دپارتمان</option>
                <option value="create_finance_task">ارجاع به مالی و ساخت کار بررسی</option>
                <option value="notify_supervisor">اعلان به سرپرست پشتیبانی</option>
                <option value="create_contract_draft">ساخت پیش‌نویس قرارداد (نیازمند تأیید)</option>
                <option value="send_offline_message">ارسال پیام خارج از ساعت کاری</option>
                <option value="generate_content_draft">تولید پیش‌نویس محتوا (نیازمند تأیید)</option>
                <option value="preview_price_update">پیش‌نمایش اختلاف قیمت با سقف تغییر</option>
              </select>
            </div>
          </div>
          <label className="flex items-center gap-2 text-xs text-slate-700">
            <input
              type="checkbox"
              checked={form.requiresExplicitApproval}
              onChange={(e) => setForm({ ...form, requiresExplicitApproval: e.target.checked })}
            />
            <span>پیش از اجرای نهایی، نیازمند تأیید صریح مدیر باشد</span>
          </label>
          <div className="flex items-center gap-3">
            <button
              type="submit"
              className="rounded-lg bg-slate-950 px-4 py-2 text-xs font-semibold text-white hover:bg-slate-800"
            >
              ذخیره قانون (نسخه ۱)
            </button>
            <button type="button" onClick={() => setShowBuilder(false)} className="text-xs text-slate-500">
              انصراف
            </button>
          </div>
        </form>
      )}

      {/* Rules Table */}
      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
        <table className="w-full text-right text-xs">
          <thead className="border-b border-slate-200 bg-slate-50 text-slate-500">
            <tr>
              <th className="px-4 py-3 font-semibold">قانون و نسخه</th>
              <th className="px-4 py-3 font-semibold">شرط ← اقدام</th>
              <th className="px-4 py-3 font-semibold">اجراها</th>
              <th className="px-4 py-3 font-semibold">وضعیت</th>
              <th className="px-4 py-3 font-semibold">عملیات</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200">
            {loading && (
              <tr>
                <td colSpan={5} className="p-6 text-center text-slate-400">در حال بارگذاری قوانین...</td>
              </tr>
            )}
            {rules.map((r) => (
              <tr key={r.id}>
                <td className="px-4 py-3 align-top">
                  <div className="font-bold text-slate-950">{r.name}</div>
                  <div className="mt-0.5 text-[11px] text-slate-500">
                    نسخه {r.version}
                    {r.requiresExplicitApproval ? ' · نیازمند مجوز صریح' : ''}
                    {r.isDemo ? ' · نمونه' : ''}
                  </div>
                </td>
                <td className="px-4 py-3 align-top max-w-md space-y-1 text-slate-700">
                  <div>
                    <span className="text-slate-400">شرط:</span> {r.conditionSummaryFa}
                  </div>
                  <div>
                    <span className="text-slate-400">اقدام:</span> {r.actionSummaryFa}
                  </div>
                </td>
                <td className="px-4 py-3 align-top tabular-nums text-slate-600">{r.runCount}</td>
                <td className="px-4 py-3 align-top">
                  <span className={r.enabled ? 'font-semibold text-emerald-700' : 'text-slate-400'}>
                    {r.enabled ? 'فعال' : 'متوقف'}
                  </span>
                </td>
                <td className="px-4 py-3 align-top">
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => void runDryTest(r.id)}
                      className="inline-flex items-center gap-1 rounded border border-slate-200 px-2.5 py-1 text-[11px] font-medium text-slate-700 hover:bg-slate-50 whitespace-nowrap"
                    >
                      <Play className="h-3 w-3" />
                      اجرای آزمایشی
                    </button>
                    <button
                      type="button"
                      onClick={() => void toggleRule(r.id)}
                      className="rounded border border-slate-200 px-2.5 py-1 text-[11px] font-medium text-slate-700 hover:bg-slate-50 whitespace-nowrap"
                    >
                      {r.enabled ? 'توقف دستی' : 'فعالسازی'}
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Run History */}
      <div className="rounded-xl border border-slate-200 bg-white p-4 space-y-3">
        <div className="text-sm font-bold text-slate-950">تاریخچه اجراها و پیش‌نمایش‌ها</div>
        <div className="divide-y divide-slate-100 text-xs">
          {runs.length === 0 && <div className="py-4 text-slate-400">هنوز اجرایی ثبت نشده است.</div>}
          {runs.map((run) => (
            <div key={run.id} className="flex flex-wrap items-center justify-between gap-2 py-2.5">
              <div>
                <div className="font-semibold text-slate-900">
                  {run.ruleName} (نسخه {run.ruleVersion}) ·{' '}
                  <span className="font-normal text-blue-700">{run.status}</span>
                </div>
                <div className="text-slate-600">{run.outputSummaryFa}</div>
              </div>
              <div className="text-[11px] text-slate-400 tabular-nums">{formatFaDateTime(run.createdAt)}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

// ============================================================================
// 3. CONTRACTS MODULE (STANDALONE OR FROM CONVERSATION + VERSIONING + PERSIAN PDF)
// ============================================================================
export const ContractsView: React.FC<{
  siteId: string;
  initialConversation?: ConversationRecord | null;
  onClearInitialConv: () => void;
}> = ({ siteId, initialConversation, onClearInitialConv }) => {
  const [contracts, setContracts] = useState<ContractRecord[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(Boolean(initialConversation));
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copiedLink, setCopiedLink] = useState(false);

  const [createForm, setCreateForm] = useState({
    customerName: initialConversation?.visitorName || '',
    customerContact: initialConversation?.visitorContact || '',
    templateName: 'قرارداد فروش و خدمات پس از فروش',
    title: initialConversation ? `قرارداد ${initialConversation.subject}` : '',
    amountToman: 50000000,
    durationText: '۶ ماه',
    termsFa: 'تحویل حداکثر ۵ روز کاری · پشتیبانی فنی از طریق مرکز پاسخگویی راماکس',
    bodyFa: '',
    generateWithAi: true,
  });

  const [revBody, setRevBody] = useState('');
  const [revNote, setRevNote] = useState('');
  const [revAmount, setRevAmount] = useState(0);

  async function load() {
    setLoading(true);
    try {
      const res = await apiFetch<{ contracts: ContractRecord[] }>(`/api/contracts/${siteId}`);
      setContracts(res.contracts);
      if (res.contracts.length > 0 && !selectedId) {
        setSelectedId(res.contracts[0].id);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'خطا در بارگذاری قراردادها.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, [siteId]);

  useEffect(() => {
    if (initialConversation) {
      setShowCreate(true);
      setCreateForm((prev) => ({
        ...prev,
        customerName: initialConversation.visitorName,
        customerContact: initialConversation.visitorContact,
        title: `قرارداد ${initialConversation.subject}`,
      }));
    }
  }, [initialConversation]);

  const activeContract = contracts.find((c) => c.id === selectedId) || null;

  useEffect(() => {
    if (activeContract) {
      const latest = activeContract.versions[activeContract.versions.length - 1];
      setRevBody(latest?.bodyFa || '');
      setRevAmount(latest?.amountToman || 0);
      setRevNote('');
    }
  }, [activeContract?.id, activeContract?.currentVersion]);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const res = await apiFetch<{ contract: ContractRecord }>(`/api/contracts/${siteId}`, {
        method: 'POST',
        body: JSON.stringify({
          ...createForm,
          conversationId: initialConversation?.id,
        }),
      });
      setContracts((prev) => [res.contract, ...prev]);
      setSelectedId(res.contract.id);
      setShowCreate(false);
      onClearInitialConv();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'خطا در ساخت قرارداد.');
    } finally {
      setSaving(false);
    }
  }

  async function handleSaveRevision(newStatus?: ContractStatus) {
    if (!activeContract) return;
    setSaving(true);
    setError(null);
    try {
      const res = await apiFetch<{ contract: ContractRecord }>(
        `/api/contracts/${siteId}/${activeContract.id}`,
        {
          method: 'PUT',
          body: JSON.stringify({
            bodyFa: revBody,
            amountToman: revAmount,
            noteFa: revNote || `بازبینی نسخه ${activeContract.currentVersion + 1}`,
            status: newStatus || activeContract.status,
          }),
        }
      );
      setContracts((prev) => prev.map((c) => (c.id === res.contract.id ? res.contract : c)));
      setRevNote('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'خطا در ذخیره نسخه قرارداد.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold text-slate-950">مدیریت قراردادها و خروجی PDF فارسی</h2>
          <p className="text-xs text-slate-500">
            تغییر نسخه پس از ارسال سابقه نسخه قبلی را حفظ می‌کند. نهایی‌سازی نیازمند مجوز مدیر است و امضای دیجیتال فقط در صورت اتصال سرویس واقعی فعال می‌شود.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setShowCreate((v) => !v)}
          className="inline-flex items-center gap-1.5 rounded-lg bg-blue-700 px-4 py-2 text-xs font-semibold text-white hover:bg-blue-800"
        >
          <Plus className="h-4 w-4" />
          قرارداد جدید
        </button>
      </div>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-xs text-red-700">{error}</div>
      )}

      {showCreate && (
        <form onSubmit={handleCreate} className="rounded-xl border border-slate-200 bg-white p-5 space-y-4">
          <div className="flex items-center justify-between">
            <div className="text-sm font-bold text-slate-950">
              ایجاد پیش‌نویس قرارداد {initialConversation ? `(متصل به گفتگوی ${initialConversation.ticketNumber})` : ''}
            </div>
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-700">نام مشتری / شرکت *</label>
              <input
                type="text"
                required
                value={createForm.customerName}
                onChange={(e) => setCreateForm({ ...createForm, customerName: e.target.value })}
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-xs"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-700">عنوان قرارداد *</label>
              <input
                type="text"
                required
                value={createForm.title}
                onChange={(e) => setCreateForm({ ...createForm, title: e.target.value })}
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-xs"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-700">مبلغ کل (تومان)</label>
              <input
                type="number"
                value={createForm.amountToman}
                onChange={(e) => setCreateForm({ ...createForm, amountToman: Number(e.target.value) || 0 })}
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-xs tabular-nums"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-700">مدت قرارداد</label>
              <input
                type="text"
                value={createForm.durationText}
                onChange={(e) => setCreateForm({ ...createForm, durationText: e.target.value })}
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-xs"
              />
            </div>
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-700">شرایط کلیدی</label>
            <input
              type="text"
              value={createForm.termsFa}
              onChange={(e) => setCreateForm({ ...createForm, termsFa: e.target.value })}
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-xs"
            />
          </div>
          <label className="flex items-center gap-2 text-xs text-slate-700">
            <input
              type="checkbox"
              checked={createForm.generateWithAi}
              onChange={(e) => setCreateForm({ ...createForm, generateWithAi: e.target.checked })}
            />
            <span>تهیه خودکار متن پیش‌نویس با هوش مصنوعی راماکس (ارسال فقط پس از تأیید مدیر)</span>
          </label>
          <div className="flex items-center gap-3">
            <button
              type="submit"
              disabled={saving}
              className="rounded-lg bg-slate-950 px-4 py-2 text-xs font-semibold text-white hover:bg-slate-800 disabled:opacity-50"
            >
              {saving ? 'در حال تولید پیش‌نویس...' : 'ساخت پیش‌نویس قرارداد'}
            </button>
            <button
              type="button"
              onClick={() => {
                setShowCreate(false);
                onClearInitialConv();
              }}
              className="text-xs text-slate-500"
            >
              انصراف
            </button>
          </div>
        </form>
      )}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        {/* Contracts List */}
        <div className="lg:col-span-4 rounded-xl border border-slate-200 bg-white divide-y divide-slate-100">
          {loading && <div className="p-4 text-xs text-slate-400">در حال بارگذاری...</div>}
          {!loading && contracts.length === 0 && (
            <div className="p-6 text-center text-xs text-slate-500">هنوز قراردادی برای این سایت ثبت نشده است.</div>
          )}
          {contracts.map((c) => (
            <button
              key={c.id}
              type="button"
              onClick={() => setSelectedId(c.id)}
              className={`w-full p-4 text-right transition-colors ${
                c.id === selectedId ? 'bg-blue-50/70' : 'hover:bg-slate-50'
              }`}
            >
              <div className="flex items-center justify-between text-xs">
                <span className="font-mono font-semibold text-slate-700">{c.contractNumber}</span>
                <span className="text-blue-700 font-medium">{CONTRACT_STATUS_LABELS_FA[c.status]}</span>
              </div>
              <div className="mt-1 text-sm font-bold text-slate-950 line-clamp-1">{c.title}</div>
              <div className="mt-1 text-xs text-slate-500 tabular-nums">
                {c.customerName} · {formatToman(c.amountToman)} · نسخه {c.currentVersion}
              </div>
            </button>
          ))}
        </div>

        {/* Selected Contract Editor, Versions & PDF Export */}
        <div className="lg:col-span-8">
          {!activeContract ? (
            <div className="rounded-xl border border-slate-200 bg-white p-8 text-center text-xs text-slate-400">
              یک قرارداد را برای بازبینی یا خروجی PDF انتخاب کنید.
            </div>
          ) : (
            <div className="rounded-xl border border-slate-200 bg-white p-5 space-y-5">
              <div className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-200 pb-4">
                <div>
                  <div className="text-xs text-slate-500">
                    {activeContract.contractNumber} · نسخه {activeContract.currentVersion} ·{' '}
                    {CONTRACT_STATUS_LABELS_FA[activeContract.status]}
                  </div>
                  <h3 className="mt-1 text-base font-bold text-slate-950">{activeContract.title}</h3>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <a
                    href={`/api/contracts/${siteId}/${activeContract.id}/pdf`}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1.5 rounded-lg bg-slate-950 px-3.5 py-2 text-xs font-semibold text-white hover:bg-slate-800"
                  >
                    <FileText className="h-3.5 w-3.5" />
                    خروجی PDF فارسی (Vazirmatn)
                  </a>
                  <button
                    type="button"
                    onClick={() => {
                      const url = `${window.location.origin}/contract/view/${activeContract.shareToken}`;
                      navigator.clipboard?.writeText(url);
                      setCopiedLink(true);
                      window.setTimeout(() => setCopiedLink(false), 1800);
                    }}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50"
                  >
                    {copiedLink ? <Check className="h-3.5 w-3.5 text-emerald-600" /> : <ExternalLink className="h-3.5 w-3.5" />}
                    {copiedLink ? 'لینک کپی شد' : 'کپی لینک مشاهده مشتری'}
                  </button>
                </div>
              </div>

              {/* Status Pipeline */}
              <div className="flex flex-wrap items-center gap-1.5 text-xs">
                {(['draft', 'review', 'ready_to_send', 'sent', 'approved', 'archived'] as ContractStatus[]).map(
                  (st) => (
                    <button
                      key={st}
                      type="button"
                      onClick={() => void handleSaveRevision(st)}
                      className={`rounded-md px-2.5 py-1 font-medium transition-colors ${
                        activeContract.status === st
                          ? 'bg-blue-700 text-white'
                          : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                      }`}
                    >
                      {CONTRACT_STATUS_LABELS_FA[st]}
                    </button>
                  )
                )}
              </div>

              {/* View & Accept Tracking */}
              <div className="flex flex-wrap items-center gap-4 text-xs text-slate-600 bg-slate-50 rounded-lg px-3.5 py-2.5">
                <span>مشاهده مشتری: {activeContract.viewedAt ? formatFaDateTime(activeContract.viewedAt) : 'هنوز مشاهده نشده'}</span>
                <span>·</span>
                <span>
                  پذیرش مشتری:{' '}
                  {activeContract.acceptedAt
                    ? `تأیید توسط ${activeContract.acceptedByName} (${formatFaDateTime(activeContract.acceptedAt)})`
                    : 'در انتظار تأیید'}
                </span>
                <span>·</span>
                <span>امضای دیجیتال: متصل‌نشده</span>
              </div>

              {/* Revision Editor */}
              <div className="space-y-3">
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <div>
                    <label className="mb-1 block text-xs font-medium text-slate-700">مبلغ قرارداد (تومان)</label>
                    <input
                      type="number"
                      value={revAmount}
                      onChange={(e) => setRevAmount(Number(e.target.value) || 0)}
                      className="w-full rounded-lg border border-slate-200 px-3 py-2 text-xs tabular-nums"
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-medium text-slate-700">توضیح این بازبینی</label>
                    <input
                      type="text"
                      value={revNote}
                      onChange={(e) => setRevNote(e.target.value)}
                      placeholder="مثلاً اصلاح بند زمان تحویل"
                      className="w-full rounded-lg border border-slate-200 px-3 py-2 text-xs"
                    />
                  </div>
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-slate-700">
                    متن مفاد قرارداد (ذخیره تغییر، نسخه جدید ایجاد و نسخه قبلی را حفظ می‌کند)
                  </label>
                  <textarea
                    rows={8}
                    value={revBody}
                    onChange={(e) => setRevBody(e.target.value)}
                    className="w-full rounded-lg border border-slate-200 p-3 text-xs leading-7"
                  />
                </div>
                <button
                  type="button"
                  disabled={saving}
                  onClick={() => void handleSaveRevision()}
                  className="rounded-lg bg-blue-700 px-4 py-2 text-xs font-semibold text-white hover:bg-blue-800 disabled:opacity-50"
                >
                  {saving ? 'در حال ثبت...' : 'ثبت بازبینی و ذخیره نسخه جدید'}
                </button>
              </div>

              {/* Immutable Version History */}
              <div className="border-t border-slate-200 pt-4 space-y-2">
                <div className="text-xs font-bold text-slate-900">سابقه نسخه‌های قرارداد</div>
                <div className="space-y-2">
                  {[...activeContract.versions].reverse().map((v) => (
                    <div key={v.version} className="rounded-lg border border-slate-100 bg-slate-50 p-3 text-xs">
                      <div className="flex items-center justify-between font-semibold text-slate-800">
                        <span>نسخه {v.version} · {v.noteFa}</span>
                        <span className="tabular-nums text-slate-500">{formatFaDateTime(v.createdAt)}</span>
                      </div>
                      <div className="mt-1 text-[11px] text-slate-500 tabular-nums">
                        ویرایشگر: {v.editedBy} · مبلغ: {formatToman(v.amountToman)}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

// ============================================================================
// 4. CONTENT & PRODUCT AI ASSISTANT (SMALL RAMAX BUTTON NEXT TO EACH FIELD)
// ============================================================================
export const ContentProductView: React.FC<{ siteId: string }> = ({ siteId }) => {
  const [productName, setProductName] = useState('دستگاه اسپرسوساز نیمه‌صنعتی باریستا پرو ۱۵ بار');
  const [specs, setSpecs] = useState('فشار ۱۵ بار واقعی، بویلر استیل، کنترل دمای PID، گارانتی ۱۸ ماهه');
  const [titleVal, setTitleVal] = useState('دستگاه اسپرسوساز باریستا پرو');
  const [descVal, setDescVal] = useState('');
  const [seoVal, setSeoVal] = useState('');

  const [pendingField, setPendingField] = useState<'title' | 'description' | 'seo_meta' | null>(null);
  const [suggestion, setSuggestion] = useState<string | null>(null);
  const [loadingField, setLoadingField] = useState<string | null>(null);
  const [statusMsg, setStatusMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Honest Product Photo framing/light preview state
  const [photoBrightness, setPhotoBrightness] = useState(105);
  const [whiteBgMode, setWhiteBgMode] = useState(true);

  async function requestRamaxAssist(field: 'title' | 'description' | 'seo_meta') {
    setLoadingField(field);
    setError(null);
    setStatusMsg(null);
    try {
      const currentText = field === 'title' ? titleVal : field === 'description' ? descVal : seoVal;
      const res = await apiFetch<{ suggestion: string; chargedToman: number }>(
        `/api/content/${siteId}/product-assist`,
        {
          method: 'POST',
          body: JSON.stringify({
            field,
            productName,
            currentText,
            specs,
            idempotencyKey: `pa_${siteId}_${field}_${Date.now()}`,
          }),
        }
      );
      setPendingField(field);
      setSuggestion(res.suggestion);
      setStatusMsg(`پیشنهاد راماکس آماده بررسی است (هزینه تسویه‌شده: ${formatToman(res.chargedToman)}).`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'خطا در دریافت پیشنهاد راماکس.');
    } finally {
      setLoadingField(null);
    }
  }

  function applySuggestion() {
    if (!pendingField || !suggestion) return;
    if (pendingField === 'title') setTitleVal(suggestion);
    if (pendingField === 'description') setDescVal(suggestion);
    if (pendingField === 'seo_meta') setSeoVal(suggestion);
    setPendingField(null);
    setSuggestion(null);
  }

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
      <div className="lg:col-span-7 rounded-xl border border-slate-200 bg-white p-5 space-y-4">
        <div>
          <h2 className="text-base font-bold text-slate-950">فرم تولید و ویرایش محصول با دستیار راماکس</h2>
          <p className="text-xs text-slate-500">
            کنار هر فیلد دکمه «راماکس» قرار دارد. پیشنهاد پس از مشاهده و تأیید شما در فیلد جایگذاری می‌شود.
          </p>
        </div>

        {error && <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-xs text-red-700">{error}</div>}
        {statusMsg && (
          <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-xs text-emerald-800">
            {statusMsg}
          </div>
        )}

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-700">نام پایه کالا</label>
            <input
              type="text"
              value={productName}
              onChange={(e) => setProductName(e.target.value)}
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-xs"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-700">مشخصات فنی واقعی (تغییرناپذیر)</label>
            <input
              type="text"
              value={specs}
              onChange={(e) => setSpecs(e.target.value)}
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-xs"
            />
          </div>
        </div>

        {/* Title Field + Ramax Button */}
        <div>
          <div className="mb-1 flex items-center justify-between">
            <label className="text-xs font-medium text-slate-700">عنوان محصول</label>
            <button
              type="button"
              disabled={loadingField !== null}
              onClick={() => void requestRamaxAssist('title')}
              className="inline-flex items-center gap-1 rounded-md border border-blue-200 bg-blue-50 px-2.5 py-1 text-[11px] font-semibold text-blue-800 hover:bg-blue-100 disabled:opacity-50"
            >
              <Sparkles className="h-3 w-3" />
              {loadingField === 'title' ? 'در حال نگارش...' : 'راماکس'}
            </button>
          </div>
          <input
            type="text"
            value={titleVal}
            onChange={(e) => setTitleVal(e.target.value)}
            className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
          />
        </div>

        {/* Description Field + Ramax Button */}
        <div>
          <div className="mb-1 flex items-center justify-between">
            <label className="text-xs font-medium text-slate-700">توضیحات محصول</label>
            <button
              type="button"
              disabled={loadingField !== null}
              onClick={() => void requestRamaxAssist('description')}
              className="inline-flex items-center gap-1 rounded-md border border-blue-200 bg-blue-50 px-2.5 py-1 text-[11px] font-semibold text-blue-800 hover:bg-blue-100 disabled:opacity-50"
            >
              <Sparkles className="h-3 w-3" />
              {loadingField === 'description' ? 'در حال نگارش...' : 'راماکس'}
            </button>
          </div>
          <textarea
            rows={5}
            value={descVal}
            onChange={(e) => setDescVal(e.target.value)}
            placeholder="توضیحات محصول یا کلیک روی دکمه راماکس برای تولید پیش‌نویس..."
            className="w-full rounded-lg border border-slate-200 p-3 text-xs leading-6"
          />
        </div>

        {/* SEO Meta Field + Ramax Button */}
        <div>
          <div className="mb-1 flex items-center justify-between">
            <label className="text-xs font-medium text-slate-700">متادیتا و سئو (Meta Title / Description)</label>
            <button
              type="button"
              disabled={loadingField !== null}
              onClick={() => void requestRamaxAssist('seo_meta')}
              className="inline-flex items-center gap-1 rounded-md border border-blue-200 bg-blue-50 px-2.5 py-1 text-[11px] font-semibold text-blue-800 hover:bg-blue-100 disabled:opacity-50"
            >
              <Sparkles className="h-3 w-3" />
              {loadingField === 'seo_meta' ? 'در حال نگارش...' : 'راماکس'}
            </button>
          </div>
          <textarea
            rows={3}
            value={seoVal}
            onChange={(e) => setSeoVal(e.target.value)}
            className="w-full rounded-lg border border-slate-200 p-3 text-xs leading-6"
          />
        </div>

        {suggestion && (
          <div className="rounded-xl border border-blue-200 bg-blue-50/70 p-4 space-y-2.5">
            <div className="text-xs font-bold text-blue-950">پیشنهاد تولیدشده راماکس (پیش از اعمال بررسی کنید):</div>
            <p className="whitespace-pre-wrap text-xs leading-6 text-slate-800">{suggestion}</p>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={applySuggestion}
                className="rounded-lg bg-blue-700 px-3.5 py-1.5 text-xs font-semibold text-white hover:bg-blue-800"
              >
                تأیید و جایگذاری در فیلد
              </button>
              <button
                type="button"
                onClick={() => {
                  setSuggestion(null);
                  setPendingField(null);
                }}
                className="text-xs text-slate-600"
              >
                انصراف
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Product Photo Before/After Framing & Compression Preview */}
      <div className="lg:col-span-5 rounded-xl border border-slate-200 bg-white p-5 space-y-4">
        <div>
          <h3 className="text-sm font-bold text-slate-950">پیش‌نمایش بهینه‌سازی تصویر محصول (نمونه)</h3>
          <p className="text-xs text-slate-500">
            تنظیم نور، قاب استاندارد و فشرده‌سازی بدون تغییر ویژگی واقعی محصول. حذف پس‌زمینه هوشمند پس از اتصال سرویس
            «راماکس استودیو» فعال می‌شود.
          </p>
        </div>

        <div className="grid grid-cols-2 gap-3 text-center text-[11px]">
          <div className="space-y-1.5">
            <div className="overflow-hidden rounded-lg border border-slate-200">
              <img
                src={ASSETS.ecommerceStudio}
                alt="تصویر قبل از تنظیم"
                referrerPolicy="no-referrer"
                className="aspect-square w-full object-cover"
              />
            </div>
            <span className="text-slate-500">قبل از تنظیم</span>
          </div>
          <div className="space-y-1.5">
            <div
              className={`overflow-hidden rounded-lg border border-slate-200 p-2 ${
                whiteBgMode ? 'bg-white' : 'bg-slate-100'
              }`}
            >
              <img
                src={ASSETS.ecommerceStudio}
                alt="پیش‌نمایش بعد از تنظیم نور و قاب"
                referrerPolicy="no-referrer"
                className="aspect-square w-full rounded object-cover"
                style={{ filter: `brightness(${photoBrightness}%) contrast(104%)` }}
              />
            </div>
            <span className="font-medium text-slate-800">پیش‌نمایش قاب و نور</span>
          </div>
        </div>

        <div className="space-y-3 border-t border-slate-100 pt-3 text-xs">
          <div>
            <div className="flex justify-between mb-1">
              <span>تنظیم روشنایی استودیویی</span>
              <span className="tabular-nums">{photoBrightness}%</span>
            </div>
            <input
              type="range"
              min={85}
              max={125}
              value={photoBrightness}
              onChange={(e) => setPhotoBrightness(Number(e.target.value))}
              className="w-full"
            />
          </div>
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={whiteBgMode}
              onChange={(e) => setWhiteBgMode(e.target.checked)}
            />
            <span>حاشیه و قاب سفید استاندارد فروشگاه (WebP فشرده)</span>
          </label>
          <div className="rounded-lg border border-amber-200 bg-amber-50 p-2.5 text-[11px] leading-5 text-amber-950">
            سرویس پردازش تصویر تولیدی «راماکس استودیو» در حال حاضر به کلید تصویرسازی متصل نیست؛ تنها تنظیمات غیرتخریبی
            نور و قاب نمایش داده می‌شود.
          </div>
        </div>
      </div>
    </div>
  );
};

// ============================================================================
// 5. TEAM & DEPARTMENTS VIEW
// ============================================================================
export const TeamView: React.FC<{
  siteId: string;
  allSites: SiteRecord[];
}> = ({ siteId, allSites }) => {
  const [members, setMembers] = useState<SessionUser[]>([]);
  const [departments, setDepartments] = useState<DepartmentRecord[]>([]);
  const [invites, setInvites] = useState<
    { id: string; name: string; emailOrUsername: string; role: UserRole; expiresAt: string; status: string }[]
  >([]);
  const [inviteForm, setInviteForm] = useState({
    name: '',
    emailOrUsername: '',
    role: 'operator' as UserRole,
    siteIds: [siteId],
    departmentIds: [] as string[],
    expiresAt: new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10),
    createImmediateDemoPassword: true,
  });
  const [tempCred, setTempCred] = useState<string | null>(null);
  const [newDepName, setNewDepName] = useState('');
  const [newDepHours, setNewDepHours] = useState('شنبه تا پنجشنبه ۰۹:۰۰ تا ۱۸:۰۰');
  const [error, setError] = useState<string | null>(null);

  async function load() {
    try {
      const res = await apiFetch<{
        members: SessionUser[];
        departments: DepartmentRecord[];
        invites: typeof invites;
      }>(`/api/sites/${siteId}/team`);
      setMembers(res.members);
      setDepartments(res.departments);
      setInvites(res.invites);
      setInviteForm((f) => ({ ...f, siteIds: [siteId] }));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'خطا در دریافت اطلاعات تیم.');
    }
  }

  useEffect(() => {
    void load();
  }, [siteId]);

  const selectedRoleMatrix = ROLE_PERMISSIONS.find((r) => r.role === inviteForm.role);

  async function sendInvite(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setTempCred(null);
    try {
      const res = await apiFetch<{ tempPassword?: string }>(`/api/sites/${siteId}/team/invite`, {
        method: 'POST',
        body: JSON.stringify(inviteForm),
      });
      if (res.tempPassword) {
        setTempCred(`حساب ساخته شد · رمز موقت یک‌بارمصرف (الزام تغییر در ورود اول): ${res.tempPassword}`);
      }
      setInviteForm({ ...inviteForm, name: '', emailOrUsername: '' });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'خطا در ثبت دعوت.');
    }
  }

  async function addDepartment(e: React.FormEvent) {
    e.preventDefault();
    if (!newDepName.trim()) return;
    await apiFetch(`/api/sites/${siteId}/departments`, {
      method: 'POST',
      body: JSON.stringify({ name: newDepName.trim(), workingHours: newDepHours }),
    });
    setNewDepName('');
    await load();
  }

  return (
    <div className="space-y-6">
      {error && <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-xs text-red-700">{error}</div>}
      {tempCred && (
        <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-xs font-medium text-emerald-900">
          {tempCred}
        </div>
      )}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        {/* Invite User Form with Permission Preview */}
        <form
          onSubmit={sendInvite}
          className="lg:col-span-6 rounded-xl border border-slate-200 bg-white p-5 space-y-4"
        >
          <h3 className="text-sm font-bold text-slate-950">افزودن یا دعوت عضو جدید به تیم</h3>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-xs text-slate-700">نام کامل *</label>
              <input
                type="text"
                required
                value={inviteForm.name}
                onChange={(e) => setInviteForm({ ...inviteForm, name: e.target.value })}
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-xs"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs text-slate-700">ایمیل یا نام کاربری *</label>
              <input
                type="text"
                required
                value={inviteForm.emailOrUsername}
                onChange={(e) => setInviteForm({ ...inviteForm, emailOrUsername: e.target.value })}
                className="ltr w-full rounded-lg border border-slate-200 px-3 py-2 text-xs text-left font-mono"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs text-slate-700">نقش</label>
              <select
                value={inviteForm.role}
                onChange={(e) => setInviteForm({ ...inviteForm, role: e.target.value as UserRole })}
                className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs"
              >
                {ROLE_PERMISSIONS.map((r) => (
                  <option key={r.role} value={r.role}>
                    {r.labelFa}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs text-slate-700">تاریخ انقضای دعوت</label>
              <input
                type="date"
                value={inviteForm.expiresAt}
                onChange={(e) => setInviteForm({ ...inviteForm, expiresAt: e.target.value })}
                className="ltr w-full rounded-lg border border-slate-200 px-3 py-2 text-xs font-mono"
              />
            </div>
          </div>

          <div className="space-y-1.5 text-xs">
            <div className="font-medium text-slate-700">سایت‌های مجاز</div>
            <div className="flex flex-wrap gap-3">
              {allSites.map((s) => (
                <label key={s.id} className="flex items-center gap-1.5">
                  <input
                    type="checkbox"
                    checked={inviteForm.siteIds.includes(s.id)}
                    onChange={(e) => {
                      const next = e.target.checked
                        ? [...inviteForm.siteIds, s.id]
                        : inviteForm.siteIds.filter((id) => id !== s.id);
                      setInviteForm({ ...inviteForm, siteIds: next });
                    }}
                  />
                  <span>{s.name}</span>
                </label>
              ))}
            </div>
          </div>

          {selectedRoleMatrix && (
            <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-xs space-y-1">
              <div className="font-semibold text-slate-900">
                پیش‌نمایش دسترسی‌های نقش «{selectedRoleMatrix.labelFa}»
              </div>
              <p className="text-slate-600">{selectedRoleMatrix.descriptionFa}</p>
              <div className="ltr text-right font-mono text-[11px] text-slate-500">
                {selectedRoleMatrix.permissions.join(' · ')}
              </div>
            </div>
          )}

          <button
            type="submit"
            className="rounded-lg bg-blue-700 px-4 py-2 text-xs font-semibold text-white hover:bg-blue-800"
          >
            ارسال دعوت و صدور رمز موقت
          </button>
        </form>

        {/* Departments CRUD */}
        <div className="lg:col-span-6 rounded-xl border border-slate-200 bg-white p-5 space-y-4">
          <h3 className="text-sm font-bold text-slate-950">دپارتمان‌های سایت فعال</h3>
          <div className="divide-y divide-slate-100 text-xs">
            {departments.map((d) => (
              <div key={d.id} className="flex items-center justify-between py-2.5">
                <div>
                  <div className="font-semibold text-slate-900">
                    {d.name} {d.isDemo ? <span className="text-slate-400 font-normal">· نمونه</span> : null}
                  </div>
                  <div className="text-slate-500">
                    ساعت کاری: {d.workingHours} · ترتیب ارجاع: {d.routingOrder}
                  </div>
                </div>
                <span className="text-slate-500 tabular-nums">{d.memberIds.length} عضو</span>
              </div>
            ))}
          </div>
          <form onSubmit={addDepartment} className="grid grid-cols-1 gap-2 border-t border-slate-100 pt-3 sm:grid-cols-3">
            <input
              type="text"
              value={newDepName}
              onChange={(e) => setNewDepName(e.target.value)}
              placeholder="نام دپارتمان جدید"
              className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs"
            />
            <input
              type="text"
              value={newDepHours}
              onChange={(e) => setNewDepHours(e.target.value)}
              className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs"
            />
            <button
              type="submit"
              className="rounded-lg bg-slate-950 px-3 py-1.5 text-xs font-semibold text-white hover:bg-slate-800"
            >
              افزودن دپارتمان
            </button>
          </form>
        </div>
      </div>

      {/* Active Members Table */}
      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
        <table className="w-full text-right text-xs">
          <thead className="border-b border-slate-200 bg-slate-50 text-slate-500">
            <tr>
              <th className="px-4 py-3 font-semibold">عضو تیم</th>
              <th className="px-4 py-3 font-semibold">نام کاربری</th>
              <th className="px-4 py-3 font-semibold">نقش</th>
              <th className="px-4 py-3 font-semibold">تعداد سایت‌های مجاز</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200">
            {members.map((m) => (
              <tr key={m.id}>
                <td className="px-4 py-3 font-semibold text-slate-950">{m.name}</td>
                <td className="px-4 py-3 font-mono ltr text-right text-slate-600">{m.username}</td>
                <td className="px-4 py-3 text-slate-700">{ROLE_LABELS_FA[m.role]}</td>
                <td className="px-4 py-3 tabular-nums text-slate-600">{m.allowedSiteIds.length} سایت</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

// ============================================================================
// 6. WALLET & MANUAL PAYMENT FORMS (CARD-TO-CARD / CRYPTO / PAYMENT LINK)
// ============================================================================
export const WalletView: React.FC<{ siteId: string }> = ({ siteId }) => {
  const [data, setData] = useState<{
    balanceToman: number;
    reservedToman: number;
    tariffVersion: string;
    taxPercent: number;
    transactions: WalletTransaction[];
    manualPayments: ManualPaymentRequest[];
  } | null>(null);
  const [method, setMethod] = useState<'card_to_card' | 'crypto' | 'payment_link'>('card_to_card');
  const [amountToman, setAmountToman] = useState(1000000);
  const [trackingCode, setTrackingCode] = useState('');
  const [networkOrBank, setNetworkOrBank] = useState('');
  const [noteFa, setNoteFa] = useState('');
  const [msg, setMsg] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);

  async function load() {
    try {
      const res = await apiFetch<typeof data>(`/api/wallet/${siteId}`);
      setData(res);
    } catch (err) {
      setMsg({ type: 'err', text: err instanceof Error ? err.message : 'دسترسی به کیف پول این سایت مجاز نیست.' });
    }
  }

  useEffect(() => {
    void load();
  }, [siteId]);

  async function submitManualPayment(e: React.FormEvent) {
    e.preventDefault();
    setMsg(null);
    try {
      await apiFetch(`/api/wallet/${siteId}/manual-payment`, {
        method: 'POST',
        body: JSON.stringify({
          method,
          amountToman,
          trackingCodeOrTxId: trackingCode,
          networkOrBank,
          noteFa,
        }),
      });
      setTrackingCode('');
      setNoteFa('');
      setMsg({
        type: 'ok',
        text: 'درخواست پرداخت دستی با موفقیت ثبت شد و در صف بررسی مدیرکل قرار گرفت (تأیید خودکار انجام نمی‌شود).',
      });
      await load();
    } catch (err) {
      setMsg({ type: 'err', text: err instanceof Error ? err.message : 'خطا در ثبت پرداخت.' });
    }
  }

  return (
    <div className="space-y-6">
      {msg && (
        <div
          className={`rounded-lg border p-3 text-xs ${
            msg.type === 'ok'
              ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
              : 'border-red-200 bg-red-50 text-red-700'
          }`}
        >
          {msg.text}
        </div>
      )}

      {data && (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <div className="rounded-xl border border-slate-200 bg-white p-5">
            <div className="text-xs text-slate-500">موجودی کیف پول سایت فعال</div>
            <div className="mt-2 text-2xl font-extrabold text-slate-950 tabular-nums">
              {formatToman(data.balanceToman)}
            </div>
          </div>
          <div className="rounded-xl border border-slate-200 bg-white p-5">
            <div className="text-xs text-slate-500">مبلغ رزروشده در عملیات جاری</div>
            <div className="mt-2 text-2xl font-extrabold text-amber-700 tabular-nums">
              {formatToman(data.reservedToman)}
            </div>
          </div>
          <div className="rounded-xl border border-slate-200 bg-white p-5">
            <div className="text-xs text-slate-500">نسخه تعرفه فعال و مالیات</div>
            <div className="mt-2 text-lg font-bold text-slate-900 tabular-nums">
              {data.tariffVersion} · {data.taxPercent}٪ مالیات
            </div>
          </div>
        </div>
      )}

      {/* Manual Payment Forms */}
      <form onSubmit={submitManualPayment} className="rounded-xl border border-slate-200 bg-white p-5 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-sm font-bold text-slate-950">ثبت درخواست شارژ کیف پول</h3>
          <div className="flex items-center gap-1 rounded-lg bg-slate-100 p-1 text-xs">
            {(['card_to_card', 'crypto', 'payment_link'] as const).map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => setMethod(m)}
                className={`rounded-md px-3 py-1.5 font-medium ${
                  method === m ? 'bg-white text-slate-950 shadow-sm' : 'text-slate-600'
                }`}
              >
                {PAYMENT_METHOD_LABELS_FA[m]}
              </button>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <div>
            <label className="mb-1 block text-xs text-slate-700">مبلغ (تومان) *</label>
            <input
              type="number"
              required
              min={50000}
              value={amountToman}
              onChange={(e) => setAmountToman(Number(e.target.value) || 0)}
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-xs tabular-nums"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs text-slate-700">
              {method === 'crypto' ? 'شناسه تراکنش (TxID) *' : 'شماره پیگیری / مرجع *'}
            </label>
            <input
              type="text"
              required
              value={trackingCode}
              onChange={(e) => setTrackingCode(e.target.value)}
              placeholder={method === 'crypto' ? '0x...' : '1234567890'}
              className="ltr w-full rounded-lg border border-slate-200 px-3 py-2 text-xs text-left font-mono"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs text-slate-700">
              {method === 'crypto' ? 'شبکه (مثلاً TRC20 / Ton)' : 'بانک یا درگاه'}
            </label>
            <input
              type="text"
              value={networkOrBank}
              onChange={(e) => setNetworkOrBank(e.target.value)}
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-xs"
            />
          </div>
        </div>
        <input
          type="text"
          value={noteFa}
          onChange={(e) => setNoteFa(e.target.value)}
          placeholder="توضیحات تکمیلی (اختیاری)"
          className="w-full rounded-lg border border-slate-200 px-3 py-2 text-xs"
        />
        <button
          type="submit"
          className="rounded-lg bg-blue-700 px-4 py-2 text-xs font-semibold text-white hover:bg-blue-800"
        >
          ثبت برای بررسی و تأیید مدیرکل
        </button>
      </form>

      {/* Transactions & Manual Payment History */}
      {data && (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          <div className="rounded-xl border border-slate-200 bg-white p-4 space-y-3">
            <div className="text-sm font-bold text-slate-950">تراکنش‌های کیف پول سایت</div>
            <div className="divide-y divide-slate-100 text-xs">
              {data.transactions.length === 0 && <div className="py-4 text-slate-400">تراکنشی ثبت نشده است.</div>}
              {data.transactions.map((t) => (
                <div key={t.id} className="flex items-center justify-between gap-2 py-2.5">
                  <div>
                    <div className="font-medium text-slate-900">{t.descriptionFa}</div>
                    <div className="text-[11px] text-slate-500">
                      نسخه تعرفه: {t.tariffVersion} · وضعیت: {t.status}
                    </div>
                  </div>
                  <div
                    className={`font-bold tabular-nums shrink-0 ${
                      t.amountToman >= 0 ? 'text-emerald-700' : 'text-slate-900'
                    }`}
                  >
                    {formatToman(t.amountToman)}
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-xl border border-slate-200 bg-white p-4 space-y-3">
            <div className="text-sm font-bold text-slate-950">درخواست‌های پرداخت دستی</div>
            <div className="divide-y divide-slate-100 text-xs">
              {data.manualPayments.length === 0 && <div className="py-4 text-slate-400">درخواستی ثبت نشده است.</div>}
              {data.manualPayments.map((p) => (
                <div key={p.id} className="flex items-center justify-between gap-2 py-2.5">
                  <div>
                    <div className="font-semibold text-slate-900">
                      {PAYMENT_METHOD_LABELS_FA[p.method]} · {formatToman(p.amountToman)}
                    </div>
                    <div className="font-mono ltr text-right text-[11px] text-slate-500">
                      {p.trackingCodeOrTxId}
                    </div>
                  </div>
                  <span
                    className={`text-xs font-semibold ${
                      p.status === 'approved'
                        ? 'text-emerald-700'
                        : p.status === 'rejected'
                        ? 'text-red-700'
                        : 'text-amber-700'
                    }`}
                  >
                    {p.status === 'approved'
                      ? 'تأییدشده'
                      : p.status === 'rejected'
                      ? 'ردشده'
                      : 'در انتظار بررسی'}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

// ============================================================================
// 7. CUSTOMER SETTINGS, SECURITY, CONNECTIONS, WEBHOOKS & PLUGINS
// ============================================================================
export const CustomerSettingsView: React.FC<{
  user: SessionUser;
  site: SiteRecord | null;
  onRefreshSites: () => Promise<void>;
}> = ({ user, site, onRefreshSites }) => {
  const [subTab, setSubTab] = useState<'security' | 'connections' | 'webhooks' | 'plugins'>('security');
  const [newPassword, setNewPassword] = useState('');
  const [secQuestion, setSecQuestion] = useState('نام اولین محل کار شما؟');
  const [secAnswer, setSecAnswer] = useState('');
  const [webhookUrl, setWebhookUrl] = useState(site?.webhookUrl || '');
  const [rotatedKey, setRotatedKey] = useState<string | null>(null);
  const [verifyKeyInput, setVerifyKeyInput] = useState('');
  const [verifyResult, setVerifyResult] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);

  useEffect(() => {
    setWebhookUrl(site?.webhookUrl || '');
  }, [site?.id]);

  async function saveSecurity(e: React.FormEvent) {
    e.preventDefault();
    setMsg(null);
    try {
      await apiFetch('/api/auth/first-login-security', {
        method: 'POST',
        body: JSON.stringify({
          newPassword: newPassword || undefined,
          securityQuestion: secAnswer ? secQuestion : undefined,
          securityAnswer: secAnswer || undefined,
        }),
      });
      setNewPassword('');
      setSecAnswer('');
      setMsg({
        type: 'ok',
        text: 'تنظیمات امنیتی ذخیره شد. پاسخ امنیتی به صورت هش‌شده نگهداری می‌شود و هرگز به مدل AI ارسال نمی‌شود.',
      });
    } catch (err) {
      setMsg({ type: 'err', text: err instanceof Error ? err.message : 'خطا در ذخیره امنیت.' });
    }
  }

  async function rotateApiKey() {
    if (!site) return;
    setMsg(null);
    try {
      const res = await apiFetch<{ oneTimeServerApiKey: string }>(`/api/sites/${site.id}/rotate-key`, {
        method: 'POST',
      });
      setRotatedKey(res.oneTimeServerApiKey);
      setVerifyKeyInput(res.oneTimeServerApiKey);
      await onRefreshSites();
      setMsg({ type: 'ok', text: 'کلید قبلی لغو و کلید جدید سرور سایت صادر شد.' });
    } catch (err) {
      setMsg({ type: 'err', text: err instanceof Error ? err.message : 'خطا در تعویض کلید.' });
    }
  }

  async function testServerConnection() {
    setVerifyResult(null);
    try {
      const res = await apiFetch<{ siteName: string; domain: string; defaultModelId: string }>(
        '/api/v1/sites/verify',
        {
          method: 'POST',
          headers: { Authorization: `Bearer ${verifyKeyInput.trim()}` },
        }
      );
      setVerifyResult(
        `اتصال موفق · سایت متصل: ${res.siteName} (${res.domain}) · مدل پیش‌فرض: ${res.defaultModelId}`
      );
    } catch (err) {
      setVerifyResult(`خطای اتصال: ${err instanceof Error ? err.message : 'نامعتبر'}`);
    }
  }

  async function saveWebhook(e: React.FormEvent) {
    e.preventDefault();
    if (!site) return;
    await apiFetch(`/api/sites/${site.id}`, {
      method: 'PUT',
      body: JSON.stringify({ webhookUrl }),
    });
    await onRefreshSites();
    setMsg({ type: 'ok', text: 'نشانی وبهوک امضاشده ذخیره شد.' });
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-1 rounded-lg bg-slate-100 p-1 text-xs w-fit">
        {[
          { id: 'security' as const, label: 'حساب و امنیت' },
          { id: 'connections' as const, label: 'اتصال‌ها و کلید API' },
          { id: 'webhooks' as const, label: 'وبهوک‌ها' },
          { id: 'plugins' as const, label: 'افزونه‌ها (WP / PS / Django / Laravel)' },
        ].map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setSubTab(t.id)}
            className={`rounded-md px-3 py-1.5 font-medium ${
              subTab === t.id ? 'bg-white text-slate-950 shadow-sm' : 'text-slate-600'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {msg && (
        <div
          className={`rounded-lg border p-3 text-xs ${
            msg.type === 'ok'
              ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
              : 'border-red-200 bg-red-50 text-red-700'
          }`}
        >
          {msg.text}
        </div>
      )}

      {subTab === 'security' && (
        <form onSubmit={saveSecurity} className="max-w-xl rounded-xl border border-slate-200 bg-white p-5 space-y-4">
          <div className="text-sm font-bold text-slate-950">تغییر رمز عبور و سؤال امنیتی ({user.username})</div>
          <div>
            <label className="mb-1 block text-xs text-slate-700">رمز عبور جدید (حداقل ۸ کاراکتر)</label>
            <input
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              className="ltr w-full rounded-lg border border-slate-200 px-3 py-2 text-xs text-left font-mono"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs text-slate-700">سؤال امنیتی تکمیلی</label>
            <input
              type="text"
              value={secQuestion}
              onChange={(e) => setSecQuestion(e.target.value)}
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-xs"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs text-slate-700">پاسخ امنیتی (هش می‌شود؛ به تنهایی برای بازیابی کافی نیست)</label>
            <input
              type="password"
              value={secAnswer}
              onChange={(e) => setSecAnswer(e.target.value)}
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-xs"
            />
          </div>
          <button
            type="submit"
            className="rounded-lg bg-slate-950 px-4 py-2 text-xs font-semibold text-white hover:bg-slate-800"
          >
            ذخیره تنظیمات امنیتی
          </button>
        </form>
      )}

      {subTab === 'connections' && site && (
        <div className="max-w-2xl rounded-xl border border-slate-200 bg-white p-5 space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-sm font-bold text-slate-950">کلید محرمانه سرور سایت ({site.domain})</h3>
              <p className="text-xs text-slate-500">
                پیشوند کلید فعلی: <span className="font-mono ltr">{site.apiKeyPrefix}</span>
              </p>
            </div>
            <button
              type="button"
              onClick={() => void rotateApiKey()}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 px-3 py-2 text-xs font-semibold text-slate-900 hover:bg-slate-50"
            >
              <KeyRound className="h-3.5 w-3.5" />
              تعویض و لغو کلید قبلی
            </button>
          </div>
          {rotatedKey && (
            <div className="ltr rounded-lg border border-amber-300 bg-amber-50 p-3 font-mono text-xs text-left text-amber-950 select-all">
              {rotatedKey}
            </div>
          )}
          <div className="border-t border-slate-100 pt-4 space-y-2">
            <label className="block text-xs font-semibold text-slate-800">تست اتصال سمت سرور (POST /api/v1/sites/verify)</label>
            <div className="flex gap-2">
              <input
                type="text"
                value={verifyKeyInput}
                onChange={(e) => setVerifyKeyInput(e.target.value)}
                placeholder="کلید سرور سایت را برای تست وارد کنید..."
                className="ltr flex-1 rounded-lg border border-slate-200 px-3 py-2 text-xs text-left font-mono"
              />
              <button
                type="button"
                onClick={() => void testServerConnection()}
                className="inline-flex items-center gap-1 rounded-lg bg-blue-700 px-4 py-2 text-xs font-semibold text-white hover:bg-blue-800 whitespace-nowrap"
              >
                <RefreshCw className="h-3.5 w-3.5" />
                تست اتصال
              </button>
            </div>
            {verifyResult && (
              <div className="rounded-lg bg-slate-50 border border-slate-200 p-2.5 text-xs text-slate-800">
                {verifyResult}
              </div>
            )}
          </div>
        </div>
      )}

      {subTab === 'webhooks' && site && (
        <form onSubmit={saveWebhook} className="max-w-xl rounded-xl border border-slate-200 bg-white p-5 space-y-4">
          <div className="text-sm font-bold text-slate-950">تنظیم وبهوک امضاشده (HMAC-SHA256)</div>
          <div>
            <label className="mb-1 block text-xs text-slate-700">نشانی دریافت وبهوک روی سرور شما</label>
            <input
              type="url"
              value={webhookUrl}
              onChange={(e) => setWebhookUrl(e.target.value)}
              placeholder="https://yourstore.ir/api/webhooks/ramax"
              className="ltr w-full rounded-lg border border-slate-200 px-3 py-2 text-xs text-left font-mono"
            />
          </div>
          <div className="text-xs text-slate-500">
            پیشوند کلید امضای وبهوک: <span className="font-mono ltr">{site.webhookSecretPrefix}</span> · هدر:{' '}
            <span className="font-mono ltr">X-Ramax-Signature</span>
          </div>
          <button
            type="submit"
            className="rounded-lg bg-slate-950 px-4 py-2 text-xs font-semibold text-white hover:bg-slate-800"
          >
            ذخیره نشانی وبهوک
          </button>
        </form>
      )}

      {subTab === 'plugins' && (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {PLUGIN_GUIDES.map((p) => (
            <div key={p.id} className="rounded-xl border border-slate-200 bg-white p-4 space-y-2.5">
              <div className="flex items-center justify-between">
                <div className="text-sm font-bold text-slate-950">{p.name}</div>
                <CheckCircle2 className="h-4 w-4 text-slate-400" />
              </div>
              <div className="text-[11px] font-mono ltr text-right text-slate-500">{p.compatibility}</div>
              <p className="text-xs leading-6 text-amber-900 bg-amber-50 border border-amber-200 rounded-lg p-2.5">
                {p.testStatusFa}
              </p>
              <pre className="ltr max-h-40 overflow-auto rounded-lg bg-slate-950 p-3 text-left text-[11px] font-mono text-slate-200">
                <code>{p.codeSnippet}</code>
              </pre>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
