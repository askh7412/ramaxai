import type {
  ContractStatus,
  ConversationStatus,
  UserRole,
} from '../shared/types';

export const ASSETS = {
  heroWorkspace: '/src/assets/images/ramax_hero_workspace_1795205439179.jpg',
  ecommerceStudio: '/src/assets/images/ramax_ecommerce_studio_1795205433590.jpg',
  supportEditorial: '/src/assets/images/ramax_support_editorial_1795205434264.jpg',
};

export async function apiFetch<T = unknown>(
  url: string,
  options?: RequestInit
): Promise<T> {
  const isFormData = options?.body instanceof FormData;
  const res = await fetch(url, {
    credentials: 'include',
    ...options,
    headers: {
      ...(isFormData ? {} : { 'Content-Type': 'application/json' }),
      ...(options?.headers || {}),
    },
  });

  const contentType = res.headers.get('content-type') || '';
  const data = contentType.includes('application/json') ? await res.json() : await res.text();

  if (!res.ok) {
    const message =
      typeof data === 'object' && data && 'message' in data
        ? String((data as { message: unknown }).message)
        : `خطا در ارتباط با سرور (کد ${res.status})`;
    const err = new Error(message) as Error & { status?: number; code?: string };
    err.status = res.status;
    if (typeof data === 'object' && data && 'code' in data) {
      err.code = String((data as { code: unknown }).code);
    }
    throw err;
  }
  return data as T;
}

export function formatToman(amount: number): string {
  return `${Math.round(amount).toLocaleString('fa-IR')} تومان`;
}

export function formatFaNumber(value: number): string {
  return value.toLocaleString('fa-IR');
}

export function formatFaDateTime(iso?: string): string {
  if (!iso) return '—';
  try {
    return new Intl.DateTimeFormat('fa-IR', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    }).format(new Date(iso));
  } catch {
    return iso.slice(0, 16);
  }
}

export const ROLE_LABELS_FA: Record<UserRole, string> = {
  super_admin: 'مدیرکل سامانه',
  owner: 'مالک حساب',
  site_manager: 'مدیر سایت',
  support_supervisor: 'سرپرست پشتیبانی',
  operator: 'اپراتور پاسخگویی',
  writer: 'نویسنده محتوا',
  finance: 'امور مالی',
  viewer: 'مشاهده‌گر',
};

export const CONV_STATUS_LABELS_FA: Record<ConversationStatus, string> = {
  new: 'جدید',
  queued: 'در صف',
  in_progress: 'در حال رسیدگی',
  waiting_customer: 'منتظر مشتری',
  resolved: 'حل‌شده',
  archived: 'بایگانی‌شده',
};

export const PRIORITY_LABELS_FA: Record<'low' | 'normal' | 'high' | 'urgent', string> = {
  low: 'کم',
  normal: 'عادی',
  high: 'زیاد',
  urgent: 'فوری',
};

export const CONTRACT_STATUS_LABELS_FA: Record<ContractStatus, string> = {
  draft: 'پیش‌نویس',
  review: 'در حال بازبینی',
  ready_to_send: 'آماده ارسال',
  sent: 'ارسال‌شده',
  approved: 'تأییدشده',
  archived: 'بایگانی‌شده',
};

export const PAYMENT_METHOD_LABELS_FA: Record<'card_to_card' | 'crypto' | 'payment_link', string> = {
  card_to_card: 'کارت‌به‌کارت',
  crypto: 'رمزارز (TxID)',
  payment_link: 'لینک پرداخت',
};

export const ACCOUNT_STATUS_LABELS_FA: Record<'pending_activation' | 'active' | 'suspended', string> = {
  pending_activation: 'در انتظار فعالسازی',
  active: 'فعال',
  suspended: 'تعلیق‌شده',
};

export function navigateTo(path: string) {
  window.history.pushState({}, '', path);
  window.dispatchEvent(new PopStateEvent('popstate'));
}
