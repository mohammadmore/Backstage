import React, { useState, useEffect } from 'react';
import { api } from '../lib/api';
import { toPersianNum, toJalaliDateTime, parseDate, isOn, exportToCSV, formatMoney, statusInfo, EVENT_STATUS, TIMINGS } from '../lib/utils';
import { Icons } from '../components/Icons';
import { EventTimer } from '../components/EventTimer';
import JalaliDatePicker from '../components/JalaliDatePicker';
import { NumInput, CommitNumInput } from '../components/NumInput';

const detectPhase = (ev) => {
    const now = new Date();
    const st = parseDate(ev.start_date);
    const en = parseDate(ev.end_date);
    if (!st) return TIMINGS[0];
    if (en && now >= st && now <= en) return 'روز رویداد';
    if (en && now > en) return 'پایان رویداد';
    if (st - now > 0 && st - now < 24 * 60 * 60 * 1000) return 'روز قبل از رویداد';
    if (!en && now >= st) return 'روز رویداد';
    return TIMINGS[0];
};

// =====================================
// داشبورد اتاق فرمان رویداد
// =====================================
export default function EventDetail({ eventId, onBack, user, md }) {
    const [data, setData] = useState(null);
    const [activePhase, setActivePhase] = useState('');
    const [editModal, setEditModal] = useState(false);
    const [editForm, setEditForm] = useState({});
    const [tab, setTab] = useState('operations');
    const [qrOld, setQrOld] = useState('');
    const [qrNew, setQrNew] = useState('');
    const [busy, setBusy] = useState(false);
    const staff = md?.staff || [];

    const loadData = async () => {
        const res = await api('get_event_detail', null, { id: eventId });
        if(res) {
            setData(res);
            setActivePhase(p => p || detectPhase(res.event));
        }
        return res;
    };
    useEffect(() => { loadData(); }, [eventId]);

    const apiCall = async (action, body) => {
        setBusy(true);
        const res = await api(action, { ...body, event_id: eventId });
        await loadData();
        setBusy(false);
        return res;
    };

    if(!data) return <div className="flex h-64 items-center justify-center pulse-text font-black text-indigo-300 text-xl">اتاق فرمان در حال بارگذاری است...</div>;

    const ev = data.event;
    const tasks = data.tasks || [];
    const logs = data.logs || [];
    const services = data.services || [];
    const delegations = data.delegations || [];

    const subTotal = services.reduce((acc, curr) => acc + (Number(curr.frozen_price) || 0), 0);
    const discount = Number(ev.discount) || 0;
    const taxPercent = Number(ev.tax_percent) || 0;
    const taxAmount = ((subTotal - discount) * taxPercent) / 100;
    const total = subTotal - discount + taxAmount;
    const deposit = Number(ev.deposit) || 0;
    const remaining = total - deposit;
    const tbdCount = services.filter(s => s.frozen_price === null || s.frozen_price === undefined).length;
    const doneCount = tasks.filter(t => isOn(t.is_done)).length;
    const progress = tasks.length ? (doneCount / tasks.length) * 100 : 0;

    const kanbanCols = [...TIMINGS];
    const tasksByTiming = {};
    kanbanCols.forEach(c => tasksByTiming[c] = tasks.filter(t => t.timing_tag === c));
    const noTimingTasks = tasks.filter(t => !TIMINGS.includes(t.timing_tag));
    if(noTimingTasks.length > 0) { kanbanCols.push('سایر زمان‌ها'); tasksByTiming['سایر زمان‌ها'] = noTimingTasks; }

    const rolesNeeded = Array.from(new Set(tasks.map(t => t.role_tag).filter(Boolean)));
    const assignedIds = Array.from(new Set(tasks.filter(t => !isOn(t.is_done)).map(t => t.assignee_id).filter(Boolean)));
    const staffName = (id) => staff.find(s => s.id == id)?.full_name;

    const isLocked = (t) => !!t.depends_on_id && !isOn(t.dep_done) && !isOn(t.is_done);

    const staffOptions = (currentId) => (
        <>
            {staff.map(s => <option key={s.id} value={s.id}>{toPersianNum(s.full_name)} {isOn(s.is_shadow) ? '(📞)' : ''}</option>)}
            {currentId && !staff.some(s => s.id == currentId) && <option value={currentId}>(کاربر حذف‌شده)</option>}
        </>
    );

    const handleQuickReplace = async () => {
        if(!qrOld || !qrNew) return alert("هر دو همکار را انتخاب کنید.");
        if(qrOld === qrNew) return alert("همکار غایب و جایگزین نمی‌توانند یکسان باشند.");
        if(!window.confirm("آیا از انتقال تمام وظایف انجام‌نشده این شخص مطمئن هستید؟")) return;
        const res = await apiCall('quick_replace', { old_user_id: Number(qrOld), new_user_id: Number(qrNew) });
        if(res) { alert(`${toPersianNum(res.moved ?? 0)} وظیفه منتقل شد.`); setQrOld(''); setQrNew(''); }
    };

    const openEditModal = () => {
        setEditForm({ venue_id: ev.venue_id || '', guest_count: ev.guest_count ?? '', start_date: ev.start_date ? ev.start_date.slice(0,16).replace(' ', 'T') : '', end_date: ev.end_date ? ev.end_date.slice(0,16).replace(' ', 'T') : '' });
        setEditModal(true);
    };

    const saveEditEvent = async () => {
        const s = parseDate(editForm.start_date), e = parseDate(editForm.end_date);
        if(s && e && e < s) return alert("تاریخ پایان رویداد نمی‌تواند قبل از تاریخ شروع باشد.");
        const res = await apiCall('update_event_details', { ...editForm, venue_id: editForm.venue_id || null });
        if(res) setEditModal(false);
    };

    const resolveDelegation = (delId, status) => apiCall('resolve_delegation', { delegation_id: delId, status });

    const toggleDone = (t) => {
        if(!isOn(t.is_done) && isLocked(t)) return alert("این تسک قفل است و باید منتظر انجام پیش‌نیاز آن باشید!");
        apiCall('update_task', { task_id: t.id, is_done: !isOn(t.is_done) });
    };

    const st = statusInfo(ev.status);

    return (
        <div className="fade-in max-w-[90rem] mx-auto pb-24">
            {/* تایمر چسبان زیر هدر (قبلاً fixed بود و نوار ناوبری موبایل را می‌پوشاند) */}
            <div className="sticky top-[72px] sm:top-[76px] z-30 -mx-4 md:-mx-8 mb-6"><EventTimer start={ev.start_date} end={ev.end_date} /></div>

            <div className="flex flex-col md:flex-row justify-between md:items-end gap-4 mb-6">
                <div>
                    <button onClick={onBack} className="mb-4 font-bold text-slate-500 dark:text-slate-400 flex items-center gap-2 hover:text-indigo-600 transition-colors bg-white dark:bg-slate-800 px-4 py-2 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700"><Icons.ArrowRight /> بازگشت به لیست</button>
                    <div className="flex items-center gap-3 mb-2 flex-wrap">
                        <span className="bg-indigo-600 text-white px-3 py-1 rounded-lg text-xs font-black shadow-sm tracking-widest">CMD-{toPersianNum(eventId)}</span>
                        <span className={`px-3 py-1 rounded-lg text-xs font-bold border ${st.badge}`}>{st.label}</span>
                        {delegations.length > 0 && <button onClick={()=>setTab('team')} className="bg-red-500 text-white px-3 py-1 rounded-lg text-xs font-black shadow-sm pulse-text">{toPersianNum(delegations.length)} درخواست واگذاری</button>}
                    </div>
                    <h2 className="text-3xl sm:text-4xl font-black text-slate-800 dark:text-white tracking-tight">{toPersianNum(ev.title)}</h2>
                </div>
                <div className="flex flex-wrap gap-2">
                    <button onClick={openEditModal} className="bg-white dark:bg-slate-800 border-2 border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 px-4 py-3 rounded-xl font-bold hover:bg-slate-50 dark:hover:bg-slate-700 shadow-sm transition-colors" title="ویرایش ابعاد رویداد"><Icons.Edit/></button>
                    <select value={ev.status} onChange={e => apiCall('update_event_status', {status: e.target.value})} className="bg-slate-800 dark:bg-indigo-600 text-white px-5 py-3 rounded-xl font-bold outline-none shadow-md cursor-pointer">
                        {Object.entries(EVENT_STATUS).map(([k, v]) => <option key={k} value={k}>وضعیت: {v.label}</option>)}
                    </select>
                </div>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
                <div className="bg-white dark:bg-slate-800 p-5 rounded-3xl border border-slate-200 dark:border-slate-700 shadow-sm relative overflow-hidden">
                    {ev.org_logo && <img src={ev.org_logo} className="absolute left-[-20px] top-[-20px] w-24 h-24 opacity-10 pointer-events-none" />}
                    <div className="text-indigo-400 mb-2"><Icons.Building/></div>
                    <div className="text-xs font-bold text-slate-500 dark:text-slate-400 mb-1">سازمان و مدیر هماهنگی</div>
                    <div className="font-black text-slate-800 dark:text-white text-base truncate">{toPersianNum(ev.org_name) || '---'}</div>
                    <div className="text-xs text-indigo-600 dark:text-indigo-400 font-bold mt-1">{toPersianNum(ev.contact_name) || 'بدون مدیر هماهنگی'}</div>
                </div>
                <div className="bg-white dark:bg-slate-800 p-5 rounded-3xl border border-slate-200 dark:border-slate-700 shadow-sm">
                    <div className="text-indigo-400 mb-2"><Icons.Calendar/></div>
                    <div className="text-xs font-bold text-slate-500 dark:text-slate-400 mb-1">شروع رویداد</div>
                    <div className="font-black text-slate-800 dark:text-white text-sm leading-relaxed">{toJalaliDateTime(ev.start_date)}</div>
                </div>
                <div className="bg-white dark:bg-slate-800 p-5 rounded-3xl border border-slate-200 dark:border-slate-700 shadow-sm">
                    <div className="text-indigo-400 mb-2"><Icons.Users/></div>
                    <div className="text-xs font-bold text-slate-500 dark:text-slate-400 mb-1">مکان و ابعاد</div>
                    <div className="font-black text-slate-800 dark:text-white text-base truncate">{toPersianNum(ev.venue_name) || '---'}</div>
                    <div className="text-xs text-slate-500 dark:text-slate-400 font-bold mt-1">{toPersianNum(ev.guest_count)} مهمان</div>
                </div>
                <div className="bg-gradient-to-br from-indigo-500 to-blue-600 p-5 rounded-3xl shadow-lg text-white">
                    <div className="text-indigo-200 mb-2"><Icons.Activity/></div>
                    <div className="text-xs font-bold text-indigo-100 mb-1">پیشرفت کل عملیات</div>
                    <div className="font-black text-3xl mt-1" dir="ltr">{toPersianNum(Math.round(progress))}%</div>
                    <div className="w-full bg-indigo-900/50 h-2 rounded-full mt-3 overflow-hidden"><div className="bg-white h-full transition-all duration-1000" style={{width: `${progress}%`}}></div></div>
                </div>
            </div>

            <div className="flex gap-2 mb-6 border-b-2 border-slate-200 dark:border-slate-700 pb-2 overflow-x-auto custom-scroll">
                {[{id:'operations', label:'فازهای عملیاتی'}, {id:'finance', label:'فاکتور تعاملی'}, {id:'team', label:'تخصیص‌ها'}, {id:'logs', label:'گزارشات زنده'}].map(t => (
                    <button key={t.id} onClick={()=>setTab(t.id)} className={`px-6 py-3 rounded-t-xl font-bold whitespace-nowrap transition-colors ${tab===t.id ? 'bg-indigo-600 text-white shadow-md' : 'text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-slate-800 dark:hover:text-white'}`}>{t.label}{t.id==='team' && delegations.length > 0 ? ` (${toPersianNum(delegations.length)})` : ''}</button>
                ))}
            </div>

            {tab === 'operations' && (
                <div className="fade-in">
                    <div className="flex flex-wrap gap-2 mb-6 bg-white dark:bg-slate-800 p-2 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm">
                        {kanbanCols.map(col => (
                            <button key={col} onClick={()=>setActivePhase(col)} className={`flex-1 min-w-[120px] py-3 px-4 rounded-xl font-bold text-sm transition-all shadow-sm ${activePhase === col ? 'bg-slate-800 dark:bg-indigo-600 text-white shadow-md transform scale-[1.02]' : 'bg-slate-50 dark:bg-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-600 border border-slate-200 dark:border-slate-600'}`}>
                                {col} <span className={`ml-2 px-2 py-0.5 rounded-md text-[10px] ${activePhase === col ? 'bg-slate-600 dark:bg-indigo-800 text-slate-200' : 'bg-white dark:bg-slate-800 border dark:border-slate-600'}`}>{toPersianNum((tasksByTiming[col] || []).length)}</span>
                            </button>
                        ))}
                    </div>

                    <div className="bg-slate-50 dark:bg-slate-900 border-2 border-slate-200 dark:border-slate-700 rounded-3xl p-4 sm:p-8 min-h-[50vh] shadow-inner">
                        <div className="flex justify-between items-center mb-6 gap-3">
                            <h3 className="text-xl sm:text-2xl font-black text-slate-800 dark:text-white">تسک‌های فاز: <span className="text-indigo-600 dark:text-indigo-400">{activePhase}</span></h3>
                            <button onClick={()=>{const title = prompt(`عنوان وظیفه آزاد برای ${activePhase}:`); if(title && title.trim()) apiCall('add_quick_task', {title: title.trim(), timing: activePhase});}} className="bg-indigo-100 dark:bg-indigo-900/50 text-indigo-700 dark:text-indigo-300 font-bold px-4 py-2 rounded-xl hover:bg-indigo-200 dark:hover:bg-indigo-800 transition-colors shadow-sm whitespace-nowrap">+ تسک آزاد</button>
                        </div>

                        <div className="space-y-4">
                            {(tasksByTiming[activePhase] || []).length === 0 && <div className="text-center py-10 font-bold text-slate-400">هیچ وظیفه‌ای در این فاز ثبت نشده است.</div>}
                            {(tasksByTiming[activePhase] || []).map(t => {
                                const locked = isLocked(t);
                                const done = isOn(t.is_done);
                                const hasIssue = isOn(t.has_issue);
                                return (
                                <div key={t.id} className={`p-4 sm:p-5 rounded-2xl border-2 transition-all shadow-sm flex flex-col md:flex-row justify-between md:items-center gap-4 ${locked ? 'gray-chain-locked bg-slate-200 dark:bg-slate-800 border-dashed border-slate-300 dark:border-slate-600' : hasIssue ? 'bg-red-50 dark:bg-red-900/20 border-red-300' : done ? 'bg-green-50 dark:bg-green-900/20 border-green-200 opacity-70' : 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 hover:border-indigo-300 dark:hover:border-indigo-500 hover:shadow-md'}`}>
                                    <div className="flex items-start gap-4">
                                        <button disabled={locked || busy} title={locked ? 'قفل: پیش‌نیاز انجام نشده' : ''} onClick={()=>toggleDone(t)} className={`w-12 h-12 shrink-0 rounded-2xl border-2 flex items-center justify-center transition-all mt-1 ${done ? 'bg-green-500 border-green-500 text-white' : 'bg-slate-50 dark:bg-slate-700 border-slate-300 dark:border-slate-600 text-transparent hover:border-green-400'}`}><Icons.Check/></button>
                                        <div>
                                            <div className={`font-bold text-lg leading-relaxed ${done ? 'line-through text-slate-400' : 'text-slate-800 dark:text-slate-100'}`}>{toPersianNum(t.title)}</div>
                                            <div className="flex flex-wrap items-center gap-2 mt-3">
                                                {t.role_tag && <span className="text-xs font-black text-indigo-700 dark:text-indigo-300 bg-indigo-50 dark:bg-indigo-900/50 px-2 py-1 rounded-md border border-indigo-200 dark:border-indigo-800 shadow-sm">@{toPersianNum(t.role_tag)}</span>}
                                                {locked && <span className="text-xs text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/50 px-2 py-1 rounded-md border border-amber-200 dark:border-amber-800 font-bold shadow-sm">⏳ پیش‌نیاز: {toPersianNum(t.dep_title)}</span>}
                                                {hasIssue && <span className="text-xs text-red-600 font-bold bg-red-100 px-2 py-1 rounded-md border border-red-200 shadow-sm">مانع: {toPersianNum(t.issue_note)}</span>}
                                            </div>
                                        </div>
                                    </div>
                                    <div className="flex flex-col sm:flex-row gap-2 items-stretch sm:items-center border-t md:border-t-0 md:border-r border-slate-100 dark:border-slate-700 pt-3 md:pt-0 md:pr-4">
                                        <button disabled={busy} onClick={()=>{ if(hasIssue) apiCall('update_task', {task_id: t.id, has_issue: false}); else { const msg = prompt("دلیل توقف کار را بنویسید:"); if(msg && msg.trim()) apiCall('update_task', {task_id: t.id, has_issue: true, issue_note: msg.trim()}); } }} className={`px-4 py-3 rounded-xl font-bold text-sm text-center border shadow-sm transition-colors ${hasIssue ? 'bg-green-50 text-green-700 border-green-200 hover:bg-green-100' : 'bg-slate-50 dark:bg-slate-700 text-red-500 border-slate-200 dark:border-slate-600 hover:bg-red-50 dark:hover:bg-red-900/30 hover:border-red-200'}`}>{hasIssue ? 'رفع مانع' : 'گزارش مانع'}</button>
                                        {/* تخصیص متصدی حتی برای تسک‌های قفل هم ممکن است تا برنامه‌ریزی از قبل انجام شود */}
                                        <div className="flex relative w-full sm:w-56">
                                            {t.assignee_avatar && <img src={t.assignee_avatar} className="w-10 h-10 rounded-full border-2 border-white dark:border-slate-700 shadow-sm absolute right-1 top-1.5 z-10 pointer-events-none object-cover bg-white" />}
                                            <select disabled={busy} value={t.assignee_id || ''} onChange={e=>apiCall('update_task', {task_id: t.id, assignee_id: e.target.value ? Number(e.target.value) : null})} className={`border-2 p-3 rounded-xl font-bold w-full outline-none appearance-none cursor-pointer shadow-sm ${t.assignee_avatar ? 'pr-12' : ''} ${!t.assignee_id ? 'bg-amber-50 dark:bg-amber-900/30 border-amber-300 dark:border-amber-700 text-amber-800 dark:text-amber-200' : 'bg-white dark:bg-slate-700 border-slate-200 dark:border-slate-600 focus:border-indigo-400 dark:text-white'}`}>
                                                <option value="">(بدون متصدی)</option>
                                                {staffOptions(t.assignee_id)}
                                            </select>
                                        </div>
                                    </div>
                                </div>
                            )})}
                        </div>
                    </div>
                </div>
            )}

            {tab === 'finance' && (
                <div className="fade-in bg-white dark:bg-slate-800 p-6 md:p-10 rounded-3xl shadow-sm border border-slate-200 dark:border-slate-700">
                    <div className="flex flex-col md:flex-row justify-between md:items-end border-b-4 border-slate-800 dark:border-slate-600 pb-6 mb-8 gap-4">
                        <div>
                            <h3 className="text-3xl sm:text-4xl font-black text-slate-800 dark:text-white tracking-tight">فاکتور رسمی خدمات</h3>
                            <p className="text-sm font-bold text-slate-500 dark:text-slate-400 mt-2">مقادیر تعداد و فی قابل ویرایش مستقیم هستند.</p>
                            {tbdCount > 0 && <p className="text-xs font-bold text-amber-600 mt-2">⚠️ {toPersianNum(tbdCount)} ردیف هنوز قیمت‌گذاری نشده (TBD) و در جمع محاسبه نمی‌شود.</p>}
                        </div>
                        <div className="text-left bg-slate-50 dark:bg-slate-900 p-5 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-inner min-w-[250px]">
                            <div className="text-sm font-bold text-slate-500 dark:text-slate-400 mb-1">مانده قابل پرداخت (تومان)</div>
                            <div className="text-4xl font-black text-green-600 dark:text-green-400" dir="ltr">{formatMoney(remaining)}</div>
                        </div>
                    </div>

                    <div className="overflow-x-auto custom-scroll pb-6 border-b border-slate-200 dark:border-slate-700 mb-8">
                        <table className="w-full text-right min-w-[700px]">
                            <thead><tr className="bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-200 text-sm"><th className="p-4 rounded-r-xl font-bold w-12">ردیف</th><th className="p-4 font-bold">شرح خدمات</th><th className="p-4 font-bold w-24">تعداد</th><th className="p-4 font-bold w-40">فی (تومان)</th><th className="p-4 rounded-l-xl font-bold w-48">مبلغ کل (تومان)</th></tr></thead>
                            <tbody>
                                {services.length === 0 && <tr><td colSpan="5" className="p-6 text-center text-slate-400 font-bold">ردیفی در فاکتور ثبت نشده است.</td></tr>}
                                {services.map((s, idx) => (
                                    <tr key={s.id} className="border-b border-slate-50 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-700/50 transition-colors">
                                        <td className="p-4 font-bold text-slate-400 text-center">{toPersianNum(idx + 1)}</td>
                                        <td className="p-4 font-bold text-slate-800 dark:text-slate-100 leading-relaxed">{toPersianNum(s.service_name)} <span className="text-[10px] bg-slate-200 dark:bg-slate-600 text-slate-500 dark:text-slate-300 px-2 py-0.5 rounded ml-2">{s.cost_type==='individual'?'نفری':'ثابت'}</span></td>
                                        <td className="p-4"><CommitNumInput value={s.qty} onCommit={v=>apiCall('update_finance_item', {service_id: s.id, qty: v === '' ? 0 : v, unit_price: s.unit_price})} className="w-full border-2 border-slate-200 dark:border-slate-600 focus:border-indigo-500 p-2 rounded-lg outline-none text-center font-bold bg-white dark:bg-slate-800 dark:text-white" /></td>
                                        <td className="p-4" dir="ltr"><CommitNumInput decimal value={s.unit_price} onCommit={v=>apiCall('update_finance_item', {service_id: s.id, qty: s.qty, unit_price: v})} placeholder="TBD" className="w-full border-2 border-slate-200 dark:border-slate-600 focus:border-indigo-500 p-2 rounded-lg outline-none text-left font-bold bg-white dark:bg-slate-800 dark:text-white" /></td>
                                        <td className="p-4 font-black text-indigo-700 dark:text-indigo-400 bg-indigo-50/50 dark:bg-indigo-900/20" dir="ltr">{s.frozen_price !== null && s.frozen_price !== undefined ? formatMoney(s.frozen_price) : 'TBD'}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>

                    <div className="grid md:grid-cols-2 gap-8">
                        <div>
                            <button onClick={()=>{const name=prompt("نام سرویس:"); if(!name || !name.trim()) return; const price=prompt("مبلغ کل (اختیاری):"); apiCall('add_adhoc_service', {name: name.trim(), price: price || ''});}} className="bg-indigo-50 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-300 font-bold px-6 py-3 rounded-xl hover:bg-indigo-100 transition-colors border border-indigo-200 dark:border-indigo-800 border-dashed mb-3 sm:mb-0 sm:mr-3 block sm:inline-block">+ افزودن ردیف جدید به فاکتور</button>
                            <button onClick={()=>exportToCSV(services, `Invoice_${eventId}`, [
                                { key: 'service_name', label: 'شرح خدمات' },
                                { key: 'cost_type', label: 'نوع', value: s => s.cost_type === 'individual' ? 'نفری' : 'ثابت' },
                                { key: 'qty', label: 'تعداد' },
                                { key: 'unit_price', label: 'فی (تومان)' },
                                { key: 'frozen_price', label: 'مبلغ کل (تومان)' },
                            ])} className="bg-emerald-50 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400 font-bold px-6 py-3 rounded-xl hover:bg-emerald-100 transition-colors border border-emerald-200 dark:border-emerald-800 border-dashed flex items-center justify-center gap-2 w-full sm:w-auto sm:inline-flex"><Icons.Download/> خروجی اکسل فاکتور</button>
                        </div>
                        <div className="bg-slate-800 dark:bg-slate-950 p-6 sm:p-8 rounded-3xl shadow-xl text-white">
                            <div className="space-y-4">
                                <div className="flex justify-between items-center text-sm font-bold text-slate-400"><span>جمع ردیف‌ها:</span> <span dir="ltr">{formatMoney(subTotal)}</span></div>
                                <div className="flex justify-between items-center">
                                    <span className="text-sm font-bold text-slate-400">تخفیف (تومان):</span>
                                    <CommitNumInput decimal value={ev.discount} onCommit={v=>apiCall('update_finance_totals', {discount: v, tax_percent: ev.tax_percent, deposit: ev.deposit})} className="w-32 bg-slate-900 dark:bg-slate-800 border border-slate-600 p-2.5 rounded-lg text-left text-sm text-white outline-none focus:border-indigo-500" dir="ltr"/>
                                </div>
                                <div className="flex justify-between items-center">
                                    <span className="text-sm font-bold text-slate-400">مالیات (درصد):</span>
                                    <CommitNumInput value={ev.tax_percent} onCommit={v=>apiCall('update_finance_totals', {discount: ev.discount, tax_percent: v, deposit: ev.deposit})} className="w-20 bg-slate-900 dark:bg-slate-800 border border-slate-600 p-2.5 rounded-lg text-center text-sm text-white outline-none focus:border-indigo-500" dir="ltr"/>
                                </div>
                                {taxAmount !== 0 && <div className="flex justify-between items-center text-xs font-bold text-slate-500"><span>مبلغ مالیات:</span> <span dir="ltr">{formatMoney(Math.round(taxAmount))}</span></div>}
                                <div className="pt-4 border-t border-slate-700">
                                    <div className="flex justify-between items-end mb-1"><span className="text-slate-300 font-bold">مبلغ نهایی فاکتور:</span></div>
                                    <div className="text-4xl font-black text-emerald-400 text-left" dir="ltr">{formatMoney(Math.round(total))}</div>
                                </div>
                                <div className="flex justify-between items-center pt-4 border-t border-slate-700 mt-4">
                                    <span className="text-sm font-bold text-amber-400">بیعانه پرداختی کارفرما:</span>
                                    <CommitNumInput decimal value={ev.deposit} onCommit={v=>apiCall('update_finance_totals', {discount: ev.discount, tax_percent: ev.tax_percent, deposit: v})} className="w-40 bg-slate-900 dark:bg-slate-800 border border-amber-600/50 p-2.5 rounded-lg text-left text-sm text-amber-400 outline-none focus:border-amber-400" dir="ltr"/>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {tab === 'team' && (
                <div className="fade-in grid lg:grid-cols-2 gap-6">
                    <div className="bg-white dark:bg-slate-800 p-6 sm:p-8 rounded-3xl shadow-sm border border-slate-200 dark:border-slate-700">
                        <h3 className="font-black text-2xl text-slate-800 dark:text-white mb-6 border-b dark:border-slate-700 pb-4">تخصیص کلی به نقش‌ها</h3>
                        <div className="space-y-4 max-h-[60vh] overflow-y-auto custom-scroll pr-2">
                            {rolesNeeded.length === 0 && <p className="text-slate-400 font-bold text-center">نقشی تعریف نشده است.</p>}
                            {rolesNeeded.map(role => {
                                const roleTasks = tasks.filter(t => t.role_tag === role);
                                const ids = Array.from(new Set(roleTasks.map(t => t.assignee_id || '')));
                                const common = ids.length === 1 ? ids[0] : '';
                                return (
                                    <div key={role} className="bg-slate-50 dark:bg-slate-700 p-4 sm:p-5 rounded-2xl border border-slate-200 dark:border-slate-600 shadow-sm">
                                        <div className="flex justify-between items-center mb-4 gap-2">
                                            <div className="font-black text-indigo-700 dark:text-indigo-300 text-lg">@{toPersianNum(role)}</div>
                                            <div className="text-xs font-bold text-slate-500 dark:text-slate-300 bg-white dark:bg-slate-800 px-3 py-1.5 rounded-lg border dark:border-slate-600 shadow-sm whitespace-nowrap">{toPersianNum(roleTasks.length)} وظیفه در فازهای مختلف</div>
                                        </div>
                                        <select disabled={busy} value={common} onChange={e => {
                                            if(window.confirm(`آیا تمام وظایف این نقش به این شخص محول شود؟`)) {
                                                apiCall('assign_role', { role, assignee_id: e.target.value ? Number(e.target.value) : null });
                                            }
                                        }} className={`w-full border-2 dark:border-slate-600 p-3.5 rounded-xl font-bold outline-none cursor-pointer shadow-sm transition-colors ${common ? 'border-green-400 bg-green-50 dark:bg-green-900/30 dark:text-white' : 'border-slate-300 bg-white dark:bg-slate-800 dark:text-white focus:border-indigo-400'}`}>
                                            <option value="">{ids.length > 1 ? '(چند متصدی مختلف — انتخاب برای یکسان‌سازی)' : '(انتخاب متصدی برای تمام وظایف این نقش)'}</option>
                                            {staffOptions(common)}
                                        </select>
                                    </div>
                                )
                            })}
                        </div>
                    </div>

                    <div className="space-y-6">
                        {delegations.length > 0 && (
                            <div className="bg-white dark:bg-slate-800 p-6 sm:p-8 rounded-3xl shadow-sm border-2 border-red-200 dark:border-red-900">
                                <h3 className="font-black text-xl mb-4 text-red-600 dark:text-red-400">درخواست‌های واگذاری در انتظار تایید</h3>
                                <div className="space-y-3">
                                    {delegations.map(d => (
                                        <div key={d.id} className="bg-slate-50 dark:bg-slate-700 p-4 rounded-2xl border border-slate-200 dark:border-slate-600">
                                            <div className="text-sm font-bold text-slate-700 dark:text-slate-200 leading-relaxed mb-3">({toPersianNum(d.from_name)}) درخواست واگذاری «{toPersianNum(d.task_title)}» به ({toPersianNum(d.to_name)}) را دارد.</div>
                                            <div className="flex gap-2">
                                                <button disabled={busy} onClick={()=>resolveDelegation(d.id, 'approved')} className="flex-1 bg-green-500 text-white font-bold py-2 rounded-lg hover:bg-green-600 shadow-sm">تایید واگذاری</button>
                                                <button disabled={busy} onClick={()=>resolveDelegation(d.id, 'rejected')} className="flex-1 bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 border border-slate-300 dark:border-slate-600 font-bold py-2 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-700">رد درخواست</button>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}
                        <div className="bg-slate-800 dark:bg-slate-950 p-6 sm:p-8 rounded-3xl shadow-xl text-white">
                            <h3 className="font-black text-xl mb-3 flex items-center gap-2 text-indigo-300"><Icons.Activity/> ابزار جایگزینی سریع (Quick Replace)</h3>
                            <p className="text-sm text-slate-300 mb-6 leading-relaxed">در روز رویداد اگر همکاری غایب بود، از این ابزار برای انتقال یکجای وظایف انجام‌نشده او به شخص جدید استفاده کنید.</p>

                            <div className="space-y-3 bg-slate-900/50 p-5 rounded-2xl border border-slate-700">
                                <select value={qrOld} onChange={e=>setQrOld(e.target.value)} className="w-full bg-slate-900 border-2 border-slate-600 p-3.5 rounded-xl outline-none text-sm text-slate-200 focus:border-indigo-400">
                                    <option value="">۱. همکار غایب را انتخاب کنید...</option>
                                    {assignedIds.map(id => <option key={'o'+id} value={id}>{toPersianNum(staffName(id) || '(کاربر حذف‌شده)')}</option>)}
                                </select>
                                <div className="flex justify-center text-slate-500"><Icons.Down/></div>
                                <select value={qrNew} onChange={e=>setQrNew(e.target.value)} className="w-full bg-slate-900 border-2 border-slate-600 p-3.5 rounded-xl outline-none text-sm text-slate-200 focus:border-indigo-400">
                                    <option value="">۲. همکار جایگزین را انتخاب کنید...</option>
                                    {staff.filter(s => String(s.id) !== String(qrOld)).map(s => <option key={'n'+s.id} value={s.id}>{toPersianNum(s.full_name)}</option>)}
                                </select>
                                <button disabled={busy} onClick={handleQuickReplace} className="w-full bg-amber-500 text-amber-950 font-black p-4 rounded-xl hover:bg-amber-400 transition-colors mt-4 shadow-[0_4px_15px_rgba(245,158,11,0.3)]">انتقال وظایف انجام‌نشده به شخص جدید</button>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {tab === 'logs' && (
                <div className="bg-white dark:bg-slate-800 p-6 md:p-8 rounded-3xl shadow-sm border border-slate-200 dark:border-slate-700 fade-in h-[70vh] flex flex-col">
                    <div className="flex justify-between items-center mb-6 border-b dark:border-slate-700 pb-4 gap-3">
                        <h3 className="font-black text-xl sm:text-2xl text-slate-800 dark:text-white">تاریخچه و لاگ سیستم (جعبه سیاه)</h3>
                        <button onClick={()=>exportToCSV(logs, `Logs_${eventId}`, [
                            { key: 'created_at', label: 'زمان', value: l => toJalaliDateTime(l.created_at) },
                            { key: 'user_name', label: 'کاربر' },
                            { key: 'action', label: 'رویداد' },
                        ])} className="bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 font-bold px-4 py-2 rounded-lg hover:bg-slate-200 flex items-center gap-2 whitespace-nowrap"><Icons.Download/> خروجی اکسل</button>
                    </div>
                    <div className="flex-1 overflow-y-auto custom-scroll pr-2 space-y-4">
                        {logs.length === 0 && <p className="text-slate-400 font-bold text-center py-10">هیچ فعالیتی ثبت نشده است.</p>}
                        {logs.map(log => (
                            <div key={log.id} className="flex gap-4 items-start p-4 hover:bg-slate-50 dark:hover:bg-slate-700/50 rounded-2xl transition-colors border border-transparent hover:border-slate-100 dark:hover:border-slate-600">
                                <div className="w-3 h-3 rounded-full bg-indigo-400 mt-2 shrink-0 shadow-[0_0_8px_rgba(99,102,241,0.5)]"></div>
                                <div className="flex-1">
                                    <div className="text-sm font-bold text-slate-700 dark:text-slate-200 leading-relaxed mb-1.5">{toPersianNum(log.action)}</div>
                                    <div className="text-xs font-bold text-slate-400 flex flex-wrap gap-3">
                                        <span className="bg-slate-100 dark:bg-slate-800 px-2 py-1 rounded border dark:border-slate-700">توسط: <b className="text-indigo-600 dark:text-indigo-400">{log.user_name}</b></span>
                                        <span className="bg-slate-100 dark:bg-slate-800 px-2 py-1 rounded border dark:border-slate-700" dir="ltr">{toJalaliDateTime(log.created_at)}</span>
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {editModal && (
                <div className="fixed inset-0 z-[200] bg-slate-900/80 backdrop-blur-sm flex justify-center items-center sm:p-6 fade-in">
                    <div className="bg-white dark:bg-slate-800 w-full sm:max-w-md p-8 rounded-3xl shadow-2xl max-h-full overflow-y-auto custom-scroll">
                        <h3 className="text-2xl font-black text-slate-800 dark:text-white mb-6 border-b dark:border-slate-700 pb-4">ویرایش اطلاعات پایه</h3>
                        <div className="space-y-4">
                            <div>
                                <label className="text-xs font-bold text-slate-500 dark:text-slate-400 mb-2 block">تعداد مهمانان (تاثیرگذار در فاکتور)</label>
                                <NumInput value={editForm.guest_count} onChange={v=>setEditForm({...editForm, guest_count: v})} className="w-full border-2 dark:border-slate-600 p-3.5 rounded-xl font-bold focus:border-indigo-500 outline-none dark:bg-slate-700 dark:text-white" dir="ltr" />
                            </div>
                            <div>
                                <label className="text-xs font-bold text-slate-500 dark:text-slate-400 mb-2 block">مکان برگزاری</label>
                                <select value={editForm.venue_id} onChange={e=>setEditForm({...editForm, venue_id: e.target.value})} className="w-full border-2 dark:border-slate-600 p-3.5 rounded-xl font-bold focus:border-indigo-500 outline-none bg-white dark:bg-slate-700 dark:text-white">
                                    <option value="">(انتخاب مکان)</option>
                                    {(md?.venues||[]).map(v => <option key={v.id} value={v.id}>{toPersianNum(v.name)}</option>)}
                                </select>
                            </div>
                            <div>
                                <label className="text-xs font-bold text-slate-500 dark:text-slate-400 mb-2 block">تاریخ شروع رویداد</label>
                                <JalaliDatePicker value={editForm.start_date} onChange={val => setEditForm(f => ({...f, start_date: val}))} />
                            </div>
                            <div>
                                <label className="text-xs font-bold text-slate-500 dark:text-slate-400 mb-2 block">تاریخ پایان رویداد</label>
                                <JalaliDatePicker value={editForm.end_date} onChange={val => setEditForm(f => ({...f, end_date: val}))} />
                            </div>
                        </div>
                        <div className="flex gap-3 mt-8">
                            <button onClick={()=>setEditModal(false)} className="flex-1 py-3.5 bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 font-bold rounded-xl hover:bg-slate-200 transition-colors">انصراف</button>
                            <button disabled={busy} onClick={saveEditEvent} className="flex-1 py-3.5 bg-indigo-600 text-white font-bold rounded-xl shadow-lg hover:bg-indigo-700 transition-colors">ذخیره و محاسبه مجدد</button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
