import React, { useState, useEffect } from 'react';
import { toPersianNum, isOn, safeJson } from '../lib/utils';
import ImageUploader from '../components/ImageUploader';
import SkillInput from '../components/SkillInput';
import { toast, confirmDialog } from '../lib/ui';
import { api } from '../lib/api';
import { NumInput } from '../components/NumInput';

export default function StaffForm({ onSave, editItem, mdStaff }) {
    const [form, setForm] = useState({ full_name: '', username: '', password: '', phone: '', phone2: '', is_shadow: false, can_delegate: false, iban: '', skillInput: '', skills: [], avatar: '' });
    const empty = { full_name: '', username: '', password: '', phone: '', phone2: '', is_shadow: false, can_delegate: false, iban: '', skillInput: '', skills: [], avatar: '', role: 'staff', default_fee: '' };
    useEffect(() => {
        if(editItem) {
            setForm({ ...empty, full_name: editItem.full_name || '', username: editItem.username || '', phone: editItem.phone || '', phone2: editItem.phone2 || '', iban: editItem.iban || '', avatar: editItem.avatar || '', is_shadow: isOn(editItem.is_shadow), can_delegate: isOn(editItem.can_delegate), skills: safeJson(editItem.skills, []), role: editItem.role || 'staff', default_fee: editItem.default_fee != null ? String(Math.trunc(Number(editItem.default_fee))) : '' });
        } else setForm(empty);
    }, [editItem]);
    const addSkill = () => { const v = form.skillInput.trim(); if(!v) return; setForm({...form, skills: form.skills.includes(v) ? form.skills : [...form.skills, v], skillInput: ''}); };
    const submit = () => {
        if(!form.full_name.trim()) return toast("نام الزامی است.", "warning");
        const wasShadow = editItem && isOn(editItem.is_shadow);
        if(!form.is_shadow) {
            if(!form.username.trim()) return toast("کاربران فعال به نام کاربری نیاز دارند.", "warning");
            if((!editItem || wasShadow) && !form.password) return toast(wasShadow ? "برای فعال کردن کاربر خاموش، رمز عبور تعیین کنید." : "رمز عبور الزامی است.", "warning");
        }
        if(form.password && form.password.length < 8) return toast("رمز عبور باید حداقل ۸ کاراکتر باشد.", "warning");
        const pending = form.skillInput.trim();
        const skills = pending && !form.skills.includes(pending) ? [...form.skills, pending] : form.skills;
        const { skillInput, ...payload } = form;
        onSave('staff', { ...payload, skills }, editItem ? editItem.id : null);
    };
    return (
        <div className="space-y-4 fade-in">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <label className="block text-sm text-slate-700 dark:text-slate-300">نقش کاربر
                    <select value={form.role} onChange={e => setForm({ ...form, role: e.target.value, ...(e.target.value !== 'staff' ? { is_shadow: false } : {}) })} className="mt-1 w-full glass-field border-2 p-3 rounded-xl font-semibold">
                        <option value="staff">کارمند (فقط وظایف خودش)</option>
                        <option value="manager">مدیر پروژه (رویدادهای سپرده‌شده)</option>
                        <option value="accountant">حسابدار (بخش مالی همه رویدادها)</option>
                    </select>
                </label>
                <label className="block text-sm text-slate-700 dark:text-slate-300">دستمزد پیش‌فرض هر رویداد (تومان)
                    <NumInput money value={form.default_fee} onChange={v => setForm({ ...form, default_fee: v })} placeholder="اختیاری" className="mt-1 w-full glass-field border-2 p-3 rounded-xl" dir="ltr" />
                </label>
            </div>
            {editItem && isOn(editItem.totp_enabled) && (
                <div className="glass-soft border rounded-xl p-3 flex flex-wrap items-center justify-between gap-2 text-sm">
                    <span className="text-emerald-700 dark:text-emerald-400">✓ ورود دومرحله‌ای فعال است</span>
                    <button type="button" onClick={async () => { if (await confirmDialog({ title: 'بازنشانی ورود دومرحله‌ای', message: `اگر «${editItem.full_name}» گوشی‌اش را گم کرده، ورود دومرحله‌ای او غیرفعال می‌شود و باید دوباره فعال کند.`, confirmText: 'بازنشانی', danger: true }) && await api('twofa_reset_user', { user_id: editItem.id })) toast('ورود دومرحله‌ای کاربر بازنشانی شد.'); }} className="text-red-600 font-semibold">بازنشانی</button>
                </div>
            )}
            <ImageUploader value={form.avatar} onChange={(b64)=>setForm({...form, avatar: b64})} type="avatar" placeholder="عکس پروفایل" />
            <input aria-label="نام و نام خانوادگی" type="text" placeholder="نام و نام خانوادگی *" value={form.full_name} onChange={(e) => setForm({...form, full_name: e.target.value})} className="w-full border-2 dark:border-white/10 p-3 rounded-xl outline-none focus:border-indigo-500 font-bold dark:text-white" />
            <div className="grid grid-cols-2 gap-4">
                <label className="glass-soft flex items-center gap-3 p-3 border-2 rounded-xl cursor-pointer">
                    <input type="checkbox" checked={form.is_shadow} onChange={(e) => setForm({...form, is_shadow: e.target.checked})} className="w-5 h-5 accent-indigo-600" />
                    <div><div className="font-semibold text-sm text-slate-700 dark:text-slate-200">کاربر خاموش</div></div>
                </label>
                <label className="flex items-center gap-3 p-3 border-2 border-blue-200 dark:border-blue-900 rounded-xl bg-blue-50 dark:bg-slate-800 cursor-pointer">
                    <input type="checkbox" checked={form.can_delegate} onChange={(e) => setForm({...form, can_delegate: e.target.checked})} className="w-5 h-5 accent-blue-600" />
                    <div><div className="font-semibold text-sm text-blue-800 dark:text-blue-300">مجوز واگذاری</div></div>
                </label>
            </div>
            {!form.is_shadow && ( <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 dark:bg-slate-800 p-4 rounded-xl border border-indigo-100 dark:border-white/10 bg-grad-soft"> <input aria-label="نام کاربری" type="text" placeholder="نام کاربری *" value={form.username} onChange={(e) => setForm({...form, username: e.target.value})} className="w-full border-2 dark:border-white/10 p-3 rounded-xl outline-none dark:text-white" dir="ltr" /> <input aria-label={editItem && !isOn(editItem.is_shadow) ? "رمز موقت جدید (خالی=بدون تغییر)" : "رمز موقت * (حداقل ۸ کاراکتر)"} type="text" placeholder={editItem && !isOn(editItem.is_shadow) ? "رمز موقت جدید (خالی=بدون تغییر)" : "رمز موقت * (حداقل ۸ کاراکتر)"} value={form.password} onChange={(e) => setForm({...form, password: e.target.value})} autoComplete="new-password" className="w-full border-2 dark:border-white/10 p-3 rounded-xl outline-none dark:text-white" dir="ltr" /> </div> )}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4"> <input aria-label="شماره موبایل" type="text" placeholder="شماره موبایل" value={form.phone} onChange={(e) => setForm({...form, phone: e.target.value})} className="w-full border-2 dark:border-white/10 p-3 rounded-xl outline-none dark:text-white" dir="ltr" /> <input aria-label="شماره تماس ۲" type="text" placeholder="شماره تماس ۲" value={form.phone2} onChange={(e) => setForm({...form, phone2: e.target.value})} className="w-full border-2 dark:border-white/10 p-3 rounded-xl outline-none dark:text-white" dir="ltr" /> </div>
            <input aria-label="شماره شبا بانکی" type="text" placeholder="شماره شبا بانکی" value={form.iban} onChange={(e) => setForm({...form, iban: e.target.value})} className="w-full border-2 dark:border-white/10 p-3 rounded-xl outline-none dark:text-white" dir="ltr" />
            <div className="glass-soft p-4 rounded-xl border">
                <p className="font-semibold text-sm mb-2 dark:text-slate-300">تخصص‌ها:</p>
                <div className="flex flex-wrap gap-2 mb-3"> {form.skills.map((s, i) => <span key={i} className="bg-grad text-white text-xs px-3 py-1.5 rounded-full flex items-center gap-2">{toPersianNum(s)} <button aria-label="حذف" onClick={() => setForm({...form, skills: form.skills.filter((_,idx) => idx !== i)})} className="hover:text-red-300">✕</button></span>)} </div>
                <div className="flex flex-col sm:flex-row gap-2"> <SkillInput value={form.skillInput} onChange={val => setForm({...form, skillInput: val})} onAdd={addSkill} mdStaff={mdStaff} /> <button type="button" onClick={addSkill} className="btn-grad w-full sm:w-auto text-white px-5 py-2.5 rounded-lg text-sm font-semibold">افزودن</button> </div>
            </div>
            <button onClick={submit} className={`w-full text-white py-4 rounded-xl font-bold text-lg shadow-sm ${editItem ? 'bg-blue-600' : 'bg-green-600'}`}>{editItem ? 'ذخیره' : 'ثبت'}</button>
        </div>
    );
}
