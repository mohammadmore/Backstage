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
import SecurityModal from './components/SecurityModal';
import CalendarPage from './pages/CalendarPage';
import ReportsPage from './pages/ReportsPage';
import SettingsPage from './pages/SettingsPage';
import PortalPage from './pages/PortalPage';
import CheckinPage from './pages/CheckinPage';

const OFFICE_SECTIONS = ['events', 'calendar', 'reports', 'master', 'settings', 'checkin'];

const inputCls = 'glass-soft w-full border-2 p-3.5 rounded-2xl text-center font-semibold focus:border-indigo-500 dark:text-white';

function LoginForm({ onSubmit, busy, username = '', lockUser = false }) {
    return (
        <form onSubmit={onSubmit} className="space-y-3">
            <label className="sr-only" htmlFor={lockUser ? 'relogin-u' : 'login-u'}>نام کاربری</label>
            <input id={lockUser ? 'relogin-u' : 'login-u'} name="u" type="text" autoComplete="username" placeholder="نام کاربری" defaultValue={username} readOnly={lockUser} className={inputCls} dir="ltr" />
            <label className="sr-only" htmlFor={lockUser ? 'relogin-p' : 'login-p'}>رمز عبور</label>
            <input id={lockUser ? 'relogin-p' : 'login-p'} name="p" type="password" autoComplete="current-password" placeholder="رمز عبور" autoFocus={lockUser} className={inputCls} dir="ltr" />
            <button type="submit" disabled={busy} className="btn-grad w-full text-white p-3.5 rounded-2xl font-bold text-lg disabled:opacity-60 mt-3 active:scale-[0.98]">{busy ? 'در حال ورود...' : 'ورود به سیستم'}</button>
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
    const [twofaStep, setTwofaStep] = useState(false);
    const [showSecurity, setShowSecurity] = useState(false);
    const wizardGuard = useRef(null);
    const userRef = useRef(null);
    userRef.current = user;

    // نشست منقضی: به‌جای خروج کامل، پنجره ورود مجدد روی همان صفحه باز می‌شود تا داده‌های فرم‌ها از بین نروند
    useEffect(() => {
        setUnauthorizedHandler(() => { if (userRef.current) setSessionExpired(true); });
        api('me', null, {}, { silent: false }).then(res => { if (res && res.user) setUser(res.user); setBooting(false); });
    }, []);

    // «مدیر» در این فایل یعنی هر کاربر دفتری (مدیر کل، مدیر پروژه، حسابدار)؛ جزئیات دسترسی در perms
    const isAdmin = !!(user && user.is_office);
    const perms = (user && user.perms) || {};
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
        if (user.is_office && !user.must_change_password && !user.must_setup_2fa) {
            loadMd(); fetchNotifs();
            const i = setInterval(() => { if (!document.hidden) fetchNotifs(); }, 15000);
            return () => clearInterval(i);
        }
    }, [user && user.id, user && user.must_change_password, user && user.must_setup_2fa]);

    // ---------- مسیرها (فقط مدیر) ----------
    const [section, sub, sub2] = route.parts;
    useEffect(() => {
        if (!isAdmin || user.must_change_password || section === 'portal') return;
        const allowed = OFFICE_SECTIONS.filter(x => (x !== 'master' || perms.master) && (x !== 'settings' || perms.settings));
        if (!allowed.includes(section)) navigate('events', { replace: true });
    }, [isAdmin, section, user && user.must_change_password]);

    // ویزارد با مسیر #/events/new باز می‌شود؛ خروج با دکمه بازگشت مرورگر هم نیاز به تایید دارد
    useEffect(() => {
        if (!isAdmin) return;
        const wantsWizard = section === 'events' && sub === 'new';
        if (wantsWizard && !wizardOpen) { if (!perms.create_event) { navigate('events', { replace: true }); return; } loadMd(); setWizardOpen(true); return; }
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
        setUser(null); setMd({}); setNotifs([]); setShowPwd(false); setWizardOpen(false); setSessionExpired(false); setTwofaStep(false); setShowSecurity(false);
        try { navigator.serviceWorker?.controller?.postMessage('clear-api-cache'); } catch (e) { /* */ }
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
        if (res.twofa_required) { setTwofaStep(true); return; }
        finishLogin(res);
    };
    const login2fa = async (e) => {
        e.preventDefault();
        const code = e.target.code.value.trim();
        if (!code) return;
        setLoggingIn(true);
        const res = await api('login_2fa', { code });
        setLoggingIn(false);
        if (res && res.success) { setTwofaStep(false); finishLogin(res); }
    };
    const finishLogin = (res) => {
        if (sessionExpired) {
            setSessionExpired(false);
            if (user && res.user.id !== user.id) { window.location.reload(); return; }
            toast('دوباره وارد شدید. اگر آخرین تغییرتان ذخیره نشده بود، آن را دوباره ثبت کنید.', 'info', 6000);
        }
        setUser(res.user);
    };

    // پورتال کارفرما بدون نیاز به ورود
    if (section === 'portal' && sub) return <PortalPage token={sub} />;

    if (booting) return <div className="p-10 text-center"><h2 className="text-indigo-600 dark:text-indigo-400 text-xl font-bold pulse-text">در حال راه‌اندازی سیستم...</h2></div>;

    if (!user) return (
        <div className="flex items-center justify-center min-h-screen px-4">
            <div className="absolute top-4 left-4">
                <button type="button" onClick={() => { const t = theme === 'light' ? 'dark' : 'light'; setTheme(t); applyTheme(t); }} className="glass p-2.5 text-violet-700 dark:text-violet-200 rounded-full border" aria-label={theme === 'dark' ? 'پوسته روشن' : 'پوسته تیره'}>{theme === 'dark' ? <Icons.Sun /> : <Icons.Moon />}</button>
            </div>
            <main className="glass grad-top p-8 sm:p-10 rounded-[2rem] w-full max-w-md text-center fade-in border">
                <div className="w-16 h-16 text-indigo-600 dark:text-indigo-400 rounded-full flex items-center justify-center mx-auto mb-4 bg-grad-soft"><Icons.Tent /></div>
                <h1 className="text-3xl font-bold mb-7 text-grad">ای‌ونت مستر</h1>
                {twofaStep ? (
                    <form onSubmit={login2fa} className="space-y-3">
                        <p className="text-sm text-slate-600 dark:text-slate-300 leading-relaxed">کد ۶ رقمی برنامه احراز هویت گوشی (یا یکی از کدهای پشتیبان) را وارد کنید.</p>
                        <label className="sr-only" htmlFor="code-2fa">کد ورود دومرحله‌ای</label>
                        <input id="code-2fa" name="code" autoFocus inputMode="numeric" autoComplete="one-time-code" maxLength={12} className={`${inputCls} text-2xl tracking-[0.4em]`} dir="ltr" />
                        <button type="submit" disabled={loggingIn} className="w-full btn-grad p-3.5 rounded-2xl font-bold text-lg disabled:opacity-60">تایید</button>
                        <button type="button" onClick={() => setTwofaStep(false)} className="w-full text-sm text-slate-500 font-semibold py-2">بازگشت</button>
                    </form>
                ) : <LoginForm onSubmit={login} busy={loggingIn} />}
            </main>
        </div>
    );

    // رمز ضعیف یا موقت => تا تغییر رمز، دسترسی دیگری وجود ندارد (سرور هم همین را اعمال می‌کند)
    if (user.must_change_password) return <ChangePassword forced user={user} onDone={(u) => u && setUser(u)} onLogout={logout} />;
    if (user.must_setup_2fa) return <SecurityModal forced user={user} onDone={(u) => u && setUser(u)} onClose={() => {}} onLogout={logout} />;

    const overlays = (
        <>
            {showSecurity && <SecurityModal user={user} onDone={(u) => u && setUser(u)} onClose={() => setShowSecurity(false)} />}
            {showPwd && <ChangePassword user={user} onDone={(u) => { setShowPwd(false); if (u) setUser(u); }} onCancel={() => setShowPwd(false)} />}
            {sessionExpired && (
                <div className="fixed inset-0 z-[380] glass-overlay flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-labelledby="relogin-title">
                    <div className="glass-strong grad-top p-7 rounded-3xl w-full max-w-sm text-center">
                        <h2 id="relogin-title" className="text-lg font-bold text-slate-800 dark:text-white mb-2">نشست شما منقضی شده است</h2>
                        <p className="text-sm text-slate-600 dark:text-slate-300 mb-5 leading-relaxed">برای ادامه دوباره وارد شوید. اطلاعات این صفحه حفظ می‌شود.</p>
                        <LoginForm onSubmit={login} busy={loggingIn} username={user.username} lockUser />
                        <button type="button" onClick={logout} className="w-full mt-2 py-2 text-sm text-slate-500 dark:text-slate-400 font-semibold">خروج کامل</button>
                    </div>
                </div>
            )}
        </>
    );

    if (!isAdmin) {
        if (section === 'checkin' && sub) return <>{overlays}<div className="p-4"><CheckinPage eventId={Number(sub)} onBack={() => navigate('my')} /></div></>;
        return <>{overlays}<StaffDashboard user={user} onLogout={logout} onChangePassword={() => setShowPwd(true)} onSecurity={user.twofa_mode !== 'off' ? () => setShowSecurity(true) : null} theme={theme} onToggleTheme={toggleTheme} /></>;
    }

    // ---------- پنل مدیر ----------
    const view = { master: 'MASTER', calendar: 'CALENDAR', reports: 'REPORTS', settings: 'SETTINGS', checkin: 'CHECKIN' }[section] || 'EVENTS';
    const navItems = [
        { href: '#/events', v: 'EVENTS', label: 'رویدادها', show: true },
        { href: '#/calendar', v: 'CALENDAR', label: 'تقویم', show: true },
        { href: '#/reports', v: 'REPORTS', label: 'گزارش‌ها', show: perms.reports },
        { href: `#/master/${MASTER_TABS.some(t => t.id === sub) ? sub : 'categories'}`, v: 'MASTER', label: 'دیتابیس‌ها', show: perms.master },
        { href: '#/settings', v: 'SETTINGS', label: 'تنظیمات', show: perms.settings },
    ].filter(n => n.show);
    const detailId = section === 'events' && sub && /^\d+$/.test(sub) ? Number(sub) : null;
    const detailTab = DETAIL_TABS.some(t => t.id === sub2) ? sub2 : 'operations';
    const masterTab = MASTER_TABS.some(t => t.id === sub) ? sub : 'categories';
    const navBtn = (active) => `px-4 py-2 rounded-lg font-semibold text-sm transition-colors ${active ? 'bg-white text-violet-700 shadow-sm' : 'on-nav'}`;

    const delegationActions = (n) => (n.type === 'delegation' && n.deleg_status === 'pending' && n.from_name) ? (
        <div className="flex gap-2 mt-3 pt-3 border-t border-blue-200/60 dark:border-blue-700/50">
            <button type="button" onClick={() => resolveDelegation(n.ref_id, 'approved')} className="flex-1 bg-green-600 text-white font-semibold py-2 rounded-lg hover:bg-green-700 text-sm">تایید واگذاری</button>
            <button type="button" onClick={() => resolveDelegation(n.ref_id, 'rejected')} className="glass flex-1 text-slate-700 dark:text-slate-300 border font-semibold py-2 rounded-lg hover:bg-white/60 text-sm">رد درخواست</button>
        </div>
    ) : null;

    return (
        <div className="min-h-screen flex flex-col">
            <header className="glass-nav text-white px-4 flex justify-between items-center z-40 sticky top-0 h-[72px] sm:h-[76px] gap-2">
                <div className="flex items-center gap-5">
                    <a href="#/events" className="font-bold text-lg flex items-center gap-2" aria-label="ای‌ونت مستر - رویدادها"><span className="text-white bg-white/20 p-1.5 rounded-lg"><Icons.Tent /></span> <span className="hidden sm:block">ای‌ونت مستر</span></a>
                    <nav className="hidden md:flex gap-1 p-1 rounded-xl bg-white/15" aria-label="بخش‌ها">
                        {navItems.map(n => <a key={n.v} href={n.href} aria-current={view === n.v ? 'page' : undefined} className={navBtn(view === n.v)}>{n.label}</a>)}
                    </nav>
                </div>
                <div className="flex items-center gap-1.5 sm:gap-2">
                    <NotificationPanel onRefresh={fetchNotifs} notifs={notifs} onRead={markNotifRead} onReadAll={markAllRead} onOpen={(evId) => navigate(`events/${evId}`)} renderActions={delegationActions} />
                    <button type="button" onClick={toggleTheme} className="p-2 on-nav rounded-full" aria-label={theme === 'dark' ? 'پوسته روشن' : 'پوسته تیره'} title="تغییر پوسته">{theme === 'dark' ? <Icons.Sun /> : <Icons.Moon />}</button>
                    {user.twofa_mode !== 'off' && <button type="button" onClick={() => setShowSecurity(true)} className="p-2 on-nav rounded-full" aria-label="ورود دومرحله‌ای" title="ورود دومرحله‌ای">🛡</button>}
                    <button type="button" onClick={() => setShowPwd(true)} className="p-2 on-nav rounded-full" aria-label="تغییر رمز عبور" title="تغییر رمز عبور"><Icons.Key /></button>
                    <div className="hidden sm:flex items-center gap-2 bg-white/15 px-3 py-1.5 rounded-full border border-white/25">
                        {user.avatar ? <img src={user.avatar} className="w-7 h-7 rounded-full object-cover bg-white" alt="" /> : <span className="w-7 h-7 rounded-full flex items-center justify-center bg-white/20"><Icons.Users /></span>}
                        <span className="text-sm text-white">{toPersianNum(user.full_name)}</span>
                    </div>
                    <button type="button" onClick={logout} className="text-white font-semibold bg-white/15 border border-white/25 px-3 py-2 rounded-lg hover:bg-red-500 hover:border-red-500 text-sm">خروج</button>
                </div>
            </header>
            <nav className="glass-nav md:hidden flex p-2 gap-1.5 z-30 relative overflow-x-auto" aria-label="بخش‌ها">
                {navItems.map(n => <a key={n.v} href={n.href} aria-current={view === n.v ? 'page' : undefined} className={`flex-1 whitespace-nowrap text-center py-2.5 px-2 rounded-xl font-semibold text-sm ${view === n.v ? 'bg-white text-violet-700' : 'bg-white/15 text-white'}`}>{n.label}</a>)}
            </nav>

            <main className="flex-1 w-full max-w-[100rem] mx-auto relative p-4 md:p-8 pt-0 md:pt-0">
                {view === 'CALENDAR' && <CalendarPage />}
                {view === 'REPORTS' && <ReportsPage user={user} />}
                {view === 'SETTINGS' && <SettingsPage user={user} onOpenSecurity={() => setShowSecurity(true)} />}
                {view === 'CHECKIN' && sub && <CheckinPage eventId={Number(sub)} onBack={() => window.history.back()} />}
                {view === 'EVENTS' && !detailId && <EventDashboard user={user} refreshKey={eventsKey} onOpen={(id) => navigate(`events/${id}`)} onNewEvent={() => navigate('events/new')} />}
                {view === 'EVENTS' && detailId && <EventDetail key={detailId} eventId={detailId} md={md} user={user} tab={detailTab} onTabChange={(t) => navigate(`events/${detailId}/${t}`, { replace: true })} onBack={() => navigate('events')} />}
                {view === 'MASTER' && <div className="mt-6"><MasterData md={md} reload={loadMd} tab={masterTab} onTabChange={(t) => navigate(`master/${t}`, { replace: true })} /></div>}
            </main>
            {wizardOpen && <EventCreate md={md} user={user} registerGuard={(fn) => { wizardGuard.current = fn; }} onClose={closeWizard} onDone={() => { wizardGuard.current = null; setWizardOpen(false); setEventsKey(k => k + 1); navigate('events', { replace: true }); }} />}
            {overlays}
        </div>
    );
}
