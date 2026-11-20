import React, { useEffect, useState } from 'react';
import { CheckCircle2, FileText } from 'lucide-react';
import { apiFetch, CONTRACT_STATUS_LABELS_FA, formatFaDateTime, formatToman, navigateTo } from '../lib/api';
import type { ContractRecord } from '../shared/types';

interface PublicContractViewProps {
  shareToken: string;
}

export const PublicContractView: React.FC<PublicContractViewProps> = ({ shareToken }) => {
  const [data, setData] = useState<{
    contract: ContractRecord;
    siteName: string;
    siteDomain: string;
    legalPublished: boolean;
    legalName?: string;
  } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [signerName, setSignerName] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    setLoading(true);
    apiFetch<typeof data>(`/api/public/contracts/${encodeURIComponent(shareToken)}`)
      .then((res) => setData(res))
      .catch((err) => setError(err instanceof Error ? err.message : 'قرارداد یافت نشد.'))
      .finally(() => setLoading(false));
  }, [shareToken]);

  async function acceptContract(e: React.FormEvent) {
    e.preventDefault();
    if (!signerName.trim()) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await apiFetch<{ contract: ContractRecord }>(
        `/api/public/contracts/${encodeURIComponent(shareToken)}/accept`,
        {
          method: 'POST',
          body: JSON.stringify({ acceptedByName: signerName.trim() }),
        }
      );
      setData((prev) => (prev ? { ...prev, contract: res.contract } : prev));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'خطا در ثبت پذیرش قرارداد.');
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) {
    return <div className="min-h-screen bg-slate-50 p-10 text-center text-sm text-slate-500">در حال بارگذاری قرارداد...</div>;
  }

  if (!data) {
    return (
      <div className="min-h-screen bg-slate-50 p-10 text-center space-y-4">
        <p className="text-sm font-medium text-red-700">{error || 'لینک قرارداد معتبر نیست.'}</p>
        <button
          type="button"
          onClick={() => navigateTo('/')}
          className="rounded-lg bg-slate-950 px-4 py-2 text-xs font-semibold text-white"
        >
          بازگشت به صفحه اصلی
        </button>
      </div>
    );
  }

  const { contract, siteName, siteDomain } = data;
  const latest = contract.versions[contract.versions.length - 1];

  return (
    <div className="min-h-screen bg-slate-50 py-10 px-4">
      <div className="mx-auto max-w-3xl space-y-6">
        <div className="flex items-center justify-between no-print">
          <div className="flex items-center gap-2 text-sm font-bold text-slate-900">
            <FileText className="h-4 w-4 text-blue-700" />
            <span>مشاهده قرارداد با لینک دسترسی محدود</span>
          </div>
          <button
            type="button"
            onClick={() => window.print()}
            className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-xs font-semibold text-slate-800 hover:bg-slate-50"
          >
            چاپ / ذخیره PDF فارسی
          </button>
        </div>

        <article className="rounded-xl border border-slate-200 bg-white p-6 sm:p-10 space-y-6">
          <div className="flex flex-wrap items-start justify-between gap-4 border-b border-slate-200 pb-5">
            <div>
              <div className="text-xs text-slate-500">
                {siteName} · <span className="font-mono ltr">{siteDomain}</span>
              </div>
              <h1 className="mt-1 text-2xl font-bold text-slate-950">{latest.title}</h1>
            </div>
            <div className="text-xs text-slate-600 space-y-1 text-left">
              <div>
                شماره: <span className="font-mono font-semibold text-slate-950">{contract.contractNumber}</span>
              </div>
              <div>نسخه: {contract.currentVersion}</div>
              <div>وضعیت: {CONTRACT_STATUS_LABELS_FA[contract.status]}</div>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-3 rounded-lg bg-slate-50 p-4 text-sm sm:grid-cols-2">
            <div>
              <span className="text-slate-500">طرف اول:</span> <strong>{siteName}</strong>
            </div>
            <div>
              <span className="text-slate-500">طرف دوم (مشتری):</span> <strong>{contract.customerName}</strong>
            </div>
            <div className="tabular-nums">
              <span className="text-slate-500">مبلغ قرارداد:</span> <strong>{formatToman(latest.amountToman)}</strong>
            </div>
            <div>
              <span className="text-slate-500">مدت:</span> <strong>{latest.durationText}</strong>
            </div>
          </div>

          <div className="whitespace-pre-wrap text-sm leading-8 text-slate-800">{latest.bodyFa}</div>

          {latest.termsFa && (
            <div className="rounded-lg border border-slate-200 bg-slate-50/70 p-4 text-xs leading-6 text-slate-700">
              <div className="font-semibold text-slate-900 mb-1">شرایط و ملاحظات:</div>
              {latest.termsFa}
            </div>
          )}

          <div className="rounded-lg border border-amber-200 bg-amber-50 p-3.5 text-xs leading-6 text-amber-950">
            توجه: اتصال به سرویس امضای دیجیتال قانونی در این قرارداد فعال نیست. ثبت پذیرش زیر صرفاً تأیید متنی مفاد
            قرارداد با ثبت زمان مشاهده و پذیرش محسوب می‌شود.
          </div>

          {contract.acceptedAt ? (
            <div className="flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-900">
              <CheckCircle2 className="h-5 w-5 shrink-0 text-emerald-700" />
              <span>
                این قرارداد توسط <strong>{contract.acceptedByName}</strong> در تاریخ{' '}
                {formatFaDateTime(contract.acceptedAt)} پذیرفته شده است.
              </span>
            </div>
          ) : (
            <form onSubmit={acceptContract} className="no-print border-t border-slate-200 pt-5 space-y-3">
              <label className="block text-xs font-semibold text-slate-800">
                تأیید و پذیرش مفاد نسخه {contract.currentVersion} قرارداد
              </label>
              <div className="flex flex-col gap-3 sm:flex-row">
                <input
                  type="text"
                  required
                  value={signerName}
                  onChange={(e) => setSignerName(e.target.value)}
                  placeholder="نام و نام خانوادگی یا سمت تأییدکننده"
                  className="flex-1 rounded-lg border border-slate-200 px-3 py-2.5 text-sm focus:border-blue-600 focus:outline-none"
                />
                <button
                  type="submit"
                  disabled={submitting}
                  className="rounded-lg bg-blue-700 px-5 py-2.5 text-sm font-semibold text-white hover:bg-blue-800 disabled:opacity-50 whitespace-nowrap"
                >
                  {submitting ? 'در حال ثبت...' : 'تأیید و پذیرش قرارداد'}
                </button>
              </div>
              {error && <p className="text-xs text-red-700">{error}</p>}
            </form>
          )}
        </article>
      </div>
    </div>
  );
};
