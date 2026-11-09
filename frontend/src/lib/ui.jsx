import React, { useState, useEffect, useRef } from 'react';
import { NumInput } from '../components/NumInput';
import JalaliDatePicker from '../components/JalaliDatePicker';

// ---------------------------------------------------------------
// سیستم پیام (Toast)، پنجره تایید و فرم ورودی، و نوار پیشرفت سراسری
// جایگزین alert / confirm / prompt مرورگر
// ---------------------------------------------------------------
let state = { toasts: [], dialogs: [], busy: 0 };
const listeners = new Set();
let seq = 0;
const emit = () => listeners.forEach((l) => l(state));
const set = (patch) => { state = { ...state, ...patch }; emit(); };

/** type: success | error | info | warning */
export function toast(message, type = 'success', ms) {
  const id = ++seq;
  set({ toasts: [...state.toasts, { id, message, type }].slice(-4) });
  setTimeout(() => dismissToast(id), ms ?? (type === 'error' ? 6000 : 3000));
}
export const dismissToast = (id) => set({ toasts: state.toasts.filter((t) => t.id !== id) });

const openDialog = (d) => new Promise((resolve) => {
  const id = ++seq;
  set({ dialogs: [...state.dialogs, { ...d, id, resolve: (v) => { set({ dialogs: state.dialogs.filter((x) => x.id !== id) }); resolve(v); } }] });
});

/** @returns {Promise<boolean>} */
export const confirmDialog = ({ title = 'تایید', message = '', confirmText = 'تایید', cancelText = 'انصراف', danger = false } = {}) =>
  openDialog({ kind: 'confirm', title, message, confirmText, cancelText, danger });

/**
 * فرم چندفیلدی.
 * fields: [{ name, label, type: 'text'|'textarea'|'number'|'money'|'select', required, value, options:[{value,label}], placeholder }]
 * @returns {Promise<object|null>} مقادیر یا null در صورت انصراف
 */
export const formDialog = ({ title, message = '', fields, confirmText = 'ثبت', cancelText = 'انصراف', danger = false }) =>
  openDialog({ kind: 'form', title, message, fields, confirmText, cancelText, danger });

export const busyStart = () => set({ busy: state.busy + 1 });
export const busyEnd = () => set({ busy: Math.max(0, state.busy - 1) });

// ---------------------------------------------------------------
const TOAST_STYLE = {
  success: 'bg-emerald-600 text-white',
  error: 'bg-red-600 text-white',
  warning: 'bg-amber-500 text-amber-950',
  info: 'glass-ink text-white',
};

function Dialog({ d }) {
  const [values, setValues] = useState(() => Object.fromEntries((d.fields || []).map((f) => [f.name, f.value ?? ''])));
  const [error, setError] = useState('');
  const firstRef = useRef(null);
  const okRef = useRef(null);

  useEffect(() => {
    (firstRef.current || okRef.current)?.focus();
    const onKey = (e) => { if (e.key === 'Escape') { e.preventDefault(); d.resolve(d.kind === 'confirm' ? false : null); } };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const submit = (e) => {
    e && e.preventDefault();
    if (d.kind === 'confirm') return d.resolve(true);
    for (const f of d.fields) {
      if (f.required && f.type !== 'checkbox' && !String(values[f.name] ?? '').trim()) { setError(`«${f.label}» الزامی است.`); return; }
    }
    const out = {};
    d.fields.forEach((f) => { out[f.name] = typeof values[f.name] === 'string' && !['money', 'number', 'datetime', 'date'].includes(f.type) ? values[f.name].trim() : (f.type === 'date' && values[f.name] ? String(values[f.name]).slice(0, 10) : values[f.name]); });
    d.resolve(out);
  };
  const cancel = () => d.resolve(d.kind === 'confirm' ? false : null);
  const inputCls = 'glass w-full border-2 p-3 rounded-xl dark:text-white focus:border-indigo-500';

  return (
    <div className="fixed inset-0 z-[400] glass-overlay flex items-end sm:items-center justify-center sm:p-4 fade-in" onMouseDown={(e) => { if (e.target === e.currentTarget) cancel(); }}>
      <form onSubmit={submit} role="dialog" aria-modal="true" aria-labelledby={`dlg-${d.id}`} className="glass-strong w-full sm:max-w-md rounded-t-3xl sm:rounded-3xl p-6 sm:p-7">
        <h3 id={`dlg-${d.id}`} className="text-lg font-bold text-slate-800 dark:text-white mb-2">{d.title}</h3>
        {d.message && <p className="text-sm text-slate-600 dark:text-slate-300 leading-relaxed whitespace-pre-line mb-4">{d.message}</p>}
        {d.kind === 'form' && (
          <div className="space-y-3 mb-2">
            {d.fields.map((f, i) => (
              <label key={f.name} className="block">
                <span className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1.5">{f.label}{f.required && <span className="text-red-500"> *</span>}</span>
                {f.type === 'datetime' || f.type === 'date' ? (
                  <JalaliDatePicker dateOnly={f.type === 'date'} clearable={!f.required} value={values[f.name]} onChange={(v) => setValues((cur) => ({ ...cur, [f.name]: v }))} />
                ) : f.type === 'checkbox' ? (
                  <span className="flex items-center gap-2 text-sm"><input type="checkbox" checked={!!values[f.name]} onChange={(e) => setValues({ ...values, [f.name]: e.target.checked })} className="w-5 h-5 accent-violet-600" /> {f.hint}</span>
                ) : f.type === 'textarea' ? (
                  <textarea aria-label={f.placeholder} ref={i === 0 ? firstRef : null} rows={3} value={values[f.name]} placeholder={f.placeholder} onChange={(e) => setValues({ ...values, [f.name]: e.target.value })} className={inputCls} />
                ) : f.type === 'select' ? (
                  <select ref={i === 0 ? firstRef : null} value={values[f.name]} onChange={(e) => setValues({ ...values, [f.name]: e.target.value })} className={inputCls}>
                    {f.options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                  </select>
                ) : f.type === 'money' || f.type === 'number' ? (
                  <NumInput inputRef={i === 0 ? firstRef : null} money={f.type === 'money'} value={values[f.name]} placeholder={f.placeholder} onChange={(v) => setValues({ ...values, [f.name]: v })} className={inputCls} dir="ltr" />
                ) : (
                  <input aria-label={f.placeholder} ref={i === 0 ? firstRef : null} type={f.type === 'password' ? 'password' : 'text'} autoComplete={f.type === 'password' ? 'current-password' : undefined} value={values[f.name]} placeholder={f.placeholder} onChange={(e) => setValues({ ...values, [f.name]: e.target.value })} className={inputCls} />
                )}
              </label>
            ))}
          </div>
        )}
        {error && <p className="text-sm font-semibold text-red-600 mb-2" role="alert">{error}</p>}
        <div className="flex gap-3 mt-5">
          <button type="button" onClick={cancel} className="glass-soft flex-1 py-3 rounded-xl font-semibold text-slate-700 dark:text-slate-200 hover:bg-white/60 dark:hover:bg-white/10">{d.cancelText}</button>
          <button ref={okRef} type="submit" className={`flex-1 py-3 rounded-xl font-bold text-white ${d.danger ? 'bg-red-600 hover:bg-red-700' : 'bg-grad'}`}>{d.confirmText}</button>
        </div>
      </form>
    </div>
  );
}

export function UIHost() {
  const [s, setS] = useState(state);
  const [online, setOnline] = useState(navigator.onLine);
  useEffect(() => { listeners.add(setS); return () => listeners.delete(setS); }, []);
  useEffect(() => {
    const on = () => { setOnline(true); toast('اتصال اینترنت برقرار شد.', 'success'); };
    const off = () => setOnline(false);
    window.addEventListener('online', on); window.addEventListener('offline', off);
    return () => { window.removeEventListener('online', on); window.removeEventListener('offline', off); };
  }, []);
  return (
    <>
      {!online && (
        <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-[460] glass-ink rounded-full px-4 py-2 text-xs font-semibold shadow-lg" role="status">
          ⚠ آفلاین هستید — آخرین اطلاعات ذخیره‌شده نمایش داده می‌شود و تغییرات تا اتصال مجدد ارسال نمی‌شوند.
        </div>
      )}
      {/* نوار پیشرفت سراسری هنگام ذخیره */}
      <div className={`fixed top-0 inset-x-0 h-1 z-[500] pointer-events-none transition-opacity ${s.busy ? 'opacity-100' : 'opacity-0'}`} aria-hidden="true">
        <div className="h-full bg-indigo-400 busy-bar" />
      </div>
      {s.busy > 0 && <span className="sr-only" role="status">در حال ذخیره...</span>}
      <div className="fixed bottom-4 inset-x-4 sm:inset-x-auto sm:left-4 sm:w-96 z-[450] space-y-2 pointer-events-none" aria-live="polite">
        {s.toasts.map((t) => (
          <div key={t.id} role={t.type === 'error' ? 'alert' : 'status'} className={`pointer-events-auto flex items-start gap-3 px-4 py-3 rounded-2xl shadow-sm text-sm font-semibold leading-relaxed slide-up ${TOAST_STYLE[t.type] || TOAST_STYLE.info}`}>
            <span className="flex-1">{t.message}</span>
            <button type="button" onClick={() => dismissToast(t.id)} aria-label="بستن پیام" className="opacity-80 hover:opacity-100">✕</button>
          </div>
        ))}
      </div>
      {s.dialogs.map((d) => <Dialog key={d.id} d={d} />)}
    </>
  );
}
