import React, { useState, useEffect } from 'react';
import { api } from '../lib/api';
import { toPersianNum, toJalaliDate, statusInfo, EVENT_STATUS, matches, parseDate } from '../lib/utils';
import { Icons } from '../components/Icons';

const FILTERS = [
    { id: 'active', label: 'جاری', test: (e) => e.status !== 'completed' },
    { id: 'all', label: 'همه', test: () => true },
    ...Object.entries(EVENT_STATUS).map(([k, v]) => ({ id: k, label: v.label, test: (e) => e.status === k })),
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
export default function EventDashboard({ onOpen, onNewEvent, refreshKey }) {
    const [eventsList, setEventsList] = useState(null);
    const [query, setQuery] = useState('');
    const [filter, setFilter] = useState(() => load('evm_ev_filter', 'active'));
    const [sort, setSort] = useState(() => load('evm_ev_sort', 'upcoming'));

    useEffect(() => { api('get_events').then((res) => setEventsList(res || [])); }, [refreshKey]);
    useEffect(() => { save('evm_ev_filter', filter); }, [filter]);
    useEffect(() => { save('evm_ev_sort', sort); }, [sort]);

    const all = eventsList || [];
    const f = FILTERS.find(x => x.id === filter) || FILTERS[0];
    const list = all.filter(f.test).filter(e => matches(query, e.title, e.org_name, e.venue_name, e.contact_name, String(e.id))).sort(SORTS[sort]?.fn || SORTS.upcoming.fn);
    const countFor = (fx) => all.filter(fx.test).length;

    return (
        <div className="fade-in mt-6">
            <div className="flex flex-col sm:flex-row justify-between items-stretch sm:items-center mb-5 gap-4 bg-white dark:bg-slate-800 p-5 sm:p-6 rounded-3xl border border-slate-200 dark:border-slate-700">
                <div>
                    <h1 className="text-xl sm:text-2xl font-bold text-slate-800 dark:text-white">داشبورد رویدادها</h1>
                    <p className="text-slate-500 dark:text-slate-400 text-sm mt-1">مدیریت و کنترل لحظه‌ای پروژه‌ها</p>
                </div>
                <button type="button" onClick={onNewEvent} className="bg-indigo-600 text-white px-6 py-3.5 rounded-2xl font-bold hover:bg-indigo-700 active:scale-[0.98] flex items-center justify-center gap-2"><Icons.Plus /> تعریف رویداد جدید</button>
            </div>

            <div className="flex flex-col lg:flex-row gap-3 mb-5">
                <div className="relative flex-1">
                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 pointer-events-none"><Icons.Search /></span>
                    <input type="search" aria-label="جستجوی رویداد" placeholder="جستجو در عنوان، سازمان، مکان یا شماره پرونده..." value={query} onChange={e => setQuery(e.target.value)} className="w-full border-2 border-slate-200 dark:border-slate-700 pr-10 pl-3 py-2.5 rounded-xl bg-white dark:bg-slate-800 dark:text-white focus:border-indigo-500" />
                </div>
                <div className="flex gap-2 overflow-x-auto custom-scroll pb-1" role="group" aria-label="فیلتر وضعیت">
                    {FILTERS.map(fx => (
                        <button key={fx.id} type="button" aria-pressed={filter === fx.id} onClick={() => setFilter(fx.id)} className={`whitespace-nowrap px-3.5 py-2 rounded-xl text-sm font-semibold border transition-colors ${filter === fx.id ? 'bg-slate-800 dark:bg-indigo-600 text-white border-transparent' : 'bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-700'}`}>
                            {fx.label} <span className="opacity-70 text-xs">{toPersianNum(countFor(fx))}</span>
                        </button>
                    ))}
                </div>
                <select aria-label="مرتب‌سازی" value={sort} onChange={e => setSort(e.target.value)} className="border-2 border-slate-200 dark:border-slate-700 px-3 py-2 rounded-xl bg-white dark:bg-slate-800 dark:text-white text-sm">
                    {Object.entries(SORTS).map(([k, v]) => <option key={k} value={k}>مرتب‌سازی: {v.label}</option>)}
                </select>
            </div>

            {eventsList === null ? (
                <div className="text-center py-24 text-slate-500 pulse-text">در حال دریافت رویدادها...</div>
            ) : all.length === 0 ? (
                <div className="text-center py-24 bg-white dark:bg-slate-800 rounded-3xl border-2 border-dashed border-slate-300 dark:border-slate-700">
                    <div className="bg-indigo-50 dark:bg-indigo-900/30 text-indigo-500 w-20 h-20 rounded-full flex items-center justify-center mx-auto mb-5"><Icons.Building /></div>
                    <h2 className="text-xl font-bold text-slate-800 dark:text-white mb-2">پروژه‌ای در دست اجرا نیست</h2>
                    <p className="text-slate-500 dark:text-slate-400 max-w-sm mx-auto px-4 leading-relaxed">برای شروع، روی «تعریف رویداد جدید» کلیک کنید.</p>
                </div>
            ) : list.length === 0 ? (
                <div className="text-center py-16 text-slate-500 bg-white dark:bg-slate-800 rounded-3xl border border-slate-200 dark:border-slate-700">
                    رویدادی با این جستجو/فیلتر پیدا نشد.
                    {filter !== 'all' && <button type="button" onClick={() => setFilter('all')} className="block mx-auto mt-3 text-indigo-600 dark:text-indigo-400 font-semibold underline">نمایش همه رویدادها</button>}
                </div>
            ) : (
                <ul className="grid sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                    {list.map(ev => {
                        const st = statusInfo(ev.status);
                        return (
                            <li key={ev.id}>
                                <a href={`#/events/${ev.id}`} onClick={(e) => { e.preventDefault(); onOpen(ev.id); }} className="bg-white dark:bg-slate-800 p-5 rounded-3xl border border-slate-200 dark:border-slate-700 hover:border-indigo-400 dark:hover:border-indigo-500 hover:shadow-md transition-all flex flex-col h-full group">
                                    <div className="flex justify-between items-start mb-4">
                                        {ev.org_logo ? <img src={ev.org_logo} alt="" className="w-12 h-12 rounded-xl object-cover border border-slate-200 dark:border-slate-700 bg-white" /> : <div className="w-12 h-12 bg-slate-100 dark:bg-slate-700 rounded-xl flex items-center justify-center text-slate-500"><Icons.Building /></div>}
                                        <span className={`text-xs font-semibold px-2.5 py-1 rounded-lg border ${st.card}`}>{st.label}</span>
                                    </div>
                                    <span className="text-xs text-slate-500 dark:text-slate-400">پرونده {toPersianNum(ev.id)}</span>
                                    <h2 className="font-bold text-lg mb-3 text-slate-800 dark:text-white leading-snug">{toPersianNum(ev.title)}</h2>
                                    <div className="space-y-1.5 text-sm text-slate-600 dark:text-slate-300 flex-1">
                                        <p className="flex items-center gap-2"><Icons.Building /> {toPersianNum(ev.org_name) || 'کارفرمای نامشخص'}</p>
                                        <p className="flex items-center gap-2"><Icons.Calendar /> {ev.start_date ? toJalaliDate(ev.start_date) : 'بدون تاریخ'}</p>
                                    </div>
                                    <span className="mt-4 text-center py-2.5 rounded-xl font-semibold text-indigo-600 dark:text-indigo-400 bg-slate-50 dark:bg-slate-700 group-hover:bg-indigo-600 group-hover:text-white transition-colors">ورود به اتاق فرمان</span>
                                </a>
                            </li>
                        );
                    })}
                </ul>
            )}
        </div>
    );
}
