import React, { useEffect, useState } from 'react';
import {
  CheckCircle2,
  Download,
  LogOut,
  Plus,
  RefreshCw,
  ShieldCheck,
} from 'lucide-react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import {
  ACCOUNT_STATUS_LABELS_FA,
  apiFetch,
  CONTRACT_STATUS_LABELS_FA,
  CONV_STATUS_LABELS_FA,
  formatFaDateTime,
  formatFaNumber,
  formatToman,
  navigateTo,
  PAYMENT_METHOD_LABELS_FA,
  ROLE_LABELS_FA,
} from '../lib/api';
import type {
  AdminModelConfig,
  AuditLogEntry,
  AutomationRule,
  AutomationRunLog,
  ContractRecord,
  ConversationRecord,
  ManualPaymentRequest,
  PlatformSettings,
  SessionUser,
  SiteRecord,
  UserRole,
  WalletTransaction,
} from '../shared/types';

type AdminTab =
  | 'overview'
  | 'customers_sites'
  | 'users'
  | 'support'
  | 'models_pricing'
  | 'wallet_payments'
  | 'contracts'
  | 'automation'
  | 'security'
  | 'settings';

interface AdminOverviewResponse {
  kpis: {
    totalUsers: number;
    pendingAccounts: number;
    totalSites: number;
    totalConversations: number;
    openQueueCount: number;
    avgFirstResponseSec: number;
    totalWalletToman: number;
    revenueToman: number;
    baseCostToman: number;
    pendingPayments: number;
  };
  chartSeries: {
    day: string;
    tokensK: number;
    revenueToman: number;
    baseCostToman: number;
    successReqs: number;
    failedReqs: number;
  }[];
  siteConsumption: {
    siteId: string;
    siteName: string;
    domain: string;
    conversations: number;
    walletBalanceToman: number;
    contracts: number;
  }[];
  settings: PlatformSettings;
  users: SessionUser[];
  sites: SiteRecord[];
  models: AdminModelConfig[];
  manualPayments: ManualPaymentRequest[];
  walletTransactions: WalletTransaction[];
  conversations: ConversationRecord[];
  contracts: ContractRecord[];
  automationRules: AutomationRule[];
  automationRuns: AutomationRunLog[];
  auditLogs: AuditLogEntry[];
}

interface SuperAdminPanelProps {
  adminUser: SessionUser;
  onLogout: () => Promise<void>;
}

export const SuperAdminPanel: React.FC<SuperAdminPanelProps> = ({ adminUser, onLogout }) => {
  const [tab, setTab] = useState<AdminTab>('overview');
  const [subTab, setSubTab] = useState<string>('main');
  const [data, setData] = useState<AdminOverviewResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [notice, setNotice] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);

  // Create customer account form
  const [newUser, setNewUser] = useState({
    name: '',
    username: '',
    email: '',
    role: 'owner' as UserRole,
    accountStatus: 'active' as 'active' | 'pending_activation',
  });
  const [issuedTempPass, setIssuedTempPass] = useState<string | null>(null);

  // Settings form state
  const [settingsForm, setSettingsForm] = useState<PlatformSettings | null>(null);

  // Restore verification result
  const [restoreChecks, setRestoreChecks] = useState<{ name: string; passed: boolean }[] | null>(null);

  async function loadAll() {
    setLoading(true);
    try {
      const res = await apiFetch<AdminOverviewResponse>('/api/admin/overview');
      setData(res);
      setSettingsForm(res.settings);
    } catch (err) {
      setNotice({ type: 'err', text: err instanceof Error ? err.message : 'خطا در دریافت داده‌های مدیرکل.' });
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadAll();
  }, []);

  async function createCustomerAccount(e: React.FormEvent) {
    e.preventDefault();
    setNotice(null);
    setIssuedTempPass(null);
    try {
      const res = await apiFetch<{ user: SessionUser; oneTimeTempPassword: string }>('/api/admin/users', {
        method: 'POST',
        body: JSON.stringify(newUser),
      });
      setIssuedTempPass(
        `حساب ${res.user.username} ساخته شد · رمز موقت یک‌بارمصرف: ${res.oneTimeTempPassword}`
      );
      setNewUser({ name: '', username: '', email: '', role: 'owner', accountStatus: 'active' });
      await loadAll();
    } catch (err) {
      setNotice({ type: 'err', text: err instanceof Error ? err.message : 'خطا در ساخت حساب.' });
    }
  }

  async function updateUserStatus(userId: string, patch: Record<string, unknown>) {
    setNotice(null);
    try {
      const res = await apiFetch<{ oneTimeTempPassword?: string }>(`/api/admin/users/${userId}`, {
        method: 'PATCH',
        body: JSON.stringify(patch),
      });
      if (res.oneTimeTempPassword) {
        setIssuedTempPass(`رمز موقت جدید صادر شد: ${res.oneTimeTempPassword}`);
      }
      setNotice({ type: 'ok', text: 'وضعیت حساب کاربری با موفقیت به‌روزرسانی و در گزارش ممیزی ثبت شد.' });
      await loadAll();
    } catch (err) {
      setNotice({ type: 'err', text: err instanceof Error ? err.message : 'خطا در به‌روزرسانی کاربر.' });
    }
  }

  async function syncModels() {
    setNotice(null);
    await apiFetch('/api/admin/models/sync', { method: 'POST' });
    setNotice({ type: 'ok', text: 'همگام‌سازی مدل‌های ارائه‌دهندگان انجام شد.' });
    await loadAll();
  }

  async function updateModel(modelId: string, patch: Partial<AdminModelConfig>) {
    setNotice(null);
    await apiFetch(`/api/admin/models/${modelId}`, {
      method: 'PATCH',
      body: JSON.stringify(patch),
    });
    setNotice({ type: 'ok', text: 'تنظیمات و تعرفه مدل ذخیره شد.' });
    await loadAll();
  }

  async function decidePayment(paymentId: string, decision: 'approved' | 'rejected') {
    setNotice(null);
    try {
      await apiFetch(`/api/admin/payments/${paymentId}/decision`, {
        method: 'POST',
        body: JSON.stringify({
          decision,
          reasonFa: decision === 'approved' ? 'تطابق مبلغ و پیگیری در حساب بررسی و تأیید شد' : 'مغایرت در شماره پیگیری',
        }),
      });
      setNotice({
        type: 'ok',
        text:
          decision === 'approved'
            ? 'پرداخت دستی تأیید و مبلغ به کیف پول سایت واریز شد (تأیید مجدد مسدود است).'
            : 'درخواست پرداخت دستی رد شد و در تاریخچه ثبت گردید.',
      });
      await loadAll();
    } catch (err) {
      setNotice({ type: 'err', text: err instanceof Error ? err.message : 'خطا در ثبت تصمیم پرداخت.' });
    }
  }

  async function savePlatformSettings(e: React.FormEvent) {
    e.preventDefault();
    if (!settingsForm) return;
    setNotice(null);
    try {
      await apiFetch('/api/admin/settings', {
        method: 'PUT',
        body: JSON.stringify(settingsForm),
      });
      setNotice({ type: 'ok', text: 'تنظیمات کلان سامانه ذخیره شد.' });
      await loadAll();
    } catch (err) {
      setNotice({ type: 'err', text: err instanceof Error ? err.message : 'خطا در ذخیره تنظیمات.' });
    }
  }

  async function testRestoreIntegrity() {
    const res = await apiFetch<{ checks: { name: string; passed: boolean }[] }>(
      '/api/admin/backup/verify-restore',
      { method: 'POST' }
    );
    setRestoreChecks(res.checks);
    setNotice({ type: 'ok', text: 'آزمون یکپارچگی و بازیابی پشتیبان با موفقیت انجام شد.' });
    await loadAll();
  }

  const primaryTabs: { id: AdminTab; label: string }[] = [
    { id: 'overview', label: 'نمای کلی' },
    { id: 'customers_sites', label: 'مشتریان و سایت‌ها' },
    { id: 'users', label: 'کاربران' },
    { id: 'support', label: 'پشتیبانی' },
    { id: 'models_pricing', label: 'مدل‌ها و تعرفه‌ها' },
    { id: 'wallet_payments', label: 'کیف پول و پرداخت' },
    { id: 'contracts', label: 'قراردادها' },
    { id: 'automation', label: 'اتوماسیون' },
    { id: 'security', label: 'امنیت و ممیزی' },
    { id: 'settings', label: 'تنظیمات' },
  ];

  return (
    <div className="min-h-screen bg-slate-100/70 text-slate-900 flex flex-col">
      {/* Formal Top Navigation Bar (Primary Menu on Top as explicitly required) */}
      <header className="sticky top-0 z-30 border-b border-slate-200 bg-slate-950 text-white">
        <div className="mx-auto flex h-14 max-w-[1440px] items-center justify-between gap-4 px-4">
          <div className="flex items-center gap-3 shrink-0">
            <ShieldCheck className="h-4 w-4 text-blue-400" />
            <span className="text-sm font-bold whitespace-nowrap">کنترل‌پنل مدیرکل راماکس</span>
            <span className="hidden md:inline font-mono text-[11px] text-slate-400 ltr">
              {data?.settings.domains.controlDomain || 'control.ramax.ramalife.cloud'}
            </span>
          </div>
          <div className="flex items-center gap-3 text-xs shrink-0">
            <span className="text-slate-300 hidden sm:inline">{adminUser.name}</span>
            <button
              type="button"
              onClick={() => navigateTo('/')}
              className="rounded border border-slate-700 px-2.5 py-1 text-slate-200 hover:bg-slate-800 whitespace-nowrap"
            >
              سایت اصلی
            </button>
            <button
              type="button"
              onClick={() => void onLogout()}
              className="inline-flex items-center gap-1 rounded bg-slate-800 px-2.5 py-1 text-slate-200 hover:bg-red-900 whitespace-nowrap"
            >
              <LogOut className="h-3.5 w-3.5" />
              خروج
            </button>
          </div>
        </div>

        {/* Horizontal Primary Menu */}
        <div className="border-t border-slate-800 bg-slate-900">
          <div className="mx-auto flex max-w-[1440px] items-center gap-1 overflow-x-auto px-4 py-1.5 text-xs">
            {primaryTabs.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => {
                  setTab(item.id);
                  setSubTab('main');
                }}
                className={`rounded-md px-3 py-1.5 font-medium whitespace-nowrap shrink-0 transition-colors ${
                  tab === item.id
                    ? 'bg-blue-700 text-white'
                    : 'text-slate-300 hover:bg-slate-800 hover:text-white'
                }`}
              >
                {item.label}
              </button>
            ))}
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-[1440px] flex-1 p-4 sm:p-6 space-y-5">
        {notice && (
          <div
            className={`rounded-lg border px-4 py-2.5 text-xs ${
              notice.type === 'ok'
                ? 'border-emerald-200 bg-emerald-50 text-emerald-900'
                : 'border-red-200 bg-red-50 text-red-700'
            }`}
          >
            {notice.text}
          </div>
        )}

        {issuedTempPass && (
          <div className="rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-xs font-semibold text-amber-950">
            {issuedTempPass}
          </div>
        )}

        {loading || !data ? (
          <div className="p-10 text-center text-sm text-slate-500">در حال بارگذاری کنترل‌پنل مدیرکل...</div>
        ) : (
          <>
            {/* 1. OVERVIEW */}
            {tab === 'overview' && (
              <div className="space-y-5">
                {/* Compact Executive KPI Strip */}
                <div className="grid grid-cols-2 gap-3 lg:grid-cols-6 tabular-nums">
                  {[
                    { label: 'حساب‌های مشتری', value: formatFaNumber(data.kpis.totalUsers), sub: `${formatFaNumber(data.kpis.pendingAccounts)} در انتظار فعالسازی` },
                    { label: 'سایت‌های ثبت‌شده', value: formatFaNumber(data.kpis.totalSites), sub: 'جداسازی کامل' },
                    { label: 'صف گفتگوهای باز', value: formatFaNumber(data.kpis.openQueueCount), sub: `کل: ${formatFaNumber(data.kpis.totalConversations)}` },
                    { label: 'میانگین اولین پاسخ', value: `${formatFaNumber(data.kpis.avgFirstResponseSec)} ثانیه`, sub: 'پشتیبانی زنده' },
                    { label: 'درآمد فروش (تومان)', value: formatToman(data.kpis.revenueToman), sub: `هزینه پایه: ${formatToman(data.kpis.baseCostToman)}` },
                    { label: 'پرداخت دستی منتظر', value: formatFaNumber(data.kpis.pendingPayments), sub: `کل کیف پول‌ها: ${formatToman(data.kpis.totalWalletToman)}` },
                  ].map((k) => (
                    <div key={k.label} className="rounded-lg border border-slate-200 bg-white p-3.5">
                      <div className="text-[11px] text-slate-500">{k.label}</div>
                      <div className="mt-1 text-base font-bold text-slate-950">{k.value}</div>
                      <div className="mt-0.5 text-[11px] text-slate-400">{k.sub}</div>
                    </div>
                  ))}
                </div>

                {/* Dense Charts Grid */}
                <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                  <div className="rounded-lg border border-slate-200 bg-white p-4">
                    <div className="mb-3 flex items-center justify-between text-xs">
                      <span className="font-bold text-slate-900">نمودار درآمد فروش در برابر هزینه پایه (نمونه + واقعی)</span>
                      <span className="text-slate-400">فرمول: {data.settings.pricing.markupMultiplier}× پایه + {data.settings.pricing.taxPercent}٪ مالیات</span>
                    </div>
                    <div className="h-60 w-full">
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={data.chartSeries}>
                          <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                          <XAxis dataKey="day" tick={{ fontSize: 11 }} />
                          <YAxis tick={{ fontSize: 10 }} />
                          <Tooltip />
                          <Legend wrapperStyle={{ fontSize: 11 }} />
                          <Bar dataKey="revenueToman" name="درآمد فروش (تومان)" fill="#1d4ed8" radius={[4, 4, 0, 0]} />
                          <Bar dataKey="baseCostToman" name="هزینه پایه (تومان)" fill="#64748b" radius={[4, 4, 0, 0]} />
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  </div>

                  <div className="rounded-lg border border-slate-200 bg-white p-4">
                    <div className="mb-3 flex items-center justify-between text-xs">
                      <span className="font-bold text-slate-900">مصرف توکن (هزار) و درخواست‌های موفق/ناموفق</span>
                      <span className="text-slate-400">۷ روز اخیر</span>
                    </div>
                    <div className="h-60 w-full">
                      <ResponsiveContainer width="100%" height="100%">
                        <LineChart data={data.chartSeries}>
                          <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                          <XAxis dataKey="day" tick={{ fontSize: 11 }} />
                          <YAxis tick={{ fontSize: 10 }} />
                          <Tooltip />
                          <Legend wrapperStyle={{ fontSize: 11 }} />
                          <Line type="monotone" dataKey="tokensK" name="توکن (هزار)" stroke="#0f172a" strokeWidth={2} />
                          <Line type="monotone" dataKey="successReqs" name="درخواست موفق" stroke="#16a34a" strokeWidth={2} />
                          <Line type="monotone" dataKey="failedReqs" name="درخواست ناموفق" stroke="#dc2626" strokeWidth={2} />
                        </LineChart>
                      </ResponsiveContainer>
                    </div>
                  </div>
                </div>

                {/* Compact Site Consumption Table */}
                <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
                  <div className="border-b border-slate-200 px-4 py-2.5 text-xs font-bold text-slate-900">
                    وضعیت سایت‌ها، گفتگوها و کیف پول
                  </div>
                  <table className="w-full text-right text-xs tabular-nums">
                    <thead className="border-b border-slate-200 bg-slate-50 text-slate-500">
                      <tr>
                        <th className="px-4 py-2.5 font-semibold">سایت</th>
                        <th className="px-4 py-2.5 font-semibold">دامنه</th>
                        <th className="px-4 py-2.5 font-semibold">گفتگوها</th>
                        <th className="px-4 py-2.5 font-semibold">قراردادها</th>
                        <th className="px-4 py-2.5 font-semibold">موجودی کیف پول</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200">
                      {data.siteConsumption.map((s) => (
                        <tr key={s.siteId} className="hover:bg-slate-50">
                          <td className="px-4 py-2.5 font-semibold text-slate-900">{s.siteName}</td>
                          <td className="px-4 py-2.5 font-mono ltr text-right text-slate-600">{s.domain}</td>
                          <td className="px-4 py-2.5">{formatFaNumber(s.conversations)}</td>
                          <td className="px-4 py-2.5">{formatFaNumber(s.contracts)}</td>
                          <td className="px-4 py-2.5 font-semibold">{formatToman(s.walletBalanceToman)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* 2. CUSTOMERS & SITES / 3. USERS */}
            {(tab === 'customers_sites' || tab === 'users') && (
              <div className="space-y-4">
                {/* Page-level Submenu */}
                <div className="flex items-center gap-2 border-b border-slate-200 pb-2 text-xs">
                  <button
                    type="button"
                    onClick={() => setSubTab('main')}
                    className={`rounded px-3 py-1.5 font-medium ${subTab === 'main' ? 'bg-slate-950 text-white' : 'bg-white text-slate-700 border border-slate-200'}`}
                  >
                    جدول حساب‌ها و فعالسازی
                  </button>
                  <button
                    type="button"
                    onClick={() => setSubTab('create')}
                    className={`rounded px-3 py-1.5 font-medium ${subTab === 'create' ? 'bg-slate-950 text-white' : 'bg-white text-slate-700 border border-slate-200'}`}
                  >
                    ساخت حساب با رمز موقت
                  </button>
                  <button
                    type="button"
                    onClick={() => setSubTab('sites_list')}
                    className={`rounded px-3 py-1.5 font-medium ${subTab === 'sites_list' ? 'bg-slate-950 text-white' : 'bg-white text-slate-700 border border-slate-200'}`}
                  >
                    فهرست سایت‌های مجاز ({data.sites.length})
                  </button>
                </div>

                {subTab === 'create' && (
                  <form onSubmit={createCustomerAccount} className="max-w-2xl rounded-lg border border-slate-200 bg-white p-4 space-y-3">
                    <div className="text-xs font-bold text-slate-950">ایجاد حساب مشتری جدید و صدور رمز موقت یک‌بارمصرف</div>
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                      <input
                        type="text"
                        required
                        placeholder="نام کامل"
                        value={newUser.name}
                        onChange={(e) => setNewUser({ ...newUser, name: e.target.value })}
                        className="rounded border border-slate-200 px-3 py-1.5 text-xs"
                      />
                      <input
                        type="text"
                        required
                        placeholder="نام کاربری انگلیسی"
                        value={newUser.username}
                        onChange={(e) => setNewUser({ ...newUser, username: e.target.value })}
                        className="ltr rounded border border-slate-200 px-3 py-1.5 text-xs text-left font-mono"
                      />
                      <input
                        type="email"
                        required
                        placeholder="email@domain.ir"
                        value={newUser.email}
                        onChange={(e) => setNewUser({ ...newUser, email: e.target.value })}
                        className="ltr rounded border border-slate-200 px-3 py-1.5 text-xs text-left font-mono"
                      />
                      <select
                        value={newUser.accountStatus}
                        onChange={(e) => setNewUser({ ...newUser, accountStatus: e.target.value as 'active' | 'pending_activation' })}
                        className="rounded border border-slate-200 bg-white px-3 py-1.5 text-xs"
                      >
                        <option value="active">فعال (دسترسی کامل تجاری)</option>
                        <option value="pending_activation">در انتظار فعالسازی</option>
                      </select>
                    </div>
                    <button
                      type="submit"
                      className="inline-flex items-center gap-1 rounded bg-blue-700 px-4 py-2 text-xs font-semibold text-white hover:bg-blue-800"
                    >
                      <Plus className="h-3.5 w-3.5" />
                      ایجاد حساب و صدور رمز موقت
                    </button>
                  </form>
                )}

                {subTab === 'main' && (
                  <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
                    <table className="w-full text-right text-xs">
                      <thead className="border-b border-slate-200 bg-slate-50 text-slate-500">
                        <tr>
                          <th className="px-3 py-2.5 font-semibold">کاربر</th>
                          <th className="px-3 py-2.5 font-semibold">نقش</th>
                          <th className="px-3 py-2.5 font-semibold">وضعیت تجاری</th>
                          <th className="px-3 py-2.5 font-semibold">سایت‌های مجاز</th>
                          <th className="px-3 py-2.5 font-semibold">عملیات مدیرکل</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-200">
                        {data.users
                          .filter((u) => u.role !== 'super_admin')
                          .map((u) => (
                            <tr key={u.id} className="hover:bg-slate-50">
                              <td className="px-3 py-2.5">
                                <div className="font-semibold text-slate-900">{u.name}</div>
                                <div className="font-mono ltr text-right text-[11px] text-slate-500">
                                  {u.username} · {u.email}
                                </div>
                              </td>
                              <td className="px-3 py-2.5">{ROLE_LABELS_FA[u.role]}</td>
                              <td className="px-3 py-2.5">
                                <span
                                  className={
                                    u.accountStatus === 'active'
                                      ? 'font-semibold text-emerald-700'
                                      : u.accountStatus === 'suspended'
                                      ? 'font-semibold text-red-700'
                                      : 'font-semibold text-amber-700'
                                  }
                                >
                                  {ACCOUNT_STATUS_LABELS_FA[u.accountStatus]}
                                </span>
                              </td>
                              <td className="px-3 py-2.5 font-mono text-[11px] text-slate-600">
                                {u.allowedSiteIds.length ? u.allowedSiteIds.join(', ') : 'بدون سایت'}
                              </td>
                              <td className="px-3 py-2.5">
                                <div className="flex flex-wrap items-center gap-1.5">
                                  {u.accountStatus !== 'active' && (
                                    <button
                                      type="button"
                                      onClick={() => void updateUserStatus(u.id, { accountStatus: 'active' })}
                                      className="rounded bg-emerald-700 px-2.5 py-1 text-[11px] font-semibold text-white hover:bg-emerald-800"
                                    >
                                      فعالسازی حساب
                                    </button>
                                  )}
                                  {u.accountStatus !== 'suspended' && (
                                    <button
                                      type="button"
                                      onClick={() => void updateUserStatus(u.id, { accountStatus: 'suspended' })}
                                      className="rounded border border-red-200 px-2.5 py-1 text-[11px] font-medium text-red-700 hover:bg-red-50"
                                    >
                                      تعلیق
                                    </button>
                                  )}
                                  <button
                                    type="button"
                                    onClick={() => void updateUserStatus(u.id, { resetTempPassword: true })}
                                    className="rounded border border-slate-200 px-2.5 py-1 text-[11px] text-slate-700 hover:bg-slate-50"
                                  >
                                    صدور رمز موقت
                                  </button>
                                </div>
                              </td>
                            </tr>
                          ))}
                      </tbody>
                    </table>
                  </div>
                )}

                {subTab === 'sites_list' && (
                  <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
                    <table className="w-full text-right text-xs">
                      <thead className="border-b border-slate-200 bg-slate-50 text-slate-500">
                        <tr>
                          <th className="px-3 py-2.5 font-semibold">سایت</th>
                          <th className="px-3 py-2.5 font-semibold">دامنه</th>
                          <th className="px-3 py-2.5 font-semibold">شناسه عمومی ویجت</th>
                          <th className="px-3 py-2.5 font-semibold">وضعیت نصب</th>
                          <th className="px-3 py-2.5 font-semibold">مدل پیش‌فرض</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-200">
                        {data.sites.map((s) => (
                          <tr key={s.id}>
                            <td className="px-3 py-2.5 font-semibold text-slate-900">{s.name}</td>
                            <td className="px-3 py-2.5 font-mono ltr text-right">{s.domain}</td>
                            <td className="px-3 py-2.5 font-mono ltr text-right text-[11px] text-slate-600">{s.publicInstallKey}</td>
                            <td className="px-3 py-2.5">{s.installVerified ? 'تأییدشده' : 'در انتظار تست'}</td>
                            <td className="px-3 py-2.5 font-mono text-[11px]">{s.defaultModelId}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )}

            {/* 4. SUPPORT GLOBAL MONITOR */}
            {tab === 'support' && (
              <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
                <div className="border-b border-slate-200 px-4 py-2.5 text-xs font-bold text-slate-900">
                  نظارت کلان صف‌های پشتیبانی همه سایت‌ها
                </div>
                <table className="w-full text-right text-xs">
                  <thead className="border-b border-slate-200 bg-slate-50 text-slate-500">
                    <tr>
                      <th className="px-3 py-2.5 font-semibold">شماره</th>
                      <th className="px-3 py-2.5 font-semibold">سایت</th>
                      <th className="px-3 py-2.5 font-semibold">مشتری و موضوع</th>
                      <th className="px-3 py-2.5 font-semibold">وضعیت</th>
                      <th className="px-3 py-2.5 font-semibold">اولین پاسخ</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200">
                    {data.conversations.map((c) => (
                      <tr key={c.id}>
                        <td className="px-3 py-2.5 font-mono">{c.ticketNumber}</td>
                        <td className="px-3 py-2.5">{data.sites.find((s) => s.id === c.siteId)?.name || c.siteId}</td>
                        <td className="px-3 py-2.5">
                          <div className="font-semibold text-slate-900">{c.visitorName}</div>
                          <div className="text-slate-500">{c.subject}</div>
                        </td>
                        <td className="px-3 py-2.5">{CONV_STATUS_LABELS_FA[c.status]}</td>
                        <td className="px-3 py-2.5 tabular-nums">{c.firstResponseSeconds ? `${c.firstResponseSeconds} ثانیه` : '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {/* 5. MODELS & PRICING (BASE COST USD, PROVIDER, INTERNAL ID — ADMIN ONLY!) */}
            {tab === 'models_pricing' && settingsForm && (
              <div className="space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="text-xs text-slate-600">
                    قیمت پایه ارزی، شناسه داخلی ارائه‌دهنده و نرخ ارز منحصراً در پنل مدیرکل نمایش داده می‌شوند. فرمول فروش:
                    <strong className="mx-1 text-slate-950">
                      {settingsForm.pricing.markupMultiplier}× قیمت پایه + {settingsForm.pricing.taxPercent}٪ مالیات
                    </strong>
                  </div>
                  <button
                    type="button"
                    onClick={() => void syncModels()}
                    className="inline-flex items-center gap-1.5 rounded-lg bg-slate-950 px-3.5 py-2 text-xs font-semibold text-white hover:bg-slate-800"
                  >
                    <RefreshCw className="h-3.5 w-3.5" />
                    همگام‌سازی مدل‌های ارائه‌دهندگان
                  </button>
                </div>

                {/* Pricing Formula Bar */}
                <form
                  onSubmit={savePlatformSettings}
                  className="grid grid-cols-1 gap-3 rounded-lg border border-slate-200 bg-white p-4 sm:grid-cols-5 items-end text-xs"
                >
                  <div>
                    <label className="mb-1 block text-slate-600">نسخه تعرفه</label>
                    <input
                      type="text"
                      value={settingsForm.pricing.tariffVersion}
                      onChange={(e) =>
                        setSettingsForm({
                          ...settingsForm,
                          pricing: { ...settingsForm.pricing, tariffVersion: e.target.value },
                        })
                      }
                      className="ltr w-full rounded border border-slate-200 px-2.5 py-1.5 font-mono"
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-slate-600">نرخ دلار (تومان)</label>
                    <input
                      type="number"
                      value={settingsForm.pricing.usdToTomanRate}
                      onChange={(e) =>
                        setSettingsForm({
                          ...settingsForm,
                          pricing: { ...settingsForm.pricing, usdToTomanRate: Number(e.target.value) || 68000 },
                        })
                      }
                      className="w-full rounded border border-slate-200 px-2.5 py-1.5 tabular-nums"
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-slate-600">ضریب فروش (پیش‌فرض ۳)</label>
                    <input
                      type="number"
                      step="0.1"
                      value={settingsForm.pricing.markupMultiplier}
                      onChange={(e) =>
                        setSettingsForm({
                          ...settingsForm,
                          pricing: { ...settingsForm.pricing, markupMultiplier: Number(e.target.value) || 3 },
                        })
                      }
                      className="w-full rounded border border-slate-200 px-2.5 py-1.5 tabular-nums"
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-slate-600">مالیات (٪)</label>
                    <input
                      type="number"
                      value={settingsForm.pricing.taxPercent}
                      onChange={(e) =>
                        setSettingsForm({
                          ...settingsForm,
                          pricing: { ...settingsForm.pricing, taxPercent: Number(e.target.value) || 10 },
                        })
                      }
                      className="w-full rounded border border-slate-200 px-2.5 py-1.5 tabular-nums"
                    />
                  </div>
                  <button
                    type="submit"
                    className="rounded bg-blue-700 px-4 py-2 font-semibold text-white hover:bg-blue-800"
                  >
                    ذخیره فرمول تعرفه
                  </button>
                </form>

                {/* Admin Models Table */}
                <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
                  <table className="w-full text-right text-xs tabular-nums">
                    <thead className="border-b border-slate-200 bg-slate-50 text-slate-500">
                      <tr>
                        <th className="px-3 py-2.5 font-semibold">نام نمایشی راماکس</th>
                        <th className="px-3 py-2.5 font-semibold">ارائه‌دهنده / شناسه داخلی</th>
                        <th className="px-3 py-2.5 font-semibold">گروه تعرفه</th>
                        <th className="px-3 py-2.5 font-semibold">پایه ورودی ($/1M)</th>
                        <th className="px-3 py-2.5 font-semibold">پایه خروجی ($/1M)</th>
                        <th className="px-3 py-2.5 font-semibold">پایه تصویر ($)</th>
                        <th className="px-3 py-2.5 font-semibold">وضعیت اتصال</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200">
                      {data.models.map((m) => (
                        <tr key={m.id}>
                          <td className="px-3 py-2.5 font-bold text-slate-950 whitespace-nowrap">
                            {m.icon} {m.publicName}
                          </td>
                          <td className="px-3 py-2.5 font-mono ltr text-right text-[11px] text-slate-600">
                            {m.provider} / {m.internalModelId}
                          </td>
                          <td className="px-3 py-2.5 font-mono text-[11px]">{m.pricingGroup}</td>
                          <td className="px-3 py-2.5">${m.baseInputCostUsdPer1M.toFixed(2)}</td>
                          <td className="px-3 py-2.5">${m.baseOutputCostUsdPer1M.toFixed(2)}</td>
                          <td className="px-3 py-2.5">${m.imageUnitBaseCostUsd.toFixed(3)}</td>
                          <td className="px-3 py-2.5">
                            {m.pipelineReady ? (
                              <button
                                type="button"
                                onClick={() => void updateModel(m.id, { enabled: !m.enabled })}
                                className={`rounded px-2.5 py-1 text-[11px] font-semibold ${
                                  m.enabled ? 'bg-emerald-50 text-emerald-800 border border-emerald-200' : 'bg-slate-100 text-slate-600'
                                }`}
                              >
                                {m.enabled ? 'فعال (کلیک برای توقف)' : 'غیرفعال (کلیک برای فعالسازی)'}
                              </button>
                            ) : (
                              <span className="text-[11px] text-amber-700">مسیر ارائه‌دهنده متصل نیست</span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* 6. WALLET & MANUAL PAYMENT REVIEW */}
            {tab === 'wallet_payments' && (
              <div className="space-y-4">
                <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
                  <div className="border-b border-slate-200 px-4 py-2.5 text-xs font-bold text-slate-900">
                    صف بررسی دستی پرداخت‌ها (کارت‌به‌کارت، رمزارز TxID، لینک پرداخت) — بدون تأیید خودکار
                  </div>
                  <table className="w-full text-right text-xs tabular-nums">
                    <thead className="border-b border-slate-200 bg-slate-50 text-slate-500">
                      <tr>
                        <th className="px-3 py-2.5 font-semibold">کاربر / سایت</th>
                        <th className="px-3 py-2.5 font-semibold">روش و مبلغ</th>
                        <th className="px-3 py-2.5 font-semibold">پیگیری / TxID</th>
                        <th className="px-3 py-2.5 font-semibold">وضعیت</th>
                        <th className="px-3 py-2.5 font-semibold">تصمیم مدیرکل</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200">
                      {data.manualPayments.map((p) => (
                        <tr key={p.id}>
                          <td className="px-3 py-2.5">
                            <div className="font-semibold text-slate-900">{p.userName}</div>
                            <div className="text-[11px] text-slate-500">{p.siteId}</div>
                          </td>
                          <td className="px-3 py-2.5">
                            <div className="font-bold text-slate-950">{formatToman(p.amountToman)}</div>
                            <div className="text-[11px] text-slate-500">{PAYMENT_METHOD_LABELS_FA[p.method]}</div>
                          </td>
                          <td className="px-3 py-2.5 font-mono ltr text-right text-[11px]">{p.trackingCodeOrTxId}</td>
                          <td className="px-3 py-2.5">
                            {p.status === 'pending_review'
                              ? 'در انتظار بررسی'
                              : p.status === 'approved'
                              ? 'تأییدشده'
                              : 'ردشده'}
                          </td>
                          <td className="px-3 py-2.5">
                            {p.status === 'pending_review' ? (
                              <div className="flex items-center gap-1.5">
                                <button
                                  type="button"
                                  onClick={() => void decidePayment(p.id, 'approved')}
                                  className="rounded bg-emerald-700 px-2.5 py-1 text-[11px] font-semibold text-white hover:bg-emerald-800"
                                >
                                  تأیید و شارژ کیف پول
                                </button>
                                <button
                                  type="button"
                                  onClick={() => void decidePayment(p.id, 'rejected')}
                                  className="rounded border border-red-200 px-2.5 py-1 text-[11px] text-red-700 hover:bg-red-50"
                                >
                                  رد
                                </button>
                              </div>
                            ) : (
                              <span className="text-[11px] text-slate-500">
                                {p.decisionHistory[0]?.decidedBy} · {formatFaDateTime(p.decisionHistory[0]?.decidedAt)}
                              </span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {/* Global Wallet Ledger */}
                <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
                  <div className="border-b border-slate-200 px-4 py-2.5 text-xs font-bold text-slate-900">
                    دفتر کل تراکنش‌ها (همراه با نسخه تعرفه و کلید یکتایی Idempotency)
                  </div>
                  <table className="w-full text-right text-xs tabular-nums">
                    <thead className="border-b border-slate-200 bg-slate-50 text-slate-500">
                      <tr>
                        <th className="px-3 py-2 font-semibold">شرح</th>
                        <th className="px-3 py-2 font-semibold">وضعیت</th>
                        <th className="px-3 py-2 font-semibold">نسخه تعرفه</th>
                        <th className="px-3 py-2 font-semibold">مبلغ</th>
                        <th className="px-3 py-2 font-semibold">زمان</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200">
                      {data.walletTransactions.map((t) => (
                        <tr key={t.id}>
                          <td className="px-3 py-2 text-slate-800">{t.descriptionFa}</td>
                          <td className="px-3 py-2 font-mono text-[11px]">{t.status}</td>
                          <td className="px-3 py-2 font-mono text-[11px]">{t.tariffVersion}</td>
                          <td className="px-3 py-2 font-semibold">{formatToman(t.amountToman)}</td>
                          <td className="px-3 py-2 text-slate-500">{formatFaDateTime(t.createdAt)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* 7. CONTRACTS */}
            {tab === 'contracts' && (
              <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
                <table className="w-full text-right text-xs tabular-nums">
                  <thead className="border-b border-slate-200 bg-slate-50 text-slate-500">
                    <tr>
                      <th className="px-3 py-2.5 font-semibold">شماره</th>
                      <th className="px-3 py-2.5 font-semibold">عنوان و مشتری</th>
                      <th className="px-3 py-2.5 font-semibold">مبلغ</th>
                      <th className="px-3 py-2.5 font-semibold">نسخه</th>
                      <th className="px-3 py-2.5 font-semibold">وضعیت</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200">
                    {data.contracts.map((c) => (
                      <tr key={c.id}>
                        <td className="px-3 py-2.5 font-mono">{c.contractNumber}</td>
                        <td className="px-3 py-2.5">
                          <div className="font-semibold text-slate-900">{c.title}</div>
                          <div className="text-slate-500">{c.customerName}</div>
                        </td>
                        <td className="px-3 py-2.5 font-semibold">{formatToman(c.amountToman)}</td>
                        <td className="px-3 py-2.5">نسخه {c.currentVersion}</td>
                        <td className="px-3 py-2.5">{CONTRACT_STATUS_LABELS_FA[c.status]}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {/* 8. AUTOMATION */}
            {tab === 'automation' && (
              <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
                <table className="w-full text-right text-xs">
                  <thead className="border-b border-slate-200 bg-slate-50 text-slate-500">
                    <tr>
                      <th className="px-3 py-2.5 font-semibold">قانون</th>
                      <th className="px-3 py-2.5 font-semibold">سایت</th>
                      <th className="px-3 py-2.5 font-semibold">نسخه</th>
                      <th className="px-3 py-2.5 font-semibold">تعداد اجرا</th>
                      <th className="px-3 py-2.5 font-semibold">وضعیت</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200">
                    {data.automationRules.map((r) => (
                      <tr key={r.id}>
                        <td className="px-3 py-2.5 font-semibold text-slate-900">{r.name}</td>
                        <td className="px-3 py-2.5 font-mono text-[11px]">{r.siteId}</td>
                        <td className="px-3 py-2.5 tabular-nums">{r.version}</td>
                        <td className="px-3 py-2.5 tabular-nums">{r.runCount}</td>
                        <td className="px-3 py-2.5">{r.enabled ? 'فعال' : 'متوقف'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {/* 9. SECURITY, AUDIT LOGS & BACKUP/RESTORE */}
            {tab === 'security' && (
              <div className="space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-slate-200 bg-white p-4 text-xs">
                  <div>
                    <div className="font-bold text-slate-950">پشتیبان‌گیری، سیاست نگهداری و آزمون بازیابی</div>
                    <div className="text-slate-500">
                      سیاست نگهداری: {data.settings.dataRetentionDays} روز · برنامه پشتیبان: {data.settings.backupSchedule}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <a
                      href="/api/admin/backup/export"
                      className="inline-flex items-center gap-1.5 rounded bg-slate-950 px-3 py-2 font-semibold text-white hover:bg-slate-800"
                    >
                      <Download className="h-3.5 w-3.5" />
                      خروجی پشتیبان مجاز (JSON)
                    </a>
                    <button
                      type="button"
                      onClick={() => void testRestoreIntegrity()}
                      className="rounded border border-slate-300 px-3 py-2 font-semibold text-slate-800 hover:bg-slate-50"
                    >
                      اجرای آزمون بازیابی
                    </button>
                  </div>
                </div>

                {restoreChecks && (
                  <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-xs">
                    {restoreChecks.map((c) => (
                      <div key={c.name} className="flex items-center gap-2 text-emerald-950">
                        <CheckCircle2 className="h-4 w-4 text-emerald-700 shrink-0" />
                        <span>{c.name}</span>
                      </div>
                    ))}
                  </div>
                )}

                <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
                  <div className="border-b border-slate-200 px-4 py-2.5 text-xs font-bold text-slate-900">
                    گزارش ممیزی امنیتی (تغییر دسترسی‌ها، امور مالی، کلیدها و ورودها)
                  </div>
                  <table className="w-full text-right text-xs">
                    <thead className="border-b border-slate-200 bg-slate-50 text-slate-500">
                      <tr>
                        <th className="px-3 py-2 font-semibold">زمان</th>
                        <th className="px-3 py-2 font-semibold">عامل</th>
                        <th className="px-3 py-2 font-semibold">دسته</th>
                        <th className="px-3 py-2 font-semibold">شرح رویداد</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200">
                      {data.auditLogs.map((a) => (
                        <tr key={a.id}>
                          <td className="px-3 py-2 tabular-nums text-slate-500 whitespace-nowrap">{formatFaDateTime(a.timestamp)}</td>
                          <td className="px-3 py-2 font-mono text-[11px]">{a.actorUsername}</td>
                          <td className="px-3 py-2 font-mono text-[11px]">{a.category}</td>
                          <td className="px-3 py-2 text-slate-800">{a.summaryFa}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* 10. GLOBAL SETTINGS (DOMAINS, LEGAL IDENTITY CONFIRMATION, TRIAL QUOTA) */}
            {tab === 'settings' && settingsForm && (
              <form onSubmit={savePlatformSettings} className="max-w-3xl space-y-5">
                <div className="rounded-lg border border-slate-200 bg-white p-5 space-y-4">
                  <h3 className="text-sm font-bold text-slate-950">تنظیم دامنه‌های سامانه (بدون نیاز به تغییر سورس)</h3>
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 text-xs">
                    <div>
                      <label className="mb-1 block text-slate-600">دامنه سایت معرفی</label>
                      <input
                        type="text"
                        value={settingsForm.domains.mainDomain}
                        onChange={(e) =>
                          setSettingsForm({
                            ...settingsForm,
                            domains: { ...settingsForm.domains, mainDomain: e.target.value },
                          })
                        }
                        className="ltr w-full rounded border border-slate-200 px-3 py-1.5 font-mono"
                      />
                    </div>
                    <div>
                      <label className="mb-1 block text-slate-600">دامنه محیط چت AI</label>
                      <input
                        type="text"
                        value={settingsForm.domains.aiDomain}
                        onChange={(e) =>
                          setSettingsForm({
                            ...settingsForm,
                            domains: { ...settingsForm.domains, aiDomain: e.target.value },
                          })
                        }
                        className="ltr w-full rounded border border-slate-200 px-3 py-1.5 font-mono"
                      />
                    </div>
                    <div>
                      <label className="mb-1 block text-slate-600">دامنه پنل مشتری تجاری</label>
                      <input
                        type="text"
                        value={settingsForm.domains.panelDomain}
                        onChange={(e) =>
                          setSettingsForm({
                            ...settingsForm,
                            domains: { ...settingsForm.domains, panelDomain: e.target.value },
                          })
                        }
                        className="ltr w-full rounded border border-slate-200 px-3 py-1.5 font-mono"
                      />
                    </div>
                    <div>
                      <label className="mb-1 block text-slate-600">دامنه کنترل‌پنل مدیرکل</label>
                      <input
                        type="text"
                        value={settingsForm.domains.controlDomain}
                        onChange={(e) =>
                          setSettingsForm({
                            ...settingsForm,
                            domains: { ...settingsForm.domains, controlDomain: e.target.value },
                          })
                        }
                        className="ltr w-full rounded border border-slate-200 px-3 py-1.5 font-mono"
                      />
                    </div>
                  </div>
                </div>

                <div className="rounded-lg border border-slate-200 bg-white p-5 space-y-4">
                  <h3 className="text-sm font-bold text-slate-950">هویت حقوقی و اطلاعات تماس (نیازمند تأیید مالک پیش از انتشار)</h3>
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 text-xs">
                    <div>
                      <label className="mb-1 block text-slate-600">نام حقوقی پیشنهادی</label>
                      <input
                        type="text"
                        value={settingsForm.legal.proposedLegalName}
                        onChange={(e) =>
                          setSettingsForm({
                            ...settingsForm,
                            legal: { ...settingsForm.legal, proposedLegalName: e.target.value },
                          })
                        }
                        className="w-full rounded border border-slate-200 px-3 py-1.5"
                      />
                    </div>
                    <div>
                      <label className="mb-1 block text-slate-600">آدرس سایت شرکت پیشنهادی</label>
                      <input
                        type="text"
                        value={settingsForm.legal.proposedLegalWebsite}
                        onChange={(e) =>
                          setSettingsForm({
                            ...settingsForm,
                            legal: { ...settingsForm.legal, proposedLegalWebsite: e.target.value },
                          })
                        }
                        className="ltr w-full rounded border border-slate-200 px-3 py-1.5 font-mono"
                      />
                    </div>
                  </div>
                  <label className="flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-950 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={settingsForm.legal.confirmedByOwner}
                      onChange={(e) =>
                        setSettingsForm({
                          ...settingsForm,
                          legal: { ...settingsForm.legal, confirmedByOwner: e.target.checked },
                        })
                      }
                    />
                    <span>
                      تأیید مالک برای انتشار قطعی «{settingsForm.legal.proposedLegalName}» ({settingsForm.legal.proposedLegalWebsite}) در فوتر، قراردادها و صورتحساب‌ها
                    </span>
                  </label>
                </div>

                <div className="rounded-lg border border-slate-200 bg-white p-5 space-y-4">
                  <h3 className="text-sm font-bold text-slate-950">تنظیمات دوره آزمایشی چت عمومی AI</h3>
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-3 text-xs tabular-nums">
                    <div>
                      <label className="mb-1 block text-slate-600">مدت دوره آزمایشی (روز)</label>
                      <input
                        type="number"
                        value={settingsForm.trialPolicy.trialDays}
                        onChange={(e) =>
                          setSettingsForm({
                            ...settingsForm,
                            trialPolicy: { ...settingsForm.trialPolicy, trialDays: Number(e.target.value) || 14 },
                          })
                        }
                        className="w-full rounded border border-slate-200 px-3 py-1.5"
                      />
                    </div>
                    <div>
                      <label className="mb-1 block text-slate-600">سقف پیام متنی روزانه</label>
                      <input
                        type="number"
                        value={settingsForm.trialPolicy.dailyTextLimit}
                        onChange={(e) =>
                          setSettingsForm({
                            ...settingsForm,
                            trialPolicy: { ...settingsForm.trialPolicy, dailyTextLimit: Number(e.target.value) || 20 },
                          })
                        }
                        className="w-full rounded border border-slate-200 px-3 py-1.5"
                      />
                    </div>
                    <div>
                      <label className="mb-1 block text-slate-600">سقف عملیات تصویری روزانه</label>
                      <input
                        type="number"
                        value={settingsForm.trialPolicy.dailyImageLimit}
                        onChange={(e) =>
                          setSettingsForm({
                            ...settingsForm,
                            trialPolicy: { ...settingsForm.trialPolicy, dailyImageLimit: Number(e.target.value) || 2 },
                          })
                        }
                        className="w-full rounded border border-slate-200 px-3 py-1.5"
                      />
                    </div>
                  </div>
                </div>

                <button
                  type="submit"
                  className="rounded-lg bg-blue-700 px-6 py-2.5 text-xs font-semibold text-white hover:bg-blue-800"
                >
                  ذخیره همه تنظیمات کلان
                </button>
              </form>
            )}
          </>
        )}
      </main>
    </div>
  );
};
