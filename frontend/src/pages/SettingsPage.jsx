import React, { useEffect, useState } from 'react';
import { api, apiUrl } from '../lib/api';
import { toast, confirmDialog, formDialog } from '../lib/ui';
import { toPersianNum, toJalaliDateTime, fileSize, ROLE_LABELS } from '../lib/utils';
import { Icons } from '../components/Icons';

const Section = ({ title, desc, children }) => (
    <section className="glass border rounded-3xl p-5 sm:p-6">
        <h2 className="font-bold text-lg text-slate-800 dark:text-white">{title}</h2>
        {desc && <p className="text-sm text-slate-500 dark:text-slate-400 mt-1 mb-4 leading-relaxed">{desc}</p>}
        {children}
    </section>
);
const Toggle = ({ checked, onChange, label }) => (
    <label className="flex items-center justify-between gap-3 py-2 cursor-pointer">
        <span className="text-sm text-slate-700 dark:text-slate-200">{label}</span>
        <span className="relative inline-flex">
            <input type="checkbox" className="sr-only peer" checked={!!checked} onChange={e => onChange(e.target.checked)} />
            <span className="w-11 h-6 rounded-full bg-slate-300 dark:bg-white/15 peer-checked:bg-violet-600 transition-colors" />
            <span className="absolute top-0.5 right-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform peer-checked:-translate-x-5" />
        </span>
    </label>
);

export default function SettingsPage({ user, onOpenSecurity }) {
    const [s, setS] = useState(null);
    const [dirty, setDirty] = useState(false);
    const [backups, setBackups] = useState([]);
    const [log, setLog] = useState(null);

    const load = async () => { const r = await api('get_settings'); if (r) { setS({ ...r, sms_api_key: '' }); setDirty(false); } };
    const loadBackups = async () => { const r = await api('backup_list'); if (r) setBackups(r); };
    useEffect(() => { load(); loadBackups(); }, []);
    if (!s) return <p className="text-center py-16 text-slate-500 pulse-text">در حال بارگذاری تنظیمات...</p>;

    const set = (k, v) => { setS({ ...s, [k]: v }); setDirty(true); };
    const save = async () => {
        const payload = {};
        ['twofa_mode', 'sms_provider', 'sms_sender', 'sms_signature', 'sms_api_key', 'reminder_hour', 'backup_auto', 'backup_keep', 'company_name',
            ...Object.keys(s.sms_events).map(k => 'sms_on_' + k)].forEach(k => { if (s[k] !== undefined && s[k] !== null) payload[k] = typeof s[k] === 'boolean' ? s[k] : String(s[k]); });
        Object.keys(s.sms_events).forEach(k => { payload['sms_on_' + k] = s['sms_on_' + k] === true || s['sms_on_' + k] === '1'; });
        payload.backup_auto = s.backup_auto === true || s.backup_auto === '1';
        if (await api('save_settings', payload)) { toast('تنظیمات ذخیره شد.'); load(); }
    };
    const testSms = async () => {
        if (dirty) return toast('ابتدا تنظیمات را ذخیره کنید.', 'warning');
        const v = await formDialog({ title: 'ارسال پیامک آزمایشی', fields: [{ name: 'phone', label: 'شماره موبایل', required: true, placeholder: '09121234567' }], confirmText: 'ارسال' });
        if (v && await api('sms_test', v)) toast(s.sms_provider === 'log' ? 'در حالت آزمایشی پیامک واقعی ارسال نمی‌شود؛ فقط در گزارش ثبت شد.' : 'پیامک آزمایشی ارسال شد.');
        if (log) setLog((await api('sms_log')) || []);
    };
    const makeBackup = async () => { if (await api('backup_create', {})) { toast('نسخه پشتیبان ساخته شد.'); loadBackups(); } };
    const delBackup = async (b) => { if (await confirmDialog({ title: 'حذف نسخه پشتیبان', message: `«${b.name}» حذف شود؟`, confirmText: 'حذف', danger: true }) && await api('backup_delete', { name: b.name })) loadBackups(); };
    const isOn = (v) => v === true || v === '1';

    return (
        <div className="fade-in mt-6 space-y-5 max-w-4xl mx-auto pb-24">
            <div className="glass border rounded-3xl p-5 flex flex-wrap items-center justify-between gap-3">
                <div><h1 className="text-xl sm:text-2xl font-bold text-slate-800 dark:text-white">تنظیمات سیستم</h1><p className="text-sm text-slate-500 dark:text-slate-400 mt-1">فقط برای مدیر کل</p></div>
                <button type="button" disabled={!dirty} onClick={save} className="btn-grad px-6 py-3 rounded-xl font-bold disabled:opacity-40">ذخیره تغییرات</button>
            </div>

            <Section title="ورود دومرحله‌ای (اختیاری)" desc="با فعال‌سازی، کاربران علاوه بر رمز عبور یک کد ۶ رقمی از برنامه احراز هویت گوشی (Google Authenticator و مشابه) وارد می‌کنند.">
                <div className="grid sm:grid-cols-3 gap-2" role="radiogroup" aria-label="حالت ورود دومرحله‌ای">
                    {[['off', 'غیرفعال', 'هیچ‌کس کد نمی‌خواهد'], ['optional', 'اختیاری', 'هر کاربر خودش می‌تواند فعال کند'], ['required_office', 'الزامی برای مدیران', 'مدیر کل، مدیر پروژه و حسابدار باید فعال کنند']].map(([k, l, d]) => (
                        <button key={k} type="button" role="radio" aria-checked={s.twofa_mode === k} onClick={() => set('twofa_mode', k)} className={`text-right p-3.5 rounded-2xl border-2 ${s.twofa_mode === k ? 'border-violet-500 bg-grad-soft' : 'glass-soft'}`}>
                            <b className="block text-sm text-slate-800 dark:text-white">{l}</b><span className="text-xs text-slate-500 dark:text-slate-400">{d}</span>
                        </button>
                    ))}
                </div>
                <div className="mt-4 flex flex-wrap items-center gap-3 text-sm">
                    <span className={user.totp_enabled ? 'text-emerald-700 dark:text-emerald-400' : 'text-amber-700 dark:text-amber-400'}>{user.totp_enabled ? '✓ برای حساب شما فعال است' : 'برای حساب شما فعال نیست'}</span>
                    {s.twofa_mode !== 'off' && <button type="button" onClick={onOpenSecurity} className="glass-soft border px-3 py-1.5 rounded-lg font-semibold">مدیریت ۲FA حساب من</button>}
                </div>
                {s.twofa_mode === 'required_office' && s.office_without_2fa?.length > 0 && (
                    <p className="text-xs text-amber-700 dark:text-amber-400 mt-3">این کاربران هنوز فعال نکرده‌اند و در ورود بعدی مجبور به فعال‌سازی می‌شوند: {s.office_without_2fa.map(u => `${u.full_name} (${ROLE_LABELS[u.role] || u.role})`).join('، ')}</p>
                )}
            </Section>

            <Section title="اعلان پیامکی" desc="سرویس کاوه‌نگار پشتیبانی می‌شود. حالت «آزمایشی» پیامک‌ها را فقط در گزارش ثبت می‌کند (برای تست بدون هزینه).">
                <div className="grid sm:grid-cols-2 gap-3">
                    <label className="text-sm text-slate-700 dark:text-slate-300">سرویس‌دهنده
                        <select value={s.sms_provider} onChange={e => set('sms_provider', e.target.value)} className="mt-1 w-full glass-field border-2 p-2.5 rounded-xl">
                            <option value="none">غیرفعال</option><option value="kavenegar">کاوه‌نگار (Kavenegar)</option><option value="log">آزمایشی (بدون ارسال)</option>
                        </select>
                    </label>
                    <label className="text-sm text-slate-700 dark:text-slate-300">کلید API {s.sms_api_key_set && <span className="text-xs text-emerald-700 dark:text-emerald-400">(ذخیره‌شده — برای تغییر مقدار جدید وارد کنید)</span>}
                        <input type="password" autoComplete="off" value={s.sms_api_key} onChange={e => set('sms_api_key', e.target.value)} placeholder={s.sms_api_key_set ? 'بدون تغییر' : 'کلید را از پنل کاوه‌نگار کپی کنید'} className="mt-1 w-full glass-field border-2 p-2.5 rounded-xl" dir="ltr" />
                    </label>
                    <label className="text-sm text-slate-700 dark:text-slate-300">شماره خط ارسال (اختیاری)
                        <input value={s.sms_sender || ''} onChange={e => set('sms_sender', e.target.value)} className="mt-1 w-full glass-field border-2 p-2.5 rounded-xl" dir="ltr" />
                    </label>
                    <label className="text-sm text-slate-700 dark:text-slate-300">امضای انتهای پیامک
                        <input value={s.sms_signature || ''} onChange={e => set('sms_signature', e.target.value)} placeholder="مثلاً: آسوا استودیو" className="mt-1 w-full glass-field border-2 p-2.5 rounded-xl" />
                    </label>
                </div>
                <div className="mt-4 divide-y divide-violet-100 dark:divide-white/10">
                    {Object.entries(s.sms_events).map(([k, label]) => <Toggle key={k} label={label} checked={isOn(s['sms_on_' + k])} onChange={v => set('sms_on_' + k, v)} />)}
                </div>
                <div className="flex flex-wrap items-center gap-3 mt-3">
                    <label className="text-sm text-slate-700 dark:text-slate-300 flex items-center gap-2">ساعت ارسال یادآوری روز قبل
                        <select value={s.reminder_hour} onChange={e => set('reminder_hour', e.target.value)} className="glass-field border-2 p-1.5 rounded-lg">{Array.from({ length: 24 }).map((_, h) => <option key={h} value={String(h)}>{toPersianNum(h)}:۰۰</option>)}</select>
                    </label>
                    <button type="button" onClick={testSms} className="glass-soft border px-3 py-1.5 rounded-lg text-sm font-semibold">ارسال پیامک آزمایشی</button>
                    <button type="button" onClick={async () => setLog((await api('sms_log')) || [])} className="text-sm text-violet-700 dark:text-violet-300 underline">گزارش ارسال‌ها</button>
                </div>
                {!s.curl && <p className="text-xs text-red-600 mt-2">افزونه curl روی سرور فعال نیست؛ ارسال پیامک واقعی ممکن نیست.</p>}
                {log && (
                    <ul className="mt-4 max-h-64 overflow-y-auto custom-scroll text-xs space-y-1">
                        {log.length === 0 && <li className="text-slate-500">پیامکی ثبت نشده است.</li>}
                        {log.map(l => <li key={l.id} className="glass-soft border rounded-lg p-2 flex flex-wrap gap-2 justify-between"><span dir="ltr">{l.phone}</span><span className="flex-1 truncate text-slate-600 dark:text-slate-300">{l.message}</span><span className={l.status === 'sent' ? 'text-emerald-600' : l.status === 'failed' ? 'text-red-600' : 'text-amber-600'}>{{ sent: 'ارسال شد', failed: 'ناموفق', pending: 'در صف' }[l.status]}{l.error ? ` — ${l.error}` : ''}</span></li>)}
                    </ul>
                )}
            </Section>

            <Section title="زمان‌بندی خودکار (Cron)" desc="یادآوری‌ها، اعلان وظایف عقب‌افتاده، ارسال پیامک‌های صف و پشتیبان‌گیری خودکار با اجرای دوره‌ای این فرمان انجام می‌شود. در cPanel → Cron Jobs، هر ۱۵ دقیقه:">
                <code className="block glass-soft border rounded-xl p-3 text-xs break-all" dir="ltr">php {'{'}مسیر پوشه event{'}'}/cron.php</code>
                <p className="text-sm mt-3 text-slate-600 dark:text-slate-300">آخرین اجرا: {s.cron_last_run ? <bdi>{toJalaliDateTime(s.cron_last_run)}</bdi> : <b className="text-amber-700 dark:text-amber-400">هنوز اجرا نشده است</b>}</p>
            </Section>

            <Section title="پشتیبان‌گیری دیتابیس" desc="خروجی کامل SQL (ساختار و همه داده‌ها). فایل‌های پیوست جداگانه در پوشه داده‌های برنامه نگهداری می‌شوند.">
                <div className="flex flex-wrap items-center gap-4 mb-4">
                    <Toggle label="پشتیبان خودکار روزانه (با Cron)" checked={isOn(s.backup_auto)} onChange={v => set('backup_auto', v)} />
                    <label className="text-sm text-slate-700 dark:text-slate-300 flex items-center gap-2">تعداد نسخه نگه‌داشته‌شده
                        <select value={s.backup_keep} onChange={e => set('backup_keep', e.target.value)} className="glass-field border-2 p-1.5 rounded-lg">{[3, 7, 14, 30].map(n => <option key={n} value={String(n)}>{toPersianNum(n)}</option>)}</select>
                    </label>
                    <button type="button" onClick={makeBackup} className="btn-grad px-4 py-2 rounded-xl font-semibold text-sm">ساخت نسخه پشتیبان الان</button>
                </div>
                <ul className="space-y-2">
                    {backups.length === 0 && <li className="text-sm text-slate-500">هنوز نسخه پشتیبانی ساخته نشده است.</li>}
                    {backups.map(b => (
                        <li key={b.name} className="glass-soft border rounded-xl p-3 flex flex-wrap items-center justify-between gap-2 text-sm">
                            <span><bdi>{toJalaliDateTime(b.created_at)}</bdi> · {fileSize(b.size)}</span>
                            <span className="flex gap-2"><a href={apiUrl('backup_download', { name: b.name })} className="glass border px-3 py-1.5 rounded-lg font-semibold inline-flex items-center gap-1"><Icons.Download /> دانلود</a><button type="button" onClick={() => delBackup(b)} className="p-2 text-red-500" aria-label="حذف نسخه پشتیبان"><Icons.Trash /></button></span>
                        </li>
                    ))}
                </ul>
            </Section>
        </div>
    );
}
