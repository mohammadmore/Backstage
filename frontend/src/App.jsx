import React, { useState, useEffect } from 'react';
import { api, setUnauthorizedHandler } from './lib/api';
import { toPersianNum } from './lib/utils';
import { Icons } from './components/Icons';
import StaffDashboard from './staff/StaffDashboard';
import EventDashboard from './events/EventDashboard';
import EventCreate from './events/EventCreate';
import MasterData from './master/MasterData';

const applyTheme = (t) => { if (t === 'dark') document.documentElement.classList.add('dark'); else document.documentElement.classList.remove('dark'); };

// =====================================
// اجرای اصلی (App) و مدیریت تم تاریک
// =====================================
export default function App() {
    const [user, setUser] = useState(null);
    const [booting, setBooting] = useState(true);
    const [view, setView] = useState('MASTER');
    const [md, setMd] = useState({});
    const [showCreate, setShowCreate] = useState(false);
    const [eventsKey, setEventsKey] = useState(0);
    const [notifs, setNotifs] = useState([]);
    const [showNotifPanel, setShowNotifPanel] = useState(false);
    const [theme, setTheme] = useState('light');
    const [loggingIn, setLoggingIn] = useState(false);

    // بازیابی نشست پس از رفرش صفحه (قبلاً با هر رفرش کاربر خارج می‌شد)
    useEffect(() => {
        setUnauthorizedHandler((msg) => {
            setUser(prev => { if (prev) alert(msg || 'نشست شما منقضی شده است. لطفاً دوباره وارد شوید.'); return null; });
            setMd({}); setNotifs([]); setShowCreate(false);
        });
        api('me', null, {}, { silent: false }).then(res => { if (res && res.user) setUser(res.user); setBooting(false); });
    }, []);

    const isAdmin = !!(user && user.is_admin);
    const loadMd = () => api('get_master_data').then((res) => { if (res) setMd(res); });
    const fetchNotifs = async () => { const res = await api('get_notifications', null, {}, { silent: true }); if (res) setNotifs(res); };

    const toggleTheme = async () => {
        const newTheme = theme === 'light' ? 'dark' : 'light';
        setTheme(newTheme); applyTheme(newTheme);
        if (user) await api('update_theme', { theme: newTheme });
    };

    useEffect(() => {
        if (!user) return;
        const t = user.theme_pref === 'dark' ? 'dark' : 'light';
        setTheme(t); applyTheme(t);
        if (user.is_admin) {
            loadMd(); fetchNotifs();
            const i = setInterval(() => { if (!document.hidden) fetchNotifs(); }, 15000);
            return () => clearInterval(i);
        }
    }, [user]);

    const logout = async () => {
        await api('logout', {}, {}, { silent: true });
        setUser(null); setMd({}); setNotifs([]); setShowNotifPanel(false); setShowCreate(false); setView('MASTER');
    };

    const markNotifRead = async (id) => { await api('mark_notif_read', { id }); fetchNotifs(); };

    // سرور اطلاعات درخواست (فرستنده، وظیفه و رویداد) را خودش از دیتابیس می‌خواند
    const resolveDelegation = async (delId, status) => {
        await api('resolve_delegation', { delegation_id: delId, status });
        fetchNotifs();
        setEventsKey(k => k + 1);
    };

    const login = async (e) => {
        e.preventDefault();
        if (loggingIn) return;
        const username = e.target.u.value.trim();
        const password = e.target.p.value;
        if (!username || !password) return alert('نام کاربری و رمز عبور را وارد کنید.');
        setLoggingIn(true);
        const res = await api('login', { username, password });
        setLoggingIn(false);
        if (res && res.success) { setView('MASTER'); setUser(res.user); }
    };

    if (booting) return <div style={{ padding: 40, textAlign: 'center' }}><h2 className="text-indigo-600 text-2xl font-black pulse-text">در حال راه‌اندازی هسته سیستم یکپارچه...</h2></div>;

    if (!user) return (
        <div className="flex items-center justify-center min-h-screen bg-slate-900 px-4 bg-[url('data:image/svg+xml;base64,PHN2ZyBvcGFjaXR5PSIwLjA1IiB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAxMDAgMTAwIj48Y2lyY2xlIGN4PSI1MCIgY3k9IjUwIiByPSI0MCIgc3Ryb2tlPSIjZmZmIiBzdHJva2Utd2lkdGg9IjIiIGZpbGw9Im5vbmUiLz48L3N2Zz4=')]">
            <div className="bg-white dark:bg-slate-800 p-8 sm:p-10 rounded-[2.5rem] shadow-2xl w-full max-w-md text-center fade-in border-t-8 border-indigo-600 relative overflow-hidden transition-colors duration-300">
                <div className="w-20 h-20 bg-indigo-50 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400 rounded-full flex items-center justify-center mx-auto mb-4 shadow-inner"><Icons.Tent /></div>
                <h1 className="text-3xl font-black mb-8 text-slate-800 dark:text-white tracking-tight">ای‌ونت مستر</h1>
                <form onSubmit={login} className="space-y-4">
                    <input name="u" type="text" autoComplete="username" placeholder="نام کاربری" className="w-full border-2 border-slate-200 dark:border-slate-600 p-4 rounded-2xl bg-slate-50 dark:bg-slate-700 text-center font-bold outline-none focus:border-indigo-500 dark:text-white transition-colors" dir="ltr" />
                    <input name="p" type="password" autoComplete="current-password" placeholder="رمز عبور" className="w-full border-2 border-slate-200 dark:border-slate-600 p-4 rounded-2xl bg-slate-50 dark:bg-slate-700 text-center font-bold outline-none focus:border-indigo-500 dark:text-white transition-colors" dir="ltr" />
                    <button type="submit" disabled={loggingIn} className="w-full bg-indigo-600 text-white p-4 rounded-2xl font-black text-lg hover:bg-indigo-700 disabled:opacity-60 shadow-[0_8px_20px_rgba(79,70,229,0.3)] mt-6 transition-transform active:scale-[0.98]">{loggingIn ? 'در حال ورود...' : 'ورود به سیستم'}</button>
                </form>
            </div>
        </div>
    );

    if (!isAdmin) return <StaffDashboard user={user} onLogout={logout} />;

    return (
        <div className="min-h-screen flex flex-col bg-slate-100 dark:bg-slate-900 transition-colors duration-300">
            <header className="bg-slate-900 text-white p-4 shadow-xl flex justify-between items-center z-40 sticky top-0 h-[72px] sm:h-[76px]">
                <div className="flex items-center gap-6">
                    <h2 className="font-black text-xl flex items-center gap-2"><span className="text-indigo-400 bg-indigo-900/50 p-1.5 rounded-lg"><Icons.Tent /></span> <span className="hidden sm:block">ای‌ونت مستر</span></h2>
                    <nav className="hidden md:flex gap-1 bg-slate-800 p-1 rounded-xl">
                        <button onClick={() => setView('EVENTS')} className={`px-5 py-2.5 rounded-lg font-bold text-sm transition-all ${view === 'EVENTS' ? 'bg-indigo-600 text-white shadow-md' : 'text-slate-300 hover:text-white hover:bg-slate-700'}`}>داشبورد رویدادها</button>
                        <button onClick={() => setView('MASTER')} className={`px-5 py-2.5 rounded-lg font-bold text-sm transition-all ${view === 'MASTER' ? 'bg-indigo-600 text-white shadow-md' : 'text-slate-300 hover:text-white hover:bg-slate-700'}`}>مدیریت دیتابیس‌ها</button>
                    </nav>
                </div>
                <div className="flex items-center gap-2 sm:gap-4">
                    <button onClick={toggleTheme} className="p-2 text-indigo-200 hover:text-white transition-colors focus:outline-none" title="تغییر پوسته">
                        {theme === 'light' ? <Icons.Moon /> : <Icons.Sun />}
                    </button>

                    <div className="relative group">
                        <button onClick={() => setShowNotifPanel(!showNotifPanel)} className="relative p-2 text-indigo-200 hover:text-white transition-colors bg-slate-800 rounded-full border border-slate-700 focus:outline-none">
                            <Icons.Bell />
                            {notifs.length > 0 && <span className="absolute top-0 right-0 bg-red-500 border-2 border-slate-900 w-3.5 h-3.5 rounded-full animate-pulse"></span>}
                        </button>
                        {showNotifPanel && (
                            <div className="absolute left-0 top-12 w-[calc(100vw-2rem)] max-w-[450px] sm:w-[450px] bg-white dark:bg-slate-800 rounded-2xl shadow-2xl p-4 z-50 border border-slate-200 dark:border-slate-700 fade-in max-h-[80vh] overflow-y-auto custom-scroll text-slate-800 dark:text-slate-100">
                                <div className="flex justify-between items-center mb-4 border-b dark:border-slate-700 pb-2">
                                    <h4 className="font-black">صندوق پیام‌ها و اعلانات</h4>
                                    <button onClick={() => setShowNotifPanel(false)} className="text-slate-400 hover:text-red-500 font-bold">✕</button>
                                </div>
                                {notifs.length === 0 && <div className="text-sm text-slate-400 font-bold text-center py-4">پیام جدیدی ندارید</div>}
                                {notifs.map(n => (
                                    <div key={n.id} className={`p-4 rounded-xl text-sm font-bold mb-3 border shadow-sm transition-all ${n.type === 'delegation' ? 'bg-blue-50 dark:bg-blue-900/30 border-blue-200 dark:border-blue-800 text-blue-900 dark:text-blue-300' : n.type === 'issue' ? 'bg-red-50 dark:bg-red-900/30 border-red-200 dark:border-red-800 text-red-900 dark:text-red-300' : 'bg-slate-50 dark:bg-slate-700 border-slate-200 dark:border-slate-600 text-slate-700 dark:text-slate-200'}`}>
                                        <div className="flex gap-2 items-start leading-relaxed"><Icons.Alert /> <span>{toPersianNum(n.message)}</span></div>

                                        {n.type === 'delegation' && n.deleg_status === 'pending' && n.from_name && (
                                            <div className="flex gap-2 mt-4 pt-3 border-t border-blue-200/50 dark:border-blue-700/50">
                                                <button onClick={(e) => { e.stopPropagation(); resolveDelegation(n.ref_id, 'approved'); }} className="flex-1 bg-green-500 text-white font-bold py-2 rounded-lg hover:bg-green-600 shadow-sm">تایید واگذاری</button>
                                                <button onClick={(e) => { e.stopPropagation(); resolveDelegation(n.ref_id, 'rejected'); }} className="flex-1 bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 border border-slate-300 dark:border-slate-600 font-bold py-2 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-700">رد درخواست</button>
                                            </div>
                                        )}

                                        {!(n.type === 'delegation' && n.deleg_status === 'pending' && n.from_name) && (
                                            <div className="mt-3 text-left"><button onClick={() => markNotifRead(n.id)} className="text-xs font-bold bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-600 px-3 py-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300">✓ متوجه شدم</button></div>
                                        )}
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>

                    <div className="flex items-center gap-2 bg-slate-800 px-3 py-1.5 rounded-full border border-slate-700">
                        {user.avatar ? <img src={user.avatar} className="w-7 h-7 rounded-full object-cover bg-white" alt="avatar" /> : <div className="w-7 h-7 rounded-full bg-slate-600 flex items-center justify-center text-xs"><Icons.Users /></div>}
                        <span className="text-sm font-bold text-slate-200 hidden sm:block">{toPersianNum(user.full_name)}</span>
                    </div>
                    <button onClick={logout} className="text-red-400 font-bold bg-red-400/10 px-4 py-2 rounded-lg hover:bg-red-500 hover:text-white transition-colors">خروج</button>
                </div>
            </header>
            <div className="md:hidden flex bg-slate-800 p-2 gap-2 shadow-inner z-30 relative">
                <button onClick={() => setView('EVENTS')} className={`flex-1 py-3 rounded-xl font-bold text-sm text-white transition-colors ${view === 'EVENTS' ? 'bg-indigo-600 shadow-inner' : 'bg-slate-700'}`}>رویدادها</button>
                <button onClick={() => setView('MASTER')} className={`flex-1 py-3 rounded-xl font-bold text-sm text-white transition-colors ${view === 'MASTER' ? 'bg-indigo-600 shadow-inner' : 'bg-slate-700'}`}>دیتابیس‌ها</button>
            </div>

            <main className="flex-1 w-full max-w-[100rem] mx-auto relative p-4 md:p-8 pt-0">
                {view === 'EVENTS' && <EventDashboard md={md} user={user} refreshKey={eventsKey} onNewEvent={() => { loadMd(); setShowCreate(true); }} />}
                {view === 'MASTER' && <div className="mt-8"><MasterData md={md} reload={loadMd} /></div>}
                {showCreate && <EventCreate md={md} onDone={() => { setShowCreate(false); setView('EVENTS'); setEventsKey(k => k + 1); }} onCancel={() => setShowCreate(false)} />}
            </main>
        </div>
    );
}
