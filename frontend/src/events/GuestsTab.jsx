import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { api } from '../lib/api';
import { toast, confirmDialog, formDialog } from '../lib/ui';
import { toPersianNum, toJalaliDateTime, matches, exportToCSV } from '../lib/utils';
import { navigate } from '../lib/router';
import { Icons } from '../components/Icons';
import { qrDataUrl } from '../components/QrImage';

/** خواندن CSV ساده (با پشتیبانی از جداکننده , یا ; یا تب و ستون‌های فارسی/انگلیسی) */
export function parseGuestCsv(text) {
    const lines = text.replace(/^﻿/, '').split(/\r?\n/).filter(l => l.trim());
    if (!lines.length) return [];
    const sep = [',', ';', '\t'].sort((a, b) => lines[0].split(b).length - lines[0].split(a).length)[0];
    const split = (l) => { const out = []; let cur = '', q = false; for (const ch of l) { if (ch === '"') q = !q; else if (ch === sep && !q) { out.push(cur); cur = ''; } else cur += ch; } out.push(cur); return out.map(s => s.trim()); };
    const head = split(lines[0]).map(h => h.toLowerCase());
    const find = (...names) => head.findIndex(h => names.some(n => h.includes(n)));
    let iName = find('نام', 'name'), iPhone = find('تلفن', 'موبایل', 'phone', 'mobile'), iOrg = find('سازمان', 'شرکت', 'org', 'company'), iCat = find('دسته', 'نوع', 'category', 'type');
    let body = lines.slice(1);
    if (iName === -1) { iName = 0; iPhone = 1; iOrg = 2; iCat = 3; body = lines; } // بدون سطر عنوان
    return body.map(split).map(c => ({ full_name: c[iName] || '', phone: iPhone >= 0 ? c[iPhone] || '' : '', organization: iOrg >= 0 ? c[iOrg] || '' : '', category: iCat >= 0 ? c[iCat] || '' : '' })).filter(r => r.full_name);
}

export default function GuestsTab({ eventId, eventTitle }) {
    const [data, setData] = useState(null);
    const [q, setQ] = useState('');
    const [cat, setCat] = useState('');
    const [badges, setBadges] = useState(null);
    const fileRef = useRef(null);

    const load = async () => { const r = await api('get_guests', null, { event_id: eventId }); if (r) setData(r); };
    useEffect(() => { load(); }, [eventId]);

    if (!data) return <p className="text-center py-10 text-slate-500 pulse-text">در حال بارگذاری مهمانان...</p>;
    const guests = data.guests;
    const list = guests.filter(g => (!cat || g.category === cat) && matches(q, g.full_name, g.organization, g.phone));
    const checked = guests.filter(g => g.checked_in_at).length;

    const editGuest = async (g = null) => {
        const v = await formDialog({
            title: g ? 'ویرایش مهمان' : 'افزودن مهمان',
            fields: [
                { name: 'full_name', label: 'نام و نام خانوادگی', value: g?.full_name || '', required: true },
                { name: 'phone', label: 'تلفن همراه', value: g?.phone || '' },
                { name: 'organization', label: 'سازمان / شرکت', value: g?.organization || '' },
                { name: 'category', label: 'دسته', type: 'select', value: g?.category || 'عادی', options: data.categories.map(c => ({ value: c, label: c })) },
            ],
            confirmText: g ? 'ذخیره' : 'افزودن',
        });
        if (v && await api('save_guest', { event_id: eventId, id: g?.id, ...v })) { toast(g ? 'مهمان ویرایش شد.' : 'مهمان افزوده شد.'); load(); }
    };
    const delGuest = async (g) => { if (await confirmDialog({ title: 'حذف مهمان', message: `«${g.full_name}» از لیست حذف شود؟`, confirmText: 'حذف', danger: true }) && await api('delete_guest', { id: g.id })) load(); };
    const toggle = async (g) => { if (await api('guest_checkin', { event_id: eventId, guest_id: g.id, undo: !!g.checked_in_at })) load(); };
    const importFile = async (file) => {
        const rows = parseGuestCsv(await file.text());
        if (!rows.length) return toast('ردیفی در فایل پیدا نشد. فایل باید CSV با ستون «نام» باشد.', 'warning');
        if (!(await confirmDialog({ title: 'ورود مهمانان', message: `${toPersianNum(rows.length)} ردیف خوانده شد. وارد لیست شود؟\n(نام‌های تکراری با همان تلفن نادیده گرفته می‌شوند)`, confirmText: 'وارد کن' }))) return;
        const r = await api('import_guests', { event_id: eventId, rows });
        if (r) { toast(`${toPersianNum(r.added)} مهمان افزوده شد${r.skipped ? `، ${toPersianNum(r.skipped)} ردیف تکراری/نامعتبر نادیده گرفته شد` : ''}.`, r.errors?.length ? 'warning' : 'success', 6000); load(); }
    };
    const printBadges = async () => {
        if (!list.length) return toast('مهمانی برای چاپ وجود ندارد.', 'warning');
        const items = await Promise.all(list.map(async g => ({ ...g, qr: await qrDataUrl('EVG:' + g.qr_token, 240) })));
        setBadges(items);
        setTimeout(() => { window.print(); setTimeout(() => setBadges(null), 500); }, 300);
    };

    return (
        <div className="fade-in space-y-4">
            <div className="grid grid-cols-3 gap-3">
                <div className="glass rounded-2xl border p-4"><div className="text-xs text-slate-500 dark:text-slate-400">کل مهمانان</div><div className="text-2xl font-bold text-slate-800 dark:text-white">{toPersianNum(guests.length)}</div></div>
                <div className="glass rounded-2xl border p-4"><div className="text-xs text-slate-500 dark:text-slate-400">پذیرش‌شده</div><div className="text-2xl font-bold text-emerald-600 dark:text-emerald-400">{toPersianNum(checked)}</div></div>
                <div className="glass rounded-2xl border p-4"><div className="text-xs text-slate-500 dark:text-slate-400">در انتظار</div><div className="text-2xl font-bold text-amber-600 dark:text-amber-400">{toPersianNum(guests.length - checked)}</div></div>
            </div>
            <div className="flex flex-wrap gap-2">
                <button type="button" onClick={() => navigate(`checkin/${eventId}`)} className="btn-grad px-4 py-2.5 rounded-xl font-bold inline-flex items-center gap-2">📷 پذیرش با QR</button>
                {data.can_manage && <button type="button" onClick={() => editGuest()} className="glass border px-4 py-2.5 rounded-xl font-semibold">+ افزودن مهمان</button>}
                {data.can_manage && <button type="button" onClick={() => fileRef.current.click()} className="glass border px-4 py-2.5 rounded-xl font-semibold">ورود از فایل CSV</button>}
                <button type="button" onClick={printBadges} className="glass border px-4 py-2.5 rounded-xl font-semibold inline-flex items-center gap-2"><Icons.Printer /> چاپ کارت‌ها</button>
                <button type="button" onClick={() => exportToCSV(guests, `Guests_${eventId}`, [
                    { key: 'full_name', label: 'نام' }, { key: 'phone', label: 'تلفن' }, { key: 'organization', label: 'سازمان' }, { key: 'category', label: 'دسته' },
                    { key: 'checked_in_at', label: 'زمان پذیرش', value: g => g.checked_in_at ? toJalaliDateTime(g.checked_in_at) : '' }, { key: 'checked_in_by', label: 'پذیرش توسط' },
                ])} className="glass border px-4 py-2.5 rounded-xl font-semibold inline-flex items-center gap-2"><Icons.Download /> خروجی اکسل</button>
                <input ref={fileRef} type="file" accept=".csv,.txt,text/csv" className="hidden" onChange={e => { if (e.target.files[0]) importFile(e.target.files[0]); e.target.value = null; }} />
            </div>
            {data.can_manage && <p className="text-xs text-slate-500 dark:text-slate-400">فایل CSV با ستون‌های «نام، تلفن، سازمان، دسته» (از اکسل: Save As → CSV UTF-8).</p>}
            <div className="flex flex-col sm:flex-row gap-2">
                <div className="relative flex-1">
                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none"><Icons.Search /></span>
                    <input type="search" aria-label="جستجوی مهمان" placeholder="جستجوی نام، سازمان یا تلفن..." value={q} onChange={e => setQ(e.target.value)} className="w-full glass-field border-2 pr-10 pl-3 py-2.5 rounded-xl" />
                </div>
                <select aria-label="فیلتر دسته" value={cat} onChange={e => setCat(e.target.value)} className="glass-field border-2 px-3 py-2.5 rounded-xl">
                    <option value="">همه دسته‌ها</option>{data.categories.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
            </div>
            <ul className="space-y-2">
                {guests.length === 0 && <li className="text-center text-slate-500 py-10">هنوز مهمانی ثبت نشده است.</li>}
                {list.map(g => (
                    <li key={g.id} className={`glass border rounded-2xl p-3.5 flex flex-wrap items-center gap-3 ${g.checked_in_at ? '!border-emerald-300 dark:!border-emerald-800' : ''}`}>
                        <div className="flex-1 min-w-[10rem]">
                            <div className="font-semibold text-slate-800 dark:text-white">{toPersianNum(g.full_name)} {g.category !== 'عادی' && <span className="text-[11px] bg-grad text-white px-2 py-0.5 rounded-full mr-1">{g.category}</span>}</div>
                            <div className="text-xs text-slate-500 dark:text-slate-400">{[g.organization, g.phone && toPersianNum(g.phone)].filter(Boolean).join(' · ')}</div>
                            {g.checked_in_at && <div className="text-xs text-emerald-700 dark:text-emerald-400 mt-0.5">✓ پذیرش: <bdi>{toJalaliDateTime(g.checked_in_at)}</bdi> توسط {g.checked_in_by}</div>}
                        </div>
                        <button type="button" onClick={() => toggle(g)} className={`px-3 py-2 rounded-xl text-sm font-semibold border ${g.checked_in_at ? 'glass-soft text-slate-600 dark:text-slate-300' : 'bg-emerald-600 text-white border-transparent'}`}>{g.checked_in_at ? 'لغو پذیرش' : 'پذیرش'}</button>
                        {data.can_manage && <button type="button" onClick={() => editGuest(g)} className="p-2 rounded-lg text-slate-500" aria-label={`ویرایش ${g.full_name}`}><Icons.Edit /></button>}
                        {data.can_manage && <button type="button" onClick={() => delGuest(g)} className="p-2 rounded-lg text-red-500" aria-label={`حذف ${g.full_name}`}><Icons.Trash /></button>}
                    </li>
                ))}
            </ul>
            {badges && <BadgePrint items={badges} eventTitle={eventTitle} />}
        </div>
    );
}

/** کارت‌های ورود قابل چاپ (۸ کارت در هر صفحه A4) */
function BadgePrint({ items, eventTitle }) {
    const [host] = useState(() => { let el = document.getElementById('print-area'); if (!el) { el = document.createElement('div'); el.id = 'print-area'; document.body.appendChild(el); } return el; });
    return createPortal(
        <div dir="rtl" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6mm', fontFamily: 'Vazirmatn, tahoma' }}>
            {items.map(g => (
                <div key={g.id} style={{ border: '1px solid #c4b5fd', borderRadius: 12, padding: '5mm', height: '62mm', display: 'flex', gap: '4mm', alignItems: 'center', breakInside: 'avoid', borderTop: '6px solid #8b5cf6' }}>
                    <img src={g.qr} alt="" style={{ width: '34mm', height: '34mm' }} />
                    <div>
                        <div style={{ fontSize: 10, color: '#6b7280' }}>{eventTitle}</div>
                        <div style={{ fontSize: 17, fontWeight: 700, margin: '2mm 0' }}>{toPersianNum(g.full_name)}</div>
                        {g.organization && <div style={{ fontSize: 11 }}>{g.organization}</div>}
                        {g.category !== 'عادی' && <div style={{ marginTop: '2mm', display: 'inline-block', background: '#8b5cf6', color: '#fff', borderRadius: 999, padding: '1px 10px', fontSize: 11 }}>{g.category}</div>}
                    </div>
                </div>
            ))}
        </div>, host);
}
