import React, { useState, useEffect, useRef } from 'react';
import { api } from '../lib/api';
import { toPersianNum, isOn, matches, safeJson } from '../lib/utils';
import { toast, confirmDialog } from '../lib/ui';
import { Icons } from '../components/Icons';
import SortControls from '../components/SortControls';
import StaffForm from './StaffForm';
import OrgForm from './OrgForm';
import VenueForm from './VenueForm';
import ServiceForm from './ServiceForm';

export const MASTER_TABS = [
    { id: 'categories', label: 'دسته‌بندی‌ها', type: 'category', noun: 'دسته‌بندی' },
    { id: 'services', label: 'خدمات', type: 'service', noun: 'سرویس' },
    { id: 'venues', label: 'مکان‌ها', type: 'venue', noun: 'مکان' },
    { id: 'orgs', label: 'سازمان‌ها', type: 'org', noun: 'سازمان' },
    { id: 'staff', label: 'همکاران', type: 'staff', noun: 'همکار' },
];
const isDesktop = () => window.matchMedia('(min-width: 1024px)').matches;

export default function MasterData({ md, reload, tab = 'categories', onTabChange }) {
    const tabInfo = MASTER_TABS.find(t => t.id === tab) || MASTER_TABS[0];
    const typeStr = tabInfo.type;
    const [catName, setCatName] = useState('');
    const [editItem, setEditItem] = useState(null);
    const [query, setQuery] = useState('');
    const [catFilter, setCatFilter] = useState('');
    const [formOpen, setFormOpen] = useState(false); // فقط روی موبایل/تبلت معنا دارد
    const [order, setOrder] = useState(null);         // ترتیب محلی هنگام کشیدن و رها کردن
    const [dragId, setDragId] = useState(null);
    const [overId, setOverId] = useState(null);
    const formRef = useRef(null);
    // formKey با هر ثبت موفق تغییر می‌کند تا فرم افزودن خالی شود (جلوگیری از ثبت تکراری)
    const [formKey, setFormKey] = useState(0);
    const [busy, setBusy] = useState(false);

    useEffect(() => { setEditItem(null); setCatName(''); setQuery(''); setCatFilter(''); setFormOpen(false); setOrder(null); }, [tab]);

    const listKey = { categories: 'categories', services: 'services', venues: 'venues', orgs: 'organizations', staff: 'staff' }[tabInfo.id];
    const fullList = md[listKey] || [];
    useEffect(() => { setOrder(null); }, [md]);
    const ordered = order ? order.map(id => fullList.find(x => x.id === id)).filter(Boolean) : fullList;
    const categoryName = (id) => (md.categories || []).find(c => String(c.id) === String(id))?.name;

    const visibleList = ordered.filter(item => {
        if (tab === 'services' && catFilter) {
            if (catFilter === 'none' ? (item.category_id && categoryName(item.category_id)) : String(item.category_id) !== catFilter) return false;
        }
        return matches(query, item.name, item.full_name, item.username, item.phone, item.national_id, item.address, item.venue_type,
            tab === 'services' ? categoryName(item.category_id) : '', tab === 'staff' ? safeJson(item.skills, []).join(' ') : '');
    });
    const filtering = !!query.trim() || !!catFilter;

    const saveItem = async (type, data, editId = null) => {
        if (busy) return false;
        setBusy(true);
        const res = editId ? await api('edit_master_item', { type, id: editId, ...data }) : await api('add_master_item', { type, ...data });
        setBusy(false);
        if (!res) return false; // در صورت خطا، داده‌های فرم حفظ می‌شوند
        toast(editId ? 'تغییرات ذخیره شد.' : `${tabInfo.noun} جدید ثبت شد.`);
        setEditItem(null); setFormKey(k => k + 1); reload();
        if (!isDesktop()) setFormOpen(false);
        return true;
    };
    const saveCategory = async () => {
        if (!catName.trim()) return toast('نام دسته‌بندی را وارد کنید.', 'warning');
        const ok = await saveItem('category', { name: catName.trim() }, editItem ? editItem.id : null);
        if (ok) setCatName('');
    };
    const deleteItem = async (item) => {
        const name = item.name || item.full_name;
        const ok = await confirmDialog({
            title: `حذف ${tabInfo.noun}`,
            message: typeStr === 'category'
                ? `دسته‌بندی «${name}» حذف شود؟\nسرویس‌های این دسته حذف نمی‌شوند و به «سایر خدمات» منتقل می‌شوند.`
                : `«${name}» حذف شود؟ این کار قابل بازگشت نیست.`,
            confirmText: 'حذف', danger: true,
        });
        if (!ok) return;
        const res = await api('delete_master_item', { type: typeStr, id: item.id });
        if (!res) return;
        toast(`«${name}» حذف شد.`);
        if (editItem && editItem.id === item.id) { setEditItem(null); setCatName(''); }
        reload();
    };
    const startEdit = (item) => {
        setEditItem(item);
        if (typeStr === 'category') setCatName(item.name);
        // روی دسکتاپ فرم کنار لیست ثابت است و نیازی به پرش صفحه نیست
        if (!isDesktop()) { setFormOpen(true); setTimeout(() => formRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 50); }
    };
    const cancelEdit = () => { setEditItem(null); setCatName(''); if (!isDesktop()) setFormOpen(false); };

    // ---------- کشیدن و رها کردن ----------
    const onDrop = async (targetId) => {
        if (!dragId || dragId === targetId) { setDragId(null); setOverId(null); return; }
        const ids = ordered.map(x => x.id);
        const from = ids.indexOf(dragId);
        ids.splice(from, 1);
        ids.splice(ids.indexOf(targetId), 0, dragId);
        setOrder(ids); setDragId(null); setOverId(null);
        const res = await api('set_order', { type: typeStr, ids });
        if (!res) setOrder(null);
        reload();
    };

    const showForm = formOpen || !!editItem;

    return (
        <div className="fade-in max-w-6xl mx-auto pb-20">
            <div className="flex overflow-x-auto gap-2 mb-6 bg-white dark:bg-slate-800 p-2 rounded-2xl border border-slate-200 dark:border-slate-700 custom-scroll" role="tablist">
                {MASTER_TABS.map((t) => (
                    <button key={t.id} role="tab" aria-selected={tab === t.id} onClick={() => onTabChange(t.id)} className={`whitespace-nowrap px-5 py-2.5 rounded-xl font-semibold text-sm transition-colors ${tab === t.id ? 'bg-slate-800 dark:bg-indigo-600 text-white' : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700'}`}>
                        {t.label} <span className="text-xs opacity-70">({toPersianNum((md[{ categories: 'categories', services: 'services', venues: 'venues', orgs: 'organizations', staff: 'staff' }[t.id]] || []).length)})</span>
                    </button>
                ))}
            </div>

            {/* موبایل: فرم به‌صورت پیش‌فرض بسته است تا لیست مستقیم دیده شود */}
            {!showForm && (
                <button type="button" onClick={() => setFormOpen(true)} className="lg:hidden w-full mb-4 bg-indigo-600 text-white py-3.5 rounded-2xl font-bold flex items-center justify-center gap-2"><Icons.Plus /> افزودن {tabInfo.noun} جدید</button>
            )}

            <div className="grid lg:grid-cols-12 gap-6 lg:gap-8">
                <div ref={formRef} className={`${showForm ? 'block' : 'hidden'} lg:block lg:col-span-5 bg-white dark:bg-slate-800 p-5 md:p-7 rounded-3xl border border-slate-200 dark:border-slate-700 h-fit lg:sticky lg:top-24 max-h-none lg:max-h-[85vh] lg:overflow-y-auto custom-scroll scroll-mt-24`}>
                    <div className="flex justify-between items-center mb-5 border-b dark:border-slate-700 pb-4">
                        <h2 className={`font-bold text-lg ${editItem ? 'text-blue-600 dark:text-blue-400' : 'text-indigo-900 dark:text-indigo-300'}`}>{editItem ? `ویرایش «${editItem.name || editItem.full_name}»` : `افزودن ${tabInfo.noun} جدید`}</h2>
                        {editItem
                            ? <button type="button" onClick={cancelEdit} className="text-xs bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 px-3 py-1.5 rounded-lg hover:bg-slate-200 font-semibold border border-slate-300 dark:border-slate-600">انصراف</button>
                            : <button type="button" onClick={() => setFormOpen(false)} className="lg:hidden text-xs bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 px-3 py-1.5 rounded-lg font-semibold">بستن</button>}
                    </div>
                    {tab === 'categories' && (
                        <div className="space-y-4">
                            <input type="text" aria-label="نام دسته‌بندی" placeholder="نام دسته‌بندی *" value={catName} onChange={(e) => setCatName(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') saveCategory(); }} className="w-full border-2 dark:border-slate-600 p-3.5 rounded-xl focus:border-indigo-500 font-semibold dark:bg-slate-700 dark:text-white" />
                            <button type="button" disabled={busy} onClick={saveCategory} className={`w-full text-white p-3.5 rounded-xl font-bold transition-colors disabled:opacity-60 ${editItem ? 'bg-blue-600 hover:bg-blue-700' : 'bg-green-600 hover:bg-green-700'}`}>{editItem ? 'ذخیره تغییرات' : 'ثبت دسته‌بندی'}</button>
                        </div>
                    )}
                    {tab === 'staff' && <StaffForm key={'s' + formKey} onSave={saveItem} mdStaff={md.staff || []} editItem={editItem} />}
                    {tab === 'orgs' && <OrgForm key={'o' + formKey} onSave={saveItem} editItem={editItem} />}
                    {tab === 'venues' && <VenueForm key={'v' + formKey} onSave={saveItem} editItem={editItem} />}
                    {tab === 'services' && <ServiceForm key={'sv' + formKey} onSave={saveItem} categories={md.categories || []} editItem={editItem} />}
                </div>

                <div className="lg:col-span-7">
                    <div className="flex flex-col sm:flex-row gap-2 mb-3">
                        <div className="relative flex-1">
                            <span className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 pointer-events-none"><Icons.Search /></span>
                            <input type="search" aria-label={`جستجو در ${tabInfo.label}`} placeholder={`جستجو در ${tabInfo.label}...`} value={query} onChange={e => setQuery(e.target.value)} className="w-full border-2 border-slate-200 dark:border-slate-700 pr-10 pl-3 py-2.5 rounded-xl bg-white dark:bg-slate-800 dark:text-white focus:border-indigo-500" />
                        </div>
                        {tab === 'services' && (
                            <select aria-label="فیلتر دسته‌بندی" value={catFilter} onChange={e => setCatFilter(e.target.value)} className="border-2 border-slate-200 dark:border-slate-700 px-3 py-2.5 rounded-xl bg-white dark:bg-slate-800 dark:text-white">
                                <option value="">همه دسته‌ها</option>
                                {(md.categories || []).map(c => <option key={c.id} value={String(c.id)}>{toPersianNum(c.name)}</option>)}
                                <option value="none">بدون دسته</option>
                            </select>
                        )}
                    </div>
                    <p className="text-xs text-slate-500 dark:text-slate-400 mb-4 leading-relaxed">
                        {filtering
                            ? `${toPersianNum(visibleList.length)} مورد از ${toPersianNum(fullList.length)} — برای تغییر ترتیب، جستجو را پاک کنید.`
                            : 'آیتم‌های بالای لیست در جلسات پرزنت اول نمایش داده می‌شوند. برای تغییر ترتیب، ردیف را با دستگیره ⠿ بکشید (یا از فلش‌ها استفاده کنید).'}
                    </p>
                    <ul className="space-y-2.5">
                        {fullList.length === 0 && <li className="text-center text-slate-500 py-8">هنوز {tabInfo.noun}ی ثبت نشده است.</li>}
                        {fullList.length > 0 && visibleList.length === 0 && <li className="text-center text-slate-500 py-8">موردی با این جستجو پیدا نشد.</li>}
                        {visibleList.map((item, idx) => {
                            const name = item.name || item.full_name;
                            const sub = tab === 'venues' ? `ظرفیت: ${toPersianNum(item.capacity || 0)} نفر` : tab === 'services' ? (categoryName(item.category_id) || 'بدون دسته') + ` · ${toPersianNum(safeJson(item.packages, []).length)} پکیج` : item.phone ? `تلفن: ${toPersianNum(item.phone)}` : tab === 'staff' ? item.username : '';
                            return (
                                <li key={item.id}
                                    draggable={!filtering}
                                    onDragStart={(e) => { setDragId(item.id); e.dataTransfer.effectAllowed = 'move'; }}
                                    onDragOver={(e) => { if (dragId) { e.preventDefault(); setOverId(item.id); } }}
                                    onDragEnd={() => { setDragId(null); setOverId(null); }}
                                    onDrop={(e) => { e.preventDefault(); onDrop(item.id); }}
                                    className={`flex flex-col sm:flex-row justify-between sm:items-center gap-3 p-3.5 border rounded-2xl transition-colors ${overId === item.id && dragId !== item.id ? 'drag-over' : ''} ${dragId === item.id ? 'opacity-50' : ''} ${editItem && editItem.id === item.id ? 'bg-blue-50 dark:bg-blue-900/30 border-blue-300' : 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 hover:border-slate-300 dark:hover:border-slate-600'}`}>
                                    <div className="flex items-center gap-3 w-full sm:w-auto overflow-hidden">
                                        {!filtering && <span className="hidden lg:inline-block cursor-grab text-slate-500 text-lg leading-none select-none" title="برای جابجایی بکشید" aria-hidden="true">⠿</span>}
                                        <span className="w-7 h-7 shrink-0 rounded-full bg-slate-100 dark:bg-slate-700 text-slate-500 dark:text-slate-300 flex items-center justify-center text-xs">{toPersianNum(fullList.indexOf(item) + 1)}</span>
                                        {item.avatar && <img src={item.avatar} alt="" className="w-11 h-11 rounded-full object-cover border border-slate-200 shrink-0 bg-white" />}
                                        {item.logo && <img src={item.logo} alt="" className="w-11 h-11 rounded-xl object-cover border border-slate-200 shrink-0 bg-white" />}
                                        <div className="min-w-0">
                                            <div className="font-semibold text-slate-800 dark:text-slate-100 truncate">
                                                {toPersianNum(name)}
                                                {isOn(item.is_shadow) && <span className="text-xs font-normal bg-slate-200 dark:bg-slate-700 px-2 rounded-full text-slate-600 dark:text-slate-300 mr-1.5">تلفنی</span>}
                                                {isOn(item.can_delegate) && <span className="text-xs font-normal text-blue-700 dark:text-blue-300 bg-blue-50 dark:bg-blue-900/50 px-2 rounded border border-blue-200 dark:border-blue-800 mr-1.5">مجوز واگذاری</span>}
                                            </div>
                                            {sub && <div className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 truncate" dir="auto">{toPersianNum(sub)}</div>}
                                        </div>
                                    </div>
                                    <div className="flex items-center justify-between sm:justify-end gap-2 w-full sm:w-auto pt-2 sm:pt-0 border-t sm:border-0 border-slate-100 dark:border-slate-700">
                                        <div className="flex gap-1 shrink-0">
                                            <button type="button" onClick={() => startEdit(item)} className="p-2 text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/30 rounded-lg" aria-label={`ویرایش ${name}`} title="ویرایش"><Icons.Edit /></button>
                                            <button type="button" onClick={() => deleteItem(item)} className="p-2 text-red-500 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-900/30 rounded-lg" aria-label={`حذف ${name}`} title="حذف"><Icons.Trash /></button>
                                        </div>
                                        {!filtering && <SortControls type={typeStr} id={item.id} onSort={reload} name={name} />}
                                    </div>
                                </li>
                            );
                        })}
                    </ul>
                </div>
            </div>
        </div>
    );
}
