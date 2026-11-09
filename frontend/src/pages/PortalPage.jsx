import React, { useEffect, useState } from 'react';
import { api } from '../lib/api';
import { toast } from '../lib/ui';
import { toPersianNum, toJalaliDateTime, toJalaliDate, formatMoney } from '../lib/utils';
import { Icons } from '../components/Icons';

/** پورتال عمومی کارفرما: پیش‌فاکتور، پرداخت‌ها، پیشرفت کار و تایید آنلاین (بدون نیاز به ورود) */
export default function PortalPage({ token }) {
    const [d, setD] = useState(null);
    const [err, setErr] = useState('');
    const [form, setForm] = useState({ name: '', note: '' });
    const [busy, setBusy] = useState(false);

    const load = async () => {
        const r = await api('portal_view', null, { token }, { silent: true });
        if (r) setD(r); else setErr('این لینک معتبر نیست یا غیرفعال شده است. لطفاً با مجری رویداد تماس بگیرید.');
    };
    useEffect(() => { load(); }, [token]);

    const approve = async (e) => {
        e.preventDefault();
        if (!form.name.trim()) return toast('نام خود را وارد کنید.', 'warning');
        setBusy(true);
        const r = await api('portal_approve', { token, name: form.name.trim(), note: form.note.trim() });
        setBusy(false);
        if (r) { toast('تایید شما ثبت شد. سپاسگزاریم.'); load(); }
    };

    if (err) return <div className="min-h-screen flex items-center justify-center p-6"><div className="glass-strong rounded-3xl p-8 max-w-md text-center"><h1 className="text-lg font-bold text-slate-800 dark:text-white mb-2">لینک نامعتبر</h1><p className="text-sm text-slate-600 dark:text-slate-300">{err}</p></div></div>;
    if (!d) return <p className="text-center py-24 text-slate-500 pulse-text">در حال بارگذاری...</p>;
    const ev = d.event; const f = d.fin;
    const totalTasks = d.phases.reduce((s, p) => s + p.total, 0);
    const doneTasks = d.phases.reduce((s, p) => s + p.done, 0);

    return (
        <div className="max-w-4xl mx-auto p-4 sm:p-8 space-y-5 fade-in">
            <header className="glass-strong grad-top rounded-3xl p-6 sm:p-8">
                <div className="flex items-start gap-4">
                    {ev.org_logo && <img src={ev.org_logo} alt="" className="w-16 h-16 rounded-2xl object-cover bg-white" />}
                    <div className="flex-1">
                        <p className="text-sm text-slate-500 dark:text-slate-400">پرونده رویداد {toPersianNum(ev.id)}{ev.org_name ? ` — ${ev.org_name}` : ''}</p>
                        <h1 className="text-2xl sm:text-3xl font-bold text-grad mt-1">{toPersianNum(ev.title)}</h1>
                        <span className="inline-block mt-2 text-xs bg-grad text-white px-3 py-1 rounded-full">{ev.status_label}</span>
                    </div>
                    <button type="button" onClick={() => window.print()} className="glass border p-2.5 rounded-xl print:hidden" aria-label="چاپ"><Icons.Printer /></button>
                </div>
                <dl className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-6 text-sm">
                    <div><dt className="text-slate-500 dark:text-slate-400 text-xs">شروع</dt><dd className="font-semibold text-slate-800 dark:text-white">{toJalaliDateTime(ev.start_date)}</dd></div>
                    <div><dt className="text-slate-500 dark:text-slate-400 text-xs">پایان</dt><dd className="font-semibold text-slate-800 dark:text-white">{toJalaliDateTime(ev.end_date)}</dd></div>
                    <div><dt className="text-slate-500 dark:text-slate-400 text-xs">محل برگزاری</dt><dd className="font-semibold text-slate-800 dark:text-white">{toPersianNum(ev.venue_name) || '---'}</dd></div>
                    <div><dt className="text-slate-500 dark:text-slate-400 text-xs">تعداد مهمانان</dt><dd className="font-semibold text-slate-800 dark:text-white">{toPersianNum(ev.guest_count)}</dd></div>
                </dl>
            </header>

            <section className="glass rounded-3xl border p-5 sm:p-6" aria-labelledby="inv-h">
                <h2 id="inv-h" className="font-bold text-lg text-slate-800 dark:text-white mb-4">پیش‌فاکتور خدمات</h2>
                <ul className="divide-y divide-violet-100 dark:divide-white/10">
                    {d.services.map((s, i) => (
                        <li key={i} className="py-3 flex flex-wrap justify-between gap-2 text-sm">
                            <span className="text-slate-800 dark:text-slate-100">{toPersianNum(i + 1)}. {toPersianNum(s.service_name)} {Number(s.qty) > 1 && <span className="text-slate-500">× {toPersianNum(s.qty)}</span>}</span>
                            <b className="text-slate-800 dark:text-white" dir="ltr">{s.frozen_price !== null ? formatMoney(s.frozen_price) : 'در حال استعلام'}</b>
                        </li>
                    ))}
                </ul>
                <div className="mt-4 glass-soft border rounded-2xl p-4 space-y-1.5 text-sm">
                    <div className="flex justify-between"><span>جمع</span><span dir="ltr">{formatMoney(f.subtotal)}</span></div>
                    {f.discount > 0 && <div className="flex justify-between"><span>تخفیف</span><span dir="ltr">- {formatMoney(f.discount)}</span></div>}
                    {f.tax > 0 && <div className="flex justify-between"><span>مالیات ({toPersianNum(ev.tax_percent)}٪)</span><span dir="ltr">{formatMoney(f.tax)}</span></div>}
                    <div className="flex justify-between font-bold text-base pt-2 border-t border-violet-200 dark:border-white/10"><span>مبلغ نهایی (تومان)</span><span dir="ltr">{formatMoney(f.total)}</span></div>
                    <div className="flex justify-between"><span>پرداخت‌شده</span><span dir="ltr">{formatMoney(f.paid)}</span></div>
                    <div className="flex justify-between font-semibold text-violet-700 dark:text-violet-300"><span>مانده</span><span dir="ltr">{formatMoney(f.remaining)}</span></div>
                    {f.tbd > 0 && <p className="text-xs text-amber-700 dark:text-amber-400 pt-1">قیمت {toPersianNum(f.tbd)} ردیف هنوز نهایی نشده است.</p>}
                </div>
                {d.payments.length > 0 && (
                    <div className="mt-4"><h3 className="font-semibold text-sm text-slate-700 dark:text-slate-300 mb-2">پرداخت‌های ثبت‌شده</h3>
                        <ul className="text-sm space-y-1">{d.payments.map((p, i) => <li key={i} className="flex justify-between glass-soft border rounded-lg px-3 py-2"><span>{toJalaliDate(p.paid_at)} {p.method && `— ${p.method}`}</span><span dir="ltr">{formatMoney(p.amount)}</span></li>)}</ul>
                    </div>
                )}
            </section>

            {totalTasks > 0 && (
                <section className="glass rounded-3xl border p-5 sm:p-6" aria-labelledby="prog-h">
                    <h2 id="prog-h" className="font-bold text-lg text-slate-800 dark:text-white mb-1">پیشرفت آماده‌سازی</h2>
                    <p className="text-sm text-slate-500 dark:text-slate-400 mb-4">{toPersianNum(Math.round((doneTasks / totalTasks) * 100))}٪ کارها انجام شده است</p>
                    <ul className="space-y-3">
                        {d.phases.map(p => (
                            <li key={p.phase}>
                                <div className="flex justify-between text-sm mb-1"><span className="text-slate-700 dark:text-slate-200">{p.phase}</span><span className="text-slate-500">{toPersianNum(p.done)} از {toPersianNum(p.total)}</span></div>
                                <div className="h-2 rounded-full bg-violet-100 dark:bg-white/10"><div className="h-2 rounded-full bg-grad" style={{ width: `${(p.done / p.total) * 100}%` }} /></div>
                            </li>
                        ))}
                    </ul>
                </section>
            )}

            <section className="glass-strong rounded-3xl border p-5 sm:p-6 print:hidden" aria-labelledby="ap-h">
                <h2 id="ap-h" className="font-bold text-lg text-slate-800 dark:text-white mb-2">تایید پیش‌فاکتور</h2>
                {ev.client_approved_at ? (
                    <p className="text-emerald-700 dark:text-emerald-400 font-semibold">✓ این پیش‌فاکتور در {toJalaliDateTime(ev.client_approved_at)} توسط {ev.client_approved_name} تایید شده است.{ev.client_note && <span className="block text-sm font-normal text-slate-600 dark:text-slate-300 mt-1">توضیح: {ev.client_note}</span>}</p>
                ) : (
                    <form onSubmit={approve} className="space-y-3">
                        <p className="text-sm text-slate-600 dark:text-slate-300">در صورت موافقت با خدمات و مبالغ بالا، نام خود را وارد و تایید کنید. مجری رویداد بلافاصله مطلع می‌شود.</p>
                        <label className="block text-sm">نام و نام خانوادگی تاییدکننده<input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} className="mt-1 w-full glass-field border-2 p-3 rounded-xl" required /></label>
                        <label className="block text-sm">توضیحات (اختیاری)<textarea rows={2} value={form.note} onChange={e => setForm({ ...form, note: e.target.value })} className="mt-1 w-full glass-field border-2 p-3 rounded-xl" /></label>
                        <button type="submit" disabled={busy} className="btn-grad w-full sm:w-auto px-8 py-3 rounded-xl font-bold disabled:opacity-60">تایید پیش‌فاکتور</button>
                    </form>
                )}
            </section>
        </div>
    );
}
