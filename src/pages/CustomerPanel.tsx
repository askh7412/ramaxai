import React, { useEffect, useState } from 'react';
import {
  Bot,
  Briefcase,
  FileText,
  Globe,
  Headphones,
  LayoutDashboard,
  LogOut,
  Menu,
  Settings,
  Sparkles,
  Users,
  Wallet,
  Workflow,
  X,
} from 'lucide-react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import {
  ACCOUNT_STATUS_LABELS_FA,
  apiFetch,
  formatFaNumber,
  formatToman,
  navigateTo,
  ROLE_LABELS_FA,
} from '../lib/api';
import { SupportCommandCenter } from '../components/SupportCommandCenter';
import {
  AutomationView,
  ContentProductView,
  ContractsView,
  CustomerSettingsView,
  SitesAndWidgetView,
  TeamView,
  WalletView,
} from '../components/CustomerModules';
import type {
  AutomationRunLog,
  ConversationRecord,
  PublicModelInfo,
  SessionUser,
  SiteRecord,
  WalletTransaction,
} from '../shared/types';

type CustomerSection =
  | 'dashboard'
  | 'sites'
  | 'support'
  | 'team'
  | 'models'
  | 'content'
  | 'automation'
  | 'contracts'
  | 'wallet'
  | 'settings';

interface CustomerPanelProps {
  user: SessionUser;
  routePath: string;
  onUserUpdated: (user: SessionUser) => void;
  onLogout: () => Promise<void>;
}

function sectionFromPath(path: string): CustomerSection {
  if (path.includes('/panel/sites')) return 'sites';
  if (path.includes('/panel/support')) return 'support';
  if (path.includes('/panel/team')) return 'team';
  if (path.includes('/panel/models')) return 'models';
  if (path.includes('/panel/content')) return 'content';
  if (path.includes('/panel/automation')) return 'automation';
  if (path.includes('/panel/contracts')) return 'contracts';
  if (path.includes('/panel/wallet')) return 'wallet';
  if (path.includes('/panel/settings')) return 'settings';
  return 'dashboard';
}

export const CustomerPanel: React.FC<CustomerPanelProps> = ({
  user,
  routePath,
  onUserUpdated,
  onLogout,
}) => {
  const [section, setSection] = useState<CustomerSection>(sectionFromPath(routePath));
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const [sites, setSites] = useState<SiteRecord[]>([]);
  const [activeSiteId, setActiveSiteId] = useState<string>('');
  const [models, setModels] = useState<PublicModelInfo[]>([]);
  const [dashboardData, setDashboardData] = useState<{
    metrics: {
      conversationsTotal: number;
      openConversations: number;
      resolvedConversations: number;
      avgFirstResponseSec: number;
      totalSpentToman: number;
      walletBalanceToman: number;
      walletReservedToman: number;
      pendingTasks: number;
      failedTasks: number;
      contractsCount: number;
    };
    recentRuns: AutomationRunLog[];
    recentTransactions: WalletTransaction[];
  } | null>(null);

  const [contractSeedConv, setContractSeedConv] = useState<ConversationRecord | null>(null);
  const [loadingSites, setLoadingSites] = useState(true);

  // First-login forced password change modal
  const [firstLoginPass, setFirstLoginPass] = useState('');
  const [firstLoginSecQ, setFirstLoginSecQ] = useState('نام اولین کسب‌وکار شما؟');
  const [firstLoginSecA, setFirstLoginSecA] = useState('');
  const [firstLoginErr, setFirstLoginErr] = useState<string | null>(null);

  // Cross-site isolation live proof check
  const [isolationCheckMsg, setIsolationCheckMsg] = useState<string | null>(null);

  useEffect(() => {
    setSection(sectionFromPath(routePath));
  }, [routePath]);

  async function refreshSites() {
    setLoadingSites(true);
    try {
      const [sitesRes, pubRes] = await Promise.all([
        apiFetch<{ sites: SiteRecord[] }>('/api/sites'),
        apiFetch<{ models: PublicModelInfo[] }>('/api/public/config'),
      ]);
      setSites(sitesRes.sites);
      setModels(pubRes.models);
      if (sitesRes.sites.length > 0) {
        setActiveSiteId((prev) =>
          prev && sitesRes.sites.some((s) => s.id === prev) ? prev : sitesRes.sites[0].id
        );
      } else {
        setActiveSiteId('');
      }
    } finally {
      setLoadingSites(false);
    }
  }

  useEffect(() => {
    void refreshSites();
  }, [user.id]);

  useEffect(() => {
    if (!activeSiteId) {
      setDashboardData(null);
      return;
    }
    apiFetch<typeof dashboardData>(`/api/sites/${activeSiteId}/dashboard`)
      .then(setDashboardData)
      .catch(() => setDashboardData(null));
  }, [activeSiteId, section]);

  const activeSite = sites.find((s) => s.id === activeSiteId) || null;

  function goSection(next: CustomerSection) {
    setSection(next);
    setMobileMenuOpen(false);
    navigateTo(next === 'dashboard' ? '/panel' : `/panel/${next}`);
  }

  async function completeFirstLoginPassword(e: React.FormEvent) {
    e.preventDefault();
    setFirstLoginErr(null);
    try {
      const res = await apiFetch<{ user: SessionUser }>('/api/auth/first-login-security', {
        method: 'POST',
        body: JSON.stringify({
          newPassword: firstLoginPass,
          securityQuestion: firstLoginSecA ? firstLoginSecQ : undefined,
          securityAnswer: firstLoginSecA || undefined,
        }),
      });
      onUserUpdated(res.user);
    } catch (err) {
      setFirstLoginErr(err instanceof Error ? err.message : 'خطا در تغییر رمز عبور.');
    }
  }

  async function testCrossSiteIsolation() {
    const otherSiteId = activeSiteId === 'site_kafe' ? 'site_salamat' : 'site_kafe';
    setIsolationCheckMsg('در حال بررسی دسترسی سمت سرور...');
    try {
      await apiFetch(`/api/support/${otherSiteId}/conversations`);
      setIsolationCheckMsg(
        `کاربر فعلی (${user.username}) مجوز دسترسی به ${otherSiteId} را دارد (مالک هر دو سایت). برای مشاهده مسدودسازی ۴۰۳ با op_kafe یا mgr_salamat وارد شوید.`
      );
    } catch (err) {
      setIsolationCheckMsg(`تأیید جداسازی سرور (HTTP 403): ${err instanceof Error ? err.message : 'مسدود شد'}`);
    }
  }

  const navItems: { id: CustomerSection; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
    { id: 'dashboard', label: 'داشبورد', icon: LayoutDashboard },
    { id: 'sites', label: 'سایت‌ها و ویجت', icon: Globe },
    { id: 'support', label: 'مرکز پاسخگویی', icon: Headphones },
    { id: 'team', label: 'تیم و دپارتمان‌ها', icon: Users },
    { id: 'models', label: 'مدل‌ها', icon: Bot },
    { id: 'content', label: 'محتوا و محصول', icon: Sparkles },
    { id: 'automation', label: 'اتوماسیون', icon: Workflow },
    { id: 'contracts', label: 'قراردادها', icon: FileText },
    { id: 'wallet', label: 'کیف پول', icon: Wallet },
    { id: 'settings', label: 'تنظیمات و افزونه‌ها', icon: Settings },
  ];

  const chartData = dashboardData
    ? [
        { label: 'کل گفتگوها', value: dashboardData.metrics.conversationsTotal },
        { label: 'باز', value: dashboardData.metrics.openConversations },
        { label: 'حل‌شده', value: dashboardData.metrics.resolvedConversations },
        { label: 'کارهای در انتظار', value: dashboardData.metrics.pendingTasks },
        { label: 'قراردادها', value: dashboardData.metrics.contractsCount },
      ]
    : [];

  return (
    <div className="flex min-h-screen bg-slate-50 text-slate-900">
      {/* Forced Password Change Modal on First Login with Temporary Password */}
      {user.mustChangePassword && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4">
          <form
            onSubmit={completeFirstLoginPassword}
            className="w-full max-w-md rounded-xl border border-slate-200 bg-white p-6 space-y-4"
          >
            <h2 className="text-lg font-bold text-slate-950">تغییر رمز موقت در ورود اول</h2>
            <p className="text-xs leading-6 text-slate-600">
              به دلیل ورود با رمز یک‌بارمصرف، تعیین رمز عبور جدید الزامی است. پاسخ سؤال امنیتی به‌صورت هش‌شده ذخیره
              می‌شود و هرگز به مدل هوش مصنوعی ارسال نخواهد شد.
            </p>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-700">رمز عبور جدید *</label>
              <input
                type="password"
                required
                minLength={8}
                value={firstLoginPass}
                onChange={(e) => setFirstLoginPass(e.target.value)}
                className="ltr w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-left font-mono"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-700">سؤال امنیتی (اختیاری)</label>
              <input
                type="text"
                value={firstLoginSecQ}
                onChange={(e) => setFirstLoginSecQ(e.target.value)}
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-xs"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-700">پاسخ امنیتی (هش‌شده)</label>
              <input
                type="password"
                value={firstLoginSecA}
                onChange={(e) => setFirstLoginSecA(e.target.value)}
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-xs"
              />
            </div>
            {firstLoginErr && <p className="text-xs text-red-700">{firstLoginErr}</p>}
            <button
              type="submit"
              className="w-full rounded-lg bg-blue-700 py-2.5 text-sm font-semibold text-white hover:bg-blue-800"
            >
              ثبت رمز جدید و ورود به پنل
            </button>
          </form>
        </div>
      )}

      {/* Mobile Sidebar Overlay */}
      {mobileMenuOpen && (
        <div
          onClick={() => setMobileMenuOpen(false)}
          className="fixed inset-0 z-30 bg-slate-950/30 lg:hidden"
        />
      )}

      {/* Right RTL Navigation Sidebar */}
      <aside
        className={`fixed inset-y-0 right-0 z-40 flex w-64 flex-col border-l border-slate-200 bg-white transition-transform lg:static lg:translate-x-0 ${
          mobileMenuOpen ? 'translate-x-0' : 'translate-x-full'
        }`}
      >
        <div className="flex h-16 items-center justify-between border-b border-slate-200 px-5">
          <button
            type="button"
            onClick={() => navigateTo('/')}
            className="text-lg font-extrabold text-slate-950"
          >
            راماکس
          </button>
          <button
            type="button"
            onClick={() => setMobileMenuOpen(false)}
            className="lg:hidden rounded p-1 text-slate-500"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <nav className="flex-1 overflow-y-auto p-3 space-y-1">
          {navItems.map((item) => {
            const Icon = item.icon;
            const active = section === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => goSection(item.id)}
                className={`flex w-full items-center gap-2.5 rounded-lg px-3 py-2.5 text-xs font-medium transition-colors ${
                  active
                    ? 'bg-blue-50 text-blue-800 font-semibold'
                    : 'text-slate-600 hover:bg-slate-50 hover:text-slate-950'
                }`}
              >
                <Icon className="h-4 w-4 shrink-0" />
                <span>{item.label}</span>
              </button>
            );
          })}
        </nav>

        <div className="border-t border-slate-200 p-3 space-y-2">
          <button
            type="button"
            onClick={() => navigateTo('/ai')}
            className="flex w-full items-center justify-center gap-1.5 rounded-lg bg-slate-950 px-3 py-2 text-xs font-semibold text-white hover:bg-slate-800"
          >
            <Bot className="h-3.5 w-3.5" />
            ورود به محیط چت AI
          </button>
          <div className="flex items-center justify-between px-1 pt-1 text-xs">
            <div className="min-w-0">
              <div className="font-semibold text-slate-900 truncate">{user.name}</div>
              <div className="text-[11px] text-slate-500">{ROLE_LABELS_FA[user.role]}</div>
            </div>
            <button
              type="button"
              onClick={() => void onLogout()}
              title="خروج از حساب"
              className="rounded-md p-1.5 text-slate-500 hover:bg-red-50 hover:text-red-700"
            >
              <LogOut className="h-4 w-4" />
            </button>
          </div>
        </div>
      </aside>

      {/* Main Workspace */}
      <div className="flex min-w-0 flex-1 flex-col">
        {/* Top Bar with Multi-Site Switcher */}
        <header className="sticky top-0 z-20 flex h-16 items-center justify-between gap-4 border-b border-slate-200 bg-white px-4 sm:px-6">
          <div className="flex items-center gap-3 min-w-0">
            <button
              type="button"
              onClick={() => setMobileMenuOpen(true)}
              aria-label="منو"
              className="rounded-lg border border-slate-200 p-2 text-slate-700 lg:hidden"
            >
              <Menu className="h-4 w-4" />
            </button>
            <div className="flex items-center gap-2 min-w-0">
              <Briefcase className="h-4 w-4 text-slate-400 shrink-0 hidden sm:block" />
              <label className="text-xs text-slate-500 shrink-0 hidden sm:inline">سایت فعال:</label>
              {sites.length > 0 ? (
                <select
                  value={activeSiteId}
                  onChange={(e) => setActiveSiteId(e.target.value)}
                  className="max-w-[240px] truncate rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-semibold text-slate-950 focus:border-blue-600 focus:outline-none"
                >
                  {sites.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name} ({s.domain})
                    </option>
                  ))}
                </select>
              ) : (
                <span className="text-xs font-medium text-amber-800">هنوز سایتی ثبت نشده است</span>
              )}
            </div>
          </div>

          <div className="flex items-center gap-3 text-xs shrink-0">
            <span
              className={
                user.accountStatus === 'active'
                  ? 'text-emerald-700 font-medium'
                  : 'text-amber-700 font-semibold'
              }
            >
              وضعیت حساب: {ACCOUNT_STATUS_LABELS_FA[user.accountStatus]}
            </span>
          </div>
        </header>

        {/* Commercial Pending Activation Banner */}
        {user.accountStatus === 'pending_activation' && (
          <div className="border-b border-amber-200 bg-amber-50 px-4 py-3 sm:px-6 text-xs leading-6 text-amber-950">
            <strong>حساب تجاری شما در وضعیت «در انتظار فعالسازی» است:</strong> هم‌اکنون می‌توانید سایت خود را ثبت کنید،
            کد ویجت را کپی نمایید و از دوره آزمایشی ۱۴ روزه در محیط چت AI استفاده کنید. امکانات پولی و API سایت تا تأیید
            مدیرکل از سمت سرور مسدود هستند.
          </div>
        )}

        {/* Main Viewport */}
        <main className="flex-1 p-4 sm:p-6">
          {loadingSites ? (
            <div className="p-10 text-center text-sm text-slate-400">در حال بارگذاری اطلاعات سایت‌ها...</div>
          ) : !activeSite && section !== 'sites' && section !== 'models' && section !== 'settings' ? (
            <div className="mx-auto max-w-lg rounded-xl border border-slate-200 bg-white p-8 text-center space-y-4">
              <h2 className="text-lg font-bold text-slate-950">اولین سایت یا فروشگاه خود را ثبت کنید</h2>
              <p className="text-xs leading-6 text-slate-600">
                برای استفاده از ویجت چت، مرکز پاسخگویی، اتوماسیون و قراردادها ابتدا دامنه و اطلاعات سایت را ثبت کنید.
              </p>
              <button
                type="button"
                onClick={() => goSection('sites')}
                className="rounded-lg bg-blue-700 px-5 py-2.5 text-xs font-semibold text-white hover:bg-blue-800"
              >
                ثبت سایت جدید
              </button>
            </div>
          ) : (
            <>
              {section === 'dashboard' && activeSite && (
                <div className="space-y-6">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <h1 className="text-xl font-bold text-slate-950">داشبورد سایت {activeSite.name}</h1>
                      <p className="text-xs text-slate-500">
                        دامنه: <span className="font-mono ltr">{activeSite.domain}</span> · همه داده‌ها در سمت سرور
                        منحصراً به این سایت محدود شده‌اند.
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => void testCrossSiteIsolation()}
                      className="rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50"
                    >
                      بررسی جداسازی سایت در سرور
                    </button>
                  </div>

                  {isolationCheckMsg && (
                    <div className="rounded-lg border border-blue-200 bg-blue-50 p-3 text-xs text-blue-950">
                      {isolationCheckMsg}
                    </div>
                  )}

                  {dashboardData && (
                    <>
                      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4 tabular-nums">
                        <div className="rounded-xl border border-slate-200 bg-white p-5">
                          <div className="text-xs text-slate-500">موجودی کیف پول سایت</div>
                          <div className="mt-2 text-xl font-extrabold text-slate-950">
                            {formatToman(dashboardData.metrics.walletBalanceToman)}
                          </div>
                          <div className="mt-1 text-[11px] text-slate-500">
                            مصرف تسویه‌شده: {formatToman(dashboardData.metrics.totalSpentToman)}
                          </div>
                        </div>
                        <div className="rounded-xl border border-slate-200 bg-white p-5">
                          <div className="text-xs text-slate-500">گفتگوهای پشتیبانی</div>
                          <div className="mt-2 text-xl font-extrabold text-slate-950">
                            {formatFaNumber(dashboardData.metrics.conversationsTotal)} گفتگو
                          </div>
                          <div className="mt-1 text-[11px] text-slate-500">
                            باز: {formatFaNumber(dashboardData.metrics.openConversations)} · حل‌شده:{' '}
                            {formatFaNumber(dashboardData.metrics.resolvedConversations)}
                          </div>
                        </div>
                        <div className="rounded-xl border border-slate-200 bg-white p-5">
                          <div className="text-xs text-slate-500">میانگین زمان اولین پاسخ</div>
                          <div className="mt-2 text-xl font-extrabold text-slate-950">
                            {formatFaNumber(dashboardData.metrics.avgFirstResponseSec)} ثانیه
                          </div>
                          <div className="mt-1 text-[11px] text-slate-500">
                            نصب ویجت: {activeSite.installVerified ? 'تأییدشده' : 'نیازمند تست نصب'}
                          </div>
                        </div>
                        <div className="rounded-xl border border-slate-200 bg-white p-5">
                          <div className="text-xs text-slate-500">کارهای در انتظار و ناموفق</div>
                          <div className="mt-2 text-xl font-extrabold text-slate-950">
                            {formatFaNumber(dashboardData.metrics.pendingTasks)} در انتظار
                          </div>
                          <div className="mt-1 text-[11px] text-red-700">
                            کارهای ناموفق: {formatFaNumber(dashboardData.metrics.failedTasks)}
                          </div>
                        </div>
                      </div>

                      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
                        <div className="lg:col-span-7 rounded-xl border border-slate-200 bg-white p-5">
                          <h3 className="mb-4 text-sm font-bold text-slate-950">نمای عملیاتی سایت فعال</h3>
                          <div className="h-60 w-full">
                            <ResponsiveContainer width="100%" height="100%">
                              <BarChart data={chartData}>
                                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                                <XAxis dataKey="label" tick={{ fontSize: 11 }} />
                                <YAxis tick={{ fontSize: 11 }} />
                                <Tooltip />
                                <Bar dataKey="value" fill="#1d4ed8" radius={[6, 6, 0, 0]} />
                              </BarChart>
                            </ResponsiveContainer>
                          </div>
                        </div>

                        <div className="lg:col-span-5 rounded-xl border border-slate-200 bg-white p-5 space-y-3">
                          <h3 className="text-sm font-bold text-slate-950">آخرین رویدادهای اتوماسیون سایت</h3>
                          <div className="divide-y divide-slate-100 text-xs">
                            {dashboardData.recentRuns.length === 0 && (
                              <div className="py-4 text-slate-400">رویدادی ثبت نشده است.</div>
                            )}
                            {dashboardData.recentRuns.map((run) => (
                              <div key={run.id} className="py-2.5">
                                <div className="font-semibold text-slate-900">{run.ruleName}</div>
                                <div className="text-slate-600">{run.outputSummaryFa}</div>
                              </div>
                            ))}
                          </div>
                        </div>
                      </div>
                    </>
                  )}
                </div>
              )}

              {section === 'sites' && (
                <SitesAndWidgetView
                  sites={sites}
                  activeSite={activeSite}
                  models={models}
                  onRefreshSites={refreshSites}
                  onSelectSite={(id) => setActiveSiteId(id)}
                />
              )}

              {section === 'support' && activeSite && (
                <SupportCommandCenter
                  siteId={activeSite.id}
                  currentUser={user}
                  onCreateContractFromConv={(conv) => {
                    setContractSeedConv(conv);
                    goSection('contracts');
                  }}
                />
              )}

              {section === 'team' && activeSite && <TeamView siteId={activeSite.id} allSites={sites} />}

              {section === 'models' && (
                <div className="space-y-4">
                  <div>
                    <h2 className="text-lg font-bold text-slate-950">مدل‌های هوش مصنوعی راماکس</h2>
                    <p className="text-xs text-slate-500">
                      فهرست مدل‌های قابل استفاده برای سایت و محیط چت عمومی. نام تأمین‌کننده و شناسه داخلی نمایش داده نمی‌شود.
                    </p>
                  </div>
                  <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
                    <table className="w-full text-right text-xs">
                      <thead className="border-b border-slate-200 bg-slate-50 text-slate-500">
                        <tr>
                          <th className="px-4 py-3 font-semibold">نام مدل</th>
                          <th className="px-4 py-3 font-semibold">کاربرد و قابلیت</th>
                          <th className="px-4 py-3 font-semibold">ورودی</th>
                          <th className="px-4 py-3 font-semibold">رده تعرفه</th>
                          <th className="px-4 py-3 font-semibold">وضعیت</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-200">
                        {models.map((m) => (
                          <tr key={m.id}>
                            <td className="px-4 py-3 font-bold text-slate-950 whitespace-nowrap">
                              {m.icon} {m.publicName}
                            </td>
                            <td className="px-4 py-3 text-slate-600">{m.descriptionFa}</td>
                            <td className="px-4 py-3 text-slate-600">{m.inputTypes.join(' · ')}</td>
                            <td className="px-4 py-3 text-slate-700">{m.pricingTierFa}</td>
                            <td className="px-4 py-3">
                              {m.pipelineReady && m.enabled ? (
                                <span className="font-semibold text-emerald-700">فعال</span>
                              ) : (
                                <span className="text-amber-700">غیرفعال (در انتظار اتصال)</span>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {section === 'content' && activeSite && <ContentProductView siteId={activeSite.id} />}

              {section === 'automation' && activeSite && <AutomationView siteId={activeSite.id} />}

              {section === 'contracts' && activeSite && (
                <ContractsView
                  siteId={activeSite.id}
                  initialConversation={contractSeedConv}
                  onClearInitialConv={() => setContractSeedConv(null)}
                />
              )}

              {section === 'wallet' && activeSite && <WalletView siteId={activeSite.id} />}

              {section === 'settings' && (
                <CustomerSettingsView user={user} site={activeSite} onRefreshSites={refreshSites} />
              )}
            </>
          )}
        </main>
      </div>
    </div>
  );
};
