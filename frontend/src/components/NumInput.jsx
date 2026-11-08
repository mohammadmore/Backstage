import React, { useState, useEffect } from 'react';
import { toEnDigits } from '../lib/utils';

/** فقط ارقام (با پذیرش ارقام فارسی/عربی) و در صورت نیاز یک ممیز */
const clean = (raw, decimal) => {
  let s = toEnDigits(raw).replace(decimal ? /[^\d.]/g : /\D/g, '');
  if (decimal) { const i = s.indexOf('.'); if (i !== -1) s = s.slice(0, i + 1) + s.slice(i + 1).replace(/\./g, ''); }
  return s;
};

/**
 * ورودی عددی کنترل‌شده. برخلاف type="number"، با صفحه‌کلید فارسی هم کار می‌کند.
 */
export function NumInput({ value, onChange, decimal = false, className = '', ...rest }) {
  return (
    <input
      type="text"
      inputMode={decimal ? 'decimal' : 'numeric'}
      value={value ?? ''}
      onChange={(e) => onChange(clean(e.target.value, decimal))}
      className={className}
      {...rest}
    />
  );
}

/**
 * ورودی عددی که مقدارش را هنگام خروج از فیلد (یا Enter) ثبت می‌کند و
 * با تغییر مقدار از سمت سرور (مثلاً پس از ویرایش تعداد مهمانان) به‌روز می‌شود.
 */
export function CommitNumInput({ value, onCommit, decimal = false, className = '', ...rest }) {
  const norm = (v) => (v === null || v === undefined ? '' : String(decimal ? Number(v) : parseInt(v, 10)));
  const [local, setLocal] = useState(norm(value));
  useEffect(() => { setLocal(norm(value)); }, [value]);
  const commit = () => {
    if (local === norm(value)) return;
    onCommit(local);
  };
  return (
    <input
      type="text"
      inputMode={decimal ? 'decimal' : 'numeric'}
      value={local}
      onChange={(e) => setLocal(clean(e.target.value, decimal))}
      onBlur={commit}
      onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur(); }}
      className={className}
      {...rest}
    />
  );
}
