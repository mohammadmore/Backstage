import React, { useState } from 'react';
import { api } from '../lib/api';
import { Icons } from './Icons';

const btn = 'p-2 hover:bg-indigo-500 hover:text-white text-slate-500 dark:text-slate-300';

/** دکمه‌های جابجایی (روی موبایل که کشیدن و رها کردن در دسترس نیست) */
export default function SortControls({ type, id, onSort, name = '' }) {
    const [busy, setBusy] = useState(false);
    const handle = async (dir) => { if (busy) return; setBusy(true); await api('update_sort', { type, id, direction: dir }); setBusy(false); onSort(); };
    return (
        <div className={`flex ${busy ? 'opacity-50 pointer-events-none' : ''} glass-soft rounded-lg overflow-hidden border`} dir="ltr" role="group" aria-label={`جابجایی ${name}`}>
            <button type="button" onClick={() => handle('top')} className={btn} aria-label="انتقال به ابتدای لیست" title="ابتدای لیست"><Icons.Top /></button>
            <button type="button" onClick={() => handle('up')} className={`${btn} border-l border-r border-violet-200/60 dark:border-white/10`} aria-label="یک خانه بالاتر" title="بالاتر"><Icons.Up /></button>
            <button type="button" onClick={() => handle('down')} className={`${btn} border-l border-violet-200/60 dark:border-white/10`} aria-label="یک خانه پایین‌تر" title="پایین‌تر"><Icons.Down /></button>
            <button type="button" onClick={() => handle('bottom')} className={btn} aria-label="انتقال به انتهای لیست" title="انتهای لیست"><Icons.Bottom /></button>
        </div>
    );
}
