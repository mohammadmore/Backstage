import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { api } from '../lib/api';
import { toPersianNum, toJalaliDate, toJalaliDateTime, parseDate, isOn, exportToCSV, formatMoney, statusInfo, EVENT_STATUS, TIMINGS, detectPhase } from '../lib/utils';
import { toast, confirmDialog, formDialog } from '../lib/ui';
import { Icons } from '../components/Icons';
import { EventTimer } from '../components/EventTimer';
import JalaliDatePicker from '../components/JalaliDatePicker';
import { NumInput, CommitNumInput } from '../components/NumInput';
import { isOverdue, dueLabel, ROLE_LABELS } from '../lib/utils';
import GuestsTab from './GuestsTab';
import ExtrasPanel, { TaskExtrasModal } from '../components/ExtrasPanel';
import { PaymentsPanel, FeesPanel, PortalPanel, RatingsPanel, duplicateEvent } from './EventExtras';

export const DETAIL_TABS = [
    { id: 'operations', label: 'فازهای عملیاتی' },
    { id: 'finance', label: 'فاکتور' },
    { id: 'team', label: 'تخصیص‌ها' },
    { id: 'guests', label: 'مهمانان' },
    { id: 'files', label: 'فایل‌ها و یادداشت‌ها' },
    { id: 'logs', label: 'گزارشات زنده' },
];

const card = 'glass rounded-3xl border';
const iconBtn = 'p-2 rounded-lg text-slate-500 dark:text-slate-400 hover:bg-white/60 dark:hover:bg-white/10';

/** نسخه قابل چاپ فاکتور (فقط هنگام چاپ نمایش داده می‌شود) */
function InvoicePrint({ ev, services, totals }) {
    const [host] = useState(() => {
        let el = document.getElementById('print-area');
        if (!el) { el = document.createElement('div'); el.id = 'print-area'; document.body.appendChild(el); }
        return el;
    });
    const td = { border: '1px solid #cbd5e1', padding: '6px 8px' };
    return createPortal(
        <div dir="rtl" style={{ fontFamily: 'Vazirmatn, tahoma', color: '#0f172a', fontSize: 12 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', borderBottom: '2px solid #0f172a', paddingBottom: 10, marginBottom: 14 }}>
                <div>
                    <div style={{ fontSize: 20, fontWeight: 700 }}>پیش‌فاکتور خدمات</div>
                    <div style={{ marginTop: 4 }}>{toPersianNum(ev.title)}</div>
                </div>
                <div style={{ textAlign: 'left', lineHeight: 1.9 }}>
                    <div>شماره پرونده: {toPersianNum(ev.id)}</div>
                    <div>تاریخ صدور: {toJalaliDate(new Date())}</div>
                </div>
            </div>
            <div style={{ marginBottom: 12, lineHeight: 1.9 }}>
                <div>کارفرما: {toPersianNum(ev.org_name) || '---'} {ev.contact_name ? `(${ev.contact_name})` : ''}</div>
                <div>زمان رویداد: {toJalaliDateTime(ev.start_date)} | مکان: {toPersianNum(ev.venue_name) || '---'} | تعداد مهمانان: {toPersianNum(ev.guest_count)}</div>
            </div>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead><tr style={{ background: '#f1f5f9' }}>{['ردیف', 'شرح خدمات', 'تعداد', 'فی (تومان)', 'مبلغ کل (تومان)'].map(h => <th key={h} style={{ ...td, textAlign: 'right' }}>{h}</th>)}</tr></thead>
                <tbody>
                    {services.map((s, i) => (
                        <tr key={s.id}>
                            <td style={td}>{toPersianNum(i + 1)}</td>
                            <td style={td}>{toPersianNum(s.service_name)}</td>
                            <td style={td}>{toPersianNum(s.qty)}</td>
                            <td style={td}>{s.unit_price !== null ? formatMoney(s.unit_price) : 'TBD'}</td>
                            <td style={td}>{s.frozen_price !== null ? formatMoney(s.frozen_price) : 'TBD'}</td>
                        </tr>
                    ))}
                </tbody>
            </table>
            <table style={{ width: '45%', marginTop: 14, marginRight: 'auto', borderCollapse: 'collapse' }}>
                <tbody>
                    {[['جمع ردیف‌ها', totals.subTotal], ['تخفیف', totals.discount], [`مالیات (${toPersianNum(totals.taxPercent)}٪)`, Math.round(totals.taxAmount)], ['مبلغ نهایی', Math.round(totals.total)], ['بیعانه پرداختی', totals.deposit], ['مانده قابل پرداخت', Math.round(totals.remaining)]].map(([k, v], i) => (
                        <tr key={k} style={{ fontWeight: i === 3 || i === 5 ? 700 : 400 }}><td style={td}>{k}</td><td style={td}>{formatMoney(v)} تومان</td></tr>
                    ))}
                </tbody>
            </table>
            {totals.tbdCount > 0 && <p style={{ marginTop: 10, color: '#b45309' }}>{toPersianNum(totals.tbdCount)} ردیف هنوز قیمت‌گذاری نشده (TBD) و در جمع لحاظ نشده است.</p>}
        </div>,
        host
    );
}

// =====================================
// داشبورد اتاق فرمان رویداد
// =====================================
export default function EventDetail({ eventId, onBack, md, user, tab = 'operations', onTabChange }) {
    const [data, setData] = useState(null);
    const [notFound, setNotFound] = useState(false);
    const [activePhase, setActivePhase] = useState('');
    const [editModal, setEditModal] = useState(false);
    const [editForm, setEditForm] = useState({});
    const [qrOld, setQrOld] = useState('');
    const [qrNew, setQrNew] = useState('');
    const [busy, setBusy] = useState(false);
    const [extrasTask, setExtrasTask] = useState(null);
    const staff = md?.staff || [];
    const assignable = staff.filter(s => ['staff', 'manager'].includes(s.role || 'staff'));

    const loadData = async () => {
        const res = await api('get_event_detail', null, { id: eventId }, { silent: !!data });
        if (res) {
            setData(res);
            setActivePhase(p => p || detectPhase(res.event));
        } else if (!data) setNotFound(true);
        return res;
    };
    useEffect(() => { setData(null); setNotFound(false); setActivePhase(''); loadData(); }, [eventId]);
    useEffect(() => {
        if (!editModal) return;
        const onKey = (e) => { if (e.key === 'Escape' && !document.querySelector('#ui-host [role="dialog"]')) setEditModal(false); };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [editModal]);

    /** فراخوانی API + بارگذاری مجدد؛ در صورت موفقیت پیام کوتاه نمایش می‌دهد */
    const apiCall = async (action, body, successMsg) => {
        setBusy(true);
        const res = await api(action, { ...body, event_id: eventId });
        await loadData();
        setBusy(false);
        if (res && successMsg) toast(successMsg);
        return res;
    };

    if (notFound) return (
        <div className="text-center py-24">
            <p className="text-slate-600 dark:text-slate-300 mb-4">این رویداد پیدا نشد یا حذف شده است.</p>
            <button type="button" onClick={onBack} className="btn-grad text-white px-5 py-2.5 rounded-xl font-semibold">بازگشت به لیست رویدادها</button>
        </div>
    );
    if (!data) return <div className="flex h-64 items-center justify-center pulse-text text-slate-500 text-lg">اتاق فرمان در حال بارگذاری است...</div>;

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
    const deposit = Number(data.fin?.paid) || 0;
    const access = data.access || { tasks: true, finance: true, admin: true };
    const busyMap = data.conflicts?.busy || {};
    const conflicts = data.conflicts || { venue: [], staff: [] };
    const remaining = total - deposit;
    const tbdCount = services.filter(s => s.frozen_price === null || s.frozen_price === undefined).length;
    const totals = { subTotal, discount, taxPercent, taxAmount, total, deposit, remaining, tbdCount };
    const doneCount = tasks.filter(t => isOn(t.is_done)).length;
    const progress = tasks.length ? (doneCount / tasks.length) * 100 : 0;

    const kanbanCols = [...TIMINGS];
    const tasksByTiming = {};
    kanbanCols.forEach(c => tasksByTiming[c] = tasks.filter(t => t.timing_tag === c));
    const noTimingTasks = tasks.filter(t => !TIMINGS.includes(t.timing_tag));
    if (noTimingTasks.length > 0) { kanbanCols.push('سایر زمان‌ها'); tasksByTiming['سایر زمان‌ها'] = noTimingTasks; }
    const currentPhase = detectPhase(ev);

    const rolesNeeded = Array.from(new Set(tasks.map(t => t.role_tag).filter(Boolean)));
    const assignedIds = Array.from(new Set(tasks.filter(t => !isOn(t.is_done)).map(t => t.assignee_id).filter(Boolean)));
    const staffName = (id) => staff.find(s => s.id == id)?.full_name;
    const isLocked = (t) => !!t.depends_on_id && !isOn(t.dep_done) && !isOn(t.is_done);

    const staffOptions = (currentId) => (
        <>
            {assignable.map(s => <option key={s.id} value={s.id}>{toPersianNum(s.full_name)} {isOn(s.is_shadow) ? '(📞)' : ''}{busyMap[s.id] && s.id != currentId ? ` — ⚠ هم‌زمان در «${busyMap[s.id][0]}»` : ''}</option>)}
            {currentId && !staff.some(s => s.id == currentId) && <option value={currentId}>(کاربر حذف‌شده)</option>}
        </>
    );

    // ---------- عملیات وظایف ----------
    const toggleDone = (t) => {
        if (!isOn(t.is_done) && isLocked(t)) return toast(`این تسک قفل است؛ ابتدا «${t.dep_title}» باید انجام شود.`, 'warning');
        apiCall('update_task', { task_id: t.id, is_done: !isOn(t.is_done) });
    };
    const reportIssue = async (t) => {
        if (isOn(t.has_issue)) return apiCall('update_task', { task_id: t.id, has_issue: false }, 'مانع برطرف شد.');
        const v = await formDialog({ title: 'گزارش مانع', message: `وظیفه: «${t.title}»`, fields: [{ name: 'note', label: 'دلیل توقف کار', type: 'textarea', required: true }], confirmText: 'ثبت مانع', danger: true });
        if (v) apiCall('update_task', { task_id: t.id, has_issue: true, issue_note: v.note }, 'مانع ثبت شد.');
    };
    const timingOptions = TIMINGS.map(x => ({ value: x, label: x }));
    const addQuickTask = async () => {
        const v = await formDialog({
            title: 'افزودن تسک آزاد',
            fields: [
                { name: 'title', label: 'عنوان وظیفه', required: true },
                { name: 'timing', label: 'فاز', type: 'select', value: TIMINGS.includes(activePhase) ? activePhase : TIMINGS[0], options: timingOptions },
                { name: 'due_at', label: 'موعد (خالی = پیش‌فرض فاز)', type: 'datetime' },
            ],
            confirmText: 'افزودن',
        });
        if (v) { const r = await apiCall('add_quick_task', v, 'تسک افزوده شد.'); if (r) setActivePhase(v.timing); }
    };
    const editTask = async (t) => {
        const v = await formDialog({
            title: 'ویرایش وظیفه',
            fields: [
                { name: 'title', label: 'عنوان', value: t.title, required: true },
                { name: 'role_tag', label: 'نقش', value: t.role_tag || '' },
                { name: 'timing_tag', label: 'فاز', type: 'select', value: TIMINGS.includes(t.timing_tag) ? t.timing_tag : TIMINGS[0], options: timingOptions },
                { name: 'due_at', label: 'موعد انجام', type: 'datetime', value: t.due_at ? t.due_at.slice(0, 16).replace(' ', 'T') : '' },
            ],
            confirmText: 'ذخیره',
        });
        if (v) apiCall('update_task_info', { task_id: t.id, ...v }, 'وظیفه ویرایش شد.');
    };
    const deleteTask = async (t) => {
        const dependents = tasks.filter(x => x.depends_on_id === t.id).length;
        const ok = await confirmDialog({
            title: 'حذف وظیفه',
            message: `وظیفه «${t.title}» حذف شود؟` + (dependents ? `\n${toPersianNum(dependents)} وظیفه که به این وظیفه وابسته بودند، از قفل آزاد می‌شوند.` : ''),
            confirmText: 'حذف', danger: true,
        });
        if (ok) apiCall('delete_task', { task_id: t.id }, 'وظیفه حذف شد.');
    };

    // ---------- فاکتور ----------
    const addAdhocService = async () => {
        const v = await formDialog({
            title: 'افزودن ردیف به فاکتور',
            fields: [
                { name: 'name', label: 'شرح خدمات', required: true },
                { name: 'price', label: 'مبلغ (تومان) — خالی یعنی TBD', type: 'money' },
            ],
            confirmText: 'افزودن',
        });
        if (v) apiCall('add_adhoc_service', v, 'ردیف به فاکتور اضافه شد.');
    };
    const renameRow = async (s) => {
        const v = await formDialog({ title: 'ویرایش شرح خدمات', fields: [{ name: 'service_name', label: 'شرح خدمات', value: s.service_name, required: true }], confirmText: 'ذخیره' });
        if (v) apiCall('update_finance_item', { service_id: s.id, qty: s.qty, unit_price: s.unit_price, service_name: v.service_name }, 'ردیف ویرایش شد.');
    };
    const deleteRow = async (s) => {
        if (await confirmDialog({ title: 'حذف ردیف فاکتور', message: `ردیف «${s.service_name}» از فاکتور حذف شود؟`, confirmText: 'حذف', danger: true })) {
            apiCall('delete_finance_item', { service_id: s.id }, 'ردیف حذف شد.');
        }
    };
    const commitRow = async (s, patch) => !!(await apiCall('update_finance_item', { service_id: s.id, qty: s.qty, unit_price: s.unit_price, ...patch }));
    const commitTotals = async (patch) => !!(await apiCall('update_finance_totals', { discount: ev.discount, tax_percent: ev.tax_percent, deposit: ev.deposit, ...patch }));

    // ---------- تیم ----------
    const assignRole = async (role, value) => {
        const name = value ? staffName(value) : null;
        const ok = await confirmDialog({ title: 'تخصیص گروهی', message: name ? `تمام وظایف نقش «${role}» به «${name}» محول شود؟` : `متصدی همه وظایف نقش «${role}» حذف شود؟`, confirmText: 'تایید' });
        if (ok) apiCall('assign_role', { role, assignee_id: value ? Number(value) : null }, 'تخصیص انجام شد.');
    };
    const handleQuickReplace = async () => {
        if (!qrOld || !qrNew) return toast('هر دو همکار را انتخاب کنید.', 'warning');
        const ok = await confirmDialog({ title: 'جایگزینی سریع', message: `تمام وظایف انجام‌نشده «${staffName(qrOld) || 'این همکار'}» به «${staffName(qrNew)}» منتقل شود؟`, confirmText: 'انتقال' });
        if (!ok) return;
        const res = await apiCall('quick_replace', { old_user_id: Number(qrOld), new_user_id: Number(qrNew) });
        if (res) { toast(`${toPersianNum(res.moved ?? 0)} وظیفه منتقل شد.`); setQrOld(''); setQrNew(''); }
    };
    const resolveDelegation = (delId, status) => apiCall('resolve_delegation', { delegation_id: delId, status }, status === 'approved' ? 'واگذاری تایید شد.' : 'درخواست رد شد.');

    // ---------- حذف رویداد (فقط مدیر کل) ----------
    const deleteEvent = async () => {
        const counts = [data.payments && data.payments.length ? `${toPersianNum(data.payments.length)} پرداخت` : '', Number(data.guest_stats?.total) > 0 ? `${toPersianNum(data.guest_stats.total)} مهمان` : ''].filter(Boolean).join('، ');
        const v = await formDialog({
            title: 'حذف دائمی رویداد',
            message: `رویداد «${ev.title}» با همه وظایف، فاکتور، پرداخت‌ها، دستمزدها، مهمانان، پیوست‌ها و یادداشت‌هایش برای همیشه حذف می‌شود${counts ? ` (از جمله ${counts})` : ''}. این کار قابل بازگشت نیست.\n\nبرای تایید، عنوان رویداد را عیناً وارد کنید.`,
            fields: [{ name: 'confirm_title', label: 'عنوان رویداد', placeholder: ev.title, required: true }],
            confirmText: 'حذف دائمی', danger: true,
        });
        if (!v) return;
        if (v.confirm_title.trim() !== String(ev.title).trim()) { toast('عنوان واردشده با عنوان رویداد یکسان نیست؛ رویداد حذف نشد.', 'error'); return; }
        const r = await api('delete_event', { event_id: ev.id, confirm_title: v.confirm_title.trim() });
        if (r) { toast('رویداد حذف شد.'); onBack(); }
    };

    // ---------- ویرایش اطلاعات پایه ----------
    const openEditModal = () => {
        setEditForm({ title: ev.title, manager_id: ev.manager_id || '', venue_id: ev.venue_id || '', guest_count: ev.guest_count ?? '', start_date: ev.start_date ? ev.start_date.slice(0, 16).replace(' ', 'T') : '', end_date: ev.end_date ? ev.end_date.slice(0, 16).replace(' ', 'T') : '' });
        setEditModal(true);
    };
    const saveEditEvent = async () => {
        const s = parseDate(editForm.start_date), e = parseDate(editForm.end_date);
        if (s && e && e < s) return toast('تاریخ پایان رویداد نمی‌تواند قبل از تاریخ شروع باشد.', 'warning');
        const body = { ...editForm, venue_id: editForm.venue_id || null, manager_id: editForm.manager_id || null };
        if (!access.admin) delete body.manager_id;
        const res = await apiCall('update_event_details', body, 'اطلاعات رویداد ذخیره شد.');
        if (res) setEditModal(false);
    };

    const st = statusInfo(ev.status);
    const numCls = 'glass w-full border-2 focus:border-indigo-500 p-2 rounded-lg font-semibold dark:text-white';

    return (
        <div className="fade-in max-w-[90rem] mx-auto pb-24">
            {/* تایمر چسبان زیر هدر */}
            <div className="sticky top-[72px] sm:top-[76px] z-30 -mx-4 md:-mx-8 mb-5"><EventTimer start={ev.start_date} end={ev.end_date} /></div>

            <div className="flex flex-col md:flex-row justify-between md:items-end gap-4 mb-5">
                <div>
                    <button type="button" onClick={onBack} className="glass mb-3 text-sm font-semibold text-slate-600 dark:text-slate-300 inline-flex items-center gap-2 hover:text-indigo-600 px-3.5 py-2 rounded-xl border"><Icons.ArrowRight /> بازگشت به لیست</button>
                    <div className="flex items-center gap-2 mb-2 flex-wrap">
                        <span className="bg-grad text-white px-2.5 py-0.5 rounded-lg text-xs font-semibold tracking-wider">پرونده {toPersianNum(eventId)}</span>
                        <span className={`px-2.5 py-0.5 rounded-lg text-xs font-semibold border ${st.badge}`}>{st.label}</span>
                        {delegations.length > 0 && <button type="button" onClick={() => onTabChange('team')} className="bg-red-500 text-white px-2.5 py-0.5 rounded-lg text-xs font-semibold">{toPersianNum(delegations.length)} درخواست واگذاری</button>}
                    </div>
                    <h1 className="text-2xl sm:text-3xl font-bold text-slate-800 dark:text-white">{toPersianNum(ev.title)}</h1>
                    <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">مدیر پروژه: {ev.manager_name ? toPersianNum(ev.manager_name) : 'مدیر کل'}{ev.client_approved_at && <span className="text-emerald-700 dark:text-emerald-400 font-semibold mr-2">· ✓ تایید کارفرما</span>}</p>
                </div>
                <div className="flex flex-wrap gap-2">
                    {access.tasks && <button type="button" onClick={() => duplicateEvent(ev, false)} className="glass border px-3.5 py-2.5 rounded-xl font-semibold text-sm">کپی رویداد</button>}
                    {access.tasks && <button type="button" onClick={() => duplicateEvent(ev, true)} className="glass border px-3.5 py-2.5 rounded-xl font-semibold text-sm">ذخیره به‌عنوان قالب</button>}
                    {access.tasks && <button type="button" onClick={openEditModal} className="glass border-2 text-slate-700 dark:text-slate-300 px-4 py-2.5 rounded-xl font-semibold hover:bg-white/60 dark:hover:bg-white/10 inline-flex items-center gap-2"><Icons.Edit /> ویرایش اطلاعات</button>}
                    {user && user.is_admin && <button type="button" onClick={deleteEvent} className="glass border-2 border-red-200 dark:border-red-900/60 text-red-600 dark:text-red-400 px-3.5 py-2.5 rounded-xl font-semibold text-sm hover:bg-red-50 dark:hover:bg-red-900/30 inline-flex items-center gap-1.5"><Icons.Trash /> حذف رویداد</button>}
                    <label className="sr-only" htmlFor="ev-status">وضعیت رویداد</label>
                    <select id="ev-status" disabled={!access.tasks} value={ev.status} onChange={e => apiCall('update_event_status', { status: e.target.value }, 'وضعیت رویداد تغییر کرد.')} className="bg-grad text-white px-4 py-2.5 rounded-xl font-semibold cursor-pointer">
                        {Object.entries(EVENT_STATUS).map(([k, v]) => <option key={k} value={k}>وضعیت: {v.label}</option>)}
                    </select>
                </div>
            </div>

            {(conflicts.venue.length > 0 || conflicts.staff.length > 0) && (
                <div className="mb-5 rounded-2xl border border-red-300 dark:border-red-800 bg-red-50/80 dark:bg-red-900/20 p-4 text-sm text-red-800 dark:text-red-200" role="alert">
                    <b className="block mb-1">⚠ تداخل زمانی با رویدادهای دیگر</b>
                    {conflicts.venue.map(c => <div key={'v' + c.event_id}>مکان «{toPersianNum(c.venue_name)}» هم‌زمان برای «{toPersianNum(c.title)}» رزرو شده است.</div>)}
                    {conflicts.staff.map(c => <div key={'s' + c.user_id}>«{toPersianNum(c.full_name)}» هم‌زمان در {c.events.map(e => `«${toPersianNum(e)}»`).join('، ')} وظیفه دارد.</div>)}
                </div>
            )}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
                <div className={`${card} p-4 relative overflow-hidden`}>
                    <div className="text-xs text-slate-500 dark:text-slate-400 mb-1 flex items-center gap-1.5"><Icons.Building /> سازمان</div>
                    <div className="font-bold text-slate-800 dark:text-white truncate">{toPersianNum(ev.org_name) || '---'}</div>
                    <div className="text-xs text-indigo-600 dark:text-indigo-400 mt-1 truncate">{toPersianNum(ev.contact_name) || 'بدون مدیر هماهنگی'}</div>
                </div>
                <div className={`${card} p-4`}>
                    <div className="text-xs text-slate-500 dark:text-slate-400 mb-1 flex items-center gap-1.5"><Icons.Calendar /> شروع رویداد</div>
                    <div className="font-semibold text-slate-800 dark:text-white text-sm leading-relaxed">{toJalaliDateTime(ev.start_date)}</div>
                </div>
                <div className={`${card} p-4`}>
                    <div className="text-xs text-slate-500 dark:text-slate-400 mb-1 flex items-center gap-1.5"><Icons.Users /> مکان و ابعاد</div>
                    <div className="font-bold text-slate-800 dark:text-white truncate">{toPersianNum(ev.venue_name) || '---'}</div>
                    <div className="text-xs text-slate-500 dark:text-slate-400 mt-1">{toPersianNum(ev.guest_count)} مهمان</div>
                </div>
                <div className="bg-grad p-4 rounded-3xl text-white">
                    <div className="text-xs text-indigo-100 mb-1 flex items-center gap-1.5"><Icons.Activity /> پیشرفت عملیات</div>
                    <div className="font-bold text-2xl" dir="ltr">{toPersianNum(Math.round(progress))}%</div>
                    <div className="text-xs text-indigo-100">{toPersianNum(doneCount)} از {toPersianNum(tasks.length)} وظیفه</div>
                    <div className="w-full bg-white/25 h-1.5 rounded-full mt-2 overflow-hidden" role="progressbar" aria-valuenow={Math.round(progress)} aria-valuemin={0} aria-valuemax={100}><div className="bg-white h-full transition-all duration-700" style={{ width: `${progress}%` }}></div></div>
                </div>
            </div>

            <div className="flex gap-1 mb-5 border-b-2 border-violet-200/60 dark:border-white/10 overflow-x-auto custom-scroll" role="tablist">
                {DETAIL_TABS.map(t => (
                    <button key={t.id} type="button" role="tab" aria-selected={tab === t.id} onClick={() => onTabChange(t.id)} className={`px-5 py-2.5 rounded-t-xl font-semibold whitespace-nowrap transition-colors ${tab === t.id ? 'bg-grad text-white' : 'text-slate-600 dark:text-slate-400 hover:bg-white/60 dark:hover:bg-white/10'}`}>{t.label}{t.id === 'team' && delegations.length > 0 ? ` (${toPersianNum(delegations.length)})` : ''}{t.id === 'guests' && Number(data.guest_stats?.total) > 0 ? ` (${toPersianNum(data.guest_stats.checked_in || 0)}/${toPersianNum(data.guest_stats.total)})` : ''}</button>
                ))}
            </div>

            {tab === 'operations' && (
                <div className="fade-in">
                    <div className="glass flex flex-wrap gap-2 mb-5 p-2 rounded-2xl border" role="group" aria-label="فاز">
                        {kanbanCols.map(col => {
                            const list = tasksByTiming[col] || [];
                            const done = list.filter(t => isOn(t.is_done)).length;
                            return (
                                <button key={col} type="button" aria-pressed={activePhase === col} onClick={() => setActivePhase(col)} className={`flex-1 min-w-[120px] py-2.5 px-3 rounded-xl text-sm font-semibold transition-colors ${activePhase === col ? 'bg-grad text-white' : 'glass-soft text-slate-700 dark:text-slate-300 hover:bg-white/60 dark:hover:bg-white/10 border'}`}>
                                    {col}{col === currentPhase && <span className="mr-1 text-[10px] bg-red-500 text-white px-1.5 py-0.5 rounded">الان</span>}
                                    <span className="block text-xs opacity-75 font-normal mt-0.5">{toPersianNum(done)}/{toPersianNum(list.length)} انجام شده</span>
                                </button>
                            );
                        })}
                    </div>

                    <div className="glass-soft border-2 border-violet-200/60 dark:border-white/10 rounded-3xl p-3 sm:p-6 min-h-[40vh]">
                        <div className="flex justify-between items-center mb-4 gap-3">
                            <h2 className="text-lg sm:text-xl font-bold text-slate-800 dark:text-white">تسک‌های فاز: <span className="text-indigo-600 dark:text-indigo-400">{activePhase}</span></h2>
                            <button type="button" disabled={!access.tasks} onClick={addQuickTask} className="text-indigo-700 dark:text-indigo-300 font-semibold px-4 py-2 rounded-xl hover:bg-white/60 dark:hover:bg-white/10 whitespace-nowrap bg-grad-soft">+ تسک آزاد</button>
                        </div>

                        <ul className="space-y-3">
                            {(tasksByTiming[activePhase] || []).length === 0 && <li className="text-center py-10 text-slate-500">هیچ وظیفه‌ای در این فاز ثبت نشده است.</li>}
                            {(tasksByTiming[activePhase] || []).map(t => {
                                const locked = isLocked(t);
                                const done = isOn(t.is_done);
                                const hasIssue = isOn(t.has_issue);
                                return (
                                    <li key={t.id} className={`p-4 rounded-2xl border-2 flex flex-col md:flex-row justify-between md:items-center gap-3 ${locked ? 'glass-soft gray-chain-locked' : hasIssue ? 'bg-red-50 dark:bg-red-900/20 border-red-300' : done ? 'bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-900' : 'glass hover:border-indigo-300'}`}>
                                        <div className="flex items-start gap-3 min-w-0">
                                            <button type="button" disabled={locked || busy} aria-pressed={done} aria-label={done ? `برگرداندن «${t.title}» به انجام‌نشده` : `علامت انجام‌شده برای «${t.title}»`} title={locked ? 'قفل: پیش‌نیاز انجام نشده' : ''} onClick={() => toggleDone(t)} className={`w-11 h-11 shrink-0 rounded-xl border-2 flex items-center justify-center transition-colors disabled:cursor-not-allowed ${done ? 'bg-green-500 border-green-500 text-white' : locked ? 'bg-slate-200 dark:bg-slate-700 border-slate-300 dark:border-white/10 text-slate-500' : 'glass text-slate-300 dark:text-slate-500 hover:border-green-500 hover:text-green-500'}`}>{locked ? <Icons.Lock /> : <Icons.Check />}</button>
                                            <div className="min-w-0">
                                                <div className={`font-semibold leading-relaxed ${done ? 'line-through text-slate-500' : 'text-slate-800 dark:text-slate-100'}`}>{toPersianNum(t.title)}</div>
                                                <div className="flex flex-wrap items-center gap-1.5 mt-1.5">
                                                    {t.role_tag && <span className="text-xs text-indigo-700 dark:text-indigo-300 px-2 py-0.5 rounded-md border border-indigo-200 dark:border-indigo-800 bg-grad-soft">@{toPersianNum(t.role_tag)}</span>}
                                                    {locked && <span className="text-xs text-amber-800 dark:text-amber-300 bg-amber-50 dark:bg-amber-900/40 px-2 py-0.5 rounded-md border border-amber-200 dark:border-amber-800 inline-flex items-center gap-1"><Icons.Lock /> منتظر: {toPersianNum(t.dep_title)}</span>}
                                                    {hasIssue && <span className="text-xs text-red-700 bg-red-100 px-2 py-0.5 rounded-md border border-red-200">مانع: {toPersianNum(t.issue_note)}</span>}
                                                    {t.due_at && !done && <span className={`text-xs px-2 py-0.5 rounded-md border inline-flex items-center gap-1 ${isOverdue(t) ? 'text-red-700 bg-red-50 border-red-300 dark:bg-red-900/30 dark:text-red-300 font-semibold' : 'text-slate-600 dark:text-slate-300 glass-soft'}`} title={toJalaliDateTime(t.due_at)}><Icons.Clock /> {isOverdue(t) ? 'عقب‌افتاده: ' : 'موعد: '}{dueLabel(t.due_at)}</span>}
                                                    <button type="button" onClick={() => setExtrasTask(t)} className="text-xs px-2 py-0.5 rounded-md border glass-soft text-slate-600 dark:text-slate-300 hover:border-violet-400" aria-label={`فایل‌ها و یادداشت‌های «${t.title}»`}>📎 {toPersianNum(Number(t.attach_count) || 0)} · 💬 {toPersianNum(Number(t.note_count) || 0)}</button>
                                                </div>
                                            </div>
                                        </div>
                                        <div className="flex flex-wrap sm:flex-nowrap gap-2 items-center border-t md:border-t-0 border-violet-200/60 dark:border-white/10 pt-3 md:pt-0">
                                            {/* تخصیص متصدی حتی برای تسک‌های قفل هم ممکن است */}
                                            <div className="flex relative flex-1 sm:w-52 sm:flex-none">
                                                {t.assignee_avatar && <img src={t.assignee_avatar} alt="" className="w-8 h-8 rounded-full border-2 border-white dark:border-white/10 absolute right-1.5 top-1.5 z-10 pointer-events-none object-cover bg-white" />}
                                                <select aria-label={`متصدی «${t.title}»`} disabled={busy || !access.tasks} value={t.assignee_id || ''} onChange={e => apiCall('update_task', { task_id: t.id, assignee_id: e.target.value ? Number(e.target.value) : null })} className={`border-2 p-2.5 rounded-xl font-semibold w-full appearance-none cursor-pointer text-sm ${t.assignee_avatar ? 'pr-11' : ''} ${!t.assignee_id ? 'bg-amber-50 dark:bg-amber-900/30 border-amber-300 dark:border-amber-700 text-amber-900 dark:text-amber-200' : 'glass dark:text-white'}`}>
                                                    <option value="">(بدون متصدی)</option>
                                                    {staffOptions(t.assignee_id)}
                                                </select>
                                            </div>
                                            {access.tasks && <>
                                            <button type="button" disabled={busy} onClick={() => reportIssue(t)} className={`px-3 py-2.5 rounded-xl font-semibold text-sm border whitespace-nowrap ${hasIssue ? 'bg-green-50 text-green-700 border-green-200 hover:bg-green-100' : 'glass text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/30'}`}>{hasIssue ? 'رفع مانع' : 'گزارش مانع'}</button>
                                            <button type="button" onClick={() => editTask(t)} className={iconBtn} aria-label={`ویرایش «${t.title}»`} title="ویرایش"><Icons.Edit /></button>
                                            <button type="button" onClick={() => deleteTask(t)} className={`${iconBtn} text-red-500 hover:text-red-700`} aria-label={`حذف «${t.title}»`} title="حذف"><Icons.Trash /></button>
                                            </>}
                                        </div>
                                    </li>
                                );
                            })}
                        </ul>
                    </div>
                </div>
            )}

            {tab === 'finance' && (
                <div className={`fade-in ${card} p-4 sm:p-8`}>
                    <InvoicePrint ev={ev} services={services} totals={totals} />
                    <div className="flex flex-col md:flex-row justify-between md:items-end border-b-2 border-slate-800 dark:border-white/10 pb-5 mb-6 gap-4">
                        <div>
                            <h2 className="text-2xl sm:text-3xl font-bold text-slate-800 dark:text-white">فاکتور خدمات</h2>
                            <p className="text-sm text-slate-500 dark:text-slate-400 mt-1.5">تعداد و فی را مستقیم ویرایش کنید؛ با خروج از فیلد ذخیره می‌شود.</p>
                            {tbdCount > 0 && <p className="text-xs font-semibold text-amber-700 dark:text-amber-400 mt-2">⚠️ {toPersianNum(tbdCount)} ردیف هنوز قیمت‌گذاری نشده (TBD) و در جمع محاسبه نمی‌شود.</p>}
                        </div>
                        <div className="glass-soft p-4 rounded-2xl border border-violet-200/60 dark:border-white/10 min-w-[230px]">
                            <div className="text-sm text-slate-500 dark:text-slate-400 mb-1">مانده قابل پرداخت (تومان)</div>
                            <div className="text-3xl font-bold text-green-700 dark:text-green-400" dir="ltr">{formatMoney(Math.round(remaining))}</div>
                        </div>
                    </div>

                    {services.length === 0 && <p className="p-6 text-center text-slate-500">ردیفی در فاکتور ثبت نشده است.</p>}
                    {/* دسکتاپ: جدول */}
                    {services.length > 0 && (
                        <div className="hidden md:block overflow-x-auto custom-scroll pb-4 mb-6">
                            <table className="w-full text-right">
                                <thead><tr className="glass-soft text-slate-600 dark:text-slate-200 text-sm"><th className="p-3 rounded-r-xl font-semibold w-12">ردیف</th><th className="p-3 font-semibold">شرح خدمات</th><th className="p-3 font-semibold w-24">تعداد</th><th className="p-3 font-semibold w-44">فی (تومان)</th><th className="p-3 font-semibold w-44">مبلغ کل (تومان)</th><th className="p-3 rounded-l-xl w-24"><span className="sr-only">عملیات</span></th></tr></thead>
                                <tbody>
                                    {services.map((s, idx) => (
                                        <tr key={s.id} className="border-b border-violet-200/60 dark:border-white/10">
                                            <td className="p-3 text-slate-500 text-center">{toPersianNum(idx + 1)}</td>
                                            <td className="p-3 font-semibold text-slate-800 dark:text-slate-100 leading-relaxed">{toPersianNum(s.service_name)} <span className="text-[11px] font-normal bg-slate-200 dark:bg-slate-600 text-slate-600 dark:text-slate-300 px-1.5 py-0.5 rounded mr-1">{s.cost_type === 'individual' ? 'نفری' : 'ثابت'}</span></td>
                                            <td className="p-3"><CommitNumInput label={`تعداد ${s.service_name}`} value={s.qty} onCommit={v => commitRow(s, { qty: v === '' ? 0 : v })} className={`${numCls} text-center`} /></td>
                                            <td className="p-3"><CommitNumInput money label={`فی ${s.service_name}`} value={s.unit_price} onCommit={v => commitRow(s, { unit_price: v })} placeholder="TBD" className={numCls} dir="ltr" /></td>
                                            <td className="p-3 font-bold text-indigo-700 dark:text-indigo-400" dir="ltr">{s.frozen_price !== null && s.frozen_price !== undefined ? formatMoney(s.frozen_price) : 'TBD'}</td>
                                            <td className="p-3 whitespace-nowrap">
                                                <button type="button" onClick={() => renameRow(s)} className={iconBtn} aria-label={`ویرایش شرح ${s.service_name}`} title="ویرایش شرح"><Icons.Edit /></button>
                                                <button type="button" onClick={() => deleteRow(s)} className={`${iconBtn} text-red-500`} aria-label={`حذف ${s.service_name}`} title="حذف ردیف"><Icons.Trash /></button>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                    {/* موبایل: کارت */}
                    <ul className="md:hidden space-y-3 mb-6">
                        {services.map((s, idx) => (
                            <li key={s.id} className="border border-violet-200/60 dark:border-white/10 rounded-2xl p-3.5">
                                <div className="flex justify-between items-start gap-2 mb-3">
                                    <div className="font-semibold text-slate-800 dark:text-slate-100 leading-relaxed text-sm">{toPersianNum(idx + 1)}. {toPersianNum(s.service_name)} <span className="text-[11px] font-normal bg-slate-200 dark:bg-slate-600 text-slate-600 dark:text-slate-300 px-1.5 rounded">{s.cost_type === 'individual' ? 'نفری' : 'ثابت'}</span></div>
                                    <div className="flex shrink-0">
                                        <button type="button" onClick={() => renameRow(s)} className={iconBtn} aria-label={`ویرایش شرح ${s.service_name}`}><Icons.Edit /></button>
                                        <button type="button" onClick={() => deleteRow(s)} className={`${iconBtn} text-red-500`} aria-label={`حذف ${s.service_name}`}><Icons.Trash /></button>
                                    </div>
                                </div>
                                <div className="grid grid-cols-[5rem_1fr] gap-2 items-end">
                                    <label className="text-xs text-slate-500 dark:text-slate-400">تعداد<CommitNumInput value={s.qty} onCommit={v => commitRow(s, { qty: v === '' ? 0 : v })} className={`${numCls} text-center mt-1`} /></label>
                                    <label className="text-xs text-slate-500 dark:text-slate-400">فی (تومان)<CommitNumInput money value={s.unit_price} onCommit={v => commitRow(s, { unit_price: v })} placeholder="TBD" className={`${numCls} mt-1`} dir="ltr" /></label>
                                </div>
                                <div className="flex justify-between mt-3 text-sm"><span className="text-slate-500 dark:text-slate-400">مبلغ کل:</span><b className="text-indigo-700 dark:text-indigo-400" dir="ltr">{s.frozen_price !== null && s.frozen_price !== undefined ? formatMoney(s.frozen_price) : 'TBD'}</b></div>
                            </li>
                        ))}
                    </ul>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div className="flex flex-col sm:flex-row md:flex-col lg:flex-row gap-2 h-fit">
                            <button type="button" onClick={addAdhocService} className="text-indigo-700 dark:text-indigo-300 font-semibold px-4 py-3 rounded-xl hover:bg-white/60 border border-indigo-200 dark:border-indigo-800 border-dashed bg-grad-soft">+ افزودن ردیف</button>
                            <button type="button" onClick={() => window.print()} className="glass-soft text-slate-700 dark:text-slate-200 font-semibold px-4 py-3 rounded-xl hover:bg-white/60 border inline-flex items-center justify-center gap-2"><Icons.Printer /> چاپ / PDF</button>
                            <button type="button" onClick={() => exportToCSV(services, `Invoice_${eventId}`, [
                                { key: 'service_name', label: 'شرح خدمات' },
                                { key: 'cost_type', label: 'نوع', value: s => s.cost_type === 'individual' ? 'نفری' : 'ثابت' },
                                { key: 'qty', label: 'تعداد' },
                                { key: 'unit_price', label: 'فی (تومان)' },
                                { key: 'frozen_price', label: 'مبلغ کل (تومان)' },
                            ])} className="bg-emerald-50 dark:bg-emerald-900/30 text-emerald-800 dark:text-emerald-400 font-semibold px-4 py-3 rounded-xl hover:bg-emerald-100 border border-emerald-200 dark:border-emerald-800 inline-flex items-center justify-center gap-2"><Icons.Download /> خروجی اکسل</button>
                        </div>
                        <div className="glass-ink p-5 sm:p-7 rounded-3xl text-white space-y-3.5">
                            <div className="flex justify-between items-center text-sm text-slate-300"><span>جمع ردیف‌ها:</span> <span dir="ltr">{formatMoney(subTotal)}</span></div>
                            <div className="flex justify-between items-center gap-3">
                                <span className="text-sm text-slate-300">تخفیف (تومان):</span>
                                <span className="w-40"><CommitNumInput money label="تخفیف" value={ev.discount} onCommit={v => commitTotals({ discount: v })} className="w-full border p-2 rounded-lg text-sm text-white bg-white/10 border-white/20" dir="ltr" /></span>
                            </div>
                            <div className="flex justify-between items-center gap-3">
                                <span className="text-sm text-slate-300">مالیات (درصد):</span>
                                <span className="w-20"><CommitNumInput label="درصد مالیات" value={ev.tax_percent} onCommit={v => commitTotals({ tax_percent: v })} className="w-full border p-2 rounded-lg text-center text-sm text-white bg-white/10 border-white/20" dir="ltr" /></span>
                            </div>
                            {taxAmount !== 0 && <div className="flex justify-between text-xs text-slate-500"><span>مبلغ مالیات:</span> <span dir="ltr">{formatMoney(Math.round(taxAmount))}</span></div>}
                            <div className="pt-3 border-t border-slate-700">
                                <div className="text-slate-300 text-sm mb-1">مبلغ نهایی فاکتور:</div>
                                <div className="text-3xl font-bold text-emerald-400 text-left" dir="ltr">{formatMoney(Math.round(total))}</div>
                            </div>
                            <div className="flex justify-between items-center gap-3 pt-3 border-t border-slate-700 text-sm">
                                <span className="text-amber-300">پرداخت‌شده (از بخش پرداخت‌ها):</span>
                                <b className="text-amber-200" dir="ltr">{formatMoney(deposit)}</b>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {tab === 'finance' && (
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 mt-5">
                    <PaymentsPanel eventId={eventId} payments={data.payments || []} fin={data.fin} canEdit={access.finance} reload={loadData} />
                    <FeesPanel eventId={eventId} fees={data.fees || []} tasks={tasks} staff={staff} fin={data.fin} canEdit={access.finance} reload={loadData} />
                    {access.finance && <div className="lg:col-span-2"><PortalPanel ev={ev} reload={loadData} /></div>}
                </div>
            )}

            {tab === 'team' && (
                <div className="fade-in grid grid-cols-1 lg:grid-cols-2 gap-5">
                    <div className={`${card} p-5 sm:p-7`}>
                        <h2 className="font-bold text-xl text-slate-800 dark:text-white mb-5 border-b dark:border-white/10 pb-3">تخصیص کلی به نقش‌ها</h2>
                        <div className="space-y-3 max-h-[60vh] overflow-y-auto custom-scroll pl-1">
                            {rolesNeeded.length === 0 && <p className="text-slate-500 text-center">نقشی تعریف نشده است.</p>}
                            {rolesNeeded.map(role => {
                                const roleTasks = tasks.filter(t => t.role_tag === role);
                                const ids = Array.from(new Set(roleTasks.map(t => t.assignee_id || '')));
                                const common = ids.length === 1 ? ids[0] : '';
                                return (
                                    <div key={role} className="glass-soft p-4 rounded-2xl border">
                                        <div className="flex justify-between items-center mb-3 gap-2">
                                            <div className="font-semibold text-indigo-700 dark:text-indigo-300">@{toPersianNum(role)}</div>
                                            <div className="glass text-xs text-slate-600 dark:text-slate-300 px-2.5 py-1 rounded-lg border whitespace-nowrap">{toPersianNum(roleTasks.length)} وظیفه</div>
                                        </div>
                                        <select aria-label={`متصدی نقش ${role}`} disabled={busy || !access.tasks} value={common} onChange={e => assignRole(role, e.target.value)} className={`w-full border-2 p-3 rounded-xl font-semibold cursor-pointer ${common ? 'border-green-400 bg-green-50 dark:bg-green-900/30 dark:text-white' : 'glass dark:text-white'}`}>
                                            <option value="">{ids.length > 1 ? '(چند متصدی مختلف — انتخاب برای یکسان‌سازی)' : '(انتخاب متصدی برای تمام وظایف این نقش)'}</option>
                                            {staffOptions(common)}
                                        </select>
                                    </div>
                                );
                            })}
                        </div>
                    </div>

                    <div className="space-y-5">
                        {delegations.length > 0 && (
                            <div className={`${card} p-5 sm:p-7 border-2 !border-red-200 dark:!border-red-900`}>
                                <h2 className="font-bold text-lg mb-4 text-red-700 dark:text-red-400">درخواست‌های واگذاری در انتظار تایید</h2>
                                <div className="space-y-3">
                                    {delegations.map(d => (
                                        <div key={d.id} className="glass-soft p-4 rounded-2xl border">
                                            <p className="text-sm text-slate-700 dark:text-slate-200 leading-relaxed mb-3">({toPersianNum(d.from_name)}) درخواست واگذاری «{toPersianNum(d.task_title)}» به ({toPersianNum(d.to_name)}) را دارد.</p>
                                            <div className="flex gap-2">
                                                <button type="button" disabled={busy || !access.tasks} onClick={() => resolveDelegation(d.id, 'approved')} className="flex-1 bg-green-600 text-white font-semibold py-2 rounded-lg hover:bg-green-700">تایید واگذاری</button>
                                                <button type="button" disabled={busy || !access.tasks} onClick={() => resolveDelegation(d.id, 'rejected')} className="glass flex-1 text-slate-700 dark:text-slate-300 border font-semibold py-2 rounded-lg hover:bg-white/60">رد درخواست</button>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}
                        <div className="glass-ink p-5 sm:p-7 rounded-3xl text-white">
                            <h2 className="font-bold text-lg mb-2 flex items-center gap-2 text-indigo-300"><Icons.Activity /> جایگزینی سریع نیرو</h2>
                            <p className="text-sm text-slate-300 mb-5 leading-relaxed">اگر همکاری غایب بود، وظایف انجام‌نشده او را یکجا به شخص دیگری منتقل کنید.</p>
                            <div className="space-y-3 p-4 rounded-2xl border bg-white/5 border-white/20">
                                <select aria-label="همکار غایب" value={qrOld} onChange={e => setQrOld(e.target.value)} className="w-full border-2 p-3 rounded-xl text-sm text-slate-100 bg-white/10 border-white/20">
                                    <option value="">۱. همکار غایب را انتخاب کنید...</option>
                                    {assignedIds.map(id => <option key={'o' + id} value={id}>{toPersianNum(staffName(id) || '(کاربر حذف‌شده)')}</option>)}
                                </select>
                                <div className="flex justify-center text-slate-500"><Icons.Down /></div>
                                <select aria-label="همکار جایگزین" value={qrNew} onChange={e => setQrNew(e.target.value)} className="w-full border-2 p-3 rounded-xl text-sm text-slate-100 bg-white/10 border-white/20">
                                    <option value="">۲. همکار جایگزین را انتخاب کنید...</option>
                                    {staff.filter(s => String(s.id) !== String(qrOld)).map(s => <option key={'n' + s.id} value={s.id}>{toPersianNum(s.full_name)}</option>)}
                                </select>
                                <button type="button" disabled={busy || !access.tasks} onClick={handleQuickReplace} className="w-full bg-amber-500 text-amber-950 font-bold p-3.5 rounded-xl hover:bg-amber-400 mt-2">انتقال وظایف انجام‌نشده</button>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {tab === 'team' && <div className="mt-5"><RatingsPanel ev={ev} tasks={tasks} staff={staff} ratings={data.ratings || []} canEdit={access.tasks} reload={loadData} /></div>}

            {tab === 'guests' && <GuestsTab eventId={eventId} eventTitle={ev.title} />}

            {tab === 'files' && <div className="glass rounded-3xl border p-5 sm:p-7 fade-in"><ExtrasPanel eventId={eventId} tasks={tasks} currentUserId={user?.id} onChanged={loadData} /></div>}

            {extrasTask && <TaskExtrasModal eventId={eventId} task={extrasTask} currentUserId={user?.id} onClose={() => setExtrasTask(null)} onChanged={loadData} />}

            {tab === 'logs' && (
                <div className={`${card} p-5 md:p-7 fade-in h-[70vh] flex flex-col`}>
                    <div className="flex justify-between items-center mb-5 border-b dark:border-white/10 pb-3 gap-3">
                        <h2 className="font-bold text-lg sm:text-xl text-slate-800 dark:text-white">تاریخچه و لاگ سیستم</h2>
                        <button type="button" onClick={() => exportToCSV(logs, `Logs_${eventId}`, [
                            { key: 'created_at', label: 'زمان', value: l => toJalaliDateTime(l.created_at) },
                            { key: 'user_name', label: 'کاربر' },
                            { key: 'action', label: 'رویداد' },
                        ])} className="glass-soft text-slate-700 dark:text-slate-300 font-semibold px-3.5 py-2 rounded-lg hover:bg-white/60 inline-flex items-center gap-2 whitespace-nowrap text-sm"><Icons.Download /> خروجی اکسل</button>
                    </div>
                    <ol className="flex-1 overflow-y-auto custom-scroll pl-1 space-y-1">
                        {logs.length === 0 && <li className="text-slate-500 text-center py-10">هیچ فعالیتی ثبت نشده است.</li>}
                        {logs.map(log => (
                            <li key={log.id} className="flex gap-3 items-start p-3 hover:bg-white/60 dark:hover:bg-white/10 rounded-xl">
                                <span className="w-2.5 h-2.5 rounded-full bg-indigo-400 mt-2 shrink-0" aria-hidden="true"></span>
                                <div className="flex-1">
                                    <div className="text-sm text-slate-800 dark:text-slate-200 leading-relaxed mb-1">{toPersianNum(log.action)}</div>
                                    <div className="text-xs text-slate-500 dark:text-slate-400 flex flex-wrap gap-3">
                                        <span>توسط: <b className="text-indigo-700 dark:text-indigo-400 font-semibold">{log.user_name}</b></span>
                                        <bdi>{toJalaliDateTime(log.created_at)}</bdi>
                                    </div>
                                </div>
                            </li>
                        ))}
                    </ol>
                </div>
            )}

            {editModal && (
                <div className="fixed inset-0 z-[200] glass-overlay flex justify-center items-end sm:items-center sm:p-6 fade-in" role="dialog" aria-modal="true" aria-labelledby="edit-ev-title">
                    <div className="glass-strong w-full sm:max-w-md p-6 sm:p-7 rounded-t-3xl sm:rounded-3xl max-h-full overflow-y-auto custom-scroll">
                        <h2 id="edit-ev-title" className="text-xl font-bold text-slate-800 dark:text-white mb-5 border-b dark:border-white/10 pb-3">ویرایش اطلاعات پایه</h2>
                        <div className="space-y-4">
                            <label className="block">
                                <span className="text-xs font-semibold text-slate-600 dark:text-slate-400 mb-1.5 block">عنوان رویداد</span>
                                <input value={editForm.title || ''} onChange={e => setEditForm({ ...editForm, title: e.target.value })} className="glass-field w-full border-2 p-3 rounded-xl font-semibold" />
                            </label>
                            {access.admin && (
                                <label className="block">
                                    <span className="text-xs font-semibold text-slate-600 dark:text-slate-400 mb-1.5 block">مدیر پروژه</span>
                                    <select value={editForm.manager_id} onChange={e => setEditForm({ ...editForm, manager_id: e.target.value })} className="glass-field w-full border-2 p-3 rounded-xl font-semibold">
                                        <option value="">(بدون مدیر پروژه — فقط مدیر کل)</option>
                                        {(md?.managers || []).map(m => <option key={m.id} value={m.id}>{toPersianNum(m.full_name)}</option>)}
                                    </select>
                                </label>
                            )}
                            <label className="block">
                                <span className="text-xs font-semibold text-slate-600 dark:text-slate-400 mb-1.5 block">تعداد مهمانان (در فاکتور اثر دارد)</span>
                                <NumInput value={editForm.guest_count} onChange={v => setEditForm({ ...editForm, guest_count: v })} className="w-full border-2 dark:border-white/10 p-3 rounded-xl font-semibold focus:border-indigo-500 dark:text-white" dir="ltr" />
                            </label>
                            <label className="block">
                                <span className="text-xs font-semibold text-slate-600 dark:text-slate-400 mb-1.5 block">مکان برگزاری</span>
                                <select value={editForm.venue_id} onChange={e => setEditForm({ ...editForm, venue_id: e.target.value })} className="glass-field w-full border-2 p-3 rounded-xl font-semibold focus:border-indigo-500 dark:text-white">
                                    <option value="">(انتخاب مکان)</option>
                                    {(md?.venues || []).map(v => <option key={v.id} value={v.id}>{toPersianNum(v.name)}</option>)}
                                </select>
                            </label>
                            <div>
                                <span className="text-xs font-semibold text-slate-600 dark:text-slate-400 mb-1.5 block">تاریخ شروع رویداد</span>
                                <JalaliDatePicker value={editForm.start_date} onChange={val => setEditForm(f => ({ ...f, start_date: val }))} />
                            </div>
                            <div>
                                <span className="text-xs font-semibold text-slate-600 dark:text-slate-400 mb-1.5 block">تاریخ پایان رویداد</span>
                                <JalaliDatePicker value={editForm.end_date} onChange={val => setEditForm(f => ({ ...f, end_date: val }))} />
                            </div>
                        </div>
                        <div className="flex gap-3 mt-7">
                            <button type="button" onClick={() => setEditModal(false)} className="glass-soft flex-1 py-3 text-slate-700 dark:text-slate-300 font-semibold rounded-xl hover:bg-white/60">انصراف</button>
                            <button type="button" disabled={busy} onClick={saveEditEvent} className="btn-grad flex-1 py-3 text-white font-bold rounded-xl disabled:opacity-60">ذخیره و محاسبه مجدد</button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
