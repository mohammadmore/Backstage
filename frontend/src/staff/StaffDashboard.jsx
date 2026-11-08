import React, { useState, useEffect } from 'react';
import { api } from '../lib/api';
import { toPersianNum, toJalaliDate, isOn } from '../lib/utils';
import { Icons } from '../components/Icons';

// =====================================
// داشبورد کارمندان
// =====================================
export default function StaffDashboard({ user, onLogout }) {
    const [myTasks, setMyTasks] = useState([]);
    const [loading, setLoading] = useState(true);
    const [delegationModal, setDelegationModal] = useState(null);
    const [delegateTo, setDelegateTo] = useState('');
    const [staffList, setStaffList] = useState([]);
    const [notifs, setNotifs] = useState([]);
    const [showNotifPanel, setShowNotifPanel] = useState(false);
    const canDelegate = isOn(user.can_delegate);

    // فقط وظایف خود کاربر از سرور دریافت می‌شود (قبلاً جزئیات کامل همه رویدادها یکی‌یکی دریافت می‌شد)
    const loadTasks = async () => {
        const res = await api('get_my_tasks');
        if(res) setMyTasks(res);
        setLoading(false);
    };
    const loadStaff = async () => { const res = await api('get_colleagues'); if(res) setStaffList(res); };
    const fetchNotifs = async () => { const res = await api('get_notifications', null, {}, { silent: true }); if(res) setNotifs(res); };

    useEffect(() => {
        loadTasks(); fetchNotifs();
        if(canDelegate) loadStaff();
        const intv = setInterval(() => { if(!document.hidden) fetchNotifs(); }, 15000);
        return () => clearInterval(intv);
    }, []);

    const isLockedTask = (t) => !!t.depends_on_id && !isOn(t.dep_done);

    const toggleTask = async (task) => {
        const done = isOn(task.is_done);
        if(!done && isLockedTask(task)) return alert("این تسک قفل است و باید منتظر انجام پیش‌نیاز آن باشید!");
        await api('update_task', { task_id: task.id, is_done: !done });
        loadTasks();
    };

    const reportIssue = async (task) => {
        if(isOn(task.has_issue)) {
            await api('update_task', { task_id: task.id, has_issue: false });
        } else {
            const msg = prompt("لطفا مشکل را بنویسید:");
            if(!msg || !msg.trim()) return;
            await api('update_task', { task_id: task.id, has_issue: true, issue_note: msg.trim() });
        }
        loadTasks();
    };

    const requestDelegation = async () => {
        if(!delegateTo) return alert("یک همکار انتخاب کنید");
        const res = await api('request_delegation', { task_id: delegationModal.task_id, to_user_id: Number(delegateTo) });
        if(!res) return;
        alert("درخواست واگذاری در صندوق پیام‌های مدیریت قرار گرفت.");
        setDelegationModal(null); setDelegateTo('');
        loadTasks();
    };

    const markNotifRead = async (id) => { await api('mark_notif_read', { id }); fetchNotifs(); loadTasks(); };

    return (
        <div className="min-h-screen flex flex-col bg-slate-100 dark:bg-slate-900 pb-20 transition-colors duration-300">
            <header className="bg-indigo-900 dark:bg-slate-950 text-white p-4 shadow-lg flex justify-between items-center z-10 sticky top-0">
                <div className="flex items-center gap-4">
                    {user.avatar ? <img src={user.avatar} className="w-10 h-10 rounded-full border-2 border-indigo-400 object-cover bg-white"/> : <div className="w-10 h-10 rounded-full bg-indigo-800 flex items-center justify-center"><Icons.Users/></div>}
                    <div>
                        <h2 className="font-black text-lg">سلام، {toPersianNum(user.full_name)}</h2>
                        <p className="text-xs text-indigo-300 font-bold">داشبورد اختصاصی وظایف</p>
                    </div>
                </div>
                <div className="flex gap-4 items-center">
                    <div className="relative group">
                        <button onClick={()=>setShowNotifPanel(!showNotifPanel)} className="relative p-2 text-indigo-200 hover:text-white transition-colors focus:outline-none">
                            <Icons.Bell />
                            {notifs.length > 0 && <span className="absolute top-0 right-0 bg-red-500 border-2 border-indigo-900 w-3.5 h-3.5 rounded-full animate-pulse"></span>}
                        </button>
                        {showNotifPanel && (
                            <div className="absolute left-0 top-12 w-[calc(100vw-2rem)] max-w-xs sm:w-80 bg-white dark:bg-slate-800 rounded-2xl shadow-2xl p-4 z-50 border border-slate-200 dark:border-slate-700 fade-in max-h-96 overflow-y-auto custom-scroll text-slate-800 dark:text-slate-100">
                                <h4 className="font-black mb-4 border-b dark:border-slate-700 pb-2">اعلانات سیستم</h4>
                                {notifs.length === 0 && <div className="text-sm text-slate-400 font-bold text-center py-4">پیام جدیدی ندارید</div>}
                                {notifs.map(n => (
                                    <div key={n.id} onClick={()=>{markNotifRead(n.id); setShowNotifPanel(false);}} className={`p-4 rounded-xl text-sm font-bold mb-2 cursor-pointer border hover:shadow-md transition-all ${n.type==='error'?'bg-red-50 border-red-200 text-red-800':n.type==='success'?'bg-green-50 border-green-200 text-green-800':'bg-slate-50 dark:bg-slate-700 border-slate-200 dark:border-slate-600'}`}>
                                        <div className="flex gap-2 items-start leading-relaxed"><Icons.Alert/> <span>{toPersianNum(n.message)}</span></div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                    <button onClick={onLogout} className="text-white bg-white/10 px-4 py-2 rounded-xl font-bold text-sm hover:bg-white/20 transition-colors">خروج</button>
                </div>
            </header>

            <main className="flex-1 p-4 w-full max-w-4xl mx-auto mt-4">
                {loading ? <div className="text-center py-20 pulse-text font-black text-indigo-300 text-xl">در حال دریافت وظایف...</div> : (
                    <div className="space-y-6 fade-in">
                        {myTasks.length === 0 && <div className="text-center py-20 bg-white dark:bg-slate-800 rounded-3xl border border-slate-200 dark:border-slate-700 font-black text-slate-400 shadow-sm">هیچ وظیفه‌ای برای شما در جریان نیست.</div>}

                        {myTasks.map((group) => (
                            <div key={group.event.id} className="bg-white dark:bg-slate-800 rounded-3xl shadow-sm border border-slate-200 dark:border-slate-700 overflow-hidden relative">
                                <div className="bg-slate-800 dark:bg-slate-950 p-5 sm:p-6 text-white relative">
                                    {group.event.org_logo && <img src={group.event.org_logo} className="absolute left-4 top-4 w-16 h-16 opacity-20 pointer-events-none" />}
                                    <div className="text-xs font-bold text-indigo-300 mb-1">پرونده: {toPersianNum(group.event.id)}</div>
                                    <h3 className="font-black text-2xl mb-2">{toPersianNum(group.event.title)}</h3>
                                    <div className="text-sm text-slate-300 mt-3 flex flex-col sm:flex-row gap-3">
                                        <span className="flex items-center gap-1.5"><Icons.Building/> {toPersianNum(group.event.venue_name) || 'بدون سالن'}</span>
                                        <span className="font-bold flex items-center gap-1.5 bg-slate-700/50 px-3 py-1.5 rounded-lg w-fit" dir="ltr"><Icons.Calendar/> {toJalaliDate(group.event.start_date)}</span>
                                    </div>
                                </div>
                                <div className="p-4 sm:p-6 space-y-4 bg-slate-50 dark:bg-slate-800">
                                    {group.tasks.map(t => {
                                        const done = isOn(t.is_done);
                                        const hasIssue = isOn(t.has_issue);
                                        const isLocked = !done && isLockedTask(t);
                                        const pendingDeleg = Number(t.pending_delegation) > 0;
                                        return (
                                        <div key={t.id} className={`p-5 rounded-2xl border-2 transition-all shadow-sm ${isLocked ? 'gray-chain-locked staff-locked bg-slate-200 dark:bg-slate-800 border-dashed border-slate-300' : hasIssue ? 'bg-red-50 dark:bg-red-900/20 border-red-300' : done ? 'bg-green-50 dark:bg-green-900/20 border-green-200 opacity-70' : 'bg-white dark:bg-slate-700 border-slate-200 dark:border-slate-600'}`}>
                                            <div className="flex flex-col sm:flex-row justify-between sm:items-center gap-4">
                                                <div className="flex-1">
                                                    <div className={`font-bold text-lg mb-3 leading-relaxed ${done ? 'line-through text-slate-400' : 'text-slate-800 dark:text-white'}`}>{toPersianNum(t.title)}</div>
                                                    <div className="flex flex-wrap gap-2">
                                                        <span className="inline-flex items-center gap-1 bg-amber-50 dark:bg-amber-900/30 border border-amber-200 dark:border-amber-700/50 text-amber-700 dark:text-amber-400 text-xs font-bold px-2.5 py-1 rounded-md shadow-sm"><Icons.Clock/> {t.timing_tag || 'بدون زمان‌بندی'}</span>
                                                        {t.role_tag && <span className="inline-block bg-indigo-50 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-300 text-xs font-bold px-2.5 py-1 rounded-md border border-indigo-200 dark:border-indigo-700/50 shadow-sm">@{toPersianNum(t.role_tag)}</span>}
                                                    </div>
                                                    {isLocked && <div className="text-xs font-bold text-slate-500 dark:text-slate-400 bg-white dark:bg-slate-800 p-2 rounded-lg mt-3 border border-slate-300 dark:border-slate-600 shadow-sm">⏳ در انتظار انجام: {toPersianNum(t.dep_title)}</div>}
                                                    {hasIssue && <div className="text-xs text-red-600 font-bold bg-red-100 p-2.5 rounded-lg mt-3 border border-red-200">مانع: {toPersianNum(t.issue_note)}</div>}
                                                </div>
                                                <div className="flex items-stretch sm:items-center gap-2 shrink-0 border-t sm:border-0 border-slate-200 dark:border-slate-600 pt-3 sm:pt-0">
                                                    {canDelegate && !done && !isLocked && (pendingDeleg
                                                        ? <span className="px-4 py-3 sm:py-2.5 rounded-xl border-2 border-blue-200 bg-blue-50 text-blue-500 font-bold text-xs text-center flex items-center">در انتظار تایید واگذاری</span>
                                                        : <button onClick={()=>{ setDelegateTo(''); setDelegationModal({ task_id: t.id }); }} className="px-4 py-3 sm:py-2.5 rounded-xl border-2 border-blue-200 bg-blue-50 text-blue-700 font-bold text-sm hover:bg-blue-100 transition-colors shadow-sm">واگذاری وظیفه</button>
                                                    )}
                                                    <button disabled={isLocked} onClick={()=>reportIssue(t)} className={`px-4 py-3 sm:py-2.5 rounded-xl border-2 font-bold text-sm transition-colors shadow-sm ${hasIssue ? 'bg-green-50 text-green-700 border-green-300 hover:bg-green-100' : 'bg-red-50 text-red-600 border-red-200 hover:bg-red-100'}`}>{hasIssue ? 'رفع توقف' : 'گزارش مشکل'}</button>
                                                    <button disabled={isLocked} onClick={()=>toggleTask(t)} className={`w-14 h-14 sm:w-12 sm:h-12 rounded-xl border-2 flex items-center justify-center transition-colors shadow-sm ${done ? 'bg-green-500 border-green-600 text-white' : 'bg-indigo-50 dark:bg-indigo-900/30 border-indigo-200 dark:border-indigo-700 text-indigo-500 dark:text-indigo-400 hover:bg-indigo-600 hover:text-white dark:hover:bg-indigo-600 dark:hover:text-white'}`}><Icons.Check/></button>
                                                </div>
                                            </div>
                                        </div>
                                    )})}
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </main>

            {delegationModal && (
                <div className="fixed inset-0 z-50 bg-slate-900/80 backdrop-blur-sm flex items-center justify-center p-4 fade-in">
                    <div className="bg-white dark:bg-slate-800 p-8 rounded-3xl w-full max-w-md shadow-2xl">
                        <h3 className="text-xl font-black text-slate-800 dark:text-white mb-2">درخواست واگذاری وظیفه</h3>
                        <p className="text-sm font-bold text-slate-500 dark:text-slate-400 mb-6 leading-relaxed">پس از ثبت درخواست، مدیریت باید این انتقال را تایید کند.</p>
                        <select value={delegateTo} onChange={e=>setDelegateTo(e.target.value)} className="w-full border-2 border-slate-200 dark:border-slate-700 p-4 rounded-xl font-bold outline-none focus:border-indigo-500 mb-8 bg-slate-50 dark:bg-slate-700 dark:text-white cursor-pointer">
                            <option value="">(انتخاب همکار جایگزین)</option>
                            {staffList.map(s => <option key={s.id} value={s.id}>{toPersianNum(s.full_name)} {isOn(s.is_shadow) ? '(📞)' : ''}</option>)}
                        </select>
                        <div className="flex gap-3">
                            <button onClick={()=>setDelegationModal(null)} className="flex-1 py-4 bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-white font-bold rounded-xl hover:bg-slate-200 transition-colors">انصراف</button>
                            <button onClick={requestDelegation} className="flex-1 py-4 bg-indigo-600 text-white font-bold rounded-xl shadow-lg hover:bg-indigo-700 transition-colors">ارسال درخواست</button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
