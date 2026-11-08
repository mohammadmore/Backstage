import React, { useState } from 'react';
import { api } from '../lib/api';
import { toPersianNum, safeJson, parseDate, formatMoney } from '../lib/utils';
import { Icons } from '../components/Icons';
import JalaliDatePicker from '../components/JalaliDatePicker';
import { NumInput } from '../components/NumInput';

const HYBRID_QUESTIONS = [
    { id: 'q_intl', text: 'آیا در رویداد شما مهمان خارجی یا سخنران بین‌المللی حضور دارد؟', keywords: ['مترجم', 'انگلیسی', 'ارزی', 'vip', 'وی آی پی', 'تشریفات'] },
    { id: 'q_outdoor', text: 'آیا بخش اصلی یا جانبی رویداد در فضای باز (باغ/روف‌گاردن) است؟', keywords: ['فضای باز', 'باغ', 'چادر', 'اسپیس', 'مه‌پاش', 'سایبان'] },
    { id: 'q_stream', text: 'آیا رویداد نیاز به پخش زنده (استریم) یا برگزاری وبینار موازی دارد؟', keywords: ['پخش زنده', 'استریم', 'وبینار', 'آپارات', 'اینترنت', 'سیار'] },
    { id: 'q_food', text: 'آیا پذیرایی اصلی (ناهار/شام گرم) برای مهمانان در نظر دارید؟', keywords: ['شام', 'ناهار', 'چلو', 'کباب', 'بوفه گرم', 'پذیرایی'] }
];

/** وضعیت نمایش سرویس بر اساس پاسخ‌های پرسشنامه: hidden | conditional | normal */
const serviceVisibility = (svc, answers) => {
    let hidden = false; let conditional = false;
    const name = (svc.name || '').toLowerCase();
    HYBRID_QUESTIONS.forEach(q => {
        if(q.keywords.some(kw => name.includes(kw.toLowerCase()))) {
            if(answers[q.id] === 'no') hidden = true;
            if(answers[q.id] === 'unknown') conditional = true;
        }
    });
    return hidden ? 'hidden' : conditional ? 'conditional' : 'normal';
};

// =====================================
// تعریف رویداد جدید (ویزارد پرزنت هیبریدی هوشمند)
// =====================================
export default function EventCreate({ md, onDone, onCancel }) {
    const [step, setStep] = useState(0);
    const [form, setForm] = useState({ title: '', event_type: '', org_id: '', contact_name: '', venue_id: '', guest_count: '', start_date: '', end_date: '' });
    // انتخاب‌ها: { [service_id]: package_index }
    const [selected, setSelected] = useState({});
    const [hybridAnswers, setHybridAnswers] = useState({});
    const [saving, setSaving] = useState(false);

    const services = md.services || [];
    const categories = md.categories || [];
    const categoryIds = new Set(categories.map(c => String(c.id)));
    // سرویس‌هایی که دسته ندارند (یا دسته‌شان حذف شده) در «سایر خدمات» نمایش داده می‌شوند
    const uncategorizedServices = services.filter(s => !s.category_id || !categoryIds.has(String(s.category_id)));
    const totalSteps = 1 + 2 + categories.length + (uncategorizedServices.length > 0 ? 1 : 0) + 1;
    const guestsNum = parseInt(form.guest_count, 10) || 0;

    const packagesOf = (svc) => safeJson(svc.packages, []);

    const setAnswer = (qid, val) => {
        const answers = { ...hybridAnswers, [qid]: val };
        setHybridAnswers(answers);
        // سرویس‌هایی که با پاسخ جدید پنهان می‌شوند از انتخاب‌ها حذف می‌شوند
        const next = {};
        Object.entries(selected).forEach(([sid, idx]) => {
            const svc = services.find(s => String(s.id) === sid);
            if(svc && serviceVisibility(svc, answers) !== 'hidden') next[sid] = idx;
        });
        setSelected(next);
    };

    const toggleService = (svc, pkgIdx) => {
        const key = String(svc.id);
        const next = { ...selected };
        if(next[key] === pkgIdx) delete next[key]; else next[key] = pkgIdx;
        setSelected(next);
    };

    // محاسبه پیش‌فاکتور بر اساس تعداد مهمانان فعلی (قبلاً تعداد در لحظه انتخاب ثابت می‌شد)
    const selectedLines = Object.entries(selected).map(([sid, idx]) => {
        const svc = services.find(s => String(s.id) === sid);
        const pkg = svc ? packagesOf(svc)[idx] : null;
        if(!svc || !pkg) return null;
        const unit = pkg.price === '' || pkg.price === null || pkg.price === undefined ? null : Number(pkg.price);
        const qty = svc.cost_type === 'individual' ? (guestsNum > 0 ? guestsNum : 1) : 1;
        return { svc, pkg, idx, unit, qty, total: unit === null ? null : unit * qty };
    }).filter(Boolean);

    const validateStep = () => {
        if(step === 1) {
            if(!form.title.trim()) { alert("عنوان رویداد الزامی است"); return false; }
            const s = parseDate(form.start_date), e = parseDate(form.end_date);
            if(s && e && e < s) { alert("تاریخ پایان رویداد نمی‌تواند قبل از تاریخ شروع باشد."); return false; }
        }
        return true;
    };
    const next = () => { if(validateStep()) setStep(step + 1); };

    const saveEvent = async () => {
        if(!form.title.trim()) { setStep(1); return alert("نام رویداد الزامی است"); }
        if(saving) return;
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
        if(res) onDone(res.id);
    };

    const renderStepContent = () => {
        if (step === 0) {
            return (
                <div className="space-y-6 fade-in max-w-3xl mx-auto mt-4">
                    <div className="text-center mb-8">
                        <h3 className="text-2xl font-black text-indigo-900 dark:text-indigo-300 mb-2">پرسشنامه هوشمند نیازسنجی</h3>
                        <p className="text-slate-500 dark:text-slate-400 font-bold text-sm">پاسخ به این سوالات، خدمات اضافی را فیلتر کرده و زمان پرزنت را کاهش می‌دهد.</p>
                    </div>
                    <div className="space-y-4">
                        {HYBRID_QUESTIONS.map((q, idx) => (
                            <div key={q.id} className="bg-white dark:bg-slate-800 p-5 rounded-2xl border-2 border-slate-100 dark:border-slate-700 shadow-sm hover:border-indigo-300 transition-colors">
                                <p className="font-bold text-slate-800 dark:text-white mb-4 text-lg">{toPersianNum(idx+1)}. {q.text}</p>
                                <div className="flex flex-wrap gap-3">
                                    <button onClick={()=>setAnswer(q.id, 'yes')} className={`flex-1 py-3 rounded-xl font-bold border-2 transition-all ${hybridAnswers[q.id] === 'yes' ? 'bg-green-100 dark:bg-green-900/40 border-green-500 text-green-700 dark:text-green-400' : 'bg-slate-50 dark:bg-slate-700 border-transparent text-slate-600 dark:text-slate-300'}`}>بله</button>
                                    <button onClick={()=>setAnswer(q.id, 'no')} className={`flex-1 py-3 rounded-xl font-bold border-2 transition-all ${hybridAnswers[q.id] === 'no' ? 'bg-red-100 dark:bg-red-900/40 border-red-500 text-red-700 dark:text-red-400' : 'bg-slate-50 dark:bg-slate-700 border-transparent text-slate-600 dark:text-slate-300'}`}>خیر</button>
                                    <button onClick={()=>setAnswer(q.id, 'unknown')} className={`flex-1 py-3 rounded-xl font-bold border-2 transition-all ${hybridAnswers[q.id] === 'unknown' ? 'bg-amber-100 dark:bg-amber-900/40 border-amber-500 text-amber-700 dark:text-amber-400' : 'bg-slate-50 dark:bg-slate-700 border-transparent text-slate-600 dark:text-slate-300'}`}>معلوم نیست</button>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            );
        }

        if (step === 1) {
            const selOrg = (md.organizations||[]).find(o => o.id == form.org_id);
            const orgContacts = selOrg ? safeJson(selOrg.contacts, []) : [];

            return (
                <div className="space-y-6 fade-in max-w-2xl mx-auto mt-4">
                    <h3 className="text-xl font-bold mb-6 text-indigo-900 dark:text-indigo-300 border-b dark:border-slate-700 pb-2">گام ۱: پرونده و زمان‌بندی</h3>
                    <input type="text" placeholder="عنوان رویداد *" value={form.title} onChange={e => setForm({...form, title: e.target.value})} className="w-full border-2 dark:border-slate-600 p-4 rounded-xl outline-none focus:border-indigo-500 font-black text-xl shadow-sm dark:bg-slate-700 dark:text-white" autoFocus />

                    <div className="space-y-4">
                        <div className="bg-slate-50 dark:bg-slate-800 p-4 rounded-xl border border-slate-200 dark:border-slate-700">
                            <label className="text-xs font-bold text-slate-500 dark:text-slate-400 mb-2 block">تاریخ و ساعت شروع رویداد</label>
                            <JalaliDatePicker value={form.start_date} onChange={val => setForm(f => ({...f, start_date: val}))} />
                        </div>
                        <div className="bg-slate-50 dark:bg-slate-800 p-4 rounded-xl border border-slate-200 dark:border-slate-700">
                            <label className="text-xs font-bold text-slate-500 dark:text-slate-400 mb-2 block">تاریخ و ساعت پایان رویداد</label>
                            <JalaliDatePicker value={form.end_date} onChange={val => setForm(f => ({...f, end_date: val}))} />
                        </div>
                    </div>

                    <select value={form.org_id} onChange={e => setForm({...form, org_id: e.target.value, contact_name: ''})} className="w-full border-2 dark:border-slate-600 p-4 rounded-xl outline-none font-bold bg-white dark:bg-slate-700 dark:text-white shadow-sm cursor-pointer mt-4">
                        <option value="">(انتخاب مشتری / سازمان)</option>
                        {(md.organizations || []).map(org => <option key={org.id} value={org.id}>{toPersianNum(org.name)}</option>)}
                    </select>

                    {form.org_id && orgContacts.length > 0 && (
                        <div className="p-4 bg-indigo-50 dark:bg-indigo-900/30 rounded-xl border border-indigo-100 dark:border-indigo-800 slide-down">
                            <label className="text-sm font-bold text-indigo-900 dark:text-indigo-300 mb-2 block">مدیر هماهنگی پروژه (نماینده کارفرما):</label>
                            <select value={form.contact_name} onChange={e => setForm({...form, contact_name: e.target.value})} className="w-full border-2 dark:border-slate-600 p-3.5 rounded-xl outline-none font-bold bg-white dark:bg-slate-700 dark:text-white">
                                <option value="">(انتخاب نماینده)</option>
                                {orgContacts.map((c, i) => <option key={i} value={c.name}>{toPersianNum(c.name)} - {toPersianNum(c.phone)}</option>)}
                            </select>
                        </div>
                    )}
                </div>
            );
        }

        if (step === 2) {
            const venues = (md.venues || []).map(v => {
                const diff = (Number(v.capacity) || 0) - guestsNum;
                let label = '', color = '';
                if(guestsNum > 0) {
                    if(diff < 0) { label = 'کوچک'; color = 'text-red-500 bg-red-50 dark:bg-red-900/20 border-red-200 opacity-60'; }
                    else if(diff <= 50) { label = 'ایده‌آل'; color = 'text-green-800 dark:text-green-300 bg-green-50 dark:bg-green-900/30 border-green-400 font-black shadow-lg ring-2 ring-green-400 transform scale-[1.02]'; }
                    else { label = 'بزرگ'; color = 'text-slate-600 bg-slate-50 dark:bg-slate-800 border-slate-200 dark:border-slate-700'; }
                }
                return { ...v, diff, label, color };
            }).sort((a, b) => { if(guestsNum === 0) return 0; if(a.diff < 0 && b.diff >= 0) return 1; if(a.diff >= 0 && b.diff < 0) return -1; return a.diff - b.diff; });

            return (
                <div className="space-y-5 fade-in max-w-2xl mx-auto mt-4 flex flex-col h-full">
                    <div>
                        <h3 className="text-xl font-bold mb-4 text-indigo-900 dark:text-indigo-300 border-b dark:border-slate-700 pb-2">گام ۲: ابعاد و لوکیشن</h3>
                        <NumInput placeholder="تعداد مهمانان را وارد کنید..." value={form.guest_count} onChange={v => setForm({...form, guest_count: v})} className="w-full border-2 dark:border-slate-600 p-5 rounded-2xl outline-none focus:border-indigo-500 text-2xl font-black text-center shadow-inner bg-slate-50 dark:bg-slate-700 focus:bg-white dark:focus:bg-slate-800 dark:text-white transition-all placeholder:text-slate-300" dir="ltr" />
                    </div>

                    <div className="flex-1 overflow-y-auto custom-scroll pr-2 space-y-3 pb-4">
                        {guestsNum === 0 ? (
                            <div className="h-full flex items-center justify-center text-center p-6 pulse-text">
                                <p className="text-lg font-bold text-slate-400">لطفاً تعداد حدودی مهمانان را در کادر بالا وارد کنید تا هوش مصنوعی، بهترین سالن‌ها را استخراج کند...</p>
                            </div>
                        ) : venues.length === 0 ? (
                            <p className="text-center font-bold text-slate-400 py-6">هنوز مکانی در دیتابیس ثبت نشده است.</p>
                        ) : (
                            venues.map(v => (
                                <div key={v.id} onClick={() => setForm({...form, venue_id: form.venue_id == v.id ? '' : v.id})} className={`p-5 border-2 rounded-2xl cursor-pointer flex justify-between items-center transition-all slide-down ${form.venue_id == v.id ? 'ring-4 ring-indigo-600 bg-indigo-50 dark:bg-indigo-900/30 border-indigo-600 shadow-lg' : v.color}`}>
                                    <div className="font-black text-lg">{toPersianNum(v.name)} <span className="text-sm font-bold flex items-center gap-2 mt-2 opacity-80">ظرفیت: {toPersianNum(v.capacity || 0)} نفر {v.label && <span className="bg-white/80 dark:bg-slate-900/50 px-2 py-0.5 rounded-md text-[11px] uppercase tracking-wider">{v.label}</span>}</span></div>
                                    <div className={`w-8 h-8 rounded-full border-2 flex items-center justify-center shrink-0 shadow-sm ${form.venue_id == v.id ? 'bg-indigo-600 border-indigo-600 text-white' : 'border-slate-300 dark:border-slate-600 bg-white/50 dark:bg-slate-800'}`}>{form.venue_id == v.id && <Icons.Check />}</div>
                                </div>
                            ))
                        )}
                    </div>
                </div>
            );
        }

        if (step > 2 && step < totalSteps - 1) {
            const catIndex = step - 3; let catName = "سایر خدمات"; let catServices = [];
            if (catIndex < categories.length) { catName = categories[catIndex].name; catServices = services.filter(s => String(s.category_id) === String(categories[catIndex].id)); } else { catServices = uncategorizedServices; }

            const visible = catServices
                .map(svc => ({ svc, vis: serviceVisibility(svc, hybridAnswers) }))
                .filter(x => x.vis !== 'hidden')
                .sort((a, b) => (a.vis === b.vis ? 0 : a.vis === 'conditional' ? 1 : -1));

            return (
                <div className="fade-in h-full flex flex-col pt-2 max-w-4xl mx-auto">
                    <h3 className="text-2xl font-black mb-6 text-indigo-900 dark:text-indigo-300 border-b-2 border-indigo-100 dark:border-slate-700 pb-3">{toPersianNum(catName)}</h3>
                    <div className="flex-1 overflow-y-auto custom-scroll pr-2 pb-6 space-y-5">
                        {visible.length === 0 && <p className="text-center font-bold text-slate-400 py-6">سرویسی در این دسته برای نمایش وجود ندارد.</p>}
                        {visible.map(({ svc, vis }) => {
                            const pkgs = packagesOf(svc);
                            return (
                                <div key={svc.id} className={`border p-5 rounded-2xl bg-white dark:bg-slate-800 shadow-sm hover:shadow-md transition-shadow ${vis === 'conditional' ? 'border-amber-200 dark:border-amber-700 opacity-90' : 'border-slate-200 dark:border-slate-700'}`}>
                                    <div className="flex items-center gap-2 mb-4">
                                        <div className="font-black text-xl text-slate-800 dark:text-white">{toPersianNum(svc.name)}</div>
                                        {vis === 'conditional' && <span className="bg-amber-100 dark:bg-amber-900/40 text-amber-600 dark:text-amber-400 text-[10px] px-2 py-0.5 rounded-full pulse-text">✨ در صورت نیاز</span>}
                                    </div>
                                    {pkgs.length === 0 && <p className="text-xs font-bold text-slate-400">برای این سرویس پکیجی تعریف نشده است (از بخش مدیریت دیتابیس اضافه کنید).</p>}
                                    <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
                                        {pkgs.map((pkg, idx) => {
                                            const isSel = selected[String(svc.id)] === idx;
                                            const hasPrice = pkg.price !== '' && pkg.price !== null && pkg.price !== undefined;
                                            return (
                                                <div key={idx} onClick={() => toggleService(svc, idx)} className={`p-4 border-2 rounded-xl cursor-pointer transition-all ${isSel ? 'border-indigo-500 bg-indigo-50 dark:bg-indigo-900/30 shadow-md ring-1 ring-indigo-500' : 'border-slate-100 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 hover:border-indigo-300 dark:hover:border-indigo-500 hover:bg-white dark:hover:bg-slate-700'}`}>
                                                    <div className="flex justify-between items-start mb-3 gap-2">
                                                        <span className="font-bold text-sm text-slate-700 dark:text-slate-200 leading-relaxed">{toPersianNum(pkg.name)}</span>
                                                        <div className={`w-6 h-6 rounded-full border-2 flex items-center justify-center shrink-0 ${isSel?'bg-indigo-600 border-indigo-600 text-white':'border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700'}`}>{isSel && <Icons.Check/>}</div>
                                                    </div>
                                                    <div className="text-xs font-black text-slate-600 dark:text-slate-300 bg-white dark:bg-slate-800 px-2.5 py-1.5 rounded-lg inline-block border border-slate-200 dark:border-slate-600 shadow-sm">{hasPrice ? formatMoney(pkg.price) + ' ت' + (svc.cost_type === 'individual' ? ' / نفر' : '') : 'نیاز به استعلام (TBD)'}</div>
                                                </div>
                                            )
                                        })}
                                    </div>
                                </div>
                            )
                        })}
                    </div>
                </div>
            );
        }

        if (step === totalSteps - 1) {
            const totalCost = selectedLines.reduce((acc, l) => acc + (l.total || 0), 0);
            const tbd = selectedLines.filter(l => l.total === null).length;
            return (
                <div className="fade-in max-w-2xl mx-auto mt-4 text-center h-full overflow-y-auto custom-scroll">
                    <h3 className="text-3xl font-black mb-8 text-slate-800 dark:text-white border-b dark:border-slate-700 pb-4">پیش‌فاکتور نهایی</h3>
                    <div className="bg-gradient-to-r from-indigo-50 to-blue-50 dark:from-indigo-900/40 dark:to-blue-900/40 p-8 sm:p-12 rounded-[2.5rem] border-2 border-indigo-100 dark:border-indigo-800 mb-8 shadow-inner">
                        <p className="text-base font-bold text-indigo-500 dark:text-indigo-400 mb-4">برآورد مالی حدودی پروپوزال</p>
                        <div className="text-5xl sm:text-6xl font-black text-indigo-700 dark:text-indigo-300 tracking-tight" dir="ltr">{formatMoney(totalCost)}</div>
                        <div className="text-xl font-bold text-indigo-400 mt-4">تومان</div>
                        <div className="text-sm font-bold text-slate-500 dark:text-slate-400 mt-4">{toPersianNum(selectedLines.length)} سرویس انتخاب شده{tbd > 0 ? ` (${toPersianNum(tbd)} مورد TBD)` : ''}</div>
                    </div>
                    <div className="text-sm text-slate-500 dark:text-slate-400 font-bold bg-amber-50 dark:bg-amber-900/20 p-5 rounded-2xl border border-amber-200 dark:border-amber-800 shadow-sm">قیمت‌های TBD و ضرایب تخفیف/مالیات در اتاق فرمان رویداد قابل ویرایش هستند.</div>
                </div>
            );
        }
    };

    return (
        <div className="fixed inset-0 z-[200] bg-slate-900/80 backdrop-blur-sm flex justify-center items-center sm:p-6">
            <div className="bg-slate-50 dark:bg-slate-900 w-full h-full sm:h-[95vh] sm:max-w-5xl sm:rounded-[2.5rem] shadow-2xl overflow-hidden flex flex-col transition-colors duration-300">
                <div className="p-6 bg-white dark:bg-slate-800 border-b dark:border-slate-700 relative z-10 shadow-sm flex justify-between items-center">
                    <h2 className="font-black text-2xl text-indigo-900 dark:text-indigo-300">ایجاد پرونده رویداد</h2>
                    <button onClick={onCancel} className="w-10 h-10 flex items-center justify-center bg-slate-100 dark:bg-slate-700 text-slate-500 dark:text-slate-300 hover:text-red-500 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/30 rounded-full font-bold transition-colors shadow-sm">✕</button>
                </div>
                <div className="px-6 pt-4 pb-2 bg-white dark:bg-slate-800">
                    <div className="flex gap-1.5 h-2.5 bg-slate-100 dark:bg-slate-700 rounded-full overflow-hidden px-1">{Array.from({length: totalSteps}).map((_, i) => <div key={i} className={`flex-1 rounded-full ${i <= step ? 'bg-indigo-500 shadow-[0_0_8px_rgba(99,102,241,0.6)]' : 'bg-slate-200 dark:bg-slate-600'} transition-all duration-500`}></div>)}</div>
                </div>
                <div className="p-4 sm:p-8 flex-1 overflow-hidden relative">{renderStepContent()}</div>

                <div className="p-4 sm:p-6 bg-white dark:bg-slate-800 border-t dark:border-slate-700 flex flex-col sm:flex-row gap-4 z-10 shadow-[0_-4px_15px_rgba(0,0,0,0.02)] justify-between items-center">
                    <div className="flex gap-3 w-full sm:w-auto">
                        <button onClick={onCancel} className="flex-1 sm:flex-none px-6 py-4 bg-red-50 dark:bg-red-900/30 text-red-600 dark:text-red-400 rounded-xl font-bold hover:bg-red-100 dark:hover:bg-red-900/50 transition-colors border border-red-100 dark:border-red-900/30">انصراف و بستن</button>
                        <button onClick={() => setStep(Math.max(0, step - 1))} disabled={step === 0} className="flex-1 sm:flex-none px-6 py-4 bg-slate-100 dark:bg-slate-700 rounded-xl font-bold text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-600 disabled:opacity-50 transition-colors">مرحله قبل</button>
                    </div>
                    <div className="w-full sm:w-auto mt-2 sm:mt-0">
                        {step < totalSteps - 1 ?
                            <button onClick={next} className="w-full sm:w-auto px-10 bg-indigo-600 hover:bg-indigo-700 text-white py-4 rounded-xl font-black text-lg shadow-lg transition-transform active:scale-[0.98]">تایید و ادامه</button> :
                            <button disabled={saving} onClick={saveEvent} className="w-full sm:w-auto px-10 bg-green-600 hover:bg-green-700 disabled:opacity-60 text-white py-4 rounded-xl font-black text-xl shadow-[0_4px_15px_rgba(22,163,74,0.4)] transition-transform active:scale-[0.98]">{saving ? 'در حال ثبت...' : 'خلق اتاق فرمان'}</button>
                        }
                    </div>
                </div>
            </div>
        </div>
    );
}
