import React, { useState, useEffect } from 'react';
import { api } from '../lib/api';
import { toPersianNum, toJalaliDate, statusInfo } from '../lib/utils';
import { Icons } from '../components/Icons';
import EventDetail from './EventDetail';

export default function EventDashboard({ md, user, onNewEvent, refreshKey }) {
    const [selectedId, setSelectedId] = useState(null);
    const [eventsList, setEventsList] = useState([]);
    
    const loadEvents = () => api('get_events').then((res) => { if(res) setEventsList(res); });
    useEffect(() => { loadEvents(); }, [refreshKey]);

    if(selectedId) return <EventDetail eventId={selectedId} onBack={() => {setSelectedId(null); loadEvents();}} user={user} md={md} />;

    return (
        <div className="fade-in mt-8">
            <div className="flex flex-col sm:flex-row justify-between items-center mb-8 gap-4 bg-white dark:bg-slate-800 p-6 sm:p-8 rounded-[2rem] shadow-sm border border-slate-200 dark:border-slate-700">
                <div className="text-center sm:text-right w-full sm:w-auto">
                    <h3 className="text-3xl font-black text-slate-800 dark:text-white">داشبورد فرماندهی رویدادها</h3>
                    <p className="text-slate-500 dark:text-slate-400 font-bold text-sm mt-2">مدیریت و کنترل لحظه‌ای پروژه‌های در حال اجرا</p>
                </div>
                <button onClick={onNewEvent} className="w-full sm:w-auto bg-indigo-600 text-white px-10 py-5 rounded-2xl font-black text-lg shadow-[0_4px_15px_rgba(79,70,229,0.3)] hover:bg-indigo-700 transition-transform active:scale-[0.98] flex items-center justify-center gap-3"><Icons.Plus /> تعریف رویداد جدید</button>
            </div>
            
            {eventsList.length === 0 ? (
                <div className="text-center py-32 bg-white dark:bg-slate-800 rounded-[3rem] border-2 border-dashed border-slate-300 dark:border-slate-700 shadow-sm mt-4">
                    <div className="bg-indigo-50 dark:bg-indigo-900/30 text-indigo-400 dark:text-indigo-500 w-28 h-28 rounded-full flex items-center justify-center mx-auto mb-6"><Icons.Building /></div>
                    <h3 className="text-3xl font-black text-slate-800 dark:text-white mb-4">پروژه‌ای در دست اجرا نیست</h3>
                    <p className="text-slate-500 dark:text-slate-400 font-bold max-w-sm mx-auto px-4 leading-relaxed">برای شروع یک برنامه‌ریزی قدرتمند، روی دکمه آبی رنگ در بالای صفحه کلیک کنید.</p>
                </div>
            ) : (
                <div className="grid md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                    {eventsList.map(ev => (
                        <div key={ev.id} className="bg-white dark:bg-slate-800 p-6 sm:p-8 rounded-[2rem] shadow-sm border border-slate-200 dark:border-slate-700 hover:border-indigo-400 dark:hover:border-indigo-500 hover:shadow-xl transition-all relative group flex flex-col h-full cursor-pointer" onClick={() => setSelectedId(ev.id)}>
                            <div className="flex-1">
                                <div className="flex justify-between items-start mb-6">
                                    {ev.org_logo ? <img src={ev.org_logo} className="w-14 h-14 rounded-xl object-cover border border-slate-200 dark:border-slate-700 shadow-sm bg-white" /> : <div className="w-14 h-14 bg-slate-100 dark:bg-slate-700 rounded-xl flex items-center justify-center text-slate-400 dark:text-slate-500"><Icons.Building/></div>}
                                    <span className={`text-[10px] font-bold px-3 py-1.5 rounded-lg border shadow-sm ${statusInfo(ev.status).card}`}>{statusInfo(ev.status).label}</span>
                                </div>
                                <h4 className="font-black text-2xl mb-4 text-slate-800 dark:text-white leading-snug">{toPersianNum(ev.title)}</h4>
                                <div className="space-y-3 mb-6">
                                    <p className="text-sm font-bold text-slate-600 dark:text-slate-300 flex items-center gap-2 bg-slate-50 dark:bg-slate-700 px-3 py-2 rounded-lg border border-slate-100 dark:border-slate-600"><Icons.Building/> {toPersianNum(ev.org_name) || 'کارفرمای نامشخص'}</p>
                                    <p className="text-sm text-slate-500 dark:text-slate-400 font-bold flex items-center gap-2 bg-slate-50 dark:bg-slate-700 px-3 py-2 rounded-lg border border-slate-100 dark:border-slate-600" dir="ltr"><Icons.Calendar/> {ev.start_date ? toJalaliDate(ev.start_date) : 'بدون تاریخ'}</p>
                                </div>
                            </div>
                            <div className="w-full bg-slate-50 dark:bg-slate-700 group-hover:bg-indigo-600 dark:group-hover:bg-indigo-500 group-hover:text-white group-hover:border-indigo-600 dark:group-hover:border-indigo-500 text-indigo-600 dark:text-indigo-400 py-4 rounded-xl font-black border border-slate-200 dark:border-slate-600 transition-colors text-center shadow-sm">ورود به اتاق فرمان</div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}
