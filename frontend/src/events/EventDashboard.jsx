import React, { useState, useEffect } from 'react';
import { api } from '../lib/api';
import { toPersianNum, toJalaliDate, toJalaliDateTime, statusInfo, EVENT_STATUS, matches, parseDate, PAY_STATUS, dueLabel } from '../lib/utils';
import { toast, confirmDialog, formDialog } from '../lib/ui';
import { navigate } from '../lib/router';
import { Icons } from '../components/Icons';

const FILTERS = [
    { id: 'active', label: 'جاری', test: (e) => e.status !== 'completed' },
    { id: 'all', label: 'همه', test: () => true },
    ...Object.entries(EVENT_STATUS).map(([k, v]) => ({ id: k, label: v.label, test: (e) => e.status === k })),
    { id: 'debt', label: 'بدهکار', test: (e) => e.fin && e.fin.remaining > 0 && e.status !== 'draft', finance: true },
    { id: 'overdue', label: 'دارای کار عقب‌افتاده', test: (e) => Number(e.overdue_count) > 0 },
];
const SORTS = {
    upcoming: { label: 'نزدیک‌ترین تاریخ', fn: (a, b) => (parseDate(a.start_date)?.getTime() ?? Infinity) - (parseDate(b.start_date)?.getTime() ?? Infinity) },
    newest: { label: 'جدیدترین پرونده', fn: (a, b) => b.id - a.id },
    title: { label: 'عنوان', fn: (a, b) => String(a.title).localeCompare(String(b.title), 'fa') },
};
const load = (k, d) => { try { return localStorage.getItem(k) || d; } catch (e) { return d; } };
const save = (k, v) => { try { localStorage.setItem(k, v); } catch (e) { /* ignore */ } };

// =====================================
// داشبورد اصلی رویدادها (لیست)
// =====================================
export default function EventDashboard({ onOpen, onNewEvent, refreshKey, user }) {
    const [eventsList, setEventsList] = useState(null);
    const [templates, setTemplates] = useState([]);
    const [overdue, setOverdue] = useState([]);
    const [showOverdue, setShowOverdue] = useState(false);
    const perms = user?.perms || {};
    const [query, setQuery] = useState('');
    const [filter, setFilter] = useState(() => load('evm_ev_filter', 'active'));
    const [sort, setSort] = useState(() => load('evm_ev_sort', 'upcoming'));

    const loadTemplates = () => api('get_events', null, { templates: 1 }).then(r => setTemplates(r || []));
    useEffect(() => {
        api('get_events').then((res) => setEventsList(res || []));
        api('get_overdue', null, {}, { silent: true }).then(r => setOverdue(r || []));
        if (perms.tasks) loadTemplates();
    }, [refreshKey]);

    const fromTemplate = async () => {
        if (!templates.length) return toast('هنوز قالبی ذخیره نشده است. در اتاق فرمان هر رویداد گزینه «ذخیره به‌عنوان قالب» وجود دارد.', 'info', 6000);
        const v = await formDialog({
            title: 'ساخت رویداد از قالب',
            fields: [
                { name: 'event_id', label: 'قالب', type: 'select', value: String(templates[0].id), options: templates.map(t => ({ value: String(t.id), label: t.title })) },
                { name: 'title', label: 'عنوان رویداد جدید', required: true },
                { name: 'start_date', label: 'شروع', type: 'datetime' },
                { name: 'end_date', label: 'پایان', type: 'datetime' },
            ],
            confirmText: 'ساخت رویداد',
        });
        if (!v) return;
        const r = await api('duplicate_event', { ...v, event_id: Number(v.event_id) });
        if (r) { toast('رویداد از قالب ساخته شد.'); navigate(`events/${r.id}`); }
    };
    const delTemplate = async (t) => {
        if (await confirmDialog({ title: 'حذف قالب', message: `قالب «${t.title}» حذف شود؟ رویدادهای ساخته‌شده از آن تغییری نمی‌کنند.`, confirmText: 'حذف', danger: true }) && await api('delete_template', { event_id: t.id })) { toast('قالب حذف شد.'); loadTemplates(); }
    };
    useEffect(() => { save('evm_ev_filter', filter); }, [filter]);
    useEffect(() => { save('evm_ev_sort', sort); }, [sort]);

    const all = eventsList || [];
    const f = FILTERS.find(x => x.id === filter) || FILTERS[0];
    const list = all.filter(f.test).filter(e => matches(query, e.title, e.org_name, e.venue_name, e.contact_name, String(e.id))).sort(SORTS[sort]?.fn || SORTS.upcoming.fn);
    const countFor = (fx) => all.filter(fx.test).length;
    const filters = FILTERS.filter(fx => !fx.finance || perms.finance);

    return (
        <div className="fade-in mt-6">
            <div className="glass flex flex-col sm:flex-row justify-between items-stretch sm:items-center mb-5 gap-4 p-5 sm:p-6 rounded-3xl border">
                <div>
                    <h1 className="text-xl sm:text-2xl font-bold text-slate-800 dark:text-white">داشبورد رویدادها</h1>
                    <p className="text-slate-500 dark:text-slate-400 text-sm mt-1">مدیریت و کنترل لحظه‌ای پروژه‌ها</p>
                </div>
                {perms.create_event && <div className="flex flex-col sm:flex-row gap-2">
                <button type="button" onClick={fromTemplate} className="glass border px-5 py-3.5 rounded-2xl font-semibold">ساخت از قالب</button>
                <button type="button" onClick={onNewEvent} className="btn-grad text-white px-6 py-3.5 rounded-2xl font-bold active:scale-[0.98] flex items-center justify-center gap-2"><Icons.Plus /> تعریف رویداد جدید</button>
                </div>}
            </div>

            {overdue.length > 0 && (
                <div className="mb-5 rounded-2xl border border-red-300 dark:border-red-800 bg-red-50/80 dark:bg-red-900/20 p-4">
                    <button type="button" aria-expanded={showOverdue} onClick={() => setShowOverdue(!showOverdue)} className="w-full flex justify-between items-center text-right text-sm font-semibold text-red-800 dark:text-red-200">
                        <span>⏰ {toPersianNum(overdue.length)} وظیفه از موعد گذشته است</span><span>{showOverdue ? '▲' : '▼'}</span>
                    </button>
                    {showOverdue && (
                        <ul className="mt-3 space-y-1.5 max-h-72 overflow-y-auto custom-scroll">
                            {overdue.map(t => (
                                <li key={t.id}><button type="button" onClick={() => onOpen(t.event_id)} className="w-full text-right text-sm glass-soft border rounded-xl px-3 py-2 hover:border-red-400">
                                    <b className="text-slate-800 dark:text-white">{toPersianNum(t.title)}</b> <span className="text-slate-500 dark:text-slate-400">— {toPersianNum(t.event_title)} · {t.assignee_name || 'بدون متصدی'} · <span title={toJalaliDateTime(t.due_at)}>{dueLabel(t.due_at)}</span></span>
                                </button></li>
                            ))}
                        </ul>
                    )}
                </div>
            )}

            <div className="flex flex-col lg:flex-row gap-3 mb-5">
                <div className="relative flex-1">
                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 pointer-events-none"><Icons.Search /></span>
                    <input type="search" aria-label="جستجوی رویداد" placeholder="جستجو در عنوان، سازمان، مکان یا شماره پرونده..." value={query} onChange={e => setQuery(e.target.value)} className="glass-field w-full border-2 pr-10 pl-3 py-2.5 rounded-xl dark:text-white focus:border-indigo-500" />
                </div>
                <div className="flex gap-2 overflow-x-auto custom-scroll pb-1" role="group" aria-label="فیلتر وضعیت">
                    {filters.map(fx => (
                        <button key={fx.id} type="button" aria-pressed={filter === fx.id} onClick={() => setFilter(fx.id)} className={`whitespace-nowrap px-3.5 py-2 rounded-xl text-sm font-semibold border transition-colors ${filter === fx.id ? 'bg-grad text-white border-transparent' : 'glass text-slate-600 dark:text-slate-300 hover:bg-white/60 dark:hover:bg-white/10'}`}>
                            {fx.label} <span className="opacity-70 text-xs">{toPersianNum(countFor(fx))}</span>
                        </button>
                    ))}
                </div>
                <select aria-label="مرتب‌سازی" value={sort} onChange={e => setSort(e.target.value)} className="glass-field border-2 px-3 py-2 rounded-xl dark:text-white text-sm">
                    {Object.entries(SORTS).map(([k, v]) => <option key={k} value={k}>مرتب‌سازی: {v.label}</option>)}
                </select>
            </div>

            {eventsList === null ? (
                <div className="text-center py-24 text-slate-500 pulse-text">در حال دریافت رویدادها...</div>
            ) : all.length === 0 ? (
                <div className="glass text-center py-24 rounded-3xl border-2 border-dashed">
                    <div className="text-indigo-500 w-20 h-20 rounded-full flex items-center justify-center mx-auto mb-5 bg-grad-soft"><Icons.Building /></div>
                    <h2 className="text-xl font-bold text-slate-800 dark:text-white mb-2">پروژه‌ای در دست اجرا نیست</h2>
                    <p className="text-slate-500 dark:text-slate-400 max-w-sm mx-auto px-4 leading-relaxed">برای شروع، روی «تعریف رویداد جدید» کلیک کنید.</p>
                </div>
            ) : list.length === 0 ? (
                <div className="glass text-center py-16 text-slate-500 rounded-3xl border">
                    رویدادی با این جستجو/فیلتر پیدا نشد.
                    {filter !== 'all' && <button type="button" onClick={() => setFilter('all')} className="block mx-auto mt-3 text-indigo-600 dark:text-indigo-400 font-semibold underline">نمایش همه رویدادها</button>}
                </div>
            ) : (
                <ul className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                    {list.map(ev => {
                        const st = statusInfo(ev.status);
                        return (
                            <li key={ev.id}>
                                <a href={`#/events/${ev.id}`} onClick={(e) => { e.preventDefault(); onOpen(ev.id); }} className="glass p-5 rounded-3xl border hover:border-indigo-400 dark:hover:border-indigo-500 hover:shadow-md transition-all flex flex-col h-full group">
                                    <div className="flex justify-between items-start mb-4">
                                        {ev.org_logo ? <img src={ev.org_logo} alt="" className="w-12 h-12 rounded-xl object-cover border border-violet-200/60 dark:border-white/10 bg-white" /> : <div className="glass-soft w-12 h-12 rounded-xl flex items-center justify-center text-slate-500"><Icons.Building /></div>}
                                        <span className={`text-xs font-semibold px-2.5 py-1 rounded-lg border ${st.card}`}>{st.label}</span>
                                    </div>
                                    <span className="text-xs text-slate-500 dark:text-slate-400">پرونده {toPersianNum(ev.id)}</span>
                                    <h2 className="font-bold text-lg mb-3 text-slate-800 dark:text-white leading-snug">{toPersianNum(ev.title)}</h2>
                                    <div className="space-y-1.5 text-sm text-slate-600 dark:text-slate-300 flex-1">
                                        <p className="flex items-center gap-2"><Icons.Building /> {toPersianNum(ev.org_name) || 'کارفرمای نامشخص'}</p>
                                        <p className="flex items-center gap-2"><Icons.Calendar /> {ev.start_date ? toJalaliDate(ev.start_date) : 'بدون تاریخ'}</p>
                                        {ev.manager_name && <p className="flex items-center gap-2"><Icons.Users /> {toPersianNum(ev.manager_name)}</p>}
                                    </div>
                                    <div className="flex flex-wrap gap-1.5 mt-3">
                                        {Number(ev.task_count) > 0 && <span className="text-[11px] glass-soft border px-2 py-0.5 rounded-md text-slate-600 dark:text-slate-300">{toPersianNum(ev.done_count)}/{toPersianNum(ev.task_count)} کار</span>}
                                        {Number(ev.overdue_count) > 0 && <span className="text-[11px] px-2 py-0.5 rounded-md border bg-red-50 text-red-700 border-red-200 dark:bg-red-900/30 dark:text-red-300 dark:border-red-800">⏰ {toPersianNum(ev.overdue_count)} عقب‌افتاده</span>}
                                        {ev.fin && ev.fin.total > 0 && <span className={`text-[11px] px-2 py-0.5 rounded-md border ${PAY_STATUS[ev.fin.pay_status].cls}`}>{PAY_STATUS[ev.fin.pay_status].label}</span>}
                                        {ev.client_approved_at && <span className="text-[11px] px-2 py-0.5 rounded-md border bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-900/30 dark:text-emerald-300 dark:border-emerald-800">✓ تایید کارفرما</span>}
                                    </div>
                                    <span className="glass-soft mt-4 text-center py-2.5 rounded-xl font-semibold text-indigo-600 dark:text-indigo-400 group-hover:bg-indigo-600 group-hover:text-white transition-colors">ورود به اتاق فرمان</span>
                                </a>
                            </li>
                        );
                    })}
                </ul>
            )}

            {perms.tasks && templates.length > 0 && (
                <section className="mt-8" aria-labelledby="tpl-h">
                    <h2 id="tpl-h" className="font-bold text-slate-800 dark:text-white mb-3">قالب‌های ذخیره‌شده</h2>
                    <ul className="flex flex-wrap gap-2">
                        {templates.map(t => (
                            <li key={t.id} className="glass border rounded-2xl pl-2 pr-4 py-2 flex items-center gap-2 text-sm">
                                <span className="text-slate-700 dark:text-slate-200">{toPersianNum(t.title)}</span>
                                <span className="text-xs text-slate-500">{toPersianNum(t.task_count)} کار</span>
                                <button type="button" onClick={() => delTemplate(t)} className="p-1.5 text-red-500" aria-label={`حذف قالب ${t.title}`}><Icons.Trash /></button>
                            </li>
                        ))}
                    </ul>
                </section>
            )}
        </div>
    );
}
