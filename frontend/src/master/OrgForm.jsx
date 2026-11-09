import React, { useState, useEffect } from 'react';
import { toPersianNum, safeJson } from '../lib/utils';
import { Icons } from '../components/Icons';
import ImageUploader from '../components/ImageUploader';
import { toast } from '../lib/ui';

export default function OrgForm({ onSave, editItem }) {
    const [form, setForm] = useState({ name: '', national_id: '', contactName: '', contactPhone: '', contacts: [], logo: '' });
    useEffect(() => { if(editItem) { setForm({ name: editItem.name || '', national_id: editItem.national_id || '', logo: editItem.logo || '', contactName: '', contactPhone: '', contacts: safeJson(editItem.contacts, []) }); } else setForm({ name: '', national_id: '', contactName: '', contactPhone: '', contacts: [], logo: '' }); }, [editItem]);
    const addContact = () => { if(form.contactName.trim()) setForm({...form, contacts: [...form.contacts, {name: form.contactName.trim(), phone: form.contactPhone.trim()}], contactName:'', contactPhone:''}); };
    const submit = () => {
        if(!form.name.trim()) return toast("نام سازمان الزامی است.", "warning");
        // رابطی که تایپ شده ولی دکمه افزودن آن زده نشده، از دست نمی‌رود
        const contacts = form.contactName.trim() ? [...form.contacts, {name: form.contactName.trim(), phone: form.contactPhone.trim()}] : form.contacts;
        const { contactName, contactPhone, ...payload } = form;
        onSave('org', { ...payload, contacts }, editItem ? editItem.id : null);
    };
    return (
        <div className="space-y-4 fade-in">
            <ImageUploader value={form.logo} onChange={(b64)=>setForm({...form, logo: b64})} type="logo" placeholder="آپلود لوگوی کارفرما" />
            <input aria-label="نام سازمان" type="text" placeholder="نام سازمان *" value={form.name} onChange={(e) => setForm({...form, name: e.target.value})} className="w-full border-2 dark:border-white/10 p-3 rounded-xl outline-none font-bold dark:text-white" />
            <input aria-label="شناسه ملی" type="text" placeholder="شناسه ملی" value={form.national_id} onChange={(e) => setForm({...form, national_id: e.target.value})} className="w-full border-2 dark:border-white/10 p-3 rounded-xl outline-none dark:text-white" dir="ltr" />
            <div className="glass-soft p-4 rounded-xl border">
                <p className="font-semibold text-sm mb-3 dark:text-slate-300">رابطین سازمان:</p>
                {form.contacts.map((c, i) => (
                    <div key={i} className="glass p-3 rounded-xl mb-2 text-sm flex justify-between items-center border">
                        <div><span className="font-bold dark:text-white">{toPersianNum(c.name)}</span> <span className="text-slate-500 dark:text-slate-400 text-xs mr-2" dir="ltr">{toPersianNum(c.phone)}</span></div>
                        <button aria-label="حذف" onClick={() => setForm({...form, contacts: form.contacts.filter((_,idx) => idx !== i)})} className="text-red-500 bg-red-50 dark:bg-red-900/30 p-1.5 rounded hover:bg-red-100"><Icons.Trash/></button>
                    </div>
                ))}
                <div className="glass grid grid-cols-1 sm:grid-cols-[1fr_1fr_auto] gap-2 mt-4 p-2 rounded-xl border border-dashed">
                    <input aria-label="نام رابط" type="text" placeholder="نام رابط" value={form.contactName} onChange={(e) => setForm({...form, contactName: e.target.value})} className="glass-field w-full border p-2.5 rounded-lg text-sm outline-none dark:text-white" />
                    <input aria-label="تلفن" type="text" placeholder="تلفن" value={form.contactPhone} onChange={(e) => setForm({...form, contactPhone: e.target.value})} className="glass-field w-full border p-2.5 rounded-lg text-sm outline-none dark:text-white" dir="ltr" />
                    <button type="button" onClick={addContact} className="btn-grad text-white px-5 py-2.5 rounded-lg text-sm font-semibold">افزودن</button>
                </div>
            </div>
            <button onClick={submit} className={`w-full text-white py-4 rounded-xl font-bold text-lg shadow-sm ${editItem ? 'bg-blue-600' : 'bg-green-600'}`}>{editItem ? 'ذخیره تغییرات' : 'ثبت سازمان'}</button>
        </div>
    );
}
