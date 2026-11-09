import React, { useState, useEffect } from 'react';
import { toPersianNum, isOn, safeJson } from '../lib/utils';
import ImageUploader from '../components/ImageUploader';
import SkillInput from '../components/SkillInput';
import { toast } from '../lib/ui';

export default function StaffForm({ onSave, editItem, mdStaff }) {
    const [form, setForm] = useState({ full_name: '', username: '', password: '', phone: '', phone2: '', is_shadow: false, can_delegate: false, iban: '', skillInput: '', skills: [], avatar: '' });
    const empty = { full_name: '', username: '', password: '', phone: '', phone2: '', is_shadow: false, can_delegate: false, iban: '', skillInput: '', skills: [], avatar: '' };
    useEffect(() => {
        if(editItem) {
            setForm({ ...empty, full_name: editItem.full_name || '', username: editItem.username || '', phone: editItem.phone || '', phone2: editItem.phone2 || '', iban: editItem.iban || '', avatar: editItem.avatar || '', is_shadow: isOn(editItem.is_shadow), can_delegate: isOn(editItem.can_delegate), skills: safeJson(editItem.skills, []) });
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
            <ImageUploader value={form.avatar} onChange={(b64)=>setForm({...form, avatar: b64})} type="avatar" placeholder="عکس پروفایل" />
            <input aria-label="نام و نام خانوادگی" type="text" placeholder="نام و نام خانوادگی *" value={form.full_name} onChange={(e) => setForm({...form, full_name: e.target.value})} className="w-full border-2 dark:border-slate-700 p-3 rounded-xl outline-none focus:border-indigo-500 font-bold dark:bg-slate-800 dark:text-white" />
            <div className="grid grid-cols-2 gap-4">
                <label className="flex items-center gap-3 p-3 border-2 dark:border-slate-700 rounded-xl bg-slate-50 dark:bg-slate-800 cursor-pointer">
                    <input type="checkbox" checked={form.is_shadow} onChange={(e) => setForm({...form, is_shadow: e.target.checked})} className="w-5 h-5 accent-indigo-600" />
                    <div><div className="font-semibold text-sm text-slate-700 dark:text-slate-200">کاربر خاموش</div></div>
                </label>
                <label className="flex items-center gap-3 p-3 border-2 border-blue-200 dark:border-blue-900 rounded-xl bg-blue-50 dark:bg-slate-800 cursor-pointer">
                    <input type="checkbox" checked={form.can_delegate} onChange={(e) => setForm({...form, can_delegate: e.target.checked})} className="w-5 h-5 accent-blue-600" />
                    <div><div className="font-semibold text-sm text-blue-800 dark:text-blue-300">مجوز واگذاری</div></div>
                </label>
            </div>
            {!form.is_shadow && ( <div className="grid sm:grid-cols-2 gap-4 bg-indigo-50 dark:bg-slate-800 p-4 rounded-xl border border-indigo-100 dark:border-slate-700"> <input aria-label="نام کاربری" type="text" placeholder="نام کاربری *" value={form.username} onChange={(e) => setForm({...form, username: e.target.value})} className="w-full border-2 dark:border-slate-600 p-3 rounded-xl outline-none dark:bg-slate-700 dark:text-white" dir="ltr" /> <input aria-label={editItem && !isOn(editItem.is_shadow) ? "رمز موقت جدید (خالی=بدون تغییر)" : "رمز موقت * (حداقل ۸ کاراکتر)"} type="text" placeholder={editItem && !isOn(editItem.is_shadow) ? "رمز موقت جدید (خالی=بدون تغییر)" : "رمز موقت * (حداقل ۸ کاراکتر)"} value={form.password} onChange={(e) => setForm({...form, password: e.target.value})} autoComplete="new-password" className="w-full border-2 dark:border-slate-600 p-3 rounded-xl outline-none dark:bg-slate-700 dark:text-white" dir="ltr" /> </div> )}
            <div className="grid sm:grid-cols-2 gap-4"> <input aria-label="شماره موبایل" type="text" placeholder="شماره موبایل" value={form.phone} onChange={(e) => setForm({...form, phone: e.target.value})} className="w-full border-2 dark:border-slate-700 p-3 rounded-xl outline-none dark:bg-slate-800 dark:text-white" dir="ltr" /> <input aria-label="شماره تماس ۲" type="text" placeholder="شماره تماس ۲" value={form.phone2} onChange={(e) => setForm({...form, phone2: e.target.value})} className="w-full border-2 dark:border-slate-700 p-3 rounded-xl outline-none dark:bg-slate-800 dark:text-white" dir="ltr" /> </div>
            <input aria-label="شماره شبا بانکی" type="text" placeholder="شماره شبا بانکی" value={form.iban} onChange={(e) => setForm({...form, iban: e.target.value})} className="w-full border-2 dark:border-slate-700 p-3 rounded-xl outline-none dark:bg-slate-800 dark:text-white" dir="ltr" />
            <div className="bg-slate-100 dark:bg-slate-800 p-4 rounded-xl border border-slate-200 dark:border-slate-700">
                <p className="font-semibold text-sm mb-2 dark:text-slate-300">تخصص‌ها:</p>
                <div className="flex flex-wrap gap-2 mb-3"> {form.skills.map((s, i) => <span key={i} className="bg-indigo-600 text-white text-xs px-3 py-1.5 rounded-full flex items-center gap-2">{toPersianNum(s)} <button aria-label="حذف" onClick={() => setForm({...form, skills: form.skills.filter((_,idx) => idx !== i)})} className="hover:text-red-300">✕</button></span>)} </div>
                <div className="flex flex-col sm:flex-row gap-2"> <SkillInput value={form.skillInput} onChange={val => setForm({...form, skillInput: val})} onAdd={addSkill} mdStaff={mdStaff} /> <button type="button" onClick={addSkill} className="w-full sm:w-auto bg-indigo-500 text-white px-5 py-2.5 rounded-lg text-sm font-semibold shadow-sm">افزودن</button> </div>
            </div>
            <button onClick={submit} className={`w-full text-white py-4 rounded-xl font-bold text-lg shadow-sm ${editItem ? 'bg-blue-600' : 'bg-green-600'}`}>{editItem ? 'ذخیره' : 'ثبت'}</button>
        </div>
    );
}
