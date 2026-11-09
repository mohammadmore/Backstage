import React, { useState } from 'react';
import { api } from '../lib/api';
import { Icons } from './Icons';
import { toast } from '../lib/ui';

export const MIN_PASSWORD_LENGTH = 8;

/**
 * فرم تغییر رمز.
 * forced=true: صفحه کامل برای کاربری که رمزش ضعیف/موقت است (تا تغییر رمز، به سیستم دسترسی ندارد)
 * forced=false: پنجره شناور که کاربر خودش باز می‌کند
 */
export default function ChangePassword({ user, forced = false, onDone, onCancel, onLogout }) {
    const [form, setForm] = useState({ current: '', next: '', repeat: '' });
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState('');

    const submit = async (e) => {
        e.preventDefault();
        setError('');
        if (!form.current) return setError('رمز عبور فعلی را وارد کنید.');
        if (form.next.length < MIN_PASSWORD_LENGTH) return setError(`رمز عبور جدید باید حداقل ${MIN_PASSWORD_LENGTH} کاراکتر باشد.`);
        if (form.next !== form.repeat) return setError('تکرار رمز عبور جدید مطابقت ندارد.');
        setBusy(true);
        const res = await api('change_password', { current_password: form.current, new_password: form.next });
        setBusy(false);
        if (res && res.success) {
            toast('رمز عبور تغییر کرد. نشست‌های باز شما روی دستگاه‌های دیگر بسته شد.', 'success', 5000);
            onDone(res.user);
        }
    };

    const inputCls = 'glass-soft w-full border-2 p-4 rounded-2xl text-center font-bold outline-none focus:border-indigo-500 dark:text-white transition-colors';
    const card = (
        <div className="glass p-8 sm:p-10 rounded-[2.5rem] w-full max-w-md text-center fade-in border-t-8 border-amber-500">
            <div className="w-16 h-16 bg-amber-50 dark:bg-amber-900/30 text-amber-600 rounded-full flex items-center justify-center mx-auto mb-4"><Icons.Alert /></div>
            <h2 className="text-2xl font-bold mb-3 text-slate-800 dark:text-white">{forced ? 'تغییر رمز عبور الزامی است' : 'تغییر رمز عبور'}</h2>
            {forced && <p className="text-sm font-semibold text-slate-500 dark:text-slate-400 mb-6 leading-relaxed">رمز فعلی شما ضعیف یا موقت است. برای ادامه، یک رمز جدید و قوی انتخاب کنید.</p>}
            <form onSubmit={submit} className="space-y-3 mt-4">
                <input type="text" name="username" autoComplete="username" value={user.username} readOnly hidden />
                <input aria-label="رمز عبور فعلی" type="password" autoComplete="current-password" placeholder="رمز عبور فعلی" value={form.current} onChange={e => setForm({ ...form, current: e.target.value })} className={inputCls} dir="ltr" />
                <input aria-label="رمز عبور جدید" type="password" autoComplete="new-password" placeholder={`رمز جدید (حداقل ${MIN_PASSWORD_LENGTH} کاراکتر)`} value={form.next} onChange={e => setForm({ ...form, next: e.target.value })} className={inputCls} dir="ltr" />
                <input aria-label="تکرار رمز جدید" type="password" autoComplete="new-password" placeholder="تکرار رمز جدید" value={form.repeat} onChange={e => setForm({ ...form, repeat: e.target.value })} className={inputCls} dir="ltr" />
                {error && <p className="text-sm font-semibold text-red-600" role="alert">{error}</p>}
                <p className="text-xs text-slate-500 dark:text-slate-400 font-medium leading-relaxed pt-1">رمزهای رایج (مثل 12345678)، دنباله‌های ساده و رمزهای شامل نام کاربری پذیرفته نمی‌شوند.</p>
                <button type="submit" disabled={busy} className="btn-grad w-full text-white p-4 rounded-2xl font-bold text-lg disabled:opacity-60 mt-4">{busy ? 'در حال ذخیره...' : 'ذخیره رمز جدید'}</button>
                {forced
                    ? <button type="button" onClick={onLogout} className="w-full text-slate-500 dark:text-slate-400 font-bold py-2">خروج</button>
                    : <button type="button" onClick={onCancel} className="w-full text-slate-500 dark:text-slate-400 font-bold py-2">انصراف</button>}
            </form>
        </div>
    );

    if (forced) return <div className="flex items-center justify-center min-h-screen px-4">{card}</div>;
    return <div className="fixed inset-0 z-[300] glass-overlay flex items-center justify-center p-4">{card}</div>;
}
