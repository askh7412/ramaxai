import React, { useEffect, useState } from 'react';
import { RefreshCw, ShieldCheck } from 'lucide-react';
import { apiFetch, navigateTo } from '../lib/api';
import type { SessionUser } from '../shared/types';

interface AuthPagesProps {
  mode: 'login' | 'register' | 'admin_login';
  onCustomerAuthed: (user: SessionUser) => void;
  onAdminAuthed: (user: SessionUser) => void;
}

export const AuthPages: React.FC<AuthPagesProps> = ({
  mode,
  onCustomerAuthed,
  onAdminAuthed,
}) => {
  const [captcha, setCaptcha] = useState<{ captchaId: string; questionFa: string } | null>(null);
  const [captchaAnswer, setCaptchaAnswer] = useState('');

  const [name, setName] = useState('');
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [mfaCode, setMfaCode] = useState('123456');
  const [secondFactorRequired, setSecondFactorRequired] = useState(false);
  const [secondFactorCode, setSecondFactorCode] = useState('');

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function loadCaptcha() {
    try {
      const data = await apiFetch<{ captchaId: string; questionFa: string }>('/api/auth/captcha');
      setCaptcha(data);
      setCaptchaAnswer('');
    } catch {
      setError('بارگذاری کد امنیتی ناموفق بود.');
    }
  }

  useEffect(() => {
    void loadCaptcha();
    setError(null);
    setSecondFactorRequired(false);
  }, [mode]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!captcha) return;
    setSubmitting(true);
    setError(null);

    try {
      if (mode === 'register') {
        const res = await apiFetch<{ user: SessionUser }>('/api/auth/register', {
          method: 'POST',
          body: JSON.stringify({
            name,
            username,
            email,
            password,
            captchaId: captcha.captchaId,
            captchaAnswer,
          }),
        });
        onCustomerAuthed(res.user);
        navigateTo('/panel');
      } else if (mode === 'login') {
        const res = await apiFetch<{ user: SessionUser }>('/api/auth/login', {
          method: 'POST',
          body: JSON.stringify({
            username,
            password,
            captchaId: captcha.captchaId,
            captchaAnswer,
            secondFactorCode: secondFactorRequired ? secondFactorCode : undefined,
          }),
        });
        onCustomerAuthed(res.user);
        navigateTo('/panel');
      } else {
        const res = await apiFetch<{ user: SessionUser }>('/api/admin/auth/login', {
          method: 'POST',
          body: JSON.stringify({
            username,
            password,
            mfaCode,
            captchaId: captcha.captchaId,
            captchaAnswer,
          }),
        });
        onAdminAuthed(res.user);
        navigateTo('/control');
      }
    } catch (err) {
      const e2 = err as Error & { code?: string };
      if (e2.code === 'SECOND_FACTOR_REQUIRED') {
        setSecondFactorRequired(true);
      }
      setError(e2.message);
      await loadCaptcha();
    } finally {
      setSubmitting(false);
    }
  }

  function fillDemoAccount(u: string, p: string) {
    setUsername(u);
    setPassword(p);
  }

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex h-16 max-w-5xl items-center justify-between px-4">
          <button
            type="button"
            onClick={() => navigateTo('/')}
            className="text-xl font-extrabold text-slate-950"
          >
            راماکس
          </button>
          <button
            type="button"
            onClick={() => navigateTo('/')}
            className="text-xs font-medium text-slate-600 hover:text-slate-950"
          >
            بازگشت به سایت اصلی
          </button>
        </div>
      </header>

      <main className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center px-4 py-10">
        <div className="rounded-xl border border-slate-200 bg-white p-6 sm:p-8 shadow-sm">
          <div className="mb-6">
            {mode === 'admin_login' && (
              <div className="mb-2 flex items-center gap-1.5 text-xs font-semibold text-slate-700">
                <ShieldCheck className="h-4 w-4 text-blue-700" />
                <span>نشست و کوکی مجزای مدیرکل سامانه</span>
              </div>
            )}
            <h1 className="text-2xl font-bold text-slate-950">
              {mode === 'register'
                ? 'ساخت حساب تجاری راماکس'
                : mode === 'admin_login'
                ? 'ورود به پنل مدیرکل راماکس'
                : 'ورود به پنل مشتری و هوش مصنوعی'}
            </h1>
            <p className="mt-1.5 text-xs leading-6 text-slate-500">
              {mode === 'register'
                ? 'پس از ثبت‌نام می‌توانید سایتتان را ثبت کنید و بلافاصله از دوره آزمایشی ۱۴ روزه چت AI استفاده نمایید.'
                : mode === 'admin_login'
                ? 'احراز هویت چندمرحله‌ای برای دسترسی به کنترل کلان، تعرفه‌ها و ممیزی الزامی است.'
                : 'ورود با نام کاربری یا ایمیل همراه با کپچای اختصاصی سمت سرور.'}
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            {mode === 'register' && (
              <>
                <div>
                  <label className="mb-1 block text-xs font-medium text-slate-700">نام و نام خانوادگی</label>
                  <input
                    type="text"
                    required
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="مثلاً سارا کریمی"
                    className="w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm focus:border-blue-600 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-slate-700">ایمیل</label>
                  <input
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="name@company.ir"
                    className="ltr w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm text-left focus:border-blue-600 focus:outline-none"
                  />
                </div>
              </>
            )}

            <div>
              <label className="mb-1 block text-xs font-medium text-slate-700">
                {mode === 'register' ? 'نام کاربری (انگلیسی)' : 'نام کاربری یا ایمیل'}
              </label>
              <input
                type="text"
                required
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder={mode === 'admin_login' ? 'admin' : 'demo_owner'}
                className="ltr w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm text-left font-mono focus:border-blue-600 focus:outline-none"
              />
            </div>

            <div>
              <label className="mb-1 block text-xs font-medium text-slate-700">رمز عبور</label>
              <input
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="حداقل ۸ کاراکتر"
                className="ltr w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm text-left font-mono focus:border-blue-600 focus:outline-none"
              />
            </div>

            {mode === 'admin_login' && (
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-700">
                  کد احراز هویت دومرحله‌ای (MFA)
                </label>
                <input
                  type="text"
                  required
                  value={mfaCode}
                  onChange={(e) => setMfaCode(e.target.value)}
                  className="ltr w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm text-left font-mono focus:border-blue-600 focus:outline-none"
                />
              </div>
            )}

            {secondFactorRequired && mode === 'login' && (
              <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 space-y-2">
                <label className="block text-xs font-semibold text-amber-950">
                  تأیید دوم امنیتی (به دلیل قوانین تشخیص ورود مشکوک)
                </label>
                <input
                  type="text"
                  required
                  value={secondFactorCode}
                  onChange={(e) => setSecondFactorCode(e.target.value)}
                  placeholder="کد تأیید ۶ رقمی"
                  className="ltr w-full rounded-lg border border-amber-300 bg-white px-3 py-2 text-sm text-left font-mono"
                />
              </div>
            )}

            {/* Server-side custom CAPTCHA */}
            <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 space-y-2">
              <div className="flex items-center justify-between text-xs">
                <span className="font-semibold text-slate-800">
                  کد امنیتی (کپچا): {captcha ? captcha.questionFa : 'در حال دریافت...'}
                </span>
                <button
                  type="button"
                  onClick={() => void loadCaptcha()}
                  className="inline-flex items-center gap-1 text-blue-700 hover:underline"
                >
                  <RefreshCw className="h-3 w-3" />
                  تغییر
                </button>
              </div>
              <input
                type="text"
                required
                value={captchaAnswer}
                onChange={(e) => setCaptchaAnswer(e.target.value)}
                placeholder="پاسخ عددی را وارد کنید"
                className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm tabular-nums focus:border-blue-600 focus:outline-none"
              />
            </div>

            {error && (
              <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-xs leading-5 text-red-700">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={submitting}
              className="w-full rounded-lg bg-blue-700 px-4 py-2.5 text-sm font-semibold text-white hover:bg-blue-800 disabled:opacity-50 transition-colors"
            >
              {submitting
                ? 'در حال بررسی...'
                : mode === 'register'
                ? 'ایجاد حساب کاربری'
                : mode === 'admin_login'
                ? 'ورود امن به کنترل‌پنل مدیرکل'
                : 'ورود به حساب'}
            </button>
          </form>

          {/* Helpful test accounts for immediate verification of multi-tenant RBAC */}
          <div className="mt-6 border-t border-slate-200 pt-4 space-y-2">
            <div className="text-[11px] font-semibold text-slate-500">
              حساب‌های نمونه جهت تست سریع جداسازی سایت‌ها و نقش‌ها:
            </div>
            {mode === 'admin_login' ? (
              <button
                type="button"
                onClick={() => {
                  fillDemoAccount('admin', 'RamaxAdmin@1405');
                  setMfaCode('123456');
                }}
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-right text-xs text-slate-700 hover:bg-slate-50"
              >
                مدیرکل سامانه · <span className="font-mono ltr">admin / RamaxAdmin@1405 (MFA: 123456)</span>
              </button>
            ) : mode === 'login' ? (
              <div className="space-y-1.5">
                <button
                  type="button"
                  onClick={() => fillDemoAccount('demo_owner', 'Ramax@1405')}
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-right text-xs text-slate-700 hover:bg-slate-50"
                >
                  مالک دو سایت (کافه‌نگار + سلامت‌پارس) · <span className="font-mono ltr">demo_owner</span>
                </button>
                <button
                  type="button"
                  onClick={() => fillDemoAccount('op_kafe', 'Ramax@1405')}
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-right text-xs text-slate-700 hover:bg-slate-50"
                >
                  اپراتور محدود به سایت کافه‌نگار · <span className="font-mono ltr">op_kafe</span>
                </button>
                <button
                  type="button"
                  onClick={() => fillDemoAccount('mgr_salamat', 'Ramax@1405')}
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-right text-xs text-slate-700 hover:bg-slate-50"
                >
                  مدیر محدود به سایت سلامت‌پارس · <span className="font-mono ltr">mgr_salamat</span>
                </button>
              </div>
            ) : null}
          </div>

          <div className="mt-5 flex items-center justify-between text-xs text-slate-600">
            {mode === 'register' ? (
              <button type="button" onClick={() => navigateTo('/login')} className="text-blue-700 hover:underline">
                حساب دارید؟ ورود به پنل
              </button>
            ) : mode === 'login' ? (
              <button type="button" onClick={() => navigateTo('/register')} className="text-blue-700 hover:underline">
                حساب ندارید؟ ساخت حساب جدید
              </button>
            ) : (
              <button type="button" onClick={() => navigateTo('/login')} className="text-blue-700 hover:underline">
                ورود به پنل مشتری
              </button>
            )}
            {mode !== 'admin_login' && (
              <button type="button" onClick={() => navigateTo('/control/login')} className="text-slate-500 hover:text-slate-900">
                ورود مدیرکل
              </button>
            )}
          </div>
        </div>
      </main>
    </div>
  );
};
