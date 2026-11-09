import React, { useState, useEffect, useRef } from 'react';
import { api, setUnauthorizedHandler } from './lib/api';
import { toPersianNum, applyTheme, currentTheme } from './lib/utils';
import { toast, confirmDialog } from './lib/ui';
import { useRoute, navigate } from './lib/router';
import { Icons } from './components/Icons';
import StaffDashboard from './staff/StaffDashboard';
import EventDashboard from './events/EventDashboard';
import EventDetail, { DETAIL_TABS } from './events/EventDetail';
import EventCreate from './events/EventCreate';
import MasterData, { MASTER_TABS } from './master/MasterData';
import ChangePassword from './components/ChangePassword';
import NotificationPanel from './components/NotificationPanel';

const inputCls = 'w-full border-2 border-slate-200 dark:border-slate-600 p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-700 text-center font-semibold focus:border-indigo-500 dark:text-white';

function LoginForm({ onSubmit, busy, username = '', lockUser = false }) {
    return (
        <form onSubmit={onSubmit} className="space-y-3">
            <label className="sr-only" htmlFor={lockUser ? 'relogin-u' : 'login-u'}>نام کاربری</label>
            <input id={lockUser ? 'relogin-u' : 'login-u'} name="u" type="text" autoComplete="username" placeholder="نام کاربری" defaultValue={username} readOnly={lockUser} className={inputCls} dir="ltr" />
            <label className="sr-only" htmlFor={lockUser ? 'relogin-p' : 'login-p'}>رمز عبور</label>
            <input id={lockUser ? 'relogin-p' : 'login-p'} name="p" type="password" autoComplete="current-password" placeholder="رمز عبور" autoFocus={lockUser} className={inputCls} dir="ltr" />
            <button type="submit" disabled={busy} className="w-full bg-indigo-600 text-white p-3.5 rounded-2xl font-bold text-lg hover:bg-indigo-700 disabled:opacity-60 mt-3 active:scale-[0.98]">{busy ? 'در حال ورود...' : 'ورود به سیستم'}</button>
        </form>
    );
}

// =====================================
// اجرای اصلی (App)
// =====================================
export default function App() {
    const route = useRoute();
    const [user, setUser] = useState(null);
    const [booting, setBooting] = useState(true);
    const [md, setMd] = useState({});
    const [eventsKey, setEventsKey] = useState(0);
    const [notifs, setNotifs] = useState([]);
    const [theme, setTheme] = useState(currentTheme);
    const [loggingIn, setLoggingIn] = useState(false);
    const [showPwd, setShowPwd] = useState(false);
    const [sessionExpired, setSessionExpired] = useState(false);
    const [wizardOpen, setWizardOpen] = useState(false);
    const wizardGuard = useRef(null);
    const userRef = useRef(null);
    userRef.current = user;

    // نشست منقضی: به‌جای خروج کامل، پنجره ورود مجدد روی همان صفحه باز می‌شود تا داده‌های فرم‌ها از بین نروند
    useEffect(() => {
        setUnauthorizedHandler(() => { if (userRef.current) setSessionExpired(true); });
        api('me', null, {}, { silent: false }).then(res => { if (res && res.user) setUser(res.user); setBooting(false); });
    }, []);

    const isAdmin = !!(user && user.is_admin);
    const loadMd = () => api('get_master_data').then((res) => { if (res) setMd(res); });
    const fetchNotifs = async () => { const res = await api('get_notifications', null, {}, { silent: true }); if (res) setNotifs(res); };

    const toggleTheme = async () => {
        const t = theme === 'light' ? 'dark' : 'light';
        setTheme(t); applyTheme(t);
        if (user) await api('update_theme', { theme: t }, {}, { silent: true });
    };

    useEffect(() => {
        if (!user) return;
        const t = user.theme_pref === 'dark' ? 'dark' : 'light';
        setTheme(t); applyTheme(t);
        if (user.is_admin && !user.must_change_password) {
            loadMd(); fetchNotifs();
            const i = setInterval(() => { if (!document.hidden) fetchNotifs(); }, 15000);
            return () => clearInterval(i);
        }
    }, [user && user.id, user && user.must_change_password]);

    // ---------- مسیرها (فقط مدیر) ----------
    const [section, sub, sub2] = route.parts;
    useEffect(() => {
        if (!isAdmin || user.must_change_password) return;
        if (section !== 'events' && section !== 'master') navigate('events', { replace: true });
    }, [isAdmin, section, user && user.must_change_password]);

    // ویزارد با مسیر #/events/new باز می‌شود؛ خروج با دکمه بازگشت مرورگر هم نیاز به تایید دارد
    useEffect(() => {
        if (!isAdmin) return;
        const wantsWizard = section === 'events' && sub === 'new';
        if (wantsWizard && !wizardOpen) { loadMd(); setWizardOpen(true); return; }
        if (!wantsWizard && wizardOpen) {
            const dirty = wizardGuard.current && wizardGuard.current();
            if (!dirty) { setWizardOpen(false); return; }
            confirmDialog({ title: 'خروج از ویزارد؟', message: 'اطلاعات واردشده در ویزارد ساخت رویداد ذخیره نشده و از بین می‌رود.', confirmText: 'خروج و حذف اطلاعات', cancelText: 'ماندن در ویزارد', danger: true })
                .then(ok => { if (ok) setWizardOpen(false); else navigate('events/new'); });
        }
    }, [section, sub, isAdmin]);

    const closeWizard = () => { wizardGuard.current = null; setWizardOpen(false); navigate('events', { replace: true }); };

    const logout = async () => {
        await api('logout', {}, {}, { silent: true });
        setUser(null); setMd({}); setNotifs([]); setShowPwd(false); setWizardOpen(false); setSessionExpired(false);
        window.history.replaceState(null, '', window.location.pathname);
    };

    const markNotifRead = async (id) => { await api('mark_notif_read', { id }); fetchNotifs(); };
    const markAllRead = async () => { if (await api('mark_all_notifs_read', {})) toast('همه اعلان‌ها خوانده شد.'); fetchNotifs(); };
    const resolveDelegation = async (delId, status) => {
        if (await api('resolve_delegation', { delegation_id: delId, status })) toast(status === 'approved' ? 'واگذاری تایید شد.' : 'درخواست رد شد.');
        fetchNotifs();
        setEventsKey(k => k + 1);
    };

    const login = async (e) => {
        e.preventDefault();
        if (loggingIn) return;
        const username = e.target.u.value.trim();
        const password = e.target.p.value;
        if (!username || !password) return toast('نام کاربری و رمز عبور را وارد کنید.', 'warning');
        setLoggingIn(true);
        const res = await api('login', { username, password });
        setLoggingIn(false);
        if (!res || !res.success) return;
        if (sessionExpired) {
            setSessionExpired(false);
            if (user && res.user.id !== user.id) { window.location.reload(); return; }
            toast('دوباره وارد شدید. اگر آخرین تغییرتان ذخیره نشده بود، آن را دوباره ثبت کنید.', 'info', 6000);
        }
        setUser(res.user);
    };

    if (booting) return <div className="p-10 text-center"><h2 className="text-indigo-600 dark:text-indigo-400 text-xl font-bold pulse-text">در حال راه‌اندازی سیستم...</h2></div>;

    if (!user) return (
        <div className="flex items-center justify-center min-h-screen bg-slate-900 px-4">
            <div className="absolute top-4 left-4">
                <button type="button" onClick={() => { const t = theme === 'light' ? 'dark' : 'light'; setTheme(t); applyTheme(t); }} className="p-2 text-slate-300 hover:text-white rounded-full hover:bg-white/10" aria-label={theme === 'dark' ? 'پوسته روشن' : 'پوسته تیره'}>{theme === 'dark' ? <Icons.Sun /> : <Icons.Moon />}</button>
            </div>
            <main className="bg-white dark:bg-slate-800 p-8 sm:p-10 rounded-[2rem] shadow-sm w-full max-w-md text-center fade-in border-t-8 border-indigo-600">
                <div className="w-16 h-16 bg-indigo-50 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400 rounded-full flex items-center justify-center mx-auto mb-4"><Icons.Tent /></div>
                <h1 className="text-2xl font-bold mb-7 text-slate-800 dark:text-white">ای‌ونت مستر</h1>
                <LoginForm onSubmit={login} busy={loggingIn} />
            </main>
        </div>
    );

    // رمز ضعیف یا موقت => تا تغییر رمز، دسترسی دیگری وجود ندارد (سرور هم همین را اعمال می‌کند)
    if (user.must_change_password) return <ChangePassword forced user={user} onDone={(u) => u && setUser(u)} onLogout={logout} />;

    const overlays = (
        <>
            {showPwd && <ChangePassword user={user} onDone={(u) => { setShowPwd(false); if (u) setUser(u); }} onCancel={() => setShowPwd(false)} />}
            {sessionExpired && (
                <div className="fixed inset-0 z-[380] bg-slate-900/80 backdrop-blur-sm flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-labelledby="relogin-title">
                    <div className="bg-white dark:bg-slate-800 p-7 rounded-3xl w-full max-w-sm text-center shadow-sm">
                        <h2 id="relogin-title" className="text-lg font-bold text-slate-800 dark:text-white mb-2">نشست شما منقضی شده است</h2>
                        <p className="text-sm text-slate-600 dark:text-slate-300 mb-5 leading-relaxed">برای ادامه دوباره وارد شوید. اطلاعات این صفحه حفظ می‌شود.</p>
                        <LoginForm onSubmit={login} busy={loggingIn} username={user.username} lockUser />
                        <button type="button" onClick={logout} className="w-full mt-2 py-2 text-sm text-slate-500 dark:text-slate-400 font-semibold">خروج کامل</button>
                    </div>
                </div>
            )}
        </>
    );

    if (!isAdmin) return <>{overlays}<StaffDashboard user={user} onLogout={logout} onChangePassword={() => setShowPwd(true)} theme={theme} onToggleTheme={toggleTheme} /></>;

    // ---------- پنل مدیر ----------
    const view = section === 'master' ? 'MASTER' : 'EVENTS';
    const detailId = section === 'events' && sub && /^\d+$/.test(sub) ? Number(sub) : null;
    const detailTab = DETAIL_TABS.some(t => t.id === sub2) ? sub2 : 'operations';
    const masterTab = MASTER_TABS.some(t => t.id === sub) ? sub : 'categories';
    const navBtn = (active) => `px-4 py-2 rounded-lg font-semibold text-sm transition-colors ${active ? 'bg-indigo-600 text-white' : 'text-slate-300 hover:text-white hover:bg-slate-700'}`;

    const delegationActions = (n) => (n.type === 'delegation' && n.deleg_status === 'pending' && n.from_name) ? (
        <div className="flex gap-2 mt-3 pt-3 border-t border-blue-200/60 dark:border-blue-700/50">
            <button type="button" onClick={() => resolveDelegation(n.ref_id, 'approved')} className="flex-1 bg-green-600 text-white font-semibold py-2 rounded-lg hover:bg-green-700 text-sm">تایید واگذاری</button>
            <button type="button" onClick={() => resolveDelegation(n.ref_id, 'rejected')} className="flex-1 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 border border-slate-300 dark:border-slate-600 font-semibold py-2 rounded-lg hover:bg-slate-50 text-sm">رد درخواست</button>
        </div>
    ) : null;

    return (
        <div className="min-h-screen flex flex-col bg-slate-100 dark:bg-slate-900">
            <header className="bg-slate-900 text-white px-4 shadow flex justify-between items-center z-40 sticky top-0 h-[72px] sm:h-[76px] gap-2">
                <div className="flex items-center gap-5">
                    <a href="#/events" className="font-bold text-lg flex items-center gap-2" aria-label="ای‌ونت مستر - رویدادها"><span className="text-indigo-300 bg-indigo-900/50 p-1.5 rounded-lg"><Icons.Tent /></span> <span className="hidden sm:block">ای‌ونت مستر</span></a>
                    <nav className="hidden md:flex gap-1 bg-slate-800 p-1 rounded-xl" aria-label="بخش‌ها">
                        <a href="#/events" aria-current={view === 'EVENTS' ? 'page' : undefined} className={navBtn(view === 'EVENTS')}>رویدادها</a>
                        <a href={`#/master/${masterTab}`} aria-current={view === 'MASTER' ? 'page' : undefined} className={navBtn(view === 'MASTER')}>مدیریت دیتابیس‌ها</a>
                    </nav>
                </div>
                <div className="flex items-center gap-1.5 sm:gap-2">
                    <NotificationPanel onRefresh={fetchNotifs} notifs={notifs} onRead={markNotifRead} onReadAll={markAllRead} onOpen={(evId) => navigate(`events/${evId}`)} renderActions={delegationActions} />
                    <button type="button" onClick={toggleTheme} className="p-2 text-indigo-100 hover:text-white rounded-full hover:bg-white/10" aria-label={theme === 'dark' ? 'پوسته روشن' : 'پوسته تیره'} title="تغییر پوسته">{theme === 'dark' ? <Icons.Sun /> : <Icons.Moon />}</button>
                    <button type="button" onClick={() => setShowPwd(true)} className="p-2 text-indigo-100 hover:text-white rounded-full hover:bg-white/10" aria-label="تغییر رمز عبور" title="تغییر رمز عبور"><Icons.Key /></button>
                    <div className="hidden sm:flex items-center gap-2 bg-slate-800 px-3 py-1.5 rounded-full border border-slate-700">
                        {user.avatar ? <img src={user.avatar} className="w-7 h-7 rounded-full object-cover bg-white" alt="" /> : <span className="w-7 h-7 rounded-full bg-slate-600 flex items-center justify-center"><Icons.Users /></span>}
                        <span className="text-sm text-slate-200">{toPersianNum(user.full_name)}</span>
                    </div>
                    <button type="button" onClick={logout} className="text-red-300 font-semibold bg-red-400/10 px-3 py-2 rounded-lg hover:bg-red-500 hover:text-white text-sm">خروج</button>
                </div>
            </header>
            <nav className="md:hidden flex bg-slate-800 p-2 gap-2 z-30 relative" aria-label="بخش‌ها">
                <a href="#/events" aria-current={view === 'EVENTS' ? 'page' : undefined} className={`flex-1 text-center py-2.5 rounded-xl font-semibold text-sm text-white ${view === 'EVENTS' ? 'bg-indigo-600' : 'bg-slate-700'}`}>رویدادها</a>
                <a href={`#/master/${masterTab}`} aria-current={view === 'MASTER' ? 'page' : undefined} className={`flex-1 text-center py-2.5 rounded-xl font-semibold text-sm text-white ${view === 'MASTER' ? 'bg-indigo-600' : 'bg-slate-700'}`}>دیتابیس‌ها</a>
            </nav>

            <main className="flex-1 w-full max-w-[100rem] mx-auto relative p-4 md:p-8 pt-0 md:pt-0">
                {view === 'EVENTS' && !detailId && <EventDashboard refreshKey={eventsKey} onOpen={(id) => navigate(`events/${id}`)} onNewEvent={() => navigate('events/new')} />}
                {view === 'EVENTS' && detailId && <EventDetail key={detailId} eventId={detailId} md={md} tab={detailTab} onTabChange={(t) => navigate(`events/${detailId}/${t}`, { replace: true })} onBack={() => navigate('events')} />}
                {view === 'MASTER' && <div className="mt-6"><MasterData md={md} reload={loadMd} tab={masterTab} onTabChange={(t) => navigate(`master/${t}`, { replace: true })} /></div>}
            </main>
            {wizardOpen && <EventCreate md={md} registerGuard={(fn) => { wizardGuard.current = fn; }} onClose={closeWizard} onDone={() => { wizardGuard.current = null; setWizardOpen(false); setEventsKey(k => k + 1); navigate('events', { replace: true }); }} />}
            {overlays}
        </div>
    );
}
