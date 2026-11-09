import React, { useEffect, useState } from 'react';
import { api } from '../lib/api';
import { toast, confirmDialog } from '../lib/ui';
import { toPersianNum, formatMoney, g2j, JALALI_MONTHS, EVENT_STATUS, exportToCSV, ymd, toJalaliDate } from '../lib/utils';
import { navigate } from '../lib/router';
import JalaliDatePicker from '../components/JalaliDatePicker';
import { RatingBadge } from '../components/Stars';
import { Icons } from '../components/Icons';

const monthLabel = (ym) => { const [y, m] = ym.split('-').map(Number); const [jy, jm] = g2j(y, m, 15); return `${JALALI_MONTHS[jm - 1]} ${toPersianNum(String(jy).slice(2))}`; };
const short = (n) => { n = Number(n) || 0; if (n >= 1e9) return toPersianNum((n / 1e9).toFixed(1)) + ' میلیارد'; if (n >= 1e6) return toPersianNum((n / 1e6).toFixed(1)) + ' میلیون'; return formatMoney(n); };

function Tile({ label, value, sub, tone }) {
    return (
        <div className={`rounded-2xl p-4 border ${tone === 'grad' ? 'bg-grad text-white border-transparent' : 'glass'}`}>
            <div className={`text-xs ${tone === 'grad' ? 'text-white/85' : 'text-slate-500 dark:text-slate-400'}`}>{label}</div>
            <div className={`text-xl sm:text-2xl font-bold mt-1 ${tone === 'grad' ? '' : 'text-slate-800 dark:text-white'}`}>{value}</div>
            {sub && <div className={`text-xs mt-0.5 ${tone === 'grad' ? 'text-white/85' : 'text-slate-500 dark:text-slate-400'}`}>{sub}</div>}
        </div>
    );
}

/** نمودار ستونی تک‌سری (درآمد ماهانه) با راهنمای شناور و نمای جدول */
function MonthBars({ months }) {
    const [table, setTable] = useState(false);
    const [hover, setHover] = useState(null);
    const max = Math.max(1, ...months.map(m => m.revenue));
    return (
        <section className="glass border rounded-3xl p-5" aria-labelledby="rev-h">
            <div className="flex justify-between items-center mb-4">
                <h2 id="rev-h" className="font-bold text-slate-800 dark:text-white">مبلغ فاکتورها به تفکیک ماه (تومان)</h2>
                <button type="button" onClick={() => setTable(!table)} className="text-xs font-semibold text-violet-700 dark:text-violet-300 underline">{table ? 'نمایش نمودار' : 'نمایش جدول'}</button>
            </div>
            {months.length === 0 ? <p className="text-sm text-slate-500 text-center py-8">داده‌ای در این بازه نیست.</p> : table ? (
                <table className="w-full text-sm text-right">
                    <thead><tr className="text-slate-500 dark:text-slate-400"><th className="p-2 font-semibold">ماه</th><th className="p-2 font-semibold">رویداد</th><th className="p-2 font-semibold">مبلغ فاکتورها</th><th className="p-2 font-semibold">دریافتی</th></tr></thead>
                    <tbody>{months.map(m => <tr key={m.month} className="border-t border-violet-100 dark:border-white/10 text-slate-700 dark:text-slate-200"><td className="p-2">{monthLabel(m.month)}</td><td className="p-2">{toPersianNum(m.events)}</td><td className="p-2" dir="ltr">{formatMoney(m.revenue)}</td><td className="p-2" dir="ltr">{formatMoney(m.paid)}</td></tr>)}</tbody>
                </table>
            ) : (
                <div className="relative">
                    <div className="flex items-end gap-[2px] h-48 border-b border-slate-300 dark:border-white/20" role="img" aria-label="نمودار مبلغ فاکتورها به تفکیک ماه؛ برای جزئیات نمایش جدول را بزنید">
                        {months.map((m, i) => (
                            <div key={m.month} className="flex-1 h-full flex items-end justify-center relative" onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)} onFocus={() => setHover(i)} onBlur={() => setHover(null)} tabIndex={0} aria-label={`${monthLabel(m.month)}: ${formatMoney(m.revenue)} تومان`}>
                                <div className="w-full max-w-[28px] rounded-t-[4px] transition-opacity" style={{ height: `${Math.max(2, (m.revenue / max) * 100)}%`, background: '#8b5cf6', opacity: hover === null || hover === i ? 1 : 0.45 }} />
                            </div>
                        ))}
                    </div>
                    <div className="flex gap-[2px] mt-1.5">{months.map(m => <div key={m.month} className="flex-1 text-center text-[10px] text-slate-500 dark:text-slate-400 truncate">{monthLabel(m.month)}</div>)}</div>
                    {hover !== null && (
                        <div className="absolute top-0 left-1/2 -translate-x-1/2 glass-strong rounded-xl px-3 py-2 text-xs text-slate-700 dark:text-slate-200 pointer-events-none shadow" role="status">
                            <b>{monthLabel(months[hover].month)}</b> · فاکتور {short(months[hover].revenue)} · دریافتی {short(months[hover].paid)} · {toPersianNum(months[hover].events)} رویداد
                        </div>
                    )}
                </div>
            )}
        </section>
    );
}

/** فهرست میله‌ای (تک‌سری) */
function BarList({ title, rows, value, label, extra }) {
    const max = Math.max(1, ...rows.map(value));
    return (
        <section className="glass border rounded-3xl p-5">
            <h2 className="font-bold text-slate-800 dark:text-white mb-4">{title}</h2>
            {rows.length === 0 && <p className="text-sm text-slate-500 text-center py-4">داده‌ای نیست.</p>}
            <ul className="space-y-3">
                {rows.map((r, i) => (
                    <li key={i}>
                        <div className="flex justify-between text-sm mb-1 gap-2"><span className="text-slate-700 dark:text-slate-200 truncate">{toPersianNum(label(r))} {extra && extra(r)}</span><span className="text-slate-600 dark:text-slate-300 shrink-0">{value(r) > 9999 ? toPersianNum(short(value(r))) : formatMoney(value(r))}</span></div>
                        <div className="h-2 rounded-full bg-violet-100 dark:bg-white/10"><div className="h-2 rounded-full" style={{ width: `${(value(r) / max) * 100}%`, background: '#8b5cf6' }} /></div>
                    </li>
                ))}
            </ul>
        </section>
    );
}

export default function ReportsPage({ user }) {
    const today = new Date();
    const yearAgo = new Date(today.getFullYear(), today.getMonth() - 11, 1);
    // رویدادهای قراردادشده آینده هم در بازه پیش‌فرض دیده شوند (تا ۶ ماه بعد)
    const ahead = new Date(today.getFullYear(), today.getMonth() + 6, today.getDate());
    const [range, setRange] = useState({ from: ymd(yearAgo) + 'T00:00', to: ymd(ahead) + 'T00:00' });
    const [data, setData] = useState(null);
    const [tab, setTab] = useState('overview');
    const [payouts, setPayouts] = useState(null);

    const load = async () => { setData(null); const r = await api('get_reports', null, { from: range.from.slice(0, 10), to: range.to.slice(0, 10) }); setData(r || false); };
    const loadPayouts = async () => { const r = await api('get_payouts'); setPayouts(r || []); };
    useEffect(() => { load(); }, [range.from, range.to]);
    useEffect(() => { if (tab === 'payouts') loadPayouts(); }, [tab]);

    const payFee = async (item, name) => {
        if (!(await confirmDialog({ title: 'تسویه دستمزد', message: `دستمزد ${formatMoney(item.amount)} تومانی «${name}» برای «${item.event_title}» پرداخت‌شده ثبت شود؟`, confirmText: 'ثبت تسویه' }))) return;
        if (await api('mark_fee_paid', { id: item.id, paid: true })) { toast('تسویه ثبت شد.'); loadPayouts(); }
    };

    const t = data && data.totals;
    const fin = user.perms.finance;
    const doneRate = data && Number(data.tasks.total) ? Math.round((Number(data.tasks.done) / Number(data.tasks.total)) * 100) : 0;

    return (
        <div className="fade-in mt-6 space-y-5">
            <div className="glass border rounded-3xl p-5 flex flex-col lg:flex-row lg:items-end justify-between gap-4">
                <div>
                    <h1 className="text-xl sm:text-2xl font-bold text-slate-800 dark:text-white">گزارش‌ها</h1>
                    <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">{user.role === 'manager' ? 'فقط رویدادهای تحت مدیریت شما' : 'همه رویدادها'} — بر اساس تاریخ شروع رویداد</p>
                </div>
                <div className="flex flex-col sm:flex-row gap-3">
                    <label className="text-xs text-slate-600 dark:text-slate-300">از تاریخ<JalaliDatePicker dateOnly value={range.from} onChange={v => v && setRange(r => ({ ...r, from: v }))} /></label>
                    <label className="text-xs text-slate-600 dark:text-slate-300">تا تاریخ<JalaliDatePicker dateOnly value={range.to} onChange={v => v && setRange(r => ({ ...r, to: v }))} /></label>
                </div>
            </div>

            {user.perms.payouts && (
                <div className="flex gap-1 glass border rounded-2xl p-1 w-fit" role="tablist">
                    {[['overview', 'خلاصه عملکرد'], ['payouts', 'تسویه نیروها']].map(([k, l]) => <button key={k} type="button" role="tab" aria-selected={tab === k} onClick={() => setTab(k)} className={`px-4 py-2 rounded-xl text-sm font-semibold ${tab === k ? 'bg-grad text-white' : 'text-slate-600 dark:text-slate-300'}`}>{l}</button>)}
                </div>
            )}

            {tab === 'payouts' ? (
                payouts === null ? <p className="text-center py-10 text-slate-500 pulse-text">در حال بارگذاری...</p> : (
                    <div className="space-y-3">
                        <div className="flex flex-wrap justify-between items-center gap-2">
                            <p className="text-sm text-slate-600 dark:text-slate-300">دستمزدهای تسویه‌نشده: <b>{formatMoney(payouts.reduce((s, p) => s + p.total, 0))}</b> تومان برای {toPersianNum(payouts.length)} نفر</p>
                            <button type="button" onClick={() => exportToCSV(payouts.flatMap(p => p.items.map(i => ({ ...i, iban: p.iban }))), 'Payouts', [
                                { key: 'full_name', label: 'نام' }, { key: 'iban', label: 'شبا' }, { key: 'event_title', label: 'رویداد' },
                                { key: 'start_date', label: 'تاریخ رویداد', value: r => toJalaliDate(r.start_date) }, { key: 'amount', label: 'مبلغ (تومان)' },
                            ])} className="glass border px-4 py-2 rounded-xl text-sm font-semibold inline-flex items-center gap-2"><Icons.Download /> خروجی اکسل برای بانک</button>
                        </div>
                        {payouts.length === 0 && <p className="glass border rounded-3xl text-center py-10 text-slate-500">دستمزد تسویه‌نشده‌ای وجود ندارد.</p>}
                        {payouts.map(p => (
                            <section key={p.user_id} className="glass border rounded-3xl p-4">
                                <div className="flex flex-wrap justify-between gap-2 mb-2">
                                    <div><b className="text-slate-800 dark:text-white">{toPersianNum(p.full_name)}</b> <span className="text-xs text-slate-500 font-mono" dir="ltr">{p.iban || 'شبا ثبت نشده'}</span></div>
                                    <b className="text-violet-700 dark:text-violet-300">{formatMoney(p.total)} تومان</b>
                                </div>
                                <ul className="divide-y divide-violet-100 dark:divide-white/10">
                                    {p.items.map(i => (
                                        <li key={i.id} className="py-2 flex flex-wrap items-center justify-between gap-2 text-sm">
                                            <span className="text-slate-700 dark:text-slate-200">{toPersianNum(i.event_title)} <span className="text-xs text-slate-500">({toJalaliDate(i.start_date)})</span></span>
                                            <span className="flex items-center gap-3"><span dir="ltr">{formatMoney(i.amount)}</span><button type="button" onClick={() => payFee(i, p.full_name)} className="text-xs bg-emerald-600 text-white px-3 py-1.5 rounded-lg font-semibold">ثبت تسویه</button></span>
                                        </li>
                                    ))}
                                </ul>
                            </section>
                        ))}
                    </div>
                )
            ) : data === null ? <p className="text-center py-16 text-slate-500 pulse-text">در حال محاسبه گزارش...</p> : data === false ? null : (
                <>
                    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                        <Tile label="تعداد رویداد" value={toPersianNum(t.events)} sub={Object.entries(data.status).filter(([, n]) => n).map(([k, n]) => `${EVENT_STATUS[k]?.label || k}: ${toPersianNum(n)}`).join(' · ')} />
                        {fin && <Tile tone="grad" label="مبلغ کل فاکتورها (تومان)" value={short(t.revenue)} sub={t.tbd_rows ? `${toPersianNum(t.tbd_rows)} ردیف TBD محاسبه نشده` : ''} />}
                        {fin && <Tile label="دریافت‌شده" value={short(t.paid)} sub={`مانده طلب: ${short(t.outstanding)}`} />}
                        {fin && <Tile label="سود (پس از دستمزد نیروها)" value={short(t.profit)} sub={`دستمزدها: ${short(t.fees)}`} />}
                        <Tile label="نرخ انجام وظایف" value={`${toPersianNum(doneRate)}٪`} sub={`${toPersianNum(Number(data.tasks.overdue) || 0)} عقب‌افتاده · ${toPersianNum(Number(data.tasks.issues) || 0)} مانع`} />
                    </div>
                    {fin && <MonthBars months={data.months} />}
                    <div className="grid lg:grid-cols-3 gap-4">
                        <BarList title="فعال‌ترین همکاران (وظایف انجام‌شده)" rows={data.top_staff} value={r => Number(r.done)} label={r => r.full_name} extra={r => <RatingBadge score={r.rating_score} count={r.rating_count} />} />
                        <BarList title={fin ? 'پرفروش‌ترین خدمات (مبلغ)' : 'پرتکرارترین خدمات'} rows={data.top_services} value={r => fin ? Number(r.revenue) : Number(r.cnt)} label={r => r.name} />
                        <BarList title="مکان‌های پرکاربرد (تعداد رویداد)" rows={data.top_venues} value={r => Number(r.cnt)} label={r => r.name} extra={r => <RatingBadge score={r.rating_score} count={r.rating_count} />} />
                    </div>
                    {fin && data.receivables.length > 0 && (
                        <section className="glass border rounded-3xl p-5">
                            <h2 className="font-bold text-slate-800 dark:text-white mb-3">مطالبات (بیشترین مانده)</h2>
                            <ul className="divide-y divide-violet-100 dark:divide-white/10">
                                {data.receivables.map(r => (
                                    <li key={r.id}><button type="button" onClick={() => navigate(`events/${r.id}/finance`)} className="w-full py-2.5 flex flex-wrap justify-between gap-2 text-sm text-right hover:bg-white/40 dark:hover:bg-white/5 rounded-lg px-2">
                                        <span className="text-slate-700 dark:text-slate-200">{toPersianNum(r.title)} <span className="text-xs text-slate-500">({toJalaliDate(r.start_date)})</span></span>
                                        <span className="text-slate-600 dark:text-slate-300">مانده <b className="text-red-700 dark:text-red-300" dir="ltr">{formatMoney(r.remaining)}</b> از {formatMoney(r.total)}</span>
                                    </button></li>
                                ))}
                            </ul>
                        </section>
                    )}
                </>
            )}
        </div>
    );
}
