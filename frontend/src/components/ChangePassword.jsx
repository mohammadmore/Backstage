import React, { useState } from 'react';
import { api } from '../lib/api';
import { Icons } from './Icons';

export const MIN_PASSWORD_LENGTH = 8;

/**
 * فرم تغییر رمز.
 * forced=true: صفحه کامل برای کاربری که رمزش ضعیف/موقت است (تا تغییر رمز، به سیستم دسترسی ندارد)
 * forced=false: پنجره شناور که کاربر خودش باز می‌کند
 */
export default function ChangePassword({ user, forced = false, onDone, onCancel, onLogout }) {
    const [form, setForm] = useState({ current: '', next: '', repeat: '' });
    const [busy, setBusy] = useState(false);

    const submit = async (e) => {
        e.preventDefault();
        if (!form.current) return alert('رمز عبور فعلی را وارد کنید.');
        if (form.next.length < MIN_PASSWORD_LENGTH) return alert(`رمز عبور جدید باید حداقل ${MIN_PASSWORD_LENGTH} کاراکتر باشد.`);
        if (form.next !== form.repeat) return alert('تکرار رمز عبور جدید مطابقت ندارد.');
        setBusy(true);
        const res = await api('change_password', { current_password: form.current, new_password: form.next });
        setBusy(false);
        if (res && res.success) {
            alert('رمز عبور با موفقیت تغییر کرد. نشست‌های باز شما روی دستگاه‌های دیگر بسته شد.');
            onDone(res.user);
        }
    };

    const inputCls = 'w-full border-2 border-slate-200 dark:border-slate-600 p-4 rounded-2xl bg-slate-50 dark:bg-slate-700 text-center font-bold outline-none focus:border-indigo-500 dark:text-white transition-colors';
    const card = (
        <div className="bg-white dark:bg-slate-800 p-8 sm:p-10 rounded-[2.5rem] shadow-2xl w-full max-w-md text-center fade-in border-t-8 border-amber-500">
            <div className="w-16 h-16 bg-amber-50 dark:bg-amber-900/30 text-amber-600 rounded-full flex items-center justify-center mx-auto mb-4"><Icons.Alert /></div>
            <h2 className="text-2xl font-black mb-3 text-slate-800 dark:text-white">{forced ? 'تغییر رمز عبور الزامی است' : 'تغییر رمز عبور'}</h2>
            {forced && <p className="text-sm font-bold text-slate-500 dark:text-slate-400 mb-6 leading-relaxed">رمز فعلی شما ضعیف یا موقت است. برای ادامه، یک رمز جدید و قوی انتخاب کنید.</p>}
            <form onSubmit={submit} className="space-y-3 mt-4">
                <input type="text" name="username" autoComplete="username" value={user.username} readOnly hidden />
                <input type="password" autoComplete="current-password" placeholder="رمز عبور فعلی" value={form.current} onChange={e => setForm({ ...form, current: e.target.value })} className={inputCls} dir="ltr" />
                <input type="password" autoComplete="new-password" placeholder={`رمز جدید (حداقل ${MIN_PASSWORD_LENGTH} کاراکتر)`} value={form.next} onChange={e => setForm({ ...form, next: e.target.value })} className={inputCls} dir="ltr" />
                <input type="password" autoComplete="new-password" placeholder="تکرار رمز جدید" value={form.repeat} onChange={e => setForm({ ...form, repeat: e.target.value })} className={inputCls} dir="ltr" />
                <p className="text-xs text-slate-400 font-bold leading-relaxed pt-1">رمزهای رایج (مثل 12345678)، دنباله‌های ساده و رمزهای شامل نام کاربری پذیرفته نمی‌شوند.</p>
                <button type="submit" disabled={busy} className="w-full bg-indigo-600 text-white p-4 rounded-2xl font-black text-lg hover:bg-indigo-700 disabled:opacity-60 mt-4">{busy ? 'در حال ذخیره...' : 'ذخیره رمز جدید'}</button>
                {forced
                    ? <button type="button" onClick={onLogout} className="w-full text-slate-500 dark:text-slate-400 font-bold py-2">خروج</button>
                    : <button type="button" onClick={onCancel} className="w-full text-slate-500 dark:text-slate-400 font-bold py-2">انصراف</button>}
            </form>
        </div>
    );

    if (forced) return <div className="flex items-center justify-center min-h-screen bg-slate-900 px-4">{card}</div>;
    return <div className="fixed inset-0 z-[300] bg-slate-900/80 backdrop-blur-sm flex items-center justify-center p-4">{card}</div>;
}
