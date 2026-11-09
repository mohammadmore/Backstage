import React, { useState, useEffect } from 'react';
import { toPersianNum, g2j, j2g, jalaliMonthLength, JALALI_MONTHS, parseDate, toInputDateTime } from '../lib/utils';

const selCls = 'glass-soft border p-2 rounded-lg dark:text-white outline-none font-bold text-sm text-center cursor-pointer';

/**
 * انتخابگر تاریخ و ساعت شمسی.
 * - تا زمانی که سال/ماه/روز کامل انتخاب نشده، مقداری ارسال نمی‌شود (قبلاً تاریخ پیش‌فرض ۱۴۰۳ نمایش داده می‌شد ولی ذخیره نمی‌شد)
 * - تعداد روزهای هر ماه (و اسفند کبیسه) درست محاسبه می‌شود
 */
export default function JalaliDatePicker({ value, onChange }) {
  const [parts, setParts] = useState({ y: '', m: '', d: '', h: 0, mn: 0 });

  useEffect(() => {
    const dt = parseDate(value);
    if (dt) {
      const [y, m, d] = g2j(dt.getFullYear(), dt.getMonth() + 1, dt.getDate());
      setParts({ y, m, d, h: dt.getHours(), mn: dt.getMinutes() });
    } else if (!value) {
      setParts((p) => (p.y && p.m && p.d ? { y: '', m: '', d: '', h: 0, mn: 0 } : p));
    }
  }, [value]);

  const now = new Date();
  const [currentJY] = g2j(now.getFullYear(), now.getMonth() + 1, now.getDate());
  const years = [];
  for (let y = currentJY - 1; y <= currentJY + 10; y++) years.push(y);
  if (parts.y && !years.includes(parts.y)) years.unshift(parts.y);

  const update = (key, raw) => {
    const next = { ...parts, [key]: raw === '' ? '' : parseInt(raw, 10) };
    if (next.y && next.m && next.d) {
      const maxDay = jalaliMonthLength(next.y, next.m);
      if (next.d > maxDay) next.d = maxDay;
    }
    setParts(next);
    if (next.y && next.m && next.d) {
      const [gy, gm, gd] = j2g(next.y, next.m, next.d);
      onChange(toInputDateTime(new Date(gy, gm - 1, gd, next.h || 0, next.mn || 0)));
    }
  };

  const dayCount = parts.y && parts.m ? jalaliMonthLength(parts.y, parts.m) : 31;

  return (
    <div className="glass flex flex-wrap gap-2 p-2.5 rounded-xl border" dir="ltr">
      <select aria-label="سال" value={parts.y} onChange={(e) => update('y', e.target.value)} className={`flex-1 min-w-[70px] ${selCls}`}>
        <option value="">سال</option>
        {years.map((y) => <option key={y} value={y}>{toPersianNum(y)}</option>)}
      </select>
      <select aria-label="ماه" value={parts.m} onChange={(e) => update('m', e.target.value)} className={`flex-1 min-w-[90px] ${selCls}`} dir="rtl">
        <option value="">ماه</option>
        {JALALI_MONTHS.map((m, i) => <option key={i} value={i + 1}>{m}</option>)}
      </select>
      <select aria-label="روز" value={parts.d} onChange={(e) => update('d', e.target.value)} className={`flex-1 min-w-[60px] ${selCls}`}>
        <option value="">روز</option>
        {[...Array(dayCount)].map((_, i) => <option key={i} value={i + 1}>{toPersianNum(i + 1)}</option>)}
      </select>
      <span className="font-bold text-slate-300 dark:text-slate-600 self-center hidden sm:inline">|</span>
      <select aria-label="ساعت" value={parts.h} onChange={(e) => update('h', e.target.value)} className={`w-16 ${selCls}`}>
        {[...Array(24)].map((_, i) => <option key={i} value={i}>{toPersianNum(String(i).padStart(2, '0'))}</option>)}
      </select>
      <span className="font-bold text-slate-800 dark:text-slate-300 self-center">:</span>
      <select aria-label="دقیقه" value={parts.mn} onChange={(e) => update('mn', e.target.value)} className={`w-16 ${selCls}`}>
        {[...Array(60)].map((_, i) => <option key={i} value={i}>{toPersianNum(String(i).padStart(2, '0'))}</option>)}
      </select>
    </div>
  );
}
