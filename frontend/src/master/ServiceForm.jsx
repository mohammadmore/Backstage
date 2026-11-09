import React, { useState, useEffect } from 'react';
import { toPersianNum, safeJson, TIMINGS } from '../lib/utils';
import { Icons } from '../components/Icons';
import { NumInput } from '../components/NumInput';
import { toast, confirmDialog } from '../lib/ui';

/** تبدیل تسک فرمت قدیمی ("نقش|dep:عنوان") به {title, role, timing, dep} */
const normalizeTask = (t) => {
    let role = t.role || '';
    let dep = t.dep || '';
    if (role.includes('|dep:')) { const parts = role.split('|dep:'); role = parts[0]; if (!dep) dep = parts[1] || ''; }
    return { title: t.title || '', role: role || 'عمومی', timing: t.timing || TIMINGS[0], dep };
};
const normalizePackages = (raw) => (Array.isArray(raw) ? raw : []).map((p) => ({ name: p.name || '', price: p.price ?? '', tasks: (Array.isArray(p.tasks) ? p.tasks : []).map(normalizeTask) }));

export default function ServiceForm({ onSave, categories, editItem }) {
    const [form, setForm] = useState({ name: '', category_id: '', cost_type: 'cumulative' });
    const [packages, setPackages] = useState([]);
    // پکیج‌ساز
    const [pkgName, setPkgName] = useState('');
    const [pkgPrice, setPkgPrice] = useState('');
    const [pkgTasks, setPkgTasks] = useState([]);
    const [editingPkg, setEditingPkg] = useState(null); // اندیس پکیج در حال ویرایش
    // تسک‌ساز
    const [taskTitle, setTaskTitle] = useState('');
    const [taskRole, setTaskRole] = useState('');
    const [taskTiming, setTaskTiming] = useState(TIMINGS[0]);
    const [dependsOn, setDependsOn] = useState('');
    const [editingTask, setEditingTask] = useState(null); // اندیس تسک در حال ویرایش

    const resetTaskBuilder = () => { setTaskTitle(''); setTaskRole(''); setTaskTiming(TIMINGS[0]); setDependsOn(''); setEditingTask(null); };
    const resetPkgBuilder = () => { setPkgName(''); setPkgPrice(''); setPkgTasks([]); setEditingPkg(null); resetTaskBuilder(); };

    useEffect(() => {
        if(editItem) {
            setForm({ name: editItem.name||'', category_id: editItem.category_id ? String(editItem.category_id) : '', cost_type: editItem.cost_type||'cumulative' });
            setPackages(normalizePackages(safeJson(editItem.packages, [])));
        } else { setForm({ name: '', category_id: '', cost_type: 'cumulative' }); setPackages([]); }
        resetPkgBuilder();
    }, [editItem]);

    // ---------- تسک‌ها ----------
    const addTaskToPackage = () => {
        const title = taskTitle.trim();
        if(!title) return toast("عنوان کار الزامی است.", "warning");
        if(pkgTasks.some((t, i) => t.title === title && i !== editingTask)) return toast("عنوان تسک در این پکیج تکراری است.", "warning");
        const task = { title, role: taskRole.trim() || 'عمومی', timing: taskTiming, dep: dependsOn };
        if(editingTask !== null) {
            const oldTitle = pkgTasks[editingTask].title;
            setPkgTasks(pkgTasks.map((t, i) => i === editingTask ? task : (t.dep === oldTitle ? { ...t, dep: title } : t)));
        } else {
            setPkgTasks([...pkgTasks, task]);
        }
        resetTaskBuilder();
    };
    const editTask = (index) => {
        const t = pkgTasks[index];
        setTaskTitle(t.title); setTaskRole(t.role); setTaskTiming(t.timing || TIMINGS[0]); setDependsOn(t.dep || ''); setEditingTask(index);
    };
    const removeTask = (index) => {
        const removed = pkgTasks[index].title;
        setPkgTasks(pkgTasks.filter((_, i) => i !== index).map(t => t.dep === removed ? { ...t, dep: '' } : t));
        if(editingTask === index) resetTaskBuilder(); else if(editingTask !== null && editingTask > index) setEditingTask(editingTask - 1);
    };
    // پیش‌نیاز فقط از تسک‌های قبلی همین پکیج قابل انتخاب است
    const depOptions = (editingTask !== null ? pkgTasks.slice(0, editingTask) : pkgTasks);

    // ---------- پکیج‌ها ----------
    const addPackage = async () => {
        if(!pkgName.trim()) return toast("نام پکیج الزامی است", "warning");
        if(taskTitle.trim() && !(await confirmDialog({ title: 'تسک ثبت‌نشده', message: 'تسکی که در حال تایپ آن هستید هنوز به پکیج اضافه نشده است. بدون آن ادامه می‌دهید؟', confirmText: 'ادامه بدون آن' }))) return;
        const pkg = { name: pkgName.trim(), price: pkgPrice, tasks: pkgTasks };
        if(editingPkg !== null) setPackages(packages.map((p, i) => i === editingPkg ? pkg : p));
        else setPackages([...packages, pkg]);
        resetPkgBuilder();
    };
    const editPackage = (index) => {
        const p = packages[index];
        setPkgName(p.name); setPkgPrice(p.price ?? ''); setPkgTasks(p.tasks || []); setEditingPkg(index); resetTaskBuilder();
        window.scrollTo({top: 0, behavior: 'smooth'});
    };
    const removePackage = async (index) => {
        if(!(await confirmDialog({ title: 'حذف پکیج', message: `پکیج «${packages[index].name}» حذف شود؟`, confirmText: 'حذف', danger: true }))) return;
        setPackages(packages.filter((_, idx) => idx !== index));
        if(editingPkg === index) resetPkgBuilder(); else if(editingPkg !== null && editingPkg > index) setEditingPkg(editingPkg - 1);
    };

    const submit = async () => {
        if(!form.name.trim()) return toast("نام سرویس الزامی است.", "warning");
        const builderDirty = editingPkg !== null || pkgName.trim() || pkgTasks.length > 0;
        if(builderDirty && !(await confirmDialog({ title: 'پکیج ثبت‌نشده', message: 'پکیجی که در پکیج‌ساز در حال ویرایش است هنوز ثبت نشده و ذخیره نخواهد شد. ادامه می‌دهید؟', confirmText: 'ذخیره بدون آن' }))) return;
        onSave('service', { ...form, category_id: form.category_id || null, packages }, editItem ? editItem.id : null);
    };

    return (
        <div className="space-y-6 fade-in">
            <div className="space-y-4">
                <div className="grid sm:grid-cols-2 gap-4">
                    <input aria-label="نام سرویس" type="text" placeholder="نام سرویس *" value={form.name} onChange={(e) => setForm({...form, name: e.target.value})} className="w-full border-2 dark:border-slate-700 p-3 rounded-xl outline-none font-bold dark:bg-slate-800 dark:text-white" />
                    <select value={form.category_id} onChange={(e) => setForm({...form, category_id: e.target.value})} className="w-full border-2 dark:border-slate-700 p-3 rounded-xl outline-none bg-white dark:bg-slate-800 dark:text-white">
                        <option value="">(بدون دسته)</option>
                        {(categories || []).map((c) => <option key={c.id} value={String(c.id)}>{toPersianNum(c.name)}</option>)}
                    </select>
                </div>
                <div className="flex flex-col sm:flex-row gap-4 sm:gap-6 bg-slate-50 dark:bg-slate-800 border-2 border-slate-100 dark:border-slate-700 p-4 rounded-xl flex-wrap">
                    <span className="font-semibold text-sm text-slate-700 dark:text-slate-300">محاسبه مالی:</span>
                    <div className="flex gap-6">
                        <label className="flex items-center gap-2 text-sm cursor-pointer dark:text-slate-200"><input type="radio" name="ct" checked={form.cost_type === 'cumulative'} onChange={() => setForm({...form, cost_type: 'cumulative'})} className="accent-indigo-600 w-4 h-4"/> تجمیعی (ثابت)</label>
                        <label className="flex items-center gap-2 text-sm cursor-pointer dark:text-slate-200"><input type="radio" name="ct" checked={form.cost_type === 'individual'} onChange={() => setForm({...form, cost_type: 'individual'})} className="accent-indigo-600 w-4 h-4"/> انفرادی (نفری)</label>
                    </div>
                </div>
            </div>

            <div className={`p-4 sm:p-5 rounded-2xl border shadow-sm ${editingPkg !== null ? 'bg-blue-50/60 dark:bg-slate-800 border-blue-300 dark:border-blue-800' : 'bg-indigo-50/50 dark:bg-slate-800 border-indigo-100 dark:border-slate-700'}`}>
                <div className="flex justify-between items-center mb-4">
                    <h4 className="font-bold text-indigo-900 dark:text-indigo-300 flex items-center gap-2"><Icons.Plus/> {editingPkg !== null ? 'ویرایش پکیج' : 'پکیج‌ساز'}</h4>
                    {editingPkg !== null && <button type="button" onClick={resetPkgBuilder} className="text-xs bg-white dark:bg-slate-700 text-slate-600 dark:text-slate-300 px-3 py-1.5 rounded-lg font-semibold border border-slate-300 dark:border-slate-600">انصراف از ویرایش پکیج</button>}
                </div>
                <div className="grid sm:grid-cols-2 gap-3 mb-4">
                    <input aria-label="نام پکیج (مثال: فول آپشن)" type="text" placeholder="نام پکیج (مثال: فول آپشن)" value={pkgName} onChange={(e) => setPkgName(e.target.value)} className="w-full border-2 dark:border-slate-600 p-2.5 rounded-xl text-sm outline-none font-semibold dark:bg-slate-700 dark:text-white" />
                    <NumInput money aria-label="قیمت واحد پکیج" placeholder="قیمت واحد به تومان (خالی = TBD)" value={pkgPrice} onChange={setPkgPrice} className="w-full border-2 dark:border-slate-600 p-2.5 rounded-xl text-sm outline-none dark:bg-slate-700 dark:text-white" dir="ltr" />
                </div>
                <div className="bg-white dark:bg-slate-700 p-4 rounded-xl border border-slate-200 dark:border-slate-600">
                    <p className="text-xs font-semibold mb-3 text-slate-500 dark:text-slate-300">میکروتسک‌های اختصاصی این پکیج:</p>
                    <div className="space-y-2 mb-4">
                        {pkgTasks.map((t, i) => (
                            <div key={i} className={`text-xs border p-2.5 rounded-lg flex flex-col sm:flex-row justify-between sm:items-center gap-2 ${editingTask === i ? 'bg-blue-50 dark:bg-blue-900/30 border-blue-300' : 'bg-slate-50 dark:bg-slate-800 border-slate-200 dark:border-slate-600'}`}>
                                <div className="flex flex-col">
                                    <span className="font-bold text-slate-700 dark:text-slate-200 leading-relaxed text-[13px] break-words">{toPersianNum(t.title)}</span>
                                    {t.dep && <span className="text-[10px] text-amber-600 mt-1">🔗 نیازمند: {toPersianNum(t.dep)}</span>}
                                </div>
                                <div className="flex flex-wrap items-center gap-1.5 shrink-0">
                                    {t.timing && <span className="text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-slate-700 px-2 py-1 rounded-md border border-amber-200 dark:border-slate-600 font-bold whitespace-nowrap text-[10px] inline-flex items-center gap-1"><Icons.Clock/> {t.timing}</span>}
                                    <span className="text-indigo-700 dark:text-indigo-300 bg-indigo-50 dark:bg-slate-700 px-2 py-1 rounded-md border border-indigo-200 dark:border-slate-600 font-bold whitespace-nowrap text-[10px]">@{toPersianNum(t.role)}</span>
                                    <div className="flex gap-1 border-r border-slate-300 dark:border-slate-600 pr-1.5 ml-1">
                                        <button aria-label="ویرایش" type="button" onClick={() => editTask(i)} className="text-blue-500 hover:text-blue-700 p-1 bg-white dark:bg-slate-800 rounded shadow-sm"><Icons.Edit/></button>
                                        <button aria-label="حذف" type="button" onClick={() => removeTask(i)} className="text-red-500 hover:text-red-700 p-1 bg-white dark:bg-slate-800 rounded shadow-sm"><Icons.Trash/></button>
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                    <div className="flex flex-col gap-3 bg-slate-50 dark:bg-slate-800 p-3 rounded-xl border border-dashed border-slate-300 dark:border-slate-600">
                        <input aria-label="عنوان کار (مثال: تنظیم نور)" type="text" placeholder="عنوان کار (مثال: تنظیم نور)" value={taskTitle} onChange={(e) => setTaskTitle(e.target.value)} onKeyDown={(e) => { if(e.key === 'Enter') { e.preventDefault(); addTaskToPackage(); } }} className="w-full border dark:border-slate-600 p-2.5 rounded-lg text-sm outline-none focus:border-indigo-400 dark:bg-slate-700 dark:text-white" />
                        <div className="grid grid-cols-1 sm:grid-cols-[1fr_1fr_auto] gap-2">
                            <input aria-label="نقش (@تکنسین)" type="text" placeholder="نقش (@تکنسین)" value={taskRole} onChange={(e) => setTaskRole(e.target.value)} className="w-full border dark:border-slate-600 p-2.5 rounded-lg text-sm outline-none focus:border-indigo-400 dark:bg-slate-700 dark:text-white" />
                            <select value={taskTiming} onChange={(e) => setTaskTiming(e.target.value)} className="w-full border dark:border-slate-600 p-2.5 rounded-lg text-sm outline-none focus:border-indigo-400 bg-white dark:bg-slate-700 dark:text-white font-semibold">
                                {TIMINGS.map(tm => <option key={tm} value={tm}>{tm}</option>)}
                            </select>
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-[1fr_auto_auto] gap-2">
                            <select value={dependsOn} onChange={e=>setDependsOn(e.target.value)} className="w-full border dark:border-slate-600 p-2.5 rounded-lg text-sm outline-none bg-white dark:bg-slate-700 dark:text-white">
                                <option value="">(زنجیر خاکستری: بدون پیش‌نیاز)</option>
                                {depOptions.map((t, idx) => <option key={idx} value={t.title}>پیش‌نیاز: {t.title}</option>)}
                            </select>
                            {editingTask !== null && <button type="button" onClick={resetTaskBuilder} className="w-full sm:w-auto bg-white dark:bg-slate-700 text-slate-600 dark:text-slate-300 border border-slate-300 dark:border-slate-600 px-4 py-2.5 rounded-lg text-sm font-semibold">انصراف</button>}
                            <button type="button" onClick={addTaskToPackage} className="w-full sm:w-auto bg-slate-800 dark:bg-indigo-600 text-white px-5 py-2.5 rounded-lg text-sm font-semibold shadow-sm hover:bg-slate-700">{editingTask !== null ? 'ذخیره تسک' : 'افزودن تسک'}</button>
                        </div>
                    </div>
                </div>
                <button type="button" onClick={addPackage} className="w-full bg-indigo-600 text-white py-3.5 rounded-xl font-semibold text-sm mt-4 hover:bg-indigo-700 shadow-sm transition-colors">{editingPkg !== null ? 'ذخیره تغییرات پکیج' : 'ثبت پکیج در لیست پایین'}</button>
            </div>

            {packages.length > 0 && (
                <div className="bg-white dark:bg-slate-800 p-4 sm:p-5 rounded-2xl border border-slate-200 dark:border-slate-700">
                    <h4 className="font-bold mb-4 text-slate-700 dark:text-slate-300">پکیج‌های آماده‌شده:</h4>
                    {packages.map((p, i) => (
                        <div key={i} className={`p-4 rounded-xl border mb-3 transition-colors ${editingPkg === i ? 'bg-blue-50 dark:bg-blue-900/30 border-blue-300' : 'bg-slate-50 dark:bg-slate-700 border-slate-200 dark:border-slate-600 hover:border-indigo-200'}`}>
                            <div className="flex flex-col sm:flex-row justify-between sm:items-start gap-4 mb-3 border-b border-slate-200 dark:border-slate-600 pb-3">
                                <div className="font-bold text-slate-800 dark:text-slate-100 leading-relaxed">
                                    {toPersianNum(p.name)} {editingPkg === i && <span className="text-xs text-blue-600 mr-1">(در حال ویرایش)</span>}
                                    <span className="block sm:inline-block text-xs font-normal text-slate-500 dark:text-slate-300 bg-white dark:bg-slate-800 px-2 py-1 rounded-md border dark:border-slate-600 sm:mr-2 shadow-sm mt-2 sm:mt-0 w-fit">قیمت واحد: {p.price !== '' && p.price !== null ? toPersianNum(Number(p.price).toLocaleString('en-US')) + ' ت' : 'TBD'}</span>
                                </div>
                                <div className="flex gap-2 shrink-0 self-end sm:self-auto">
                                    <button aria-label="ویرایش" type="button" onClick={() => editPackage(i)} className="text-blue-500 hover:text-white hover:bg-blue-500 bg-white dark:bg-slate-800 p-2 rounded-lg border dark:border-slate-600 shadow-sm transition-colors"><Icons.Edit/></button>
                                    <button aria-label="حذف" type="button" onClick={() => removePackage(i)} className="text-red-500 hover:text-white hover:bg-red-500 bg-white dark:bg-slate-800 p-2 rounded-lg border dark:border-slate-600 shadow-sm transition-colors"><Icons.Trash/></button>
                                </div>
                            </div>
                            <div className="flex flex-wrap gap-2">
                                {p.tasks.length === 0 && <span className="text-xs text-slate-500">بدون میکروتسک</span>}
                                {p.tasks.map((t, idx) => (
                                    <span key={idx} className={`text-xs border px-2.5 py-1.5 rounded-lg flex items-center gap-2 shadow-sm break-words max-w-full ${t.dep ? 'bg-amber-50 border-amber-200 text-amber-800 dark:bg-amber-900/30' : 'bg-white border-slate-200 text-slate-600 dark:bg-slate-800 dark:text-slate-300'}`}>
                                        <span className="truncate">{toPersianNum(t.title)}</span> <b className="text-indigo-600 dark:text-indigo-400 shrink-0">@{toPersianNum(t.role)}</b>
                                        {t.dep && <Icons.Link/>}
                                    </span>
                                ))}
                            </div>
                        </div>
                    ))}
                </div>
            )}
            <button type="button" onClick={submit} className={`w-full text-white py-4 rounded-xl font-bold text-lg shadow-sm transition-transform active:scale-95 ${editItem ? 'bg-blue-600' : 'bg-green-600'}`}>{editItem ? 'ذخیره تغییرات سرویس' : 'ثبت نهایی سرویس'}</button>
        </div>
    );
}
