import React, { useState, useEffect } from 'react';
import { toPersianNum, safeJson } from '../lib/utils';
import { NumInput } from '../components/NumInput';
import { toast } from '../lib/ui';

export default function VenueForm({ onSave, editItem }) {
    const [form, setForm] = useState({ name: '', venue_type: 'سالن همایش', capacity: '', gps_link: '', address: '', facInput: '', facilities: [] });
    useEffect(() => { if(editItem) { setForm({ name: editItem.name || '', venue_type: editItem.venue_type || 'سالن همایش', capacity: editItem.capacity ?? '', gps_link: editItem.gps_link || '', address: editItem.address || '', facInput: '', facilities: safeJson(editItem.facilities, []) }); } else setForm({ name: '', venue_type: 'سالن همایش', capacity: '', gps_link: '', address: '', facInput: '', facilities: [] }); }, [editItem]);
    const addFacility = () => { const v = form.facInput.trim(); if(!v) return; setForm({...form, facilities: form.facilities.includes(v) ? form.facilities : [...form.facilities, v], facInput: ''}); };
    const submit = () => {
        if(!form.name.trim()) return toast("نام مکان الزامی است.", "warning");
        const v = form.facInput.trim();
        const facilities = v && !form.facilities.includes(v) ? [...form.facilities, v] : form.facilities;
        const { facInput, ...payload } = form;
        onSave('venue', { ...payload, facilities }, editItem ? editItem.id : null);
    };
    const venueTypes = ['سالن همایش', 'هتل', 'فضای باز'];
    return (
        <div className="space-y-4 fade-in">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <input aria-label="نام مکان" type="text" placeholder="نام مکان *" value={form.name} onChange={(e) => setForm({...form, name: e.target.value})} className="w-full border-2 dark:border-white/10 p-3 rounded-xl outline-none font-bold dark:text-white" />
                <select value={form.venue_type} onChange={(e) => setForm({...form, venue_type: e.target.value})} className="glass-field w-full border-2 p-3 rounded-xl outline-none dark:text-white">
                    {venueTypes.map(t => <option key={t} value={t}>{t}</option>)}{form.venue_type && !venueTypes.includes(form.venue_type) && <option value={form.venue_type}>{form.venue_type}</option>}
                </select>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <NumInput placeholder="ظرفیت (نفر)" value={form.capacity} onChange={(v) => setForm({...form, capacity: v})} className="w-full border-2 dark:border-white/10 p-3 rounded-xl outline-none dark:text-white" dir="ltr" />
                <input aria-label="لینک لوکیشن" type="text" placeholder="لینک لوکیشن" value={form.gps_link} onChange={(e) => setForm({...form, gps_link: e.target.value})} className="w-full border-2 dark:border-white/10 p-3 rounded-xl outline-none dark:text-white" dir="ltr" />
            </div>
            <textarea aria-label="آدرس دقیق متنی" placeholder="آدرس دقیق متنی" value={form.address} onChange={(e) => setForm({...form, address: e.target.value})} className="w-full border-2 dark:border-white/10 p-3 rounded-xl outline-none h-20 custom-scroll dark:text-white"></textarea>
            <div className="bg-amber-50 dark:bg-slate-800 p-4 rounded-xl border border-amber-100 dark:border-white/10">
                <p className="font-semibold text-sm mb-2 text-amber-900 dark:text-amber-500">امکانات:</p>
                <div className="flex flex-wrap gap-2 mb-3">
                    {form.facilities.map((f, i) => <span key={i} className="bg-amber-200 dark:bg-amber-900/50 text-amber-900 dark:text-amber-200 text-xs px-3 py-1.5 rounded-full flex items-center gap-2">{toPersianNum(f)} <button aria-label="حذف" onClick={() => setForm({...form, facilities: form.facilities.filter((_,idx) => idx !== i)})} className="hover:text-red-500">✕</button></span>)}
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-[1fr_auto] gap-2">
                    <input aria-label="مثال: پارکینگ" type="text" placeholder="مثال: پارکینگ" value={form.facInput} onChange={(e) => setForm({...form, facInput: e.target.value})} onKeyDown={(e) => { if(e.key === 'Enter') { e.preventDefault(); addFacility(); } }} className="w-full border dark:border-white/10 p-2.5 rounded-lg text-sm outline-none dark:text-white" />
                    <button type="button" onClick={addFacility} className="w-full sm:w-auto bg-amber-600 hover:bg-amber-700 text-white px-5 py-2.5 rounded-lg text-sm font-semibold shadow-sm hover:bg-amber-600">افزودن</button>
                </div>
            </div>
            <button onClick={submit} className={`w-full text-white py-4 rounded-xl font-bold text-lg shadow-sm ${editItem ? 'bg-blue-600' : 'bg-green-600'}`}>{editItem ? 'ذخیره تغییرات' : 'ثبت مکان'}</button>
        </div>
    );
}
