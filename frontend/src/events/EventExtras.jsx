import React from 'react';
import { api } from '../lib/api';
import { toast, confirmDialog, formDialog } from '../lib/ui';
import { toPersianNum, toJalaliDate, formatMoney, PAY_STATUS, PAYMENT_METHODS, ymd, isOn } from '../lib/utils';
import { navigate } from '../lib/router';
import { Icons } from '../components/Icons';
import { CommitNumInput } from '../components/NumInput';
import { StarInput, RatingBadge } from '../components/Stars';

const card = 'glass rounded-3xl border p-5 sm:p-6';

// ---------------------------------------------------------------
// پرداخت‌ها و اقساط
// ---------------------------------------------------------------
export function PaymentsPanel({ eventId, payments, fin, canEdit, reload }) {
    const add = async () => {
        const v = await formDialog({
            title: 'ثبت پرداخت',
            fields: [
                { name: 'amount', label: 'مبلغ (تومان)', type: 'money', required: true, value: fin.remaining > 0 ? String(Math.round(fin.remaining)) : '' },
                { name: 'paid_at', label: 'تاریخ پرداخت', type: 'date', required: true, value: ymd(new Date()) + 'T00:00' },
                { name: 'method', label: 'روش پرداخت', type: 'select', value: 'کارت به کارت', options: PAYMENT_METHODS.map(m => ({ value: m, label: m })) },
                { name: 'note', label: 'توضیح (مثلاً شماره پیگیری)' },
            ],
            confirmText: 'ثبت پرداخت',
        });
        if (v && await api('add_payment', { event_id: eventId, ...v })) { toast('پرداخت ثبت شد.'); reload(); }
    };
    const del = async (p) => {
        if (await confirmDialog({ title: 'حذف پرداخت', message: `پرداخت ${formatMoney(p.amount)} تومانی مورخ ${toJalaliDate(p.paid_at)} حذف شود؟`, confirmText: 'حذف', danger: true }) && await api('delete_payment', { id: p.id })) { toast('پرداخت حذف شد.'); reload(); }
    };
    const st = PAY_STATUS[fin.pay_status] || PAY_STATUS.none;
    const pct = fin.total > 0 ? Math.min(100, (fin.paid / fin.total) * 100) : 0;
    return (
        <section className={card} aria-labelledby="pay-h">
            <div className="flex flex-wrap justify-between items-center gap-3 mb-4">
                <h2 id="pay-h" className="font-bold text-lg text-slate-800 dark:text-white flex items-center gap-2">پرداخت‌ها <span className={`text-xs px-2 py-0.5 rounded-md border ${st.cls}`}>{st.label}</span></h2>
                {canEdit && <button type="button" onClick={add} className="btn-grad px-4 py-2 rounded-xl font-semibold text-sm">+ ثبت پرداخت</button>}
            </div>
            <div className="mb-4">
                <div className="flex justify-between text-sm mb-1.5"><span className="text-slate-600 dark:text-slate-300">دریافت‌شده <b dir="ltr">{formatMoney(fin.paid)}</b> از <span dir="ltr">{formatMoney(fin.total)}</span></span><span className="font-semibold text-slate-800 dark:text-white">مانده: <span dir="ltr">{formatMoney(Math.max(0, fin.remaining))}</span></span></div>
                <div className="h-2.5 rounded-full bg-violet-100 dark:bg-white/10" role="progressbar" aria-valuenow={Math.round(pct)} aria-valuemin={0} aria-valuemax={100}><div className="h-2.5 rounded-full bg-grad" style={{ width: `${pct}%` }} /></div>
            </div>
            <ul className="space-y-2">
                {payments.length === 0 && <li className="text-sm text-slate-500 text-center py-3">هنوز پرداختی ثبت نشده است.</li>}
                {payments.map(p => (
                    <li key={p.id} className="glass-soft border rounded-xl p-3 flex flex-wrap items-center justify-between gap-2 text-sm">
                        <span className="text-slate-700 dark:text-slate-200">{toJalaliDate(p.paid_at)} {p.method && <span className="text-slate-500">· {p.method}</span>} {p.note && <span className="text-slate-500">· {p.note}</span>}</span>
                        <span className="flex items-center gap-2"><b dir="ltr">{formatMoney(p.amount)}</b>{canEdit && <button type="button" onClick={() => del(p)} className="p-1.5 text-red-500" aria-label="حذف پرداخت"><Icons.Trash /></button>}</span>
                    </li>
                ))}
            </ul>
        </section>
    );
}

// ---------------------------------------------------------------
// دستمزد نیروها و سود رویداد
// ---------------------------------------------------------------
export function FeesPanel({ eventId, fees, tasks, staff, fin, canEdit, reload }) {
    const involved = Array.from(new Set(tasks.map(t => t.assignee_id).filter(Boolean)));
    const missing = involved.filter(id => !fees.some(f => f.user_id == id));
    const name = (id) => staff.find(s => s.id == id)?.full_name || 'همکار';
    const setFee = async (uid, amount) => !!(await api('set_staff_fee', { event_id: eventId, user_id: uid, amount })) && (reload(), true);
    const fill = async () => { const r = await api('fill_default_fees', { event_id: eventId }); if (r) { toast(`${toPersianNum(r.added)} ردیف دستمزد اضافه شد.`); reload(); } };
    const paid = async (f) => { if (await api('mark_fee_paid', { id: f.id, paid: !f.paid_at })) reload(); };
    const del = async (f) => { if (await confirmDialog({ title: 'حذف دستمزد', message: `دستمزد «${f.full_name}» حذف شود؟`, confirmText: 'حذف', danger: true }) && await api('delete_staff_fee', { id: f.id })) reload(); };
    const addOther = async () => {
        const v = await formDialog({ title: 'افزودن دستمزد', fields: [
            { name: 'user_id', label: 'همکار', type: 'select', value: '', required: true, options: [{ value: '', label: '(انتخاب کنید)' }, ...staff.filter(s => !fees.some(f => f.user_id == s.id)).map(s => ({ value: String(s.id), label: s.full_name }))] },
            { name: 'amount', label: 'مبلغ (تومان)', type: 'money', required: true },
        ], confirmText: 'ثبت' });
        if (v && await setFee(Number(v.user_id), v.amount)) toast('دستمزد ثبت شد.');
    };
    return (
        <section className={card} aria-labelledby="fee-h">
            <div className="flex flex-wrap justify-between items-center gap-3 mb-4">
                <h2 id="fee-h" className="font-bold text-lg text-slate-800 dark:text-white">دستمزد نیروها و سود</h2>
                {canEdit && <div className="flex gap-2">
                    {missing.length > 0 && <button type="button" onClick={fill} className="btn-grad px-3 py-2 rounded-xl text-sm font-semibold">پر کردن دستمزد پیش‌فرض ({toPersianNum(missing.length)} نفر)</button>}
                    <button type="button" onClick={addOther} className="glass-soft border px-3 py-2 rounded-xl text-sm font-semibold">+ همکار دیگر</button>
                </div>}
            </div>
            <ul className="space-y-2 mb-4">
                {fees.length === 0 && <li className="text-sm text-slate-500 text-center py-3">دستمزدی ثبت نشده است.{missing.length > 0 && ' نیروهای این رویداد: ' + missing.map(name).join('، ')}</li>}
                {fees.map(f => (
                    <li key={f.id} className="glass-soft border rounded-xl p-3 flex flex-wrap items-center gap-3 text-sm">
                        <span className="flex-1 min-w-[8rem] text-slate-800 dark:text-slate-100 font-semibold">{toPersianNum(f.full_name)}</span>
                        <span className="w-40">{canEdit ? <CommitNumInput money label={`دستمزد ${f.full_name}`} value={f.amount} onCommit={v => setFee(f.user_id, v || 0)} className="w-full glass-field border-2 p-2 rounded-lg" dir="ltr" /> : <b dir="ltr">{formatMoney(f.amount)}</b>}</span>
                        {canEdit
                            ? <button type="button" onClick={() => paid(f)} className={`px-3 py-1.5 rounded-lg text-xs font-semibold border ${f.paid_at ? 'bg-emerald-600 text-white border-transparent' : 'glass'}`}>{f.paid_at ? `✓ تسویه ${toJalaliDate(f.paid_at)}` : 'تسویه نشده'}</button>
                            : <span className="text-xs">{f.paid_at ? '✓ تسویه' : 'تسویه نشده'}</span>}
                        {canEdit && <button type="button" onClick={() => del(f)} className="p-1.5 text-red-500" aria-label={`حذف دستمزد ${f.full_name}`}><Icons.Trash /></button>}
                    </li>
                ))}
            </ul>
            <div className="grid grid-cols-3 gap-3 text-center">
                <div className="glass-soft border rounded-2xl p-3"><div className="text-xs text-slate-500 dark:text-slate-400">مبلغ فاکتور</div><b className="text-slate-800 dark:text-white" dir="ltr">{formatMoney(fin.total)}</b></div>
                <div className="glass-soft border rounded-2xl p-3"><div className="text-xs text-slate-500 dark:text-slate-400">دستمزدها</div><b className="text-slate-800 dark:text-white" dir="ltr">{formatMoney(fin.fees)}</b></div>
                <div className="bg-grad rounded-2xl p-3 text-white"><div className="text-xs text-white/85">سود ناخالص</div><b dir="ltr">{formatMoney(fin.profit)}</b></div>
            </div>
        </section>
    );
}

// ---------------------------------------------------------------
// پورتال کارفرما
// ---------------------------------------------------------------
export function PortalPanel({ ev, reload }) {
    const link = ev.portal_token ? `${location.origin}${location.pathname}#/portal/${ev.portal_token}` : '';
    const enable = async (regenerate = false) => {
        if (regenerate && !(await confirmDialog({ title: 'ساخت لینک جدید', message: 'لینک قبلی باطل می‌شود و کارفرما دیگر نمی‌تواند با آن وارد شود. ادامه می‌دهید؟', confirmText: 'ساخت لینک جدید' }))) return;
        if (await api('portal_enable', { event_id: ev.id, regenerate })) { toast('لینک پورتال آماده است.'); reload(); }
    };
    const disable = async () => { if (await confirmDialog({ title: 'غیرفعال کردن پورتال', message: 'لینک کارفرما باطل می‌شود. ادامه می‌دهید؟', confirmText: 'غیرفعال کن', danger: true }) && await api('portal_disable', { event_id: ev.id })) reload(); };
    const copy = async () => { try { await navigator.clipboard.writeText(link); toast('لینک کپی شد. آن را برای کارفرما بفرستید.'); } catch (e) { toast('کپی خودکار ممکن نشد؛ لینک را دستی انتخاب کنید.', 'warning'); } };
    return (
        <section className={card} aria-labelledby="portal-h">
            <h2 id="portal-h" className="font-bold text-lg text-slate-800 dark:text-white mb-1">پورتال کارفرما</h2>
            <p className="text-sm text-slate-500 dark:text-slate-400 mb-4">لینک امن و فقط‌خواندنی: پیش‌فاکتور، پرداخت‌ها و پیشرفت کار، با امکان تایید آنلاین. اطلاعات تیم نمایش داده نمی‌شود.</p>
            {ev.client_approved_at && <p className="text-sm font-semibold text-emerald-700 dark:text-emerald-400 mb-3">✓ تایید کارفرما: {ev.client_approved_name} — {toJalaliDate(ev.client_approved_at)}{ev.client_note ? ` («${ev.client_note}»)` : ''}</p>}
            {link ? (
                <>
                    <input readOnly value={link} onFocus={e => e.target.select()} aria-label="لینک پورتال" className="w-full glass-field border-2 p-2.5 rounded-xl text-xs mb-3" dir="ltr" />
                    <div className="flex flex-wrap gap-2">
                        <button type="button" onClick={copy} className="btn-grad px-4 py-2 rounded-xl text-sm font-semibold">کپی لینک</button>
                        <a href={link} target="_blank" rel="noopener" className="glass-soft border px-4 py-2 rounded-xl text-sm font-semibold">مشاهده</a>
                        <button type="button" onClick={() => enable(true)} className="glass-soft border px-4 py-2 rounded-xl text-sm font-semibold">لینک جدید</button>
                        <button type="button" onClick={disable} className="px-4 py-2 rounded-xl text-sm font-semibold text-red-600 border border-red-200 dark:border-red-900">غیرفعال</button>
                    </div>
                </>
            ) : <button type="button" onClick={() => enable(false)} className="btn-grad px-4 py-2 rounded-xl text-sm font-semibold">ساخت لینک پورتال</button>}
        </section>
    );
}

// ---------------------------------------------------------------
// امتیازدهی پس از رویداد
// ---------------------------------------------------------------
export function RatingsPanel({ ev, tasks, staff, ratings, canEdit, reload }) {
    const people = Array.from(new Set(tasks.map(t => t.assignee_id).filter(Boolean)));
    const scoreOf = (type, id) => Number(ratings.find(r => r.target_type === type && r.target_id == id)?.score || 0);
    const rate = async (type, id, score) => { const r = await api('rate', { event_id: ev.id, target_type: type, target_id: id, score }); if (r) { toast(score ? 'امتیاز ثبت شد.' : 'امتیاز حذف شد.'); reload(); } };
    return (
        <section className={card} aria-labelledby="rate-h">
            <h2 id="rate-h" className="font-bold text-lg text-slate-800 dark:text-white mb-1">امتیازدهی</h2>
            <p className="text-sm text-slate-500 dark:text-slate-400 mb-4">کیفیت کار نیروها و مکان را ثبت کنید؛ میانگین در لیست‌ها و گزارش‌ها نمایش داده می‌شود.</p>
            <ul className="space-y-2">
                {ev.venue_id && (
                    <li className="glass-soft border rounded-xl p-3 flex flex-wrap items-center justify-between gap-2">
                        <span className="text-sm text-slate-800 dark:text-slate-100">🏛 {toPersianNum(ev.venue_name)}</span>
                        <StarInput label={`امتیاز ${ev.venue_name}`} disabled={!canEdit} value={scoreOf('venue', ev.venue_id)} onChange={v => rate('venue', ev.venue_id, v)} />
                    </li>
                )}
                {people.map(id => {
                    const s = staff.find(x => x.id == id);
                    return (
                        <li key={id} className="glass-soft border rounded-xl p-3 flex flex-wrap items-center justify-between gap-2">
                            <span className="text-sm text-slate-800 dark:text-slate-100">{toPersianNum(s?.full_name || 'همکار')} <RatingBadge score={s?.rating_score} count={s?.rating_count} /></span>
                            <StarInput label={`امتیاز ${s?.full_name || ''}`} disabled={!canEdit} value={scoreOf('staff', id)} onChange={v => rate('staff', id, v)} />
                        </li>
                    );
                })}
                {!ev.venue_id && people.length === 0 && <li className="text-sm text-slate-500 text-center py-3">نیرو یا مکانی برای امتیازدهی وجود ندارد.</li>}
            </ul>
        </section>
    );
}

// ---------------------------------------------------------------
// کپی رویداد / ذخیره به‌عنوان قالب
// ---------------------------------------------------------------
export async function duplicateEvent(ev, asTemplate) {
    const fields = asTemplate
        ? [{ name: 'title', label: 'نام قالب', value: `قالب ${ev.title}`, required: true }]
        : [
            { name: 'title', label: 'عنوان رویداد جدید', value: `${ev.title} (کپی)`, required: true },
            { name: 'start_date', label: 'شروع', type: 'datetime' },
            { name: 'end_date', label: 'پایان', type: 'datetime' },
            { name: 'copy_assignees', label: 'متصدی‌ها', type: 'checkbox', value: false, hint: 'متصدی وظایف هم کپی شوند' },
        ];
    const v = await formDialog({
        title: asTemplate ? 'ذخیره به‌عنوان قالب' : 'کپی رویداد',
        message: asTemplate ? 'خدمات، قیمت‌ها، وظایف و موعدها در قالب ذخیره می‌شوند (بدون تاریخ و متصدی).' : 'خدمات، قیمت‌ها و وظایف کپی می‌شوند. پرداخت‌ها، مهمانان و لاگ‌ها کپی نمی‌شوند.',
        fields, confirmText: asTemplate ? 'ذخیره قالب' : 'ساخت کپی',
    });
    if (!v) return null;
    const r = await api('duplicate_event', { event_id: ev.id, as_template: asTemplate, ...v });
    if (r) { toast(asTemplate ? 'قالب ذخیره شد.' : 'رویداد جدید ساخته شد.'); if (!asTemplate) navigate(`events/${r.id}`); }
    return r;
}
