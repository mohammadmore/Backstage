import React, { useState } from 'react';
import { api } from '../lib/api';
import { toast, formDialog } from '../lib/ui';
import QrImage from './QrImage';

/**
 * فعال/غیرفعال کردن ورود دومرحله‌ای برای کاربر جاری.
 * forced=true: صفحه کامل وقتی مدیر سیستم آن را برای نقش کاربر الزامی کرده است.
 */
export default function SecurityModal({ user, onDone, onClose, forced = false, onLogout }) {
    const [setup, setSetup] = useState(null);   // {secret, uri}
    const [code, setCode] = useState('');
    const [codes, setCodes] = useState(null);   // کدهای پشتیبان پس از فعال‌سازی
    const [busy, setBusy] = useState(false);

    const begin = async () => { setBusy(true); const r = await api('twofa_setup_begin', {}); setBusy(false); if (r) setSetup(r); };
    const confirm = async (e) => {
        e.preventDefault();
        setBusy(true);
        const r = await api('twofa_setup_confirm', { code });
        setBusy(false);
        if (r) { setCodes(r.backup_codes); toast('ورود دومرحله‌ای فعال شد.'); onDone && onDone(r.user, true); }
    };
    const disable = async () => {
        const v = await formDialog({ title: 'غیرفعال کردن ورود دومرحله‌ای', message: 'برای تایید، رمز عبور فعلی را وارد کنید.', fields: [{ name: 'password', label: 'رمز عبور', type: 'password', required: true }], confirmText: 'غیرفعال کن', danger: true });
        if (!v) return;
        const r = await api('twofa_disable', { password: v.password });
        if (r) { toast('ورود دومرحله‌ای غیرفعال شد.'); onDone && onDone(r.user); onClose && onClose(); }
    };

    const body = (
        <div className="glass-strong grad-top p-6 sm:p-8 rounded-3xl w-full max-w-md shadow-xl text-right">
            <h2 className="text-xl font-bold text-slate-800 dark:text-white mb-2">ورود دومرحله‌ای</h2>
            {codes ? (
                <>
                    <p className="text-sm text-slate-600 dark:text-slate-300 leading-relaxed mb-4">این ۸ کد پشتیبان را در جای امن یادداشت کنید. اگر به گوشی دسترسی نداشتید، با هرکدام یک بار می‌توانید وارد شوید.</p>
                    <div className="grid grid-cols-2 gap-2 font-mono text-sm mb-5" dir="ltr">{codes.map(c => <span key={c} className="glass-soft border rounded-lg px-3 py-2 text-center">{c}</span>)}</div>
                    <button type="button" onClick={() => { navigator.clipboard && navigator.clipboard.writeText(codes.join('\n')); toast('کدها کپی شد.'); }} className="w-full mb-2 py-2.5 rounded-xl glass-soft border font-semibold">کپی کدها</button>
                    <button type="button" onClick={onClose} className="w-full py-3 rounded-xl btn-grad font-bold">تمام</button>
                </>
            ) : setup ? (
                <form onSubmit={confirm}>
                    <p className="text-sm text-slate-600 dark:text-slate-300 leading-relaxed mb-3">با برنامه Google Authenticator یا Microsoft Authenticator (یا مشابه) این کد را اسکن کنید، سپس کد ۶ رقمی نمایش‌داده‌شده را وارد کنید.</p>
                    <div className="flex justify-center mb-3"><span className="bg-white p-2 rounded-xl"><QrImage text={setup.uri} size={180} alt="کد QR فعال‌سازی" /></span></div>
                    <p className="text-xs text-center text-slate-500 dark:text-slate-400 mb-4">یا کلید را دستی وارد کنید: <b className="font-mono select-all" dir="ltr">{setup.secret}</b></p>
                    <label className="block mb-4"><span className="sr-only">کد ۶ رقمی</span>
                        <input autoFocus inputMode="numeric" autoComplete="one-time-code" maxLength={6} value={code} onChange={e => setCode(e.target.value.replace(/[^\d۰-۹]/g, ''))} placeholder="کد ۶ رقمی" className="w-full glass-field border-2 p-3.5 rounded-2xl text-center text-2xl tracking-[0.5em] font-bold" dir="ltr" />
                    </label>
                    <button type="submit" disabled={busy || code.length < 6} className="w-full py-3 rounded-xl btn-grad font-bold disabled:opacity-50">فعال‌سازی</button>
                </form>
            ) : (
                <>
                    <p className="text-sm text-slate-600 dark:text-slate-300 leading-relaxed mb-5">
                        {forced ? 'مدیر سیستم ورود دومرحله‌ای را برای نقش شما الزامی کرده است. برای ادامه آن را فعال کنید.' : 'با فعال‌سازی، علاوه بر رمز عبور، یک کد ۶ رقمی از برنامه احراز هویت گوشی شما هم لازم می‌شود. حتی اگر رمز شما لو برود، حساب امن می‌ماند.'}
                    </p>
                    {user.totp_enabled ? (
                        <>
                            <p className="text-sm font-semibold text-emerald-700 dark:text-emerald-400 mb-4">✓ ورود دومرحله‌ای برای حساب شما فعال است.</p>
                            {!forced && <button type="button" onClick={disable} className="w-full py-3 rounded-xl border border-red-300 text-red-600 font-semibold hover:bg-red-50 dark:hover:bg-red-900/20">غیرفعال کردن</button>}
                        </>
                    ) : <button type="button" disabled={busy} onClick={begin} className="w-full py-3 rounded-xl btn-grad font-bold">شروع فعال‌سازی</button>}
                </>
            )}
            {!codes && (forced
                ? <button type="button" onClick={onLogout} className="w-full mt-3 py-2 text-sm text-slate-500 font-semibold">خروج</button>
                : <button type="button" onClick={onClose} className="w-full mt-3 py-2 text-sm text-slate-500 font-semibold">بستن</button>)}
        </div>
    );
    if (forced) return <div className="min-h-screen flex items-center justify-center p-4">{body}</div>;
    return <div className="fixed inset-0 z-[300] glass-overlay flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-label="ورود دومرحله‌ای">{body}</div>;
}
