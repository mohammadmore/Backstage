import React, { useState, useEffect } from 'react';
import { api } from '../lib/api';
import { toPersianNum, isOn } from '../lib/utils';
import { Icons } from '../components/Icons';
import SortControls from '../components/SortControls';
import StaffForm from './StaffForm';
import OrgForm from './OrgForm';
import VenueForm from './VenueForm';
import ServiceForm from './ServiceForm';

export default function MasterData({ md, reload }) {
    const [tab, setTab] = useState('categories'); const [catName, setCatName] = useState(''); const [editItem, setEditItem] = useState(null);
    useEffect(() => { setEditItem(null); setCatName(''); }, [tab]);

    // formKey با هر ثبت موفق تغییر می‌کند تا فرم افزودن خالی شود (جلوگیری از ثبت تکراری)
    const [formKey, setFormKey] = useState(0);
    const [busy, setBusy] = useState(false);
    const saveItem = async (type, data, editId = null) => {
        if(busy) return false;
        setBusy(true);
        const res = editId ? await api('edit_master_item', { type, id: editId, ...data }) : await api('add_master_item', { type, ...data });
        setBusy(false);
        if(!res) return false; // در صورت خطا، داده‌های فرم حفظ می‌شوند
        setEditItem(null); setFormKey(k => k + 1); reload();
        return true;
    };
    const saveCategory = async () => { if(!catName.trim()) return; const ok = await saveItem('category', { name: catName.trim() }, editItem ? editItem.id : null); if(ok) setCatName(''); };
    const deleteItem = async (type, id) => {
        const msg = type === 'category' ? "آیا از حذف این دسته‌بندی مطمئن هستید؟\nسرویس‌های این دسته حذف نمی‌شوند و به «سایر خدمات» منتقل می‌شوند." : "آیا از حذف این آیتم مطمئن هستید؟";
        if(!window.confirm(msg)) return;
        const res = await api('delete_master_item', { type, id });
        if(!res) return;
        if(editItem && editItem.id === id) { setEditItem(null); setCatName(''); }
        reload();
    };

    const currentList = tab === 'staff' ? (md.staff || []) : tab === 'orgs' ? (md.organizations || []) : tab === 'venues' ? (md.venues || []) : tab === 'services' ? (md.services || []) : (md.categories || []);

    return (
        <div className="fade-in max-w-6xl mx-auto pb-20">
            <div className="flex overflow-x-auto gap-2 mb-8 bg-white dark:bg-slate-800 p-2 rounded-2xl shadow-sm border border-slate-200 dark:border-slate-700 custom-scroll">
                {[{id: 'categories', label: 'دسته‌بندی‌ها', tbl: 'categories', typeStr: 'category'}, {id: 'services', label: 'خدمات', tbl: 'services', typeStr: 'service'}, {id: 'venues', label: 'مکان‌ها', tbl: 'venues', typeStr: 'venue'}, {id: 'orgs', label: 'سازمان‌ها', tbl: 'organizations', typeStr: 'org'}, {id: 'staff', label: 'همکاران', tbl: 'users', typeStr: 'staff'}].map((t) => (
                    <button key={t.id} onClick={() => setTab(t.id)} className={`whitespace-nowrap px-6 py-3 rounded-xl font-bold text-sm transition-all ${tab === t.id ? 'bg-slate-800 dark:bg-indigo-600 text-white shadow-md' : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700'}`}>{t.label}</button>
                ))}
            </div>
            <div className="grid lg:grid-cols-12 gap-8">
                <div className="lg:col-span-5 bg-white dark:bg-slate-800 p-5 md:p-8 rounded-3xl shadow-sm border border-slate-200 dark:border-slate-700 h-fit lg:sticky lg:top-24 max-h-none lg:max-h-[85vh] lg:overflow-y-auto custom-scroll">
                    <div className="flex justify-between items-center mb-6 border-b dark:border-slate-700 pb-4">
                        <h4 className={`font-black text-xl ${editItem ? 'text-blue-600' : 'text-indigo-900 dark:text-indigo-300'}`}>{editItem ? 'ویرایش آیتم' : 'افزودن آیتم جدید'}</h4>
                        {editItem && <button onClick={()=>{setEditItem(null); setCatName('');}} className="text-xs bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 px-3 py-1.5 rounded-lg hover:bg-slate-200 font-bold border border-slate-300 dark:border-slate-600 transition-colors">انصراف</button>}
                    </div>
                    {tab === 'categories' && ( <div className="space-y-4"> <input type="text" placeholder="نام دسته‌بندی *" value={catName} onChange={(e) => setCatName(e.target.value)} onKeyDown={(e) => { if(e.key === 'Enter') saveCategory(); }} className="w-full border-2 dark:border-slate-600 p-4 rounded-xl outline-none focus:border-indigo-500 font-bold dark:bg-slate-700 dark:text-white" /> <button onClick={saveCategory} className={`w-full text-white p-4 rounded-xl font-bold shadow-md transition-colors ${editItem ? 'bg-blue-600 hover:bg-blue-700' : 'bg-green-600 hover:bg-green-700'}`}>{editItem ? 'ذخیره تغییرات' : 'ثبت دسته‌بندی'}</button> </div> )}
                    {tab === 'staff' && <StaffForm key={'s'+formKey} onSave={saveItem} mdStaff={md.staff || []} editItem={editItem} />}
                    {tab === 'orgs' && <OrgForm key={'o'+formKey} onSave={saveItem} editItem={editItem} />}
                    {tab === 'venues' && <VenueForm key={'v'+formKey} onSave={saveItem} editItem={editItem} />}
                    {tab === 'services' && <ServiceForm key={'sv'+formKey} onSave={saveItem} categories={md.categories || []} editItem={editItem} />}
                </div>
                <div className="lg:col-span-7">
                    <h4 className="font-black text-2xl text-slate-800 dark:text-white mb-2">لیست دیتابیس</h4>
                    <p className="text-sm text-slate-500 dark:text-slate-400 font-bold mb-6">آیتم‌هایی که در بالای لیست قرار دارند، در جلسات پرزنت در اولویت نمایش هستند.</p>
                    <div className="space-y-3 mt-6">
                        {currentList.length === 0 && <p className="text-center text-slate-400 font-bold py-6">لیست خالی است.</p>}
                        {currentList.map((item, idx) => {
                            const typeStr = tab === 'orgs' ? 'org' : tab === 'venues' ? 'venue' : tab === 'services' ? 'service' : tab === 'staff' ? 'staff' : 'category';
                                                        return (
                                <div key={item.id} className={`flex flex-col sm:flex-row justify-between sm:items-center gap-4 p-4 border rounded-2xl shadow-sm transition-all ${editItem && editItem.id === item.id ? 'bg-blue-50 dark:bg-blue-900/30 border-blue-300 ring-2 ring-blue-100' : 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 hover:shadow-md'}`}>
                                    <div className="flex items-center gap-4 w-full sm:w-auto overflow-hidden">
                                        <div className="w-8 h-8 shrink-0 rounded-full bg-slate-100 dark:bg-slate-700 text-slate-400 dark:text-slate-300 flex items-center justify-center font-bold text-xs">{toPersianNum(idx + 1)}</div>
                                        {item.avatar && <img src={item.avatar} className="w-12 h-12 rounded-full object-cover shadow-sm border border-slate-200 shrink-0 bg-white" />}
                                        {item.logo && <img src={item.logo} className="w-12 h-12 rounded-xl object-cover shadow-sm border border-slate-200 shrink-0 bg-white" />}
                                        <div className="min-w-0">
                                            <div className="font-bold text-slate-800 dark:text-slate-100 truncate">{toPersianNum(item.name || item.full_name)} {isOn(item.is_shadow) ? <span className="text-xs font-normal bg-slate-200 dark:bg-slate-700 px-2 rounded-full text-slate-600 dark:text-slate-300 ml-1">تلفنی</span> : ''} {isOn(item.can_delegate) && <span className="text-xs text-blue-600 dark:text-blue-300 bg-blue-50 dark:bg-blue-900/50 px-2 rounded border border-blue-200 dark:border-blue-800 ml-1">مجوز واگذاری</span>}</div>
                                            <div className="text-xs text-slate-500 dark:text-slate-400 mt-1 truncate">{tab === 'venues' ? `ظرفیت: ${toPersianNum(item.capacity || 0)}` : item.phone ? `تلفن: ${toPersianNum(item.phone)}` : ''}</div>
                                        </div>
                                    </div>
                                    <div className="flex items-center justify-between sm:justify-end gap-3 w-full sm:w-auto mt-2 sm:mt-0 pt-3 sm:pt-0 border-t sm:border-0 border-slate-100 dark:border-slate-700">
                                        <div className="flex gap-1 shrink-0">
                                            <button onClick={() => deleteItem(typeStr, item.id)} className="p-2 text-red-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/30 rounded-lg transition-colors" title="حذف"><Icons.Trash /></button>
                                            <button onClick={() => { setEditItem(item); if(typeStr==='category') setCatName(item.name); window.scrollTo({top:0, behavior:'smooth'}); }} className="p-2 text-blue-500 hover:text-blue-700 hover:bg-blue-50 dark:hover:bg-blue-900/30 rounded-lg transition-colors bg-slate-50 dark:bg-slate-700 sm:bg-transparent border sm:border-transparent border-slate-200" title="ویرایش"><Icons.Edit /></button>
                                        </div>
                                        <SortControls type={typeStr} id={item.id} onSort={reload} />
                                    </div>
                                </div>
                            )
                        })}
                    </div>
                </div>
            </div>
        </div>
    );
}
