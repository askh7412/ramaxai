import React, { useEffect, useState } from 'react';
import { motion } from 'motion/react';
import {
  ArrowLeft,
  Check,
  Copy,
  Menu,
  MessageSquare,
  X,
} from 'lucide-react';
import { apiFetch, ASSETS, formatFaNumber, formatToman, navigateTo } from '../lib/api';
import { LiveWidget } from '../components/LiveWidget';
import { PLUGIN_GUIDES, RAMAX_OPENAPI_SPEC } from '../shared/openapi';
import type { PublicModelInfo } from '../shared/types';

export interface PublicConfigData {
  domains: {
    mainDomain: string;
    aiDomain: string;
    panelDomain: string;
    controlDomain: string;
  };
  legal: {
    published: boolean;
    legalName: string;
    legalWebsite: string;
    contactEmail: string;
    contactPhone: string;
    supportAddressFa: string;
  };
  trialPolicy: {
    trialDays: number;
    dailyTextLimit: number;
    dailyImageLimit: number;
  };
  tariffVersion: string;
  taxPercent: number;
  models: PublicModelInfo[];
  demoSitePublicKey: string;
}

type MarketingTab =
  | 'home'
  | 'features'
  | 'ecommerce'
  | 'support'
  | 'automation'
  | 'pricing'
  | 'docs'
  | 'contact'
  | 'privacy'
  | 'terms';

interface MarketingSiteProps {
  routePath: string;
}

function pathToTab(p: string): MarketingTab {
  if (p.startsWith('/features')) return 'features';
  if (p.startsWith('/ecommerce')) return 'ecommerce';
  if (p.startsWith('/support-solution')) return 'support';
  if (p.startsWith('/automation')) return 'automation';
  if (p.startsWith('/pricing')) return 'pricing';
  if (p.startsWith('/docs') || p.startsWith('/install')) return 'docs';
  if (p.startsWith('/contact')) return 'contact';
  if (p.startsWith('/privacy')) return 'privacy';
  if (p.startsWith('/terms')) return 'terms';
  return 'home';
}

export const MarketingSite: React.FC<MarketingSiteProps> = ({ routePath }) => {
  const activeTab = pathToTab(routePath);
  const [config, setConfig] = useState<PublicConfigData | null>(null);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  // Interactive Homepage Product Demo state
  const [demoView, setDemoView] = useState<'widget' | 'desk' | 'studio'>('widget');
  const [floatingDemoOpen, setFloatingDemoOpen] = useState(false);

  // Docs interactive plugin guide
  const [selectedPlugin, setSelectedPlugin] = useState<'wordpress' | 'prestashop' | 'django' | 'laravel'>('wordpress');
  const [copiedId, setCopiedId] = useState<string | null>(null);

  // Contact form
  const [leadForm, setLeadForm] = useState({ name: '', email: '', phone: '', company: '', message: '' });
  const [leadStatus, setLeadStatus] = useState<{ type: 'idle' | 'submitting' | 'success' | 'error'; text?: string }>({
    type: 'idle',
  });

  useEffect(() => {
    apiFetch<PublicConfigData>('/api/public/config')
      .then(setConfig)
      .catch(() => null);
  }, []);

  function go(path: string) {
    setMobileNavOpen(false);
    navigateTo(path);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function copyText(id: string, text: string) {
    navigator.clipboard?.writeText(text);
    setCopiedId(id);
    window.setTimeout(() => setCopiedId(null), 1800);
  }

  async function submitLead(e: React.FormEvent) {
    e.preventDefault();
    setLeadStatus({ type: 'submitting' });
    try {
      const res = await apiFetch<{ message: string }>('/api/public/contact', {
        method: 'POST',
        body: JSON.stringify(leadForm),
      });
      setLeadStatus({ type: 'success', text: res.message });
      setLeadForm({ name: '', email: '', phone: '', company: '', message: '' });
    } catch (err) {
      setLeadStatus({
        type: 'error',
        text: err instanceof Error ? err.message : 'خطا در ثبت فرم تماس.',
      });
    }
  }

  const activePluginGuide = PLUGIN_GUIDES.find((p) => p.id === selectedPlugin) || PLUGIN_GUIDES[0];

  return (
    <div className="min-h-screen bg-white text-slate-900 flex flex-col">
      {/* Strict 3-Zone Top Bar Contract */}
      <header className="sticky top-0 z-40 border-b border-slate-200 bg-white/95 backdrop-blur-sm">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between gap-8 px-4 sm:px-6 lg:px-8">
          {/* Zone 1: Brand Wordmark (single clean element) */}
          <button
            type="button"
            onClick={() => go('/')}
            className="text-xl font-extrabold tracking-tight text-slate-950 whitespace-nowrap shrink-0 cursor-pointer"
          >
            راماکس
          </button>

          {/* Zone 2: 5 concise single-line text nav links */}
          <nav className="hidden md:flex items-center gap-7 text-sm font-medium text-slate-600">
            <button
              type="button"
              onClick={() => go('/features')}
              className={`whitespace-nowrap shrink-0 transition-colors hover:text-slate-950 ${
                activeTab === 'features' ? 'text-blue-700 font-semibold' : ''
              }`}
            >
              امکانات
            </button>
            <button
              type="button"
              onClick={() => go('/ecommerce')}
              className={`whitespace-nowrap shrink-0 transition-colors hover:text-slate-950 ${
                activeTab === 'ecommerce' ? 'text-blue-700 font-semibold' : ''
              }`}
            >
              فروشگاهی
            </button>
            <button
              type="button"
              onClick={() => go('/support-solution')}
              className={`whitespace-nowrap shrink-0 transition-colors hover:text-slate-950 ${
                activeTab === 'support' ? 'text-blue-700 font-semibold' : ''
              }`}
            >
              پشتیبانی
            </button>
            <button
              type="button"
              onClick={() => go('/pricing')}
              className={`whitespace-nowrap shrink-0 transition-colors hover:text-slate-950 ${
                activeTab === 'pricing' ? 'text-blue-700 font-semibold' : ''
              }`}
            >
              تعرفه‌ها
            </button>
            <button
              type="button"
              onClick={() => go('/docs')}
              className={`whitespace-nowrap shrink-0 transition-colors hover:text-slate-950 ${
                activeTab === 'docs' ? 'text-blue-700 font-semibold' : ''
              }`}
            >
              مستندات
            </button>
          </nav>

          {/* Zone 3: 1 Primary CTA (+ Mobile menu trigger on small screens) */}
          <div className="flex items-center gap-3 shrink-0">
            <button
              type="button"
              onClick={() => go('/register')}
              className="rounded-lg bg-blue-700 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-800 transition-colors whitespace-nowrap shrink-0"
            >
              شروع رایگان
            </button>
            <button
              type="button"
              onClick={() => setMobileNavOpen((v) => !v)}
              aria-label="منوی موبایل"
              className="md:hidden rounded-lg border border-slate-200 p-2 text-slate-700 hover:bg-slate-50"
            >
              {mobileNavOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
            </button>
          </div>
        </div>

        {/* Mobile Menu Drawer */}
        {mobileNavOpen && (
          <div className="border-t border-slate-200 bg-white px-4 py-4 md:hidden">
            <div className="grid grid-cols-2 gap-2 text-sm">
              {[
                { label: 'خانه', path: '/' },
                { label: 'امکانات', path: '/features' },
                { label: 'راهکار فروشگاهی', path: '/ecommerce' },
                { label: 'پشتیبانی آنلاین', path: '/support-solution' },
                { label: 'اتوماسیون', path: '/automation' },
                { label: 'تعرفه‌ها', path: '/pricing' },
                { label: 'مستندات و نصب', path: '/docs' },
                { label: 'تماس با ما', path: '/contact' },
                { label: 'ورود به پنل', path: '/login' },
                { label: 'محیط چت AI', path: '/ai' },
              ].map((item) => (
                <button
                  key={item.path}
                  type="button"
                  onClick={() => go(item.path)}
                  className="rounded-lg px-3 py-2.5 text-right font-medium text-slate-700 hover:bg-slate-50"
                >
                  {item.label}
                </button>
              ))}
            </div>
          </div>
        )}
      </header>

      {/* Main Content Area */}
      <main className="flex-1">
        {activeTab === 'home' && (
          <>
            {/* HERO SECTION */}
            <section className="relative overflow-hidden border-b border-slate-200 bg-slate-50/60">
              <div
                aria-hidden="true"
                className="ramax-ambient pointer-events-none absolute -top-24 left-1/4 h-96 w-96 rounded-full bg-blue-200/40 blur-3xl"
              />
              <div className="relative mx-auto max-w-7xl px-4 py-14 sm:px-6 lg:px-8 lg:py-20">
                <div className="grid grid-cols-1 items-stretch gap-10 lg:grid-cols-12">
                  <motion.div
                    initial={{ opacity: 0, y: 12 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.35 }}
                    className="flex flex-col justify-center lg:col-span-6"
                  >
                    <p className="text-xs font-medium text-blue-700">
                      پلتفرم یکپارچه فارسی · هوش مصنوعی، مرکز پاسخگویی و اتوماسیون فروشگاهی
                    </p>
                    <h1 className="mt-4 text-balance text-3xl font-extrabold leading-[1.25] tracking-tight text-slate-950 sm:text-5xl">
                      پشتیبانی آنلاین، اتوماسیون و هوش مصنوعی فارسی برای رشد سایت شما
                    </h1>
                    <p className="mt-5 max-w-xl text-base leading-8 text-slate-600">
                      راماکس ویجت چت ایزوله، مرکز فرماندهی اپراتورها، سازنده قوانین اتوماسیون، قراردادهای فارسی و
                      گفتگوی هوشمند با مدل‌های تخصصی را در یک محیط منسجم برای فروشگاه‌ها و کسب‌وکارهای آنلاین فراهم می‌کند.
                    </p>

                    <div className="mt-8 flex flex-wrap items-center gap-4">
                      <button
                        type="button"
                        onClick={() => go('/register')}
                        className="inline-flex items-center gap-2 rounded-lg bg-slate-950 px-6 py-3 text-sm font-semibold text-white hover:bg-slate-800 transition-colors whitespace-nowrap"
                      >
                        ساخت حساب و ثبت سایت
                        <ArrowLeft className="h-4 w-4" />
                      </button>
                      <button
                        type="button"
                        onClick={() => go('/login')}
                        className="rounded-lg border border-slate-300 bg-white px-5 py-3 text-sm font-medium text-slate-800 hover:bg-slate-50 transition-colors whitespace-nowrap"
                      >
                        ورود به پنل مشتری
                      </button>
                      <button
                        type="button"
                        onClick={() => go('/ai')}
                        className="text-sm font-semibold text-blue-700 hover:text-blue-900 transition-colors whitespace-nowrap px-2 py-2"
                      >
                        ورود به محیط چت AI
                      </button>
                    </div>

                    <div className="mt-8 flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-slate-200 pt-5 text-xs text-slate-500">
                      <span>دوره آزمایشی چت AI: {formatFaNumber(config?.trialPolicy.trialDays ?? 14)} روز</span>
                      <span aria-hidden="true">·</span>
                      <span>سهمیه روزانه: {formatFaNumber(config?.trialPolicy.dailyTextLimit ?? 20)} پیام متنی</span>
                      <span aria-hidden="true">·</span>
                      <span>نصب ویجت روی هر سایت با یک خط کد</span>
                    </div>
                  </motion.div>

                  <motion.div
                    initial={{ opacity: 0, y: 16 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.45, delay: 0.06 }}
                    className="lg:col-span-6"
                  >
                    <div className="relative h-full min-h-[320px] overflow-hidden rounded-xl border border-slate-200 bg-slate-900">
                      <img
                        src={ASSETS.heroWorkspace}
                        alt="محیط کاری مدرن و مرکز فرماندهی راماکس"
                        referrerPolicy="no-referrer"
                        className="h-full w-full object-cover"
                      />
                      <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-slate-950/90 via-slate-950/50 to-transparent p-6 text-white">
                        <div className="text-xs text-slate-300">
                          چهار محیط مجزا با یک هویت یکپارچه · قابل تنظیم از پنل مدیرکل
                        </div>
                        <div className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 text-xs font-mono ltr text-left text-slate-100 sm:grid-cols-4">
                          <span className="truncate">{config?.domains.mainDomain || 'ramax.ramalife.cloud'}</span>
                          <span className="truncate">{config?.domains.aiDomain || 'ai.ramalife.cloud'}</span>
                          <span className="truncate">{config?.domains.panelDomain || 'panel.ramax.ramalife.cloud'}</span>
                          <span className="truncate">{config?.domains.controlDomain || 'control.ramax.ramalife.cloud'}</span>
                        </div>
                      </div>
                    </div>
                  </motion.div>
                </div>

                {/* 4-Step Short Onboarding Strip (Full width row below Hero Split) */}
                <div className="mt-10 grid grid-cols-1 gap-4 border-t border-slate-200 pt-8 sm:grid-cols-2 lg:grid-cols-4">
                  {[
                    { num: '۰۱', title: 'ثبت‌نام سریع', desc: 'ساخت حساب تجاری با کپچای اختصاصی و شروع هم‌زمان دوره آزمایشی چت AI' },
                    { num: '۰۲', title: 'ثبت دامنه و سایت', desc: 'تنظیم موضوع کسب‌وکار، لحن، قوانین پاسخگویی و مدل پیش‌فرض سایت' },
                    { num: '۰۳', title: 'کپی یک خط کد نصب', desc: 'نصب ویجت ایزوله با شناسه عمومی بدون افشای کلید محرمانه در مرورگر' },
                    { num: '۰۴', title: 'آزمون زنده و پاسخگویی', desc: 'ارسال پیام آزمایشی از ویجت، دریافت در مرکز فرماندهی و برگشت پاسخ' },
                  ].map((step) => (
                    <div key={step.num} className="space-y-1.5">
                      <div className="text-xs font-semibold text-blue-700 tabular-nums">{step.num}</div>
                      <h2 className="text-sm font-bold text-slate-950">{step.title}</h2>
                      <p className="text-xs leading-6 text-slate-600">{step.desc}</p>
                    </div>
                  ))}
                </div>
              </div>
            </section>

            {/* LIVE INTERACTIVE PRODUCT DEMO SECTION */}
            <section className="mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:px-8">
              <div className="flex flex-col justify-between gap-4 border-b border-slate-200 pb-6 md:flex-row md:items-end">
                <div>
                  <p className="text-xs font-medium text-slate-500">
                    پیش‌نمایش واقعی تجربه محصول · داده‌های نمایشی با برچسب «نمونه» مشخص شده‌اند
                  </p>
                  <h2 className="mt-2 text-2xl font-bold text-slate-950 sm:text-3xl">
                    محصول را پیش از ثبت‌نام امتحان کنید
                  </h2>
                </div>
                <div className="flex items-center gap-1 rounded-lg bg-slate-100 p-1 self-start">
                  {[
                    { id: 'widget' as const, label: 'ویجت زنده (نمونه)' },
                    { id: 'desk' as const, label: 'مرکز پاسخگویی (نمونه)' },
                    { id: 'studio' as const, label: 'مدل‌ها و عکس محصول (نمونه)' },
                  ].map((tab) => (
                    <button
                      key={tab.id}
                      type="button"
                      onClick={() => setDemoView(tab.id)}
                      className={`rounded-md px-3.5 py-2 text-xs font-medium transition-colors whitespace-nowrap ${
                        demoView === tab.id
                          ? 'bg-white text-slate-950 shadow-sm'
                          : 'text-slate-600 hover:text-slate-950'
                      }`}
                    >
                      {tab.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="mt-8">
                {demoView === 'widget' && (
                  <div className="grid grid-cols-1 gap-8 lg:grid-cols-12 items-start">
                    <div className="lg:col-span-5 space-y-5">
                      <h3 className="text-lg font-bold text-slate-950">
                        ویجت چت ایزوله روی سایت فروشگاه نمونه
                      </h3>
                      <p className="text-sm leading-7 text-slate-600">
                        این ویجت به سرور واقعی راماکس متصل است. می‌توانید نام وارد کنید، دپارتمان را انتخاب کنید، پیام یا فایل
                        بفرستید و قطعی اتصال را شبیه‌سازی کنید. هر پیامی که اینجا ثبت کنید واقعاً به مرکز پاسخگویی سایت نمونه
                        «کافه‌نگار» می‌رسد.
                      </p>
                      <div className="space-y-2 border-t border-slate-200 pt-4 text-xs leading-6 text-slate-600">
                        <div>۰۱. فرانت ویجت فقط شناسه عمومی نصب را می‌گیرد؛ هیچ کلید محرمانه‌ای در مرورگر ذخیره نمی‌شود.</div>
                        <div>۰۲. یادداشت‌های داخلی اپراتور هرگز در پنجره بازدیدکننده نمایش داده نمی‌شوند.</div>
                        <div>۰۳. با تحویل گفتگو به اپراتور انسانی، پاسخ خودکار ربات بلافاصله متوقف می‌شود.</div>
                      </div>
                      <button
                        type="button"
                        onClick={() => go('/login')}
                        className="inline-flex items-center gap-2 rounded-lg border border-slate-300 px-4 py-2.5 text-xs font-semibold text-slate-900 hover:bg-slate-50"
                      >
                        ورود با حساب نمونه برای دیدن پیام در مرکز پاسخگویی
                        <ArrowLeft className="h-3.5 w-3.5" />
                      </button>
                    </div>
                    <div className="lg:col-span-7">
                      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm max-w-md mx-auto lg:mx-0 lg:mr-auto">
                        {config?.demoSitePublicKey ? (
                          <LiveWidget
                            publicInstallKey={config.demoSitePublicKey}
                            isDemoBadge
                          />
                        ) : (
                          <div className="p-8 text-center text-sm text-slate-500">در حال بارگذاری ویجت نمونه...</div>
                        )}
                      </div>
                    </div>
                  </div>
                )}

                {demoView === 'desk' && (
                  <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
                    <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 bg-slate-50 px-5 py-3 text-xs text-slate-600">
                      <span className="font-semibold text-slate-900">
                        نمای سه‌ستونه مرکز فرماندهی پشتیبانی · داده‌های نمایشی (نمونه)
                      </span>
                      <span>فروشگاه قهوه کافه‌نگار (نمونه) · دپارتمان ارسال و پیگیری</span>
                    </div>
                    <div className="grid grid-cols-1 divide-y divide-slate-200 lg:grid-cols-12 lg:divide-y-0 lg:divide-x lg:divide-x-reverse">
                      {/* Queue */}
                      <div className="p-4 lg:col-span-3 space-y-2.5">
                        <div className="text-xs font-semibold text-slate-500">صف گفتگوها (نمونه)</div>
                        <div className="rounded-lg border border-blue-200 bg-blue-50/50 p-3">
                          <div className="flex items-center justify-between text-xs">
                            <span className="font-bold text-slate-950">مریم کاظمی (نمونه)</span>
                            <span className="font-mono text-slate-500">RMX-1041</span>
                          </div>
                          <p className="mt-1 truncate text-xs text-slate-600">
                            تاخیر در ارسال سفارش اسپرسوساز #4821
                          </p>
                          <div className="mt-1.5 text-[11px] text-red-700 font-medium">
                            هشدار مشتری ناراضی · فوری · ارسال
                          </div>
                        </div>
                        <div className="rounded-lg border border-slate-200 p-3">
                          <div className="flex items-center justify-between text-xs">
                            <span className="font-semibold text-slate-900">شرکت سپهر (نمونه)</span>
                            <span className="font-mono text-slate-500">RMX-1042</span>
                          </div>
                          <p className="mt-1 truncate text-xs text-slate-600">
                            درخواست قرارداد تجهیز کافی‌بار اداری
                          </p>
                          <div className="mt-1.5 text-[11px] text-slate-500">در صف · فروش سازمانی</div>
                        </div>
                      </div>
                      {/* Thread */}
                      <div className="p-4 lg:col-span-6 space-y-3 bg-slate-50/30">
                        <div className="flex items-center justify-between border-b border-slate-200 pb-2 text-xs">
                          <span className="font-semibold text-slate-900">حالت پاسخگویی: پیشنهاد AI با تأیید اپراتور</span>
                          <span className="text-slate-500">ربات خودکار متوقف است</span>
                        </div>
                        <div className="rounded-lg border border-slate-200 bg-white p-3 text-xs leading-6 text-slate-800">
                          <div className="text-[11px] text-slate-400 mb-1">مریم کاظمی (نمونه)</div>
                          سه روز پیش دستگاه سفارش دادم اما هنوز کد رهگیری نیامده است.
                        </div>
                        <div className="rounded-lg border border-amber-200 bg-amber-50/80 p-3 text-xs leading-6 text-amber-950">
                          <div className="text-[11px] font-semibold text-amber-800 mb-1">
                            یادداشت داخلی تیم (هرگز برای مشتری ارسال نمی‌شود)
                          </div>
                          با انبار غرب هماهنگ شد، بسته ساعت ۱۴ تحویل تیپاکس می‌شود.
                        </div>
                        <div className="rounded-lg border border-blue-200 bg-blue-50/60 p-3 text-xs leading-6 text-slate-800">
                          <div className="text-[11px] font-semibold text-blue-800 mb-1">
                            پیشنهاد هوش مصنوعی راماکس (آماده ویرایش و تأیید اپراتور)
                          </div>
                          «سلام خانم کاظمی عزیز، سفارش شماره ۴۸۲۱ شما آماده ارسال است و کد رهگیری تا یک ساعت آینده در همین
                          گفتگو ارسال می‌شود.»
                        </div>
                      </div>
                      {/* Details */}
                      <div className="p-4 lg:col-span-3 space-y-3 text-xs">
                        <div className="font-semibold text-slate-900">جزئیات و اقدامات (نمونه)</div>
                        <div className="space-y-1.5 text-slate-600">
                          <div>موضوع تشخیص‌داده‌شده: ارسال مرسوله</div>
                          <div>اولین پاسخ: ۴۸ ثانیه</div>
                          <div>دپارتمان: ارسال و پیگیری</div>
                        </div>
                        <button
                          type="button"
                          onClick={() => go('/panel/support')}
                          className="w-full rounded-lg bg-slate-950 px-3 py-2 text-xs font-semibold text-white hover:bg-slate-800"
                        >
                          باز کردن مرکز پاسخگویی واقعی
                        </button>
                      </div>
                    </div>
                  </div>
                )}

                {demoView === 'studio' && (
                  <div className="grid grid-cols-1 gap-8 lg:grid-cols-12 items-start">
                    <div className="lg:col-span-6 space-y-4">
                      <h3 className="text-lg font-bold text-slate-950">
                        انتخاب مدل تخصصی راماکس و ابزار محصول فروشگاهی (نمونه)
                      </h3>
                      <p className="text-sm leading-7 text-slate-600">
                        در محیط چت AI و فرم ویرایش محصولات فروشگاه، مدل‌ها بر اساس کارایی دسته‌بندی شده‌اند و نام
                        تأمین‌کننده یا شناسه داخلی هرگز نمایش داده نمی‌شود. کنار هر فیلد محصول یک دکمه «راماکس» برای تولید
                        پیشنهاد قابل بازبینی قرار می‌گیرد.
                      </p>
                      <div className="divide-y divide-slate-200 border-t border-b border-slate-200">
                        {(config?.models || []).slice(0, 6).map((m) => (
                          <div key={m.id} className="flex items-center justify-between gap-4 py-2.5 text-xs">
                            <div>
                              <span className="font-semibold text-slate-950">
                                {m.icon} {m.publicName}
                              </span>
                              <span className="mx-2 text-slate-300">·</span>
                              <span className="text-slate-600">{m.capabilitiesFa.join('، ')}</span>
                            </div>
                            <span className="shrink-0 text-slate-500">{m.pricingTierFa}</span>
                          </div>
                        ))}
                      </div>
                      <button
                        type="button"
                        onClick={() => go('/ai')}
                        className="inline-flex items-center gap-2 rounded-lg bg-blue-700 px-4 py-2.5 text-xs font-semibold text-white hover:bg-blue-800"
                      >
                        آزمایش چت عمومی AI با دوره ۱۴ روزه
                        <ArrowLeft className="h-3.5 w-3.5" />
                      </button>
                    </div>
                    <div className="lg:col-span-6">
                      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
                        <img
                          src={ASSETS.ecommerceStudio}
                          alt="نمونه تصویر محصول استاندارد فروشگاهی"
                          referrerPolicy="no-referrer"
                          className="aspect-[4/3] w-full object-cover"
                        />
                        <div className="p-4 text-xs text-slate-600 flex items-center justify-between gap-2">
                          <span>نمونه تصویر استاندارد کاتالوگ محصول (حفظ ویژگی واقعی کالا)</span>
                          <span className="font-medium text-slate-900">نمونه</span>
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </section>

            {/* ASYMMETRIC BENTO CAPABILITIES */}
            <section className="border-t border-slate-200 bg-slate-50/50 py-16">
              <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
                <div className="max-w-2xl">
                  <h2 className="text-2xl font-bold text-slate-950 sm:text-3xl">
                    معماری یکپارچه برای فروشگاه‌ها، تیم‌های پشتیبانی و مدیران چندسایته
                  </h2>
                  <p className="mt-3 text-sm leading-7 text-slate-600">
                    هر بخش راماکس با کنترل دسترسی سمت سرور و جداسازی کامل داده‌های هر سایت طراحی شده است تا تیم‌های
                    مختلف بدون تداخل داده‌ای کار کنند.
                  </p>
                </div>

                <div className="mt-10 grid grid-cols-1 gap-6 lg:grid-cols-12">
                  <div className="rounded-xl border border-slate-200 bg-white p-6 lg:col-span-7 flex flex-col justify-between">
                    <div>
                      <div className="text-xs font-semibold text-blue-700">۰۱. مرکز فرماندهی پشتیبانی</div>
                      <h3 className="mt-2 text-xl font-bold text-slate-950">
                        پاسخگویی سریع با تعادل دقیق میان اپراتور و هوش مصنوعی
                      </h3>
                      <p className="mt-3 text-sm leading-7 text-slate-600">
                        صف گفتگوها بر اساس سایت، دپارتمان، اولویت و زمان انتظار فیلتر می‌شود. با تحویل گفتگو به اپراتور،
                        پاسخ خودکار ربات متوقف می‌شود تا پیام تکراری ارسال نشود و یادداشت‌های داخلی محرمانه می‌مانند.
                      </p>
                    </div>
                    <div className="mt-6 overflow-hidden rounded-lg border border-slate-200">
                      <img
                        src={ASSETS.supportEditorial}
                        alt="فضای کار آرام و خوانای پشتیبانی آنلاین راماکس"
                        referrerPolicy="no-referrer"
                        className="aspect-[16/9] w-full object-cover"
                      />
                    </div>
                  </div>

                  <div className="lg:col-span-5 flex flex-col gap-6">
                    <div className="rounded-xl border border-slate-200 bg-white p-6 flex-1">
                      <div className="text-xs font-semibold text-blue-700">۰۲. اتوماسیون بدون حلقه</div>
                      <h3 className="mt-2 text-lg font-bold text-slate-950">
                        رویداد ← شرط ← اقدام با پیش‌نمایش و نسخه‌بندی
                      </h3>
                      <p className="mt-2 text-sm leading-7 text-slate-600">
                        ارجاع خودکار پیام‌های ارسال، انتقال رسیدهای سالم به بخش مالی، هشدار بی‌پاسخ ماندن گفتگو به
                        سرپرست و تولید پیش‌نویس قرارداد با کنترل مجوز صریح مدیر.
                      </p>
                      <button
                        type="button"
                        onClick={() => go('/automation')}
                        className="mt-4 inline-flex items-center gap-1.5 text-xs font-semibold text-blue-700 hover:underline"
                      >
                        مشاهده نمونه‌های عملی اتوماسیون
                        <ArrowLeft className="h-3.5 w-3.5" />
                      </button>
                    </div>

                    <div className="rounded-xl border border-slate-200 bg-white p-6 flex-1">
                      <div className="text-xs font-semibold text-blue-700">۰۳. قراردادها و PDF فارسی</div>
                      <h3 className="mt-2 text-lg font-bold text-slate-950">
                        از گفتگوی فروش تا پیش‌نویس نسخه‌بندی‌شده و PDF استاندارد
                      </h3>
                      <p className="mt-2 text-sm leading-7 text-slate-600">
                        ساخت قرارداد مستقیماً از داخل گفتگو، حفظ سابقه نسخه‌های ارسال‌شده، لینک مشاهده و پذیرش محدود و
                        خروجی PDF فارسی با فونت Vazirmatn.
                      </p>
                      <button
                        type="button"
                        onClick={() => go('/docs')}
                        className="mt-4 inline-flex items-center gap-1.5 text-xs font-semibold text-blue-700 hover:underline"
                      >
                        بررسی افزونه‌های وردپرس، پرستاشاپ، جنگو و لاراول
                        <ArrowLeft className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            </section>
          </>
        )}

        {activeTab === 'features' && (
          <section className="mx-auto max-w-6xl px-4 py-14 sm:px-6 lg:px-8 space-y-10">
            <div className="max-w-3xl">
              <p className="text-xs font-medium text-blue-700">امکانات سامانه راماکس</p>
              <h1 className="mt-2 text-3xl font-extrabold text-slate-950">
                همه ابزارهای مورد نیاز پشتیبانی، محتوا، قرارداد و اتوماسیون در یک معماری امن
              </h1>
            </div>
            <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
              {[
                {
                  num: '۰۱',
                  title: 'ویجت چت ایزوله با نشست کوتاه‌عمر',
                  body: 'نصب با یک خط کد روی هر قالب فروشگاهی بدون تداخل CSS. تنها شناسه عمومی در مرورگر قرار می‌گیرد و محدودیت دامنه و نرخ درخواست سمت سرور اعمال می‌شود.',
                },
                {
                  num: '۰۲',
                  title: 'مدیریت چندسایته با جداسازی کامل داده',
                  body: 'تغییر سایت فعال در بالای پنل تمامی گفتگوها، فایل‌های خصوصی، کیف پول، قراردادها و گزارش‌ها را در سمت سرور به همان سایت محدود می‌کند.',
                },
                {
                  num: '۰۳',
                  title: 'هشت مدل تخصصی با نام‌گذاری شفاف فارسی',
                  body: 'دسته‌بندی بر اساس سرعت، نویسندگی، کدنویسی، تحلیل، سندخوانی و تصویرخوانی همراه با نمایش دقیق سهمیه و رده تعرفه.',
                },
                {
                  num: '۰۴',
                  title: 'حسابداری دقیق رزرو و تسویه اعتبار',
                  body: 'پیش از هر عملیات پولی اعتبار رزرو می‌شود؛ در موفقیت تسویه و در خطای قطعی آزاد می‌گردد. تکرار درخواست هرگز تراکنش تکراری نمی‌سازد.',
                },
                {
                  num: '۰۵',
                  title: 'فایل‌های خصوصی با اسکن امنیتی و لینک کوتاه‌عمر',
                  body: 'فایل‌های پیوست مشتریان در فضای خصوصی نگهداری می‌شوند، نوع و اندازه بررسی می‌شود و دانلود فقط با لینک کوتاه‌عمر و ثبت رویداد ممیزی ممکن است.',
                },
                {
                  num: '۰۶',
                  title: 'پنل مجزای مدیرکل با کوکی مستقل و MFA',
                  body: 'مدیریت حساب‌ها، فعالسازی حساب‌های تجاری، همگام‌سازی مدل‌ها، تنظیم نرخ و مالیات، بررسی دستی پرداخت‌ها و گزارش ممیزی کامل.',
                },
              ].map((item) => (
                <div key={item.num} className="rounded-xl border border-slate-200 bg-white p-6">
                  <div className="text-xs font-semibold text-blue-700">{item.num}</div>
                  <h2 className="mt-2 text-lg font-bold text-slate-950">{item.title}</h2>
                  <p className="mt-2 text-sm leading-7 text-slate-600">{item.body}</p>
                </div>
              ))}
            </div>
          </section>
        )}

        {activeTab === 'ecommerce' && (
          <section className="mx-auto max-w-6xl px-4 py-14 sm:px-6 lg:px-8 space-y-12">
            <div className="grid grid-cols-1 gap-10 lg:grid-cols-12 items-center">
              <div className="lg:col-span-6 space-y-4">
                <p className="text-xs font-medium text-blue-700">راهکار فروشگاهی راماکس</p>
                <h1 className="text-3xl font-extrabold text-slate-950">
                  افزایش نرخ تبدیل فروشگاه با دستیار محصول و پشتیبانی لحظه‌ای
                </h1>
                <p className="text-sm leading-7 text-slate-600">
                  کنار فیلدهای عنوان، توضیحات و متادیتای محصول در ووکامرس، پرستاشاپ، جنگو و لاراول، دکمه «راماکس»
                  پیشنهاد دقیق و منطبق بر لحن برند تولید می‌کند تا مدیر فروشگاه پس از بررسی و تأیید آن را منتشر کند.
                </p>
                <div className="space-y-2 pt-2 text-sm text-slate-700">
                  <div>· حفظ کامل مشخصات واقعی کالا بدون تغییر ویژگی‌های محصول در متن یا عکس</div>
                  <div>· همگام‌سازی قیمت از منابع تأییدشده همراه با پیش‌نمایش اختلاف و سقف تغییر</div>
                  <div>· بررسی خودکار رسیدهای واریز و ارجاع سالم‌ها به دپارتمان مالی</div>
                </div>
                <div className="pt-3">
                  <button
                    type="button"
                    onClick={() => go('/register')}
                    className="rounded-lg bg-blue-700 px-5 py-2.5 text-sm font-semibold text-white hover:bg-blue-800"
                  >
                    اتصال فروشگاه به راماکس
                  </button>
                </div>
              </div>
              <div className="lg:col-span-6">
                <img
                  src={ASSETS.ecommerceStudio}
                  alt="استودیو محصول فروشگاهی راماکس"
                  referrerPolicy="no-referrer"
                  className="aspect-[4/3] w-full rounded-xl border border-slate-200 object-cover"
                />
              </div>
            </div>
          </section>
        )}

        {activeTab === 'support' && (
          <section className="mx-auto max-w-6xl px-4 py-14 sm:px-6 lg:px-8 space-y-10">
            <div className="grid grid-cols-1 gap-10 lg:grid-cols-12 items-center">
              <div className="lg:col-span-6 space-y-4">
                <p className="text-xs font-medium text-blue-700">مرکز فرماندهی پشتیبانی آنلاین</p>
                <h1 className="text-3xl font-extrabold text-slate-950">
                  محیط کاری خوانا و سریع برای پاسخگویی طولانی‌مدت اپراتورها
                </h1>
                <p className="text-sm leading-7 text-slate-600">
                  طراحی سه‌ستونه دسکتاپ (صف گفتگوها، متن گفتگو، جزئیات مشتری) و مسیر روان موبایل به تیم شما اجازه
                  می‌دهد بین سه حالت «فقط انسان»، «پیشنهاد AI با تأیید اپراتور» و «پاسخ خودکار» کنترل دقیق داشته باشد.
                </p>
                <ul className="space-y-2 text-sm text-slate-700">
                  <li>· دپارتمان‌های قابل تنظیم فروش، پشتیبانی، مالی، ارسال و شکایات همراه با جانشین</li>
                  <li>· خلاصه‌سازی هوشمند گفتگو، تشخیص موضوع و هشدار مشتری ناراضی</li>
                  <li>· ثبت تاریخچه کامل انتقال‌ها، تغییر وضعیت‌ها و زمان اولین پاسخ</li>
                </ul>
              </div>
              <div className="lg:col-span-6">
                <img
                  src={ASSETS.supportEditorial}
                  alt="محیط پاسخگویی تیم پشتیبانی"
                  referrerPolicy="no-referrer"
                  className="aspect-[4/3] w-full rounded-xl border border-slate-200 object-cover"
                />
              </div>
            </div>
          </section>
        )}

        {activeTab === 'automation' && (
          <section className="mx-auto max-w-6xl px-4 py-14 sm:px-6 lg:px-8 space-y-8">
            <div className="max-w-3xl">
              <p className="text-xs font-medium text-blue-700">موتور اتوماسیون گفتگو، فایل و عملیات سایت</p>
              <h1 className="mt-2 text-3xl font-extrabold text-slate-950">
                قوانین نسخه‌بندی‌شده با پیش‌نمایش آزمایشی و جلوگیری از حلقه
              </h1>
              <p className="mt-3 text-sm leading-7 text-slate-600">
                پیش از فعالسازی هر قانون می‌توانید آن را روی ورودی نمونه اجرا کنید. اقدامات حساس مانند ارسال قرارداد یا
                انتشار محتوا و تغییر قیمت همیشه نیازمند مجوز صریح مدیر هستند.
              </p>
            </div>
            <div className="overflow-x-auto rounded-xl border border-slate-200">
              <table className="w-full text-right text-sm">
                <thead className="bg-slate-50 text-xs text-slate-500 border-b border-slate-200">
                  <tr>
                    <th className="px-4 py-3 font-semibold">رویداد (Trigger)</th>
                    <th className="px-4 py-3 font-semibold">شرط (Condition)</th>
                    <th className="px-4 py-3 font-semibold">اقدام (Action)</th>
                    <th className="px-4 py-3 font-semibold">سیاست مجوز</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 text-slate-700">
                  <tr>
                    <td className="px-4 py-3 font-medium">ثبت گفتگو</td>
                    <td className="px-4 py-3">موضوع مرتبط با ارسال و مرسوله</td>
                    <td className="px-4 py-3">انتقال به دپارتمان ارسال</td>
                    <td className="px-4 py-3 text-xs text-slate-500">اجرای خودکار</td>
                  </tr>
                  <tr>
                    <td className="px-4 py-3 font-medium">بارگذاری فایل رسید</td>
                    <td className="px-4 py-3">تأیید سلامت امنیتی فایل</td>
                    <td className="px-4 py-3">ارجاع به مالی + ایجاد کار بررسی</td>
                    <td className="px-4 py-3 text-xs text-slate-500">اجرای خودکار</td>
                  </tr>
                  <tr>
                    <td className="px-4 py-3 font-medium">بی‌پاسخ ماندن پیام</td>
                    <td className="px-4 py-3">گذشت زمان تعیین‌شده SLA</td>
                    <td className="px-4 py-3">اعلان فوری به سرپرست پشتیبانی</td>
                    <td className="px-4 py-3 text-xs text-slate-500">اجرای خودکار</td>
                  </tr>
                  <tr>
                    <td className="px-4 py-3 font-medium">درخواست قرارداد</td>
                    <td className="px-4 py-3">انتخاب قالب متناسب با سفارش</td>
                    <td className="px-4 py-3">ساخت پیش‌نویس و ارسال برای تأیید مدیر</td>
                    <td className="px-4 py-3 text-xs font-medium text-amber-800">نیازمند تأیید مدیر</td>
                  </tr>
                  <tr>
                    <td className="px-4 py-3 font-medium">به‌روزرسانی قیمت</td>
                    <td className="px-4 py-3">منبع تأییدشده با سقف تغییر مجاز</td>
                    <td className="px-4 py-3">پیش‌نمایش اختلاف و ثبت تاریخچه</td>
                    <td className="px-4 py-3 text-xs font-medium text-amber-800">نیازمند تأیید مدیر</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </section>
        )}

        {activeTab === 'pricing' && (
          <section className="mx-auto max-w-6xl px-4 py-14 sm:px-6 lg:px-8 space-y-10">
            <div className="max-w-3xl">
              <p className="text-xs font-medium text-blue-700">
                تعرفه‌های شفاف و قابل تنظیم · نسخه تعرفه: {config?.tariffVersion || 'در حال بارگذاری'}
              </p>
              <h1 className="mt-2 text-3xl font-extrabold text-slate-950">
                شروع رایگان با دوره آزمایشی AI و پرداخت به‌اندازه مصرف در حساب تجاری
              </h1>
              <p className="mt-3 text-sm leading-7 text-slate-600">
                مبالغ زیر مستقیماً از تنظیمات تعرفه سامانه خوانده می‌شوند و شامل {formatFaNumber(config?.taxPercent ?? 10)}٪
                مالیات قانونی هستند. برای امکانات سازمانی اختصاصی، پیش‌فاکتور دقیق پس از بررسی حجم درخواست اعلام می‌شود.
              </p>
            </div>

            <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
              <div className="rounded-xl border border-slate-200 bg-white p-6 flex flex-col justify-between">
                <div>
                  <div className="text-xs font-medium text-slate-500">برای شروع سریع و ارزیابی</div>
                  <h2 className="mt-1 text-xl font-bold text-slate-950">دوره آزمایشی چت AI</h2>
                  <div className="mt-4 text-2xl font-extrabold text-slate-950 tabular-nums">
                    رایگان · {formatFaNumber(config?.trialPolicy.trialDays ?? 14)} روز
                  </div>
                  <ul className="mt-5 space-y-2.5 text-sm text-slate-600">
                    <li>· روزانه {formatFaNumber(config?.trialPolicy.dailyTextLimit ?? 20)} پیام متنی واقعی</li>
                    <li>· روزانه {formatFaNumber(config?.trialPolicy.dailyImageLimit ?? 2)} سهمیه عملیات تصویری (در صورت فعال‌بودن سرویس تصویر)</li>
                    <li>· مستقل از فعالسازی حساب تجاری</li>
                    <li>· حفظ تاریخچه گفتگوها پس از پایان دوره</li>
                  </ul>
                </div>
                <button
                  type="button"
                  onClick={() => go('/register')}
                  className="mt-6 w-full rounded-lg border border-slate-300 px-4 py-2.5 text-sm font-semibold text-slate-900 hover:bg-slate-50"
                >
                  شروع دوره آزمایشی
                </button>
              </div>

              <div className="rounded-xl border-2 border-blue-700 bg-white p-6 flex flex-col justify-between">
                <div>
                  <div className="text-xs font-semibold text-blue-700">برای فروشگاه‌ها و تیم‌های پشتیبانی</div>
                  <h2 className="mt-1 text-xl font-bold text-slate-950">حساب تجاری (کیف پول مصرفی)</h2>
                  <div className="mt-4 text-2xl font-extrabold text-slate-950">پرداخت به‌اندازه مصرف</div>
                  <ul className="mt-5 space-y-2.5 text-sm text-slate-600">
                    <li>· ثبت سایت، ویجت چت ایزوله و مرکز پاسخگویی سه‌ستونه</li>
                    <li>· اتوماسیون، قراردادهای PDF فارسی و افزونه‌های فروشگاهی</li>
                    <li>· شارژ کیف پول با کارت‌به‌کارت، رمزارز یا لینک پرداخت (بررسی دستی)</li>
                    <li>· رزرو اعتبار پیش از مصرف و آزادسازی خودکار در خطای قطعی</li>
                  </ul>
                </div>
                <button
                  type="button"
                  onClick={() => go('/register')}
                  className="mt-6 w-full rounded-lg bg-blue-700 px-4 py-2.5 text-sm font-semibold text-white hover:bg-blue-800"
                >
                  ثبت‌نام حساب تجاری
                </button>
              </div>

              <div className="rounded-xl border border-slate-200 bg-white p-6 flex flex-col justify-between">
                <div>
                  <div className="text-xs font-medium text-slate-500">برای سازمان‌های چندبرندی</div>
                  <h2 className="mt-1 text-xl font-bold text-slate-950">استقرار و توافقنامه اختصاصی</h2>
                  <div className="mt-4 text-2xl font-extrabold text-slate-950">توافقی پس از ارزیابی</div>
                  <ul className="mt-5 space-y-2.5 text-sm text-slate-600">
                    <li>· تعداد سایت و اپراتور نامحدود مطابق قرارداد</li>
                    <li>· سیاست نگهداری داده و پشتیبان‌گیری سفارشی</li>
                    <li>· محدودیت‌ها و SLA اختصاصی پس از بررسی فنی اعلام می‌شود</li>
                  </ul>
                </div>
                <button
                  type="button"
                  onClick={() => go('/contact')}
                  className="mt-6 w-full rounded-lg border border-slate-300 px-4 py-2.5 text-sm font-semibold text-slate-900 hover:bg-slate-50"
                >
                  درخواست مشاوره و پیش‌فاکتور
                </button>
              </div>
            </div>

            {/* Live Model Pricing Table from Server Config */}
            <div className="overflow-x-auto rounded-xl border border-slate-200">
              <table className="w-full text-right text-sm">
                <thead className="bg-slate-50 text-xs text-slate-500 border-b border-slate-200">
                  <tr>
                    <th className="px-4 py-3 font-semibold">مدل راماکس</th>
                    <th className="px-4 py-3 font-semibold">رده</th>
                    <th className="px-4 py-3 font-semibold">ورودی مجاز</th>
                    <th className="px-4 py-3 font-semibold">وضعیت دسترسی</th>
                    <th className="px-4 py-3 font-semibold">تعرفه برآوردی (با مالیات)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 tabular-nums">
                  {(config?.models || []).map((m) => (
                    <tr key={m.id}>
                      <td className="px-4 py-3 font-semibold text-slate-950">
                        {m.icon} {m.publicName}
                      </td>
                      <td className="px-4 py-3 text-slate-600">{m.pricingTierFa}</td>
                      <td className="px-4 py-3 text-slate-600">{m.inputTypes.join(' · ')}</td>
                      <td className="px-4 py-3 text-xs">
                        {m.pipelineReady && m.enabled ? (
                          <span className="font-medium text-emerald-700">فعال و متصل</span>
                        ) : (
                          <span className="text-amber-700">در انتظار اتصال ارائه‌دهنده</span>
                        )}
                      </td>
                      <td className="px-4 py-3 font-medium text-slate-900">
                        {m.quotaType === 'text' && m.salePricePer1kTokensToman
                          ? `${formatToman(m.salePricePer1kTokensToman)} / هر ۱۰۰۰ توکن`
                          : m.salePricePerImageToman
                          ? `${formatToman(m.salePricePerImageToman)} / هر تصویر`
                          : 'وابسته به تعرفه ارائه‌دهنده'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        )}

        {activeTab === 'docs' && (
          <section className="mx-auto max-w-6xl px-4 py-14 sm:px-6 lg:px-8 space-y-12">
            <div className="max-w-3xl">
              <p className="text-xs font-medium text-blue-700">مستندات فنی، قرارداد OpenAPI و راهنمای نصب</p>
              <h1 className="mt-2 text-3xl font-extrabold text-slate-950">
                نصب ویجت و اتصال امن به WordPress، PrestaShop، Django و Laravel
              </h1>
              <p className="mt-3 text-sm leading-7 text-slate-600">
                در تمامی اتصالات، کلید محرمانه سایت فقط در سمت سرور نگهداری می‌شود و فرانت‌اند صرفاً شناسه عمومی ویجت را
                دریافت می‌کند.
              </p>
            </div>

            {/* 4-step Install Test Flowchart */}
            <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-6">
              <h2 className="text-base font-bold text-slate-950">مسیر آزمون تأیید نصب ویجت در پنل راماکس</h2>
              <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-4 text-xs">
                {[
                  '۱. ویجت در سایت دیده شد',
                  '۲. پیام آزمایشی ثبت شد',
                  '۳. پیام در مرکز پاسخگویی رسید',
                  '۴. پاسخ اپراتور به همان پنجره برگشت',
                ].map((step) => (
                  <div key={step} className="rounded-lg border border-slate-200 bg-white p-3.5 font-medium text-slate-800">
                    {step}
                  </div>
                ))}
              </div>
            </div>

            {/* Plugin Tabs */}
            <div className="space-y-5">
              <div className="flex flex-wrap items-center gap-2 border-b border-slate-200 pb-3">
                {PLUGIN_GUIDES.map((pg) => (
                  <button
                    key={pg.id}
                    type="button"
                    onClick={() => setSelectedPlugin(pg.id)}
                    className={`rounded-lg px-4 py-2 text-xs font-semibold transition-colors whitespace-nowrap ${
                      selectedPlugin === pg.id
                        ? 'bg-slate-950 text-white'
                        : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                    }`}
                  >
                    {pg.name}
                  </button>
                ))}
              </div>

              <div className="grid grid-cols-1 gap-8 lg:grid-cols-12">
                <div className="lg:col-span-5 space-y-4">
                  <div>
                    <h3 className="text-lg font-bold text-slate-950">{activePluginGuide.name}</h3>
                    <div className="mt-1 text-xs text-slate-500 ltr text-right">{activePluginGuide.compatibility}</div>
                  </div>
                  <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs leading-6 text-amber-950">
                    {activePluginGuide.testStatusFa}
                  </div>
                  <div>
                    <h4 className="text-xs font-bold text-slate-900">مراحل نصب و پیکربندی</h4>
                    <ol className="mt-2 space-y-2 text-xs leading-6 text-slate-600 list-decimal pr-4">
                      {activePluginGuide.installStepsFa.map((s) => (
                        <li key={s}>{s}</li>
                      ))}
                    </ol>
                  </div>
                  <div>
                    <h4 className="text-xs font-bold text-slate-900">رفع خطاهای رایج و امنیت</h4>
                    <ul className="mt-2 space-y-1.5 text-xs leading-6 text-slate-600">
                      {activePluginGuide.troubleshootingFa.map((t) => (
                        <li key={t}>· {t}</li>
                      ))}
                    </ul>
                  </div>
                </div>
                <div className="lg:col-span-7">
                  <div className="overflow-hidden rounded-xl border border-slate-200 bg-slate-950 text-slate-100">
                    <div className="flex items-center justify-between border-b border-slate-800 px-4 py-2.5 text-xs">
                      <span className="font-mono ltr text-slate-300">{activePluginGuide.codeFileName}</span>
                      <button
                        type="button"
                        onClick={() => copyText(activePluginGuide.id, activePluginGuide.codeSnippet)}
                        className="inline-flex items-center gap-1.5 rounded px-2.5 py-1 text-xs text-slate-200 hover:bg-slate-800"
                      >
                        {copiedId === activePluginGuide.id ? (
                          <>
                            <Check className="h-3.5 w-3.5 text-emerald-400" />
                            کپی شد
                          </>
                        ) : (
                          <>
                            <Copy className="h-3.5 w-3.5" />
                            کپی کد
                          </>
                        )}
                      </button>
                    </div>
                    <pre className="ltr overflow-x-auto p-4 text-xs leading-6 text-left font-mono text-slate-200">
                      <code>{activePluginGuide.codeSnippet}</code>
                    </pre>
                  </div>
                </div>
              </div>
            </div>

            {/* OpenAPI 3.1 Contract preview */}
            <div className="rounded-xl border border-slate-200 bg-white p-6 space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h3 className="text-base font-bold text-slate-950">قرارداد مشترک OpenAPI 3.1 راماکس</h3>
                  <p className="text-xs text-slate-500">
                    امضای وبهوک‌ها با الگوریتم HMAC-SHA256 در هدر <span className="font-mono ltr">X-Ramax-Signature</span> ارسال می‌شود.
                  </p>
                </div>
                <a
                  href="/api/public/openapi.json"
                  target="_blank"
                  rel="noreferrer"
                  className="rounded-lg border border-slate-300 px-3.5 py-2 text-xs font-semibold text-slate-800 hover:bg-slate-50"
                >
                  مشاهده فایل JSON کامل
                </a>
              </div>
              <pre className="ltr max-h-72 overflow-auto rounded-lg bg-slate-950 p-4 text-left text-xs text-slate-200 font-mono">
                <code>{JSON.stringify(RAMAX_OPENAPI_SPEC, null, 2)}</code>
              </pre>
            </div>
          </section>
        )}

        {activeTab === 'contact' && (
          <section className="mx-auto max-w-4xl px-4 py-14 sm:px-6 lg:px-8">
            <div className="grid grid-cols-1 gap-10 md:grid-cols-12">
              <div className="md:col-span-5 space-y-4">
                <p className="text-xs font-medium text-blue-700">تماس با تیم راماکس</p>
                <h1 className="text-3xl font-extrabold text-slate-950">درخواست دمو یا مشاوره استقرار</h1>
                <p className="text-sm leading-7 text-slate-600">
                  برای استقرار سازمانی، اتصال فروشگاه‌های پرترافیک یا فعالسازی سریع حساب تجاری پیام بگذارید.
                </p>
                <div className="space-y-2 border-t border-slate-200 pt-4 text-xs text-slate-600">
                  <div>
                    ایمیل پشتیبانی:{' '}
                    <span className="font-mono ltr font-medium text-slate-900">
                      {config?.legal.contactEmail || 'support@ramalife.cloud'}
                    </span>
                  </div>
                  <div>{config?.legal.supportAddressFa}</div>
                </div>
              </div>
              <form
                onSubmit={submitLead}
                className="md:col-span-7 rounded-xl border border-slate-200 bg-white p-6 space-y-4"
              >
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div>
                    <label className="mb-1 block text-xs font-medium text-slate-700">نام و نام خانوادگی *</label>
                    <input
                      type="text"
                      required
                      value={leadForm.name}
                      onChange={(e) => setLeadForm({ ...leadForm, name: e.target.value })}
                      className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-blue-600 focus:outline-none"
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-medium text-slate-700">نام فروشگاه یا شرکت</label>
                    <input
                      type="text"
                      value={leadForm.company}
                      onChange={(e) => setLeadForm({ ...leadForm, company: e.target.value })}
                      className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-blue-600 focus:outline-none"
                    />
                  </div>
                </div>
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div>
                    <label className="mb-1 block text-xs font-medium text-slate-700">ایمیل</label>
                    <input
                      type="email"
                      value={leadForm.email}
                      onChange={(e) => setLeadForm({ ...leadForm, email: e.target.value })}
                      className="ltr w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-left focus:border-blue-600 focus:outline-none"
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-medium text-slate-700">شماره تماس</label>
                    <input
                      type="tel"
                      value={leadForm.phone}
                      onChange={(e) => setLeadForm({ ...leadForm, phone: e.target.value })}
                      className="ltr w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-left focus:border-blue-600 focus:outline-none"
                    />
                  </div>
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-slate-700">شرح نیاز شما *</label>
                  <textarea
                    rows={4}
                    required
                    value={leadForm.message}
                    onChange={(e) => setLeadForm({ ...leadForm, message: e.target.value })}
                    className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-blue-600 focus:outline-none"
                  />
                </div>
                {leadStatus.type === 'success' && (
                  <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-xs text-emerald-800">
                    {leadStatus.text}
                  </div>
                )}
                {leadStatus.type === 'error' && (
                  <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-xs text-red-700">
                    {leadStatus.text}
                  </div>
                )}
                <button
                  type="submit"
                  disabled={leadStatus.type === 'submitting'}
                  className="rounded-lg bg-slate-950 px-5 py-2.5 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-50"
                >
                  {leadStatus.type === 'submitting' ? 'در حال ثبت...' : 'ارسال درخواست تماس'}
                </button>
              </form>
            </div>
          </section>
        )}

        {(activeTab === 'privacy' || activeTab === 'terms') && (
          <section className="mx-auto max-w-3xl px-4 py-14 sm:px-6 lg:px-8 space-y-6">
            <h1 className="text-3xl font-extrabold text-slate-950">
              {activeTab === 'privacy' ? 'سیاست حریم خصوصی راماکس' : 'شرایط استفاده از خدمات راماکس'}
            </h1>
            <div className="rounded-lg border border-slate-200 bg-slate-50 p-4 text-xs leading-6 text-slate-600">
              {config?.legal.published ? (
                <span>
                  صاحب امتیاز حقوقی تأییدشده: <strong>{config.legal.legalName}</strong> ({config.legal.legalWebsite})
                </span>
              ) : (
                <span>
                  هویت حقوقی رسمی سامانه در تنظیمات مدیرکل ثبت می‌شود و تا پیش از تأیید قطعی مالک به عنوان قرارداد حقوقی
                  منتشر نمی‌گردد.
                </span>
              )}
            </div>
            <div className="space-y-4 text-sm leading-8 text-slate-700">
              <p>
                ۱. جداسازی کامل داده‌ها: اطلاعات، گفتگوها، فایل‌های پیوست و کیف پول هر سایت به‌صورت مستقل در سرور ایزوله
                می‌شوند و هیچ کاربری از سایت دیگر به آن‌ها دسترسی ندارد.
              </p>
              <p>
                ۲. حفاظت از اطلاعات امنیتی: رمز عبور و پاسخ سؤالات امنیتی به صورت هش‌شده ذخیره می‌شوند و هرگز به مدل‌های
                هوش مصنوعی ارسال نمی‌گردند.
              </p>
              <p>
                ۳. ذخیره و بازیابی فایل‌ها: فایل‌های پیوست در فضای خصوصی ذخیره شده و صرفاً با لینک کوتاه‌عمر پس از بررسی
                امنیتی قابل دانلود هستند. بایگانی با حذف نهایی متفاوت است.
              </p>
              <p>
                ۴. شفافیت مالی و دوره آزمایشی: دوره آزمایشی چت عمومی AI مجوزی مستقل از فعالسازی امکانات تجاری است و
                سهمیه روزانه در سرور محاسبه می‌شود.
              </p>
            </div>
          </section>
        )}
      </main>

      {/* Quiet Editorial Footer */}
      <footer className="border-t border-slate-200 bg-white">
        <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 gap-8 md:grid-cols-4">
            <div className="space-y-2">
              <div className="text-lg font-extrabold text-slate-950">راماکس · RAMAX</div>
              <p className="text-xs leading-6 text-slate-500">
                {config?.legal.published
                  ? `${config.legal.legalName} — ${config.legal.legalWebsite}`
                  : 'پلتفرم فارسی هوش مصنوعی، پشتیبانی آنلاین و اتوماسیون (هویت حقوقی در انتظار تأیید مالک)'}
              </p>
              <p className="text-xs text-slate-500 font-mono ltr text-right">
                {config?.legal.contactEmail || 'support@ramalife.cloud'}
              </p>
            </div>

            <div className="space-y-2 text-xs">
              <div className="font-semibold text-slate-900">محصول</div>
              <div className="flex flex-col gap-2 text-slate-600">
                <button type="button" onClick={() => go('/features')} className="text-right hover:text-slate-950">امکانات</button>
                <button type="button" onClick={() => go('/ecommerce')} className="text-right hover:text-slate-950">راهکار فروشگاهی</button>
                <button type="button" onClick={() => go('/support-solution')} className="text-right hover:text-slate-950">پشتیبانی آنلاین</button>
                <button type="button" onClick={() => go('/automation')} className="text-right hover:text-slate-950">اتوماسیون</button>
              </div>
            </div>

            <div className="space-y-2 text-xs">
              <div className="font-semibold text-slate-900">منابع و راهنما</div>
              <div className="flex flex-col gap-2 text-slate-600">
                <button type="button" onClick={() => go('/pricing')} className="text-right hover:text-slate-950">تعرفه‌ها</button>
                <button type="button" onClick={() => go('/docs')} className="text-right hover:text-slate-950">مستندات و راهنمای نصب</button>
                <button type="button" onClick={() => go('/contact')} className="text-right hover:text-slate-950">تماس با ما</button>
                <button type="button" onClick={() => go('/privacy')} className="text-right hover:text-slate-950">حریم خصوصی</button>
                <button type="button" onClick={() => go('/terms')} className="text-right hover:text-slate-950">شرایط استفاده</button>
              </div>
            </div>

            <div className="space-y-2 text-xs">
              <div className="font-semibold text-slate-900">محیط‌های کاربری راماکس</div>
              <div className="flex flex-col gap-2 text-slate-600">
                <button type="button" onClick={() => go('/ai')} className="text-right hover:text-blue-700 font-medium">
                  محیط چت عمومی AI
                </button>
                <button type="button" onClick={() => go('/login')} className="text-right hover:text-blue-700 font-medium">
                  ورود به پنل مشتری و مرکز پاسخگویی
                </button>
                <button type="button" onClick={() => go('/control/login')} className="text-right hover:text-slate-950">
                  ورود به پنل مدیرکل راماکس
                </button>
              </div>
            </div>
          </div>
          <div className="mt-8 border-t border-slate-100 pt-6 flex flex-wrap items-center justify-between gap-4 text-xs text-slate-400">
            <span>© ۱۴۰۵ راماکس. تمامی حقوق محفوظ است.</span>
            <span className="font-mono ltr">{config?.domains.mainDomain || 'ramax.ramalife.cloud'}</span>
          </div>
        </div>
      </footer>

      {/* Floating Demo Widget Launcher on Marketing Site */}
      {config?.demoSitePublicKey && (
        <div className="fixed bottom-5 left-5 z-40">
          {floatingDemoOpen && (
            <div className="mb-3 w-[360px] max-w-[calc(100vw-2rem)] overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl">
              <LiveWidget
                publicInstallKey={config.demoSitePublicKey}
                isDemoBadge
                onClose={() => setFloatingDemoOpen(false)}
              />
            </div>
          )}
          <button
            type="button"
            onClick={() => setFloatingDemoOpen((v) => !v)}
            className="flex items-center gap-2 rounded-full bg-blue-700 px-4 py-3 text-sm font-semibold text-white shadow-lg hover:bg-blue-800 transition-colors"
          >
            <MessageSquare className="h-4 w-4" />
            <span>{floatingDemoOpen ? 'بستن ویجت نمونه' : 'تست ویجت زنده'}</span>
          </button>
        </div>
      )}
    </div>
  );
};
