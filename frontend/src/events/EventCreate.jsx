import React, { useState, useEffect } from 'react';
import { api } from '../lib/api';
import { toPersianNum, safeJson, parseDate, formatMoney } from '../lib/utils';
import { toast, confirmDialog } from '../lib/ui';
import { Icons } from '../components/Icons';
import JalaliDatePicker from '../components/JalaliDatePicker';
import { NumInput } from '../components/NumInput';

const HYBRID_QUESTIONS = [
    { id: 'q_intl', short: 'مهمان خارجی', text: 'آیا در رویداد شما مهمان خارجی یا سخنران بین‌المللی حضور دارد؟', keywords: ['مترجم', 'انگلیسی', 'ارزی', 'vip', 'وی آی پی', 'تشریفات'] },
    { id: 'q_outdoor', short: 'فضای باز', text: 'آیا بخش اصلی یا جانبی رویداد در فضای باز (باغ/روف‌گاردن) است؟', keywords: ['فضای باز', 'باغ', 'چادر', 'اسپیس', 'مه‌پاش', 'سایبان'] },
    { id: 'q_stream', short: 'پخش زنده', text: 'آیا رویداد نیاز به پخش زنده (استریم) یا برگزاری وبینار موازی دارد؟', keywords: ['پخش زنده', 'استریم', 'وبینار', 'آپارات', 'اینترنت', 'سیار'] },
    { id: 'q_food', short: 'پذیرایی اصلی', text: 'آیا پذیرایی اصلی (ناهار/شام گرم) برای مهمانان در نظر دارید؟', keywords: ['شام', 'ناهار', 'چلو', 'کباب', 'بوفه گرم', 'پذیرایی'] }
];

/** وضعیت سرویس بر اساس پاسخ‌های پرسشنامه + دلیل آن */
const serviceVisibility = (svc, answers) => {
    let hidden = []; let conditional = false;
    const name = (svc.name || '').toLowerCase();
    HYBRID_QUESTIONS.forEach(q => {
        if (q.keywords.some(kw => name.includes(kw.toLowerCase()))) {
            if (answers[q.id] === 'no') hidden.push(q.short);
            if (answers[q.id] === 'unknown') conditional = true;
        }
    });
    return { vis: hidden.length ? 'hidden' : conditional ? 'conditional' : 'normal', reasons: hidden };
};

const EMPTY_FORM = { title: '', event_type: '', org_id: '', contact_name: '', venue_id: '', guest_count: '', start_date: '', end_date: '' };

// =====================================
// تعریف رویداد جدید (ویزارد پرزنت)
// =====================================
export default function EventCreate({ md, onDone, onClose, registerGuard }) {
    const [step, setStep] = useState(0);
    const [maxStep, setMaxStep] = useState(0);
    const [form, setForm] = useState(EMPTY_FORM);
    const [selected, setSelected] = useState({}); // { [service_id]: package_index }
    const [hybridAnswers, setHybridAnswers] = useState({});
    const [showHidden, setShowHidden] = useState(false);
    const [saving, setSaving] = useState(false);

    const dirty = JSON.stringify(form) !== JSON.stringify(EMPTY_FORM) || Object.keys(selected).length > 0 || Object.keys(hybridAnswers).length > 0;

    // هشدار هنگام بستن تب/رفرش و هنگام خروج با دکمه بازگشت مرورگر
    useEffect(() => {
        const onBeforeUnload = (e) => { if (dirty) { e.preventDefault(); e.returnValue = ''; } };
        window.addEventListener('beforeunload', onBeforeUnload);
        registerGuard && registerGuard(() => dirty);
        return () => { window.removeEventListener('beforeunload', onBeforeUnload); };
    }, [dirty]);
    useEffect(() => () => registerGuard && registerGuard(null), []);

    const requestClose = async () => {
        if (dirty && !(await confirmDialog({ title: 'بستن بدون ذخیره؟', message: 'اطلاعات واردشده در این ویزارد ذخیره نشده و از بین می‌رود.', confirmText: 'بستن و حذف اطلاعات', cancelText: 'ادامه ویرایش', danger: true }))) return;
        onClose();
    };
    useEffect(() => {
        const onKey = (e) => { if (e.key === 'Escape' && !document.querySelector('[role="dialog"][aria-modal="true"]:not(#wizard)')) requestClose(); };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    });

    const services = md.services || [];
    const categories = md.categories || [];
    const categoryIds = new Set(categories.map(c => String(c.id)));
    const uncategorizedServices = services.filter(s => !s.category_id || !categoryIds.has(String(s.category_id)));
    const steps = [
        { label: 'نیازسنجی' },
        { label: 'پرونده و زمان' },
        { label: 'ابعاد و مکان' },
        ...categories.map(c => ({ label: c.name, catId: c.id })),
        ...(uncategorizedServices.length ? [{ label: 'سایر خدمات', catId: null }] : []),
        { label: 'پیش‌فاکتور' },
    ];
    const totalSteps = steps.length;
    const guestsNum = parseInt(form.guest_count, 10) || 0;
    const packagesOf = (svc) => safeJson(svc.packages, []);

    const setAnswer = (qid, val) => {
        const answers = { ...hybridAnswers, [qid]: val };
        setHybridAnswers(answers);
        const next = {};
        let removed = 0;
        Object.entries(selected).forEach(([sid, idx]) => {
            const svc = services.find(s => String(s.id) === sid);
            if (svc && serviceVisibility(svc, answers).vis !== 'hidden') next[sid] = idx; else removed++;
        });
        if (removed) toast(`${toPersianNum(removed)} سرویس انتخاب‌شده با این پاسخ از پیش‌فاکتور حذف شد.`, 'info');
        setSelected(next);
    };
    const toggleService = (svc, pkgIdx) => {
        const key = String(svc.id);
        const next = { ...selected };
        if (next[key] === pkgIdx) delete next[key]; else next[key] = pkgIdx;
        setSelected(next);
    };

    const selectedLines = Object.entries(selected).map(([sid, idx]) => {
        const svc = services.find(s => String(s.id) === sid);
        const pkg = svc ? packagesOf(svc)[idx] : null;
        if (!svc || !pkg) return null;
        const unit = pkg.price === '' || pkg.price === null || pkg.price === undefined ? null : Number(pkg.price);
        const qty = svc.cost_type === 'individual' ? (guestsNum > 0 ? guestsNum : 1) : 1;
        return { svc, pkg, idx, unit, qty, total: unit === null ? null : unit * qty };
    }).filter(Boolean);
    const countInCat = (catId) => selectedLines.filter(l => catId === null ? uncategorizedServices.includes(l.svc) : String(l.svc.category_id) === String(catId)).length;

    const validateStep = (s) => {
        if (s >= 1 && !form.title.trim()) { toast('عنوان رویداد الزامی است.', 'warning'); setStep(1); return false; }
        const a = parseDate(form.start_date), b = parseDate(form.end_date);
        if (s >= 1 && a && b && b < a) { toast('تاریخ پایان رویداد نمی‌تواند قبل از تاریخ شروع باشد.', 'warning'); setStep(1); return false; }
        return true;
    };
    const goTo = (target) => {
        if (target > 1 && !validateStep(1)) return;
        setStep(target); setMaxStep(m => Math.max(m, target)); setShowHidden(false);
    };

    const saveEvent = async () => {
        if (!validateStep(1) || saving) return;
        setSaving(true);
        const res = await api('create_event', {
            ...form,
            title: form.title.trim(),
            org_id: form.org_id || null,
            venue_id: form.venue_id || null,
            guest_count: form.guest_count || 0,
            selected_services: selectedLines.map(l => ({ service_id: l.svc.id, package_index: l.idx })),
        });
        setSaving(false);
        if (res) { toast('رویداد جدید ساخته شد.'); onDone(res.id); }
    };

    const answerBtn = (q, val, label, active) => (
        <button type="button" aria-pressed={hybridAnswers[q.id] === val} onClick={() => setAnswer(q.id, val)} className={`flex-1 py-2.5 rounded-xl font-semibold border-2 transition-colors ${hybridAnswers[q.id] === val ? active : 'bg-slate-50 dark:bg-slate-700 border-transparent text-slate-600 dark:text-slate-300 hover:bg-slate-100'}`}>{label}</button>
    );

    const renderStepContent = () => {
        if (step === 0) {
            return (
                <div className="space-y-4 fade-in max-w-3xl mx-auto">
                    <div className="text-center mb-5">
                        <h3 className="text-xl font-bold text-indigo-900 dark:text-indigo-300 mb-1.5">پرسشنامه نیازسنجی</h3>
                        <p className="text-slate-500 dark:text-slate-400 text-sm">با پاسخ «خیر»، خدمات مرتبط از لیست‌ها پنهان می‌شوند (همیشه قابل نمایش هستند). این مرحله اختیاری است.</p>
                    </div>
                    {HYBRID_QUESTIONS.map((q, idx) => (
                        <fieldset key={q.id} className="bg-white dark:bg-slate-800 p-4 rounded-2xl border-2 border-slate-100 dark:border-slate-700">
                            <legend className="sr-only">{q.text}</legend>
                            <p className="font-semibold text-slate-800 dark:text-white mb-3">{toPersianNum(idx + 1)}. {q.text}</p>
                            <div className="flex flex-wrap gap-2">
                                {answerBtn(q, 'yes', 'بله', 'bg-green-100 dark:bg-green-900/40 border-green-500 text-green-800 dark:text-green-300')}
                                {answerBtn(q, 'no', 'خیر', 'bg-red-100 dark:bg-red-900/40 border-red-500 text-red-800 dark:text-red-300')}
                                {answerBtn(q, 'unknown', 'معلوم نیست', 'bg-amber-100 dark:bg-amber-900/40 border-amber-500 text-amber-800 dark:text-amber-300')}
                            </div>
                        </fieldset>
                    ))}
                </div>
            );
        }

        if (step === 1) {
            const selOrg = (md.organizations || []).find(o => o.id == form.org_id);
            const orgContacts = selOrg ? safeJson(selOrg.contacts, []) : [];
            return (
                <div className="space-y-5 fade-in max-w-2xl mx-auto">
                    <label className="block">
                        <span className="text-sm font-semibold text-slate-700 dark:text-slate-300 mb-1.5 block">عنوان رویداد <span className="text-red-500">*</span></span>
                        <input type="text" value={form.title} onChange={e => setForm({ ...form, title: e.target.value })} className="w-full border-2 dark:border-slate-600 p-3.5 rounded-xl focus:border-indigo-500 font-semibold text-lg dark:bg-slate-700 dark:text-white" autoFocus />
                    </label>
                    <div className="bg-slate-50 dark:bg-slate-800 p-4 rounded-xl border border-slate-200 dark:border-slate-700">
                        <span className="text-xs font-semibold text-slate-600 dark:text-slate-400 mb-2 block">تاریخ و ساعت شروع</span>
                        <JalaliDatePicker value={form.start_date} onChange={val => setForm(f => ({ ...f, start_date: val }))} />
                    </div>
                    <div className="bg-slate-50 dark:bg-slate-800 p-4 rounded-xl border border-slate-200 dark:border-slate-700">
                        <span className="text-xs font-semibold text-slate-600 dark:text-slate-400 mb-2 block">تاریخ و ساعت پایان</span>
                        <JalaliDatePicker value={form.end_date} onChange={val => setForm(f => ({ ...f, end_date: val }))} />
                    </div>
                    <label className="block">
                        <span className="text-sm font-semibold text-slate-700 dark:text-slate-300 mb-1.5 block">مشتری / سازمان</span>
                        <select value={form.org_id} onChange={e => setForm({ ...form, org_id: e.target.value, contact_name: '' })} className="w-full border-2 dark:border-slate-600 p-3.5 rounded-xl font-semibold bg-white dark:bg-slate-700 dark:text-white cursor-pointer">
                            <option value="">(انتخاب نشده)</option>
                            {(md.organizations || []).map(org => <option key={org.id} value={org.id}>{toPersianNum(org.name)}</option>)}
                        </select>
                    </label>
                    {form.org_id && orgContacts.length > 0 && (
                        <label className="block p-4 bg-indigo-50 dark:bg-indigo-900/30 rounded-xl border border-indigo-100 dark:border-indigo-800 slide-down">
                            <span className="text-sm font-semibold text-indigo-900 dark:text-indigo-300 mb-2 block">مدیر هماهنگی پروژه (نماینده کارفرما)</span>
                            <select value={form.contact_name} onChange={e => setForm({ ...form, contact_name: e.target.value })} className="w-full border-2 dark:border-slate-600 p-3 rounded-xl font-semibold bg-white dark:bg-slate-700 dark:text-white">
                                <option value="">(انتخاب نماینده)</option>
                                {orgContacts.map((c, i) => <option key={i} value={c.name}>{toPersianNum(c.name)} - {toPersianNum(c.phone)}</option>)}
                            </select>
                        </label>
                    )}
                </div>
            );
        }

        if (step === 2) {
            const venues = (md.venues || []).map(v => {
                const diff = (Number(v.capacity) || 0) - guestsNum;
                let label = '', color = 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700';
                if (guestsNum > 0) {
                    if (diff < 0) { label = 'ظرفیت کم'; color = 'text-red-700 bg-red-50 dark:bg-red-900/20 dark:text-red-300 border-red-200'; }
                    else if (diff <= 50) { label = 'مناسب'; color = 'text-green-800 dark:text-green-300 bg-green-50 dark:bg-green-900/30 border-green-400'; }
                    else { label = 'بزرگ‌تر از نیاز'; }
                }
                return { ...v, diff, label, color };
            }).sort((a, b) => { if (guestsNum === 0) return 0; if (a.diff < 0 && b.diff >= 0) return 1; if (a.diff >= 0 && b.diff < 0) return -1; return a.diff - b.diff; });

            return (
                <div className="space-y-4 fade-in max-w-2xl mx-auto">
                    <label className="block">
                        <span className="text-sm font-semibold text-slate-700 dark:text-slate-300 mb-1.5 block">تعداد مهمانان</span>
                        <NumInput placeholder="مثلاً ۱۵۰" value={form.guest_count} onChange={v => setForm({ ...form, guest_count: v })} className="w-full border-2 dark:border-slate-600 p-4 rounded-2xl focus:border-indigo-500 text-xl font-bold text-center bg-slate-50 dark:bg-slate-700 dark:text-white" dir="ltr" />
                    </label>
                    <p className="text-sm text-slate-500 dark:text-slate-400">{guestsNum > 0 ? 'سالن‌ها بر اساس تناسب ظرفیت با تعداد مهمانان مرتب شده‌اند.' : 'با وارد کردن تعداد مهمانان، سالن‌ها بر اساس تناسب ظرفیت مرتب می‌شوند.'} انتخاب مکان اختیاری است.</p>
                    {venues.length === 0 && <p className="text-center text-slate-500 py-6">هنوز مکانی در دیتابیس ثبت نشده است.</p>}
                    <div className="space-y-2.5" role="radiogroup" aria-label="مکان برگزاری">
                        {venues.map(v => {
                            const sel = form.venue_id == v.id;
                            return (
                                <button type="button" role="radio" aria-checked={sel} key={v.id} onClick={() => setForm({ ...form, venue_id: sel ? '' : v.id })} className={`w-full text-right p-4 border-2 rounded-2xl flex justify-between items-center transition-colors ${sel ? 'ring-2 ring-indigo-600 bg-indigo-50 dark:bg-indigo-900/30 border-indigo-600' : v.color}`}>
                                    <span>
                                        <span className="font-bold block text-slate-800 dark:text-white">{toPersianNum(v.name)}</span>
                                        <span className="text-sm flex items-center gap-2 mt-1 opacity-90">ظرفیت: {toPersianNum(v.capacity || 0)} نفر {v.label && <span className="bg-white/80 dark:bg-slate-900/50 px-2 py-0.5 rounded-md text-xs">{v.label}</span>}</span>
                                    </span>
                                    <span className={`w-7 h-7 rounded-full border-2 flex items-center justify-center shrink-0 ${sel ? 'bg-indigo-600 border-indigo-600 text-white' : 'border-slate-300 dark:border-slate-600'}`}>{sel && <Icons.Check />}</span>
                                </button>
                            );
                        })}
                    </div>
                </div>
            );
        }

        if (step > 2 && step < totalSteps - 1) {
            const info = steps[step];
            const catServices = info.catId === null ? uncategorizedServices : services.filter(s => String(s.category_id) === String(info.catId));
            const withVis = catServices.map(svc => ({ svc, ...serviceVisibility(svc, hybridAnswers) }));
            const hiddenCount = withVis.filter(x => x.vis === 'hidden').length;
            const visible = withVis.filter(x => x.vis !== 'hidden' || showHidden || selected[String(x.svc.id)] !== undefined)
                .sort((a, b) => ({ normal: 0, conditional: 1, hidden: 2 }[a.vis] - { normal: 0, conditional: 1, hidden: 2 }[b.vis]));

            return (
                <div className="fade-in max-w-4xl mx-auto">
                    <h3 className="text-xl font-bold mb-3 text-indigo-900 dark:text-indigo-300">{toPersianNum(info.label)}</h3>
                    {hiddenCount > 0 && (
                        <div className="mb-4 text-sm bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 px-4 py-2.5 rounded-xl flex flex-wrap items-center justify-between gap-2">
                            <span>{toPersianNum(hiddenCount)} سرویس بر اساس پاسخ‌های پرسشنامه پنهان {showHidden ? 'بود' : 'است'}.</span>
                            <button type="button" onClick={() => setShowHidden(!showHidden)} className="font-semibold text-indigo-700 dark:text-indigo-400 underline">{showHidden ? 'پنهان کردن' : 'نمایش همه'}</button>
                        </div>
                    )}
                    <div className="space-y-4">
                        {catServices.length === 0 && <p className="text-center text-slate-500 py-6">سرویسی در این دسته ثبت نشده است.</p>}
                        {visible.map(({ svc, vis, reasons }) => {
                            const pkgs = packagesOf(svc);
                            return (
                                <div key={svc.id} className={`border p-4 rounded-2xl bg-white dark:bg-slate-800 ${vis === 'hidden' ? 'border-dashed border-slate-300 dark:border-slate-600' : vis === 'conditional' ? 'border-amber-300 dark:border-amber-700' : 'border-slate-200 dark:border-slate-700'}`}>
                                    <div className="flex flex-wrap items-center gap-2 mb-3">
                                        <div className="font-bold text-slate-800 dark:text-white">{toPersianNum(svc.name)}</div>
                                        {svc.cost_type === 'individual' && <span className="text-[11px] bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 px-2 py-0.5 rounded-full">نفری</span>}
                                        {vis === 'conditional' && <span className="bg-amber-100 dark:bg-amber-900/40 text-amber-800 dark:text-amber-300 text-[11px] px-2 py-0.5 rounded-full">در صورت نیاز</span>}
                                        {vis === 'hidden' && <span className="bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 text-[11px] px-2 py-0.5 rounded-full">پنهان‌شده (پاسخ «خیر» به: {reasons.join('، ')})</span>}
                                    </div>
                                    {pkgs.length === 0 && <p className="text-xs text-slate-500">برای این سرویس پکیجی تعریف نشده است (از بخش مدیریت دیتابیس اضافه کنید).</p>}
                                    <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
                                        {pkgs.map((pkg, idx) => {
                                            const isSel = selected[String(svc.id)] === idx;
                                            const hasPrice = pkg.price !== '' && pkg.price !== null && pkg.price !== undefined;
                                            return (
                                                <button type="button" aria-pressed={isSel} key={idx} onClick={() => toggleService(svc, idx)} className={`text-right p-3.5 border-2 rounded-xl transition-colors ${isSel ? 'border-indigo-500 bg-indigo-50 dark:bg-indigo-900/30' : 'border-slate-100 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 hover:border-indigo-300'}`}>
                                                    <span className="flex justify-between items-start mb-2 gap-2">
                                                        <span className="font-semibold text-sm text-slate-800 dark:text-slate-200 leading-relaxed">{toPersianNum(pkg.name)}</span>
                                                        <span className={`w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0 ${isSel ? 'bg-indigo-600 border-indigo-600 text-white' : 'border-slate-300 dark:border-slate-600'}`}>{isSel && <Icons.Check />}</span>
                                                    </span>
                                                    <span className="text-xs font-semibold text-slate-700 dark:text-slate-300">{hasPrice ? formatMoney(pkg.price) + ' تومان' + (svc.cost_type === 'individual' ? ' / نفر' : '') : 'نیاز به استعلام (TBD)'}</span>
                                                    <span className="block text-[11px] text-slate-500 dark:text-slate-400 mt-1">{toPersianNum((pkg.tasks || []).length)} میکروتسک</span>
                                                </button>
                                            );
                                        })}
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>
            );
        }

        // پیش‌فاکتور
        const totalCost = selectedLines.reduce((acc, l) => acc + (l.total || 0), 0);
        const tbd = selectedLines.filter(l => l.total === null).length;
        return (
            <div className="fade-in max-w-2xl mx-auto">
                <div className="bg-indigo-50 dark:bg-indigo-900/40 p-6 rounded-3xl border border-indigo-100 dark:border-indigo-800 mb-5 text-center">
                    <p className="text-sm text-indigo-700 dark:text-indigo-300 mb-2">برآورد مالی حدودی</p>
                    <div className="text-2xl sm:text-3xl sm:text-5xl font-bold text-indigo-800 dark:text-indigo-200" dir="ltr">{formatMoney(totalCost)}</div>
                    <div className="text-indigo-600 dark:text-indigo-400 mt-1">تومان {tbd > 0 && <span className="text-sm">+ {toPersianNum(tbd)} مورد TBD</span>}</div>
                </div>
                <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 divide-y divide-slate-100 dark:divide-slate-700 mb-4">
                    <div className="p-4 text-sm text-slate-700 dark:text-slate-300 leading-7">
                        <b className="text-slate-900 dark:text-white">{toPersianNum(form.title) || '(بدون عنوان)'}</b>
                        <div>مهمانان: {toPersianNum(guestsNum || 0)} | مکان: {toPersianNum((md.venues || []).find(v => v.id == form.venue_id)?.name) || 'انتخاب نشده'}</div>
                    </div>
                    {selectedLines.length === 0 && <p className="p-4 text-sm text-slate-500">هنوز سرویسی انتخاب نشده است.</p>}
                    {selectedLines.map(l => (
                        <div key={l.svc.id} className="p-3.5 flex justify-between items-center gap-3 text-sm">
                            <span className="text-slate-800 dark:text-slate-200">{toPersianNum(l.svc.name)} <span className="text-slate-500">— {toPersianNum(l.pkg.name)}</span>{l.qty > 1 && <span className="text-slate-500"> × {toPersianNum(l.qty)}</span>}</span>
                            <span className="flex items-center gap-2 shrink-0">
                                <b className="text-slate-900 dark:text-white" dir="ltr">{l.total === null ? 'TBD' : formatMoney(l.total)}</b>
                                <button type="button" onClick={() => toggleService(l.svc, l.idx)} className="p-1.5 text-red-500 hover:bg-red-50 rounded-lg" aria-label={`حذف ${l.svc.name}`}><Icons.Trash /></button>
                            </span>
                        </div>
                    ))}
                </div>
                <p className="text-sm text-slate-600 dark:text-slate-400 bg-amber-50 dark:bg-amber-900/20 p-4 rounded-2xl border border-amber-200 dark:border-amber-800">قیمت‌های TBD و ضرایب تخفیف/مالیات بعداً در اتاق فرمان رویداد قابل ویرایش هستند.</p>
            </div>
        );
    };

    return (
        <div className="fixed inset-0 z-[200] bg-slate-900/70 backdrop-blur-sm flex justify-center items-center sm:p-6" onMouseDown={(e) => { if (e.target === e.currentTarget) requestClose(); }}>
            <div id="wizard" role="dialog" aria-modal="true" aria-labelledby="wizard-title" className="bg-slate-50 dark:bg-slate-900 w-full h-full sm:h-[95vh] sm:max-w-5xl sm:rounded-[2rem] shadow-sm overflow-hidden flex flex-col">
                <div className="px-5 py-4 bg-white dark:bg-slate-800 border-b dark:border-slate-700 flex justify-between items-center gap-3">
                    <h2 id="wizard-title" className="font-bold text-lg text-indigo-900 dark:text-indigo-300">ایجاد پرونده رویداد <span className="text-sm font-normal text-slate-500">— مرحله {toPersianNum(step + 1)} از {toPersianNum(totalSteps)}</span></h2>
                    <button type="button" onClick={requestClose} aria-label="بستن ویزارد" className="w-9 h-9 flex items-center justify-center bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 hover:text-red-600 hover:bg-red-50 rounded-full">✕</button>
                </div>
                {/* مراحل نام‌دار؛ مراحل دیده‌شده قابل کلیک هستند */}
                <nav aria-label="مراحل" className="bg-white dark:bg-slate-800 px-3 py-2.5 border-b dark:border-slate-700 overflow-x-auto custom-scroll">
                    <ol className="flex gap-1.5 min-w-max">
                        {steps.map((s, i) => {
                            const cnt = s.catId !== undefined ? countInCat(s.catId) : 0;
                            const reachable = i <= Math.max(maxStep, 1) || !!form.title.trim();
                            return (
                                <li key={i}>
                                    <button type="button" disabled={!reachable} aria-current={i === step ? 'step' : undefined} onClick={() => goTo(i)} className={`px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-colors disabled:opacity-40 ${i === step ? 'bg-indigo-600 text-white' : i <= maxStep ? 'bg-indigo-50 dark:bg-indigo-900/40 text-indigo-800 dark:text-indigo-300 hover:bg-indigo-100' : 'bg-slate-100 dark:bg-slate-700 text-slate-500 dark:text-slate-400'}`}>
                                        {toPersianNum(i + 1)}. {toPersianNum(s.label)}{cnt > 0 && <span className="mr-1 bg-white/90 text-indigo-700 rounded-full px-1.5">{toPersianNum(cnt)}</span>}
                                    </button>
                                </li>
                            );
                        })}
                    </ol>
                </nav>
                <div className="p-4 sm:p-7 flex-1 overflow-y-auto custom-scroll">{renderStepContent()}</div>

                <div className="p-3 sm:p-5 bg-white dark:bg-slate-800 border-t dark:border-slate-700 flex gap-3 justify-between items-center">
                    <div className="flex gap-2">
                        <button type="button" onClick={() => goTo(Math.max(0, step - 1))} disabled={step === 0} className="px-5 py-3 bg-slate-100 dark:bg-slate-700 rounded-xl font-semibold text-slate-700 dark:text-slate-300 hover:bg-slate-200 disabled:opacity-40">قبلی</button>
                        <span className="hidden sm:flex items-center text-sm text-slate-500 dark:text-slate-400 px-2">{toPersianNum(selectedLines.length)} سرویس انتخاب شده</span>
                    </div>
                    {step < totalSteps - 1
                        ? <button type="button" onClick={() => goTo(step + 1)} className="px-8 bg-indigo-600 hover:bg-indigo-700 text-white py-3 rounded-xl font-bold active:scale-[0.98]">ادامه</button>
                        : <button type="button" disabled={saving} onClick={saveEvent} className="px-8 bg-green-600 hover:bg-green-700 disabled:opacity-60 text-white py-3 rounded-xl font-bold active:scale-[0.98]">{saving ? 'در حال ثبت...' : 'ساخت رویداد'}</button>}
                </div>
            </div>
        </div>
    );
}
