import React, { useState } from 'react';
import { toPersianNum } from '../lib/utils';

/** نمایش میانگین امتیاز (فقط اگر رای وجود داشته باشد) */
export function RatingBadge({ score, count }) {
    const c = Number(count) || 0;
    if (!c) return null;
    return (
        <span className="inline-flex items-center gap-0.5 text-xs font-semibold text-amber-600 dark:text-amber-400" title={`میانگین ${score} از ${c} رای`}>
            ★ {toPersianNum(Number(score).toFixed(1))} <span className="text-slate-500 dark:text-slate-400 font-normal">({toPersianNum(c)})</span>
        </span>
    );
}

/** ورودی امتیاز ۱ تا ۵ (کلیک دوباره روی همان ستاره = حذف امتیاز) */
export function StarInput({ value = 0, onChange, label = 'امتیاز', disabled = false }) {
    const [hover, setHover] = useState(0);
    const v = hover || Number(value) || 0;
    return (
        <span className="inline-flex" role="radiogroup" aria-label={label} onMouseLeave={() => setHover(0)}>
            {[1, 2, 3, 4, 5].map(n => (
                <button key={n} type="button" disabled={disabled} role="radio" aria-checked={Number(value) === n} aria-label={`${n} ستاره`}
                    onMouseEnter={() => setHover(n)} onClick={() => onChange(Number(value) === n ? 0 : n)}
                    className={`text-2xl leading-none px-0.5 transition-transform hover:scale-110 disabled:opacity-50 ${n <= v ? 'text-amber-400' : 'text-slate-300 dark:text-slate-600'}`}>★</button>
            ))}
        </span>
    );
}
