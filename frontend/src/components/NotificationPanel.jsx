import React, { useState, useEffect, useRef } from 'react';
import { Icons } from './Icons';
import { toPersianNum, toJalaliDateTime } from '../lib/utils';

const TYPE_STYLE = {
    delegation: 'bg-blue-50 dark:bg-blue-900/30 border-blue-200 dark:border-blue-800',
    issue: 'bg-red-50 dark:bg-red-900/30 border-red-200 dark:border-red-800',
    error: 'bg-red-50 dark:bg-red-900/30 border-red-200 dark:border-red-800',
    success: 'bg-green-50 dark:bg-green-900/30 border-green-200 dark:border-green-800',
};

/** شناسه رویداد مرتبط با اعلان (برای رفتن به همان رویداد) */
export const notifEventId = (n) => (n.type === 'delegation' ? n.deleg_event_id : n.ref_id) || null;

/**
 * زنگوله و پنل اعلان‌ها.
 * - تعداد اعلان‌های خوانده‌نشده روی زنگوله
 * - کلیک روی متن اعلان => رفتن به رویداد مربوطه (بدون خوانده‌شدن ناخواسته)
 * - دکمه ✓ جداگانه و «همه خوانده شد»
 */
export default function NotificationPanel({ notifs, onRead, onReadAll, onOpen, renderActions, onRefresh, dark = true }) {
    const [open, setOpen] = useState(false);
    const ref = useRef(null);
    useEffect(() => {
        if (!open) return;
        const onDoc = (e) => { if (ref.current && !ref.current.contains(e.target) && !e.target.closest('#ui-host')) setOpen(false); };
        const onKey = (e) => { if (e.key === 'Escape') setOpen(false); };
        document.addEventListener('mousedown', onDoc);
        window.addEventListener('keydown', onKey);
        return () => { document.removeEventListener('mousedown', onDoc); window.removeEventListener('keydown', onKey); };
    }, [open]);

    const count = notifs.length;
    const readable = notifs.filter(n => !(renderActions && renderActions(n)));

    return (
        <div className="relative" ref={ref}>
            <button type="button" onClick={() => { if (!open && onRefresh) onRefresh(); setOpen(!open); }} aria-expanded={open} aria-label={count ? `اعلان‌ها (${count} خوانده‌نشده)` : 'اعلان‌ها'} className={`relative p-2 rounded-full transition-colors ${dark ? 'text-indigo-100 hover:text-white bg-white/10 hover:bg-white/20' : ''}`}>
                <Icons.Bell />
                {count > 0 && <span className="absolute -top-1 -right-1 bg-red-500 text-white text-[10px] font-bold min-w-[18px] h-[18px] px-1 rounded-full flex items-center justify-center">{toPersianNum(count > 99 ? '99+' : count)}</span>}
            </button>
            {open && (
                <div className="glass absolute left-0 top-12 w-[calc(100vw-2rem)] max-w-[420px] rounded-2xl z-50 border fade-in text-slate-800 dark:text-slate-100" role="region" aria-label="اعلان‌ها">
                    <div className="flex justify-between items-center px-4 py-3 border-b dark:border-white/10">
                        <h2 className="font-bold">اعلان‌ها {count > 0 && <span className="text-sm font-normal text-slate-500">({toPersianNum(count)})</span>}</h2>
                        <div className="flex items-center gap-2">
                            {readable.length > 0 && <button type="button" onClick={onReadAll} className="text-xs font-semibold text-indigo-700 dark:text-indigo-400 hover:underline">همه خوانده شد</button>}
                            <button type="button" onClick={() => setOpen(false)} aria-label="بستن" className="text-slate-500 hover:text-red-500 px-1">✕</button>
                        </div>
                    </div>
                    <ul className="max-h-[70vh] overflow-y-auto custom-scroll p-3 space-y-2">
                        {count === 0 && <li className="text-sm text-slate-500 text-center py-6">اعلان جدیدی ندارید</li>}
                        {notifs.map(n => {
                            const evId = notifEventId(n);
                            const actions = renderActions && renderActions(n);
                            return (
                                <li key={n.id} className={`p-3 rounded-xl text-sm border ${TYPE_STYLE[n.type] || 'glass-soft'}`}>
                                    <div className="flex gap-2 items-start">
                                        <span className="mt-0.5 shrink-0 opacity-70"><Icons.Alert /></span>
                                        <div className="flex-1 min-w-0">
                                            {evId ? (
                                                <button type="button" onClick={() => { setOpen(false); onOpen(evId, n); }} className="text-right leading-relaxed hover:underline">{toPersianNum(n.message)}</button>
                                            ) : <p className="leading-relaxed">{toPersianNum(n.message)}</p>}
                                            <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1">{toJalaliDateTime(n.created_at)}</p>
                                        </div>
                                        {!actions && <button type="button" onClick={() => onRead(n.id)} title="خوانده شد" aria-label="علامت خوانده‌شده" className="shrink-0 w-8 h-8 rounded-lg flex items-center justify-center text-slate-500 hover:text-green-600 hover:bg-white dark:hover:bg-white/10"><Icons.Check /></button>}
                                    </div>
                                    {actions}
                                </li>
                            );
                        })}
                    </ul>
                </div>
            )}
        </div>
    );
}
