import React, { useState, useEffect } from 'react';
import { toEnDigits, toPersianNum } from '../lib/utils';

/** فقط ارقام (با پذیرش ارقام فارسی/عربی) و در صورت نیاز یک ممیز */
const clean = (raw, decimal) => {
  let s = toEnDigits(raw).replace(decimal ? /[^\d.]/g : /\D/g, '');
  if (decimal) { const i = s.indexOf('.'); if (i !== -1) s = s.slice(0, i + 1) + s.slice(i + 1).replace(/\./g, ''); }
  return s.replace(/^0+(?=\d)/, '');
};

/** نمایش: ارقام فارسی و (برای مبالغ) جداکننده هزارگان */
const display = (v, money) => {
  if (v === null || v === undefined || v === '') return '';
  let s = String(v);
  if (money) {
    const [int, frac] = s.split('.');
    s = int.replace(/\B(?=(\d{3})+(?!\d))/g, ',') + (frac !== undefined ? '.' + frac : '');
  }
  return toPersianNum(s).replace(/,/g, '٬').replace(/\./g, '٫');
};

/** مقدار ذخیره‌شده دیتابیس (مثلاً "1500000.00") => رشته تمیز */
const fromDb = (v, decimal) => {
  if (v === null || v === undefined || v === '') return '';
  const n = Number(v);
  if (isNaN(n)) return '';
  return decimal ? String(n) : String(Math.trunc(n));
};

/**
 * ورودی عددی کنترل‌شده. با صفحه‌کلید فارسی کار می‌کند، ارقام را فارسی نمایش می‌دهد
 * و در حالت money جداکننده هزارگان دارد. مقدار خروجی همیشه رشته انگلیسی تمیز است.
 */
export function NumInput({ value, onChange, decimal = false, money = false, inputRef, className = '', ...rest }) {
  const dec = decimal || money;
  return (
    <input
      ref={inputRef}
      type="text"
      inputMode={dec ? 'decimal' : 'numeric'}
      autoComplete="off"
      value={display(value, money)}
      onChange={(e) => onChange(clean(e.target.value, dec))}
      className={className}
      {...rest}
    />
  );
}

/**
 * ورودی عددی که هنگام خروج از فیلد (یا Enter) ذخیره می‌شود و وضعیت ذخیره را نشان می‌دهد.
 * onCommit باید Promise برگرداند (truthy = موفق).
 */
export function CommitNumInput({ value, onCommit, decimal = false, money = false, className = '', label, ...rest }) {
  const dec = decimal || money;
  const [local, setLocal] = useState(fromDb(value, dec));
  const [status, setStatus] = useState(''); // saving | saved | error
  useEffect(() => { setLocal(fromDb(value, dec)); }, [value]);
  useEffect(() => { if (status === 'saved') { const t = setTimeout(() => setStatus(''), 1800); return () => clearTimeout(t); } }, [status]);

  const commit = async () => {
    if (local === fromDb(value, dec)) return;
    setStatus('saving');
    const ok = await onCommit(local);
    setStatus(ok ? 'saved' : 'error');
    if (!ok) setLocal(fromDb(value, dec));
  };
  return (
    <span className="relative block">
      <input
        type="text"
        inputMode={dec ? 'decimal' : 'numeric'}
        autoComplete="off"
        aria-label={label}
        value={display(local, money)}
        onChange={(e) => { setLocal(clean(e.target.value, dec)); setStatus(''); }}
        onBlur={commit}
        onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur(); if (e.key === 'Escape') { setLocal(fromDb(value, dec)); } }}
        className={className}
        {...rest}
      />
      {status && (
        <span className={`absolute -top-2 -left-2 text-[10px] font-bold px-1.5 py-0.5 rounded-md shadow ${status === 'saving' ? 'bg-slate-500 text-white' : status === 'saved' ? 'bg-emerald-500 text-white' : 'bg-red-500 text-white'}`} role="status">
          {status === 'saving' ? '...' : status === 'saved' ? '✓ ذخیره شد' : 'خطا'}
        </span>
      )}
    </span>
  );
}
