import React, { useEffect, useMemo, useState } from 'react';
import { api } from '../lib/api';
import { toPersianNum, g2j, j2g, jalaliMonthLength, JALALI_MONTHS, parseDate, statusInfo, ymd } from '../lib/utils';
import { navigate } from '../lib/router';
import { Icons } from '../components/Icons';

const WEEK = ['شنبه', 'یکشنبه', 'دوشنبه', 'سه‌شنبه', 'چهارشنبه', 'پنجشنبه', 'جمعه'];
const toG = (jy, jm, jd) => { const [gy, gm, gd] = j2g(jy, jm, jd); return new Date(gy, gm - 1, gd); };

/** تقویم ماهانه شمسی رویدادها + هشدار تداخل مکان و نیرو */
export default function CalendarPage() {
    const now = new Date();
    const [cur, setCur] = useState(() => { const [y, m] = g2j(now.getFullYear(), now.getMonth() + 1, now.getDate()); return { y, m }; });
    const [events, setEvents] = useState(null);
    const [view, setView] = useState(() => (window.innerWidth < 768 ? 'list' : 'month'));
    const [onlyConflicts, setOnlyConflicts] = useState(false);

    const days = jalaliMonthLength(cur.y, cur.m);
    const first = toG(cur.y, cur.m, 1);
    const last = toG(cur.y, cur.m, days);
    useEffect(() => {
        setEvents(null);
        api('get_calendar', null, { from: ymd(first), to: ymd(last) }).then(r => setEvents(r || []));
    }, [cur.y, cur.m]);

    const shift = (d) => setCur(c => { let m = c.m + d, y = c.y; if (m < 1) { m = 12; y--; } if (m > 12) { m = 1; y++; } return { y, m }; });
    const today = () => { const [y, m] = g2j(now.getFullYear(), now.getMonth() + 1, now.getDate()); setCur({ y, m }); };

    const list = (events || []).filter(e => !onlyConflicts || e.conflicts.length);
    const conflictCount = (events || []).filter(e => e.conflicts.length).length;

    // رویدادهای هر روز ماه
    const byDay = useMemo(() => {
        const map = {};
        list.forEach(e => {
            const s = parseDate(e.start_date); const en = parseDate(e.end_date) || s;
            for (let d = 1; d <= days; d++) {
                const dayStart = toG(cur.y, cur.m, d); const dayEnd = new Date(dayStart.getTime() + 86400000 - 1);
                if (s <= dayEnd && en >= dayStart) (map[d] = map[d] || []).push(e);
            }
        });
        return map;
    }, [events, onlyConflicts, cur.y, cur.m]);

    const offset = (first.getDay() + 1) % 7; // شنبه = ۰
    const [ty, tm, td] = g2j(now.getFullYear(), now.getMonth() + 1, now.getDate());
    const open = (e) => { if (e.can_open) navigate(`events/${e.id}`); };
    const chip = (e) => {
        const st = statusInfo(e.status);
        return (
            <button type="button" key={e.id} onClick={() => open(e)} disabled={!e.can_open} title={[e.title, e.venue_name, ...e.conflicts].filter(Boolean).join('\n')}
                className={`w-full text-right text-[11px] leading-tight px-1.5 py-1 rounded-md border truncate block ${st.card} ${e.conflicts.length ? '!border-red-500 ring-1 ring-red-400' : ''} disabled:cursor-default`}>
                {e.conflicts.length > 0 && '⚠ '}{toPersianNum(e.title)}
            </button>
        );
    };

    return (
        <div className="fade-in mt-6 space-y-4">
            <div className="glass border rounded-3xl p-4 sm:p-5 flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                    <button type="button" onClick={() => shift(-1)} className="glass-soft border p-2 rounded-xl" aria-label="ماه قبل"><Icons.ArrowRight /></button>
                    <h1 className="text-xl font-bold text-slate-800 dark:text-white min-w-[9rem] text-center">{JALALI_MONTHS[cur.m - 1]} {toPersianNum(cur.y)}</h1>
                    <button type="button" onClick={() => shift(1)} className="glass-soft border p-2 rounded-xl rotate-180" aria-label="ماه بعد"><Icons.ArrowRight /></button>
                    <button type="button" onClick={today} className="glass-soft border px-3 py-2 rounded-xl text-sm font-semibold">امروز</button>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                    {conflictCount > 0 && (
                        <button type="button" aria-pressed={onlyConflicts} onClick={() => setOnlyConflicts(!onlyConflicts)} className={`px-3 py-2 rounded-xl text-sm font-semibold border ${onlyConflicts ? 'bg-red-600 text-white border-transparent' : 'text-red-700 dark:text-red-300 border-red-300 dark:border-red-800 bg-red-50 dark:bg-red-900/20'}`}>
                            ⚠ {toPersianNum(conflictCount)} رویداد با تداخل
                        </button>
                    )}
                    <div className="flex glass-soft border rounded-xl p-1" role="group" aria-label="نوع نمایش">
                        {[['month', 'ماهانه'], ['list', 'فهرست']].map(([k, l]) => <button key={k} type="button" aria-pressed={view === k} onClick={() => setView(k)} className={`px-3 py-1.5 rounded-lg text-sm font-semibold ${view === k ? 'bg-grad text-white' : 'text-slate-600 dark:text-slate-300'}`}>{l}</button>)}
                    </div>
                </div>
            </div>

            {events === null ? <p className="text-center py-16 text-slate-500 pulse-text">در حال بارگذاری...</p> : view === 'month' ? (
                <div className="glass border rounded-3xl p-2 sm:p-4 overflow-x-auto custom-scroll">
                    <div className="grid grid-cols-7 gap-1 min-w-[640px]">
                        {WEEK.map(w => <div key={w} className="text-center text-xs font-semibold text-slate-500 dark:text-slate-400 py-2">{w}</div>)}
                        {Array.from({ length: offset }).map((_, i) => <div key={'e' + i} />)}
                        {Array.from({ length: days }).map((_, i) => {
                            const d = i + 1;
                            const isToday = cur.y === ty && cur.m === tm && d === td;
                            const evs = byDay[d] || [];
                            return (
                                <div key={d} className={`min-h-[96px] rounded-xl border p-1.5 ${isToday ? 'border-violet-500 bg-grad-soft' : 'glass-soft'}`}>
                                    <div className={`text-xs font-bold mb-1 ${isToday ? 'text-violet-700 dark:text-violet-300' : 'text-slate-600 dark:text-slate-300'}`}>{toPersianNum(d)}</div>
                                    <div className="space-y-1">{evs.slice(0, 3).map(chip)}{evs.length > 3 && <div className="text-[10px] text-slate-500">+{toPersianNum(evs.length - 3)} مورد دیگر</div>}</div>
                                </div>
                            );
                        })}
                    </div>
                </div>
            ) : (
                <ul className="space-y-2.5">
                    {list.length === 0 && <li className="glass border rounded-3xl text-center py-12 text-slate-500">در این ماه رویدادی ثبت نشده است.</li>}
                    {list.map(e => {
                        const st = statusInfo(e.status);
                        const s = parseDate(e.start_date);
                        const [, jm, jd] = g2j(s.getFullYear(), s.getMonth() + 1, s.getDate());
                        return (
                            <li key={e.id}>
                                <button type="button" onClick={() => open(e)} disabled={!e.can_open} className={`w-full text-right glass border rounded-2xl p-4 flex gap-4 items-start ${e.conflicts.length ? '!border-red-400' : ''}`}>
                                    <span className="bg-grad text-white rounded-xl w-14 shrink-0 text-center py-1.5"><span className="block text-xl font-bold">{toPersianNum(jd)}</span><span className="block text-[11px]">{JALALI_MONTHS[jm - 1]}</span></span>
                                    <span className="flex-1 min-w-0">
                                        <span className="flex flex-wrap items-center gap-2"><b className="text-slate-800 dark:text-white">{toPersianNum(e.title)}</b><span className={`text-[11px] px-2 py-0.5 rounded-md border ${st.card}`}>{st.label}</span></span>
                                        <span className="block text-xs text-slate-500 dark:text-slate-400 mt-1">ساعت {toPersianNum(`${String(s.getHours()).padStart(2, '0')}:${String(s.getMinutes()).padStart(2, '0')}`)} · {toPersianNum(e.venue_name) || 'بدون مکان'} · {toPersianNum(e.staff.length)} نیرو</span>
                                        {e.conflicts.map((c, i) => <span key={i} className="block text-xs text-red-700 dark:text-red-300 mt-1">⚠ {toPersianNum(c)}</span>)}
                                    </span>
                                </button>
                            </li>
                        );
                    })}
                </ul>
            )}
        </div>
    );
}
