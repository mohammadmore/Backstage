import React, { useState, useEffect } from 'react';
import { api } from '../lib/api';
import { toPersianNum, toJalaliDateTime, isOn, parseDate, detectPhase, isEventOver, TIMINGS } from '../lib/utils';
import { toast, formDialog } from '../lib/ui';
import { Icons } from '../components/Icons';
import NotificationPanel from '../components/NotificationPanel';

const loadPref = () => { try { return localStorage.getItem('evm_staff_pending') !== '0'; } catch (e) { return true; } };

// =====================================
// داشبورد کارمندان
// =====================================
export default function StaffDashboard({ user, onLogout, onChangePassword, theme, onToggleTheme }) {
    const [groups, setGroups] = useState([]);
    const [loading, setLoading] = useState(true);
    const [staffList, setStaffList] = useState([]);
    const [notifs, setNotifs] = useState([]);
    const [onlyPending, setOnlyPending] = useState(loadPref);
    const [showPast, setShowPast] = useState(false);
    const [highlight, setHighlight] = useState(null);
    const canDelegate = isOn(user.can_delegate);

    const loadTasks = async () => { const res = await api('get_my_tasks'); if (res) setGroups(res); setLoading(false); };
    const loadStaff = async () => { const res = await api('get_colleagues'); if (res) setStaffList(res); };
    const fetchNotifs = async () => { const res = await api('get_notifications', null, {}, { silent: true }); if (res) setNotifs(res); };

    useEffect(() => {
        loadTasks(); fetchNotifs();
        if (canDelegate) loadStaff();
        const intv = setInterval(() => { if (!document.hidden) fetchNotifs(); }, 15000);
        return () => clearInterval(intv);
    }, []);
    useEffect(() => { try { localStorage.setItem('evm_staff_pending', onlyPending ? '1' : '0'); } catch (e) { /* */ } }, [onlyPending]);

    const isLockedTask = (t) => !!t.depends_on_id && !isOn(t.dep_done) && !isOn(t.is_done);

    const toggleTask = async (task) => {
        const done = isOn(task.is_done);
        if (!done && isLockedTask(task)) return toast(`این تسک قفل است؛ ابتدا «${task.dep_title}» باید انجام شود.`, 'warning');
        const res = await api('update_task', { task_id: task.id, is_done: !done });
        if (res) toast(done ? 'وظیفه به حالت انجام‌نشده برگشت.' : 'وظیفه انجام شد. خسته نباشید!');
        loadTasks();
    };
    const reportIssue = async (task) => {
        if (isOn(task.has_issue)) {
            if (await api('update_task', { task_id: task.id, has_issue: false })) toast('مانع برطرف شد.');
        } else {
            const v = await formDialog({ title: 'گزارش مشکل', message: `وظیفه: «${task.title}»\nمدیریت بلافاصله مطلع می‌شود.`, fields: [{ name: 'note', label: 'شرح مشکل', type: 'textarea', required: true }], confirmText: 'ارسال گزارش', danger: true });
            if (!v) return;
            if (await api('update_task', { task_id: task.id, has_issue: true, issue_note: v.note })) toast('گزارش مشکل برای مدیریت ارسال شد.');
        }
        loadTasks();
    };
    const requestDelegation = async (task) => {
        if (staffList.length === 0) return toast('همکار دیگری برای واگذاری وجود ندارد.', 'warning');
        const v = await formDialog({
            title: 'درخواست واگذاری وظیفه',
            message: `«${task.title}»\nپس از ثبت، مدیریت باید این انتقال را تایید کند.`,
            fields: [{ name: 'to', label: 'همکار جایگزین', type: 'select', value: '', required: true, options: [{ value: '', label: '(انتخاب کنید)' }, ...staffList.map(s => ({ value: String(s.id), label: s.full_name + (isOn(s.is_shadow) ? ' (📞)' : '') }))] }],
            confirmText: 'ارسال درخواست',
        });
        if (!v) return;
        if (await api('request_delegation', { task_id: task.id, to_user_id: Number(v.to) })) toast('درخواست واگذاری برای مدیریت ارسال شد.');
        loadTasks();
    };

    const markRead = async (id) => { await api('mark_notif_read', { id }); fetchNotifs(); };
    const markAll = async () => { await api('mark_all_notifs_read', {}); fetchNotifs(); };
    const openEvent = (evId) => {
        loadTasks();
        const past = groups.find(g => g.event.id == evId && isPast(g));
        if (past) setShowPast(true);
        setTimeout(() => {
            const el = document.getElementById(`event-${evId}`);
            if (el) { el.scrollIntoView({ behavior: 'smooth', block: 'start' }); setHighlight(evId); setTimeout(() => setHighlight(null), 2000); }
            else toast('وظیفه‌ای از این رویداد به شما محول نیست.', 'info');
        }, 100);
    };

    const isPast = (g) => isEventOver(g.event);
    const byDate = (a, b) => (parseDate(a.event.start_date)?.getTime() ?? Infinity) - (parseDate(b.event.start_date)?.getTime() ?? Infinity);
    const current = groups.filter(g => !isPast(g)).sort(byDate);
    const past = groups.filter(isPast).sort((a, b) => byDate(b, a));
    const remainingCount = current.reduce((n, g) => n + g.tasks.filter(t => !isOn(t.is_done)).length, 0);

    const renderTask = (t) => {
        const done = isOn(t.is_done);
        const hasIssue = isOn(t.has_issue);
        const locked = isLockedTask(t);
        const pendingDeleg = Number(t.pending_delegation) > 0;
        return (
            <li key={t.id} className={`p-4 rounded-2xl border-2 ${locked ? 'gray-chain-locked bg-slate-100 dark:bg-slate-800/60 border-slate-300 dark:border-slate-600' : hasIssue ? 'bg-red-50 dark:bg-red-900/20 border-red-300' : done ? 'bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-900' : 'bg-white dark:bg-slate-700 border-slate-200 dark:border-slate-600'}`}>
                <div className="flex gap-3 items-start">
                    <button type="button" disabled={locked} onClick={() => toggleTask(t)} aria-pressed={done} aria-label={done ? `برگرداندن «${t.title}» به انجام‌نشده` : `علامت انجام‌شده برای «${t.title}»`} className={`w-12 h-12 shrink-0 rounded-xl border-2 flex items-center justify-center transition-colors disabled:cursor-not-allowed ${done ? 'bg-green-500 border-green-600 text-white' : locked ? 'bg-slate-200 dark:bg-slate-700 border-slate-300 dark:border-slate-600 text-slate-500' : 'bg-indigo-50 dark:bg-indigo-900/30 border-indigo-200 dark:border-indigo-700 text-indigo-500 hover:bg-indigo-600 hover:text-white'}`}>{locked ? <Icons.Lock /> : <Icons.Check />}</button>
                    <div className="flex-1 min-w-0">
                        <div className={`font-semibold leading-relaxed ${done ? 'line-through text-slate-500' : 'text-slate-800 dark:text-white'}`}>{toPersianNum(t.title)}</div>
                        <div className="flex flex-wrap gap-1.5 mt-1.5">
                            {t.role_tag && <span className="text-xs text-indigo-700 dark:text-indigo-300 bg-indigo-50 dark:bg-indigo-900/30 px-2 py-0.5 rounded-md border border-indigo-200 dark:border-indigo-700/50">@{toPersianNum(t.role_tag)}</span>}
                            {locked && <span className="text-xs text-amber-800 dark:text-amber-300 bg-amber-50 dark:bg-amber-900/40 px-2 py-0.5 rounded-md border border-amber-200 dark:border-amber-800 inline-flex items-center gap-1"><Icons.Lock /> منتظر: {toPersianNum(t.dep_title)}</span>}
                            {pendingDeleg && <span className="text-xs text-blue-700 dark:text-blue-300 bg-blue-50 dark:bg-blue-900/30 px-2 py-0.5 rounded-md border border-blue-200">در انتظار تایید واگذاری</span>}
                        </div>
                        {hasIssue && <div className="text-xs text-red-700 bg-red-100 p-2 rounded-lg mt-2 border border-red-200">مانع: {toPersianNum(t.issue_note)}</div>}
                        {!done && !locked && (
                            <div className="flex flex-wrap gap-2 mt-3">
                                <button type="button" onClick={() => reportIssue(t)} className={`px-3 py-1.5 rounded-lg border text-xs font-semibold ${hasIssue ? 'bg-green-50 text-green-700 border-green-300 hover:bg-green-100' : 'bg-white dark:bg-slate-800 text-red-600 dark:text-red-400 border-red-200 dark:border-slate-600 hover:bg-red-50'}`}>{hasIssue ? 'رفع توقف' : 'گزارش مشکل'}</button>
                                {canDelegate && !pendingDeleg && <button type="button" onClick={() => requestDelegation(t)} className="px-3 py-1.5 rounded-lg border border-blue-200 dark:border-slate-600 bg-white dark:bg-slate-800 text-blue-700 dark:text-blue-300 text-xs font-semibold hover:bg-blue-50">واگذاری وظیفه</button>}
                            </div>
                        )}
                    </div>
                </div>
            </li>
        );
    };

    const renderGroup = (g) => {
        const phaseNow = detectPhase(g.event);
        const total = g.tasks.length;
        const doneN = g.tasks.filter(t => isOn(t.is_done)).length;
        const shown = onlyPending ? g.tasks.filter(t => !isOn(t.is_done)) : g.tasks;
        const phases = [...TIMINGS, null].map(ph => ({ ph, list: shown.filter(t => ph === null ? !TIMINGS.includes(t.timing_tag) : t.timing_tag === ph) })).filter(x => x.list.length);
        return (
            <section key={g.event.id} id={`event-${g.event.id}`} aria-labelledby={`ev-h-${g.event.id}`} className={`scroll-mt-24 bg-white dark:bg-slate-800 rounded-3xl border overflow-hidden transition-shadow ${highlight == g.event.id ? 'ring-4 ring-indigo-400 border-indigo-400' : 'border-slate-200 dark:border-slate-700'}`}>
                <div className="bg-slate-800 dark:bg-slate-950 p-5 text-white relative">
                    {g.event.org_logo && <img src={g.event.org_logo} alt="" className="absolute left-4 top-4 w-12 h-12 rounded-lg opacity-30" />}
                    <div className="text-xs text-indigo-300 mb-1">پرونده {toPersianNum(g.event.id)}</div>
                    <h2 id={`ev-h-${g.event.id}`} className="font-bold text-xl mb-2">{toPersianNum(g.event.title)}</h2>
                    <div className="text-sm text-slate-300 flex flex-wrap gap-x-4 gap-y-1">
                        <span className="flex items-center gap-1.5"><Icons.Building /> {toPersianNum(g.event.venue_name) || 'بدون سالن'}</span>
                        <span className="flex items-center gap-1.5"><Icons.Calendar /> {toJalaliDateTime(g.event.start_date)}</span>
                    </div>
                    <div className="mt-3 flex items-center gap-3">
                        <div className="flex-1 bg-slate-700 h-1.5 rounded-full overflow-hidden" role="progressbar" aria-valuenow={doneN} aria-valuemax={total} aria-valuemin={0}><div className="bg-green-400 h-full" style={{ width: `${total ? (doneN / total) * 100 : 0}%` }} /></div>
                        <span className="text-xs text-slate-300">{toPersianNum(doneN)} از {toPersianNum(total)} انجام شده</span>
                    </div>
                </div>
                <div className="p-4 space-y-5 bg-slate-50 dark:bg-slate-800">
                    {phases.length === 0 && <p className="text-sm text-green-700 dark:text-green-400 text-center py-3">همه کارهای شما در این رویداد انجام شده است. 🎉</p>}
                    {phases.map(({ ph, list }) => (
                        <div key={ph || 'other'}>
                            <h3 className="text-sm font-semibold text-slate-600 dark:text-slate-300 mb-2 flex items-center gap-2">
                                <Icons.Clock /> {ph || 'بدون زمان‌بندی'}
                                {ph === phaseNow && !isPast(g) && <span className="text-[10px] bg-red-500 text-white px-1.5 py-0.5 rounded">فاز فعلی</span>}
                            </h3>
                            <ul className="space-y-2.5">{list.map(renderTask)}</ul>
                        </div>
                    ))}
                </div>
            </section>
        );
    };

    return (
        <div className="min-h-screen flex flex-col bg-slate-100 dark:bg-slate-900 pb-16">
            <header className="bg-indigo-900 dark:bg-slate-950 text-white px-4 py-3 shadow flex justify-between items-center z-40 sticky top-0 gap-2">
                <div className="flex items-center gap-3 min-w-0">
                    {user.avatar ? <img src={user.avatar} alt="" className="w-10 h-10 rounded-full border-2 border-indigo-400 object-cover bg-white shrink-0" /> : <div className="w-10 h-10 rounded-full bg-indigo-800 flex items-center justify-center shrink-0"><Icons.Users /></div>}
                    <div className="min-w-0">
                        <h1 className="font-bold truncate">سلام، {toPersianNum(user.full_name)}</h1>
                        <p className="hidden sm:block text-xs text-indigo-200">داشبورد اختصاصی وظایف</p>
                    </div>
                </div>
                <div className="flex gap-1.5 items-center shrink-0">
                    <NotificationPanel onRefresh={fetchNotifs} notifs={notifs} onRead={markRead} onReadAll={markAll} onOpen={openEvent} />
                    <button type="button" onClick={onToggleTheme} className="p-2 text-indigo-100 hover:text-white rounded-full hover:bg-white/10" aria-label={theme === 'dark' ? 'پوسته روشن' : 'پوسته تیره'} title="تغییر پوسته">{theme === 'dark' ? <Icons.Sun /> : <Icons.Moon />}</button>
                    <button type="button" onClick={onChangePassword} className="p-2 text-indigo-100 hover:text-white rounded-full hover:bg-white/10" aria-label="تغییر رمز عبور" title="تغییر رمز عبور"><Icons.Key /></button>
                    <button type="button" onClick={onLogout} className="text-white bg-white/10 px-3 py-2 rounded-xl text-sm font-semibold hover:bg-white/20">خروج</button>
                </div>
            </header>

            <main className="flex-1 p-4 w-full max-w-3xl mx-auto">
                {loading ? <div className="text-center py-20 pulse-text text-slate-500">در حال دریافت وظایف...</div> : (
                    <div className="space-y-5 fade-in">
                        <div className="flex flex-wrap items-center justify-between gap-3 bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 px-4 py-3">
                            <p className="text-sm text-slate-700 dark:text-slate-300">{remainingCount > 0 ? <><b className="text-indigo-700 dark:text-indigo-300">{toPersianNum(remainingCount)}</b> کار باقیمانده در {toPersianNum(current.length)} رویداد جاری</> : 'کار باقیمانده‌ای ندارید.'}</p>
                            <label className="flex items-center gap-2 text-sm text-slate-700 dark:text-slate-300 cursor-pointer">
                                <input type="checkbox" checked={onlyPending} onChange={e => setOnlyPending(e.target.checked)} className="w-4 h-4 accent-indigo-600" />
                                فقط کارهای باقیمانده
                            </label>
                        </div>

                        {groups.length === 0 && <div className="text-center py-16 bg-white dark:bg-slate-800 rounded-3xl border border-slate-200 dark:border-slate-700 text-slate-500">هیچ وظیفه‌ای به شما محول نشده است.</div>}
                        {current.map(renderGroup)}

                        {past.length > 0 && (
                            <div>
                                <button type="button" aria-expanded={showPast} onClick={() => setShowPast(!showPast)} className="w-full text-sm font-semibold text-slate-600 dark:text-slate-300 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl py-3 hover:bg-slate-50 dark:hover:bg-slate-700">
                                    {showPast ? '▲ پنهان کردن' : '▼ نمایش'} رویدادهای گذشته ({toPersianNum(past.length)})
                                </button>
                                {showPast && <div className="space-y-5 mt-4">{past.map(renderGroup)}</div>}
                            </div>
                        )}
                    </div>
                )}
            </main>
        </div>
    );
}
