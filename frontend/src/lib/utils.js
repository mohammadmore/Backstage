import { toast } from './ui';

// ---------------------------------------------------------------
// اعداد
// ---------------------------------------------------------------
const FA_DIGITS = ['۰', '۱', '۲', '۳', '۴', '۵', '۶', '۷', '۸', '۹'];

export const toPersianNum = (num) => {
  if (num === null || num === undefined) return '';
  return num.toString().replace(/\d/g, (x) => FA_DIGITS[x]);
};

/** تبدیل ارقام فارسی/عربی به انگلیسی و حذف جداکننده هزارگان */
export const toEnDigits = (s) => String(s ?? '')
  .replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 0x06F0))
  .replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660))
  .replace(/٫/g, '.')
  .replace(/[,٬،]/g, '');

/** مقادیر 0/1 دیتابیس (عدد یا رشته) را به boolean تبدیل می‌کند */
export const isOn = (v) => v === true || Number(v) === 1;

export const formatMoney = (n) => toPersianNum(Number(n || 0).toLocaleString('en-US'));

// ---------------------------------------------------------------
// تقویم جلالی
// ---------------------------------------------------------------
export function g2j(gy, gm, gd) { var g_d_m = [0, 31, 59, 90, 120, 151, 181, 212, 243, 273, 304, 334]; var gy2 = (gm > 2) ? (gy + 1) : gy; var days = 355666 + (365 * gy) + ~~((gy2 + 3) / 4) - ~~((gy2 + 99) / 100) + ~~((gy2 + 399) / 400) + gd + g_d_m[gm - 1]; var jy = -1595 + 33 * ~~(days / 12053); days %= 12053; jy += 4 * ~~(days / 1461); days %= 1461; if (days > 365) { jy += ~~((days - 1) / 365); days = (days - 1) % 365; } var jm = (days < 186) ? 1 + ~~(days / 31) : 7 + ~~((days - 186) / 30); var jd = 1 + ((days < 186) ? (days % 31) : ((days - 186) % 30)); return [jy, jm, jd]; }
export function j2g(jy, jm, jd) { var gy, gm, gd, days; jy += 1595; days = -355668 + (365 * jy) + (~~(jy / 33) * 8) + ~~(((jy % 33) + 3) / 4) + jd + ((jm < 7) ? (jm - 1) * 31 : ((jm - 7) * 30) + 186); gy = 400 * ~~(days / 146097); days %= 146097; if (days > 36524) { gy += 100 * ~~(--days / 36524); days %= 36524; if (days >= 365) days++; } gy += 4 * ~~(days / 1461); days %= 1461; if (days > 365) { gy += ~~((days - 1) / 365); days = (days - 1) % 365; } gd = days + 1; var sal_a = [0, 31, ((gy % 4 === 0 && gy % 100 !== 0) || (gy % 400 === 0)) ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]; for (gm = 0; gm < 13 && gd > sal_a[gm]; gm++) gd -= sal_a[gm]; return [gy, gm, gd]; }

export const isJalaliLeap = (jy) => {
  const [gy, gm, gd] = j2g(jy, 12, 30);
  const [y, m, d] = g2j(gy, gm, gd);
  return y === jy && m === 12 && d === 30;
};

/** تعداد روزهای ماه جلالی (۶ ماه اول ۳۱، بعدی ۳۰، اسفند ۲۹ یا ۳۰) */
export const jalaliMonthLength = (jy, jm) => (jm <= 6 ? 31 : jm <= 11 ? 30 : (isJalaliLeap(jy) ? 30 : 29));

export const JALALI_MONTHS = ['فروردین', 'اردیبهشت', 'خرداد', 'تیر', 'مرداد', 'شهریور', 'مهر', 'آبان', 'آذر', 'دی', 'بهمن', 'اسفند'];

/**
 * تبدیل تاریخ دیتابیس ("2026-11-08 10:00:00") یا ورودی ("2026-11-08T10:00") به Date محلی.
 * سافاری تاریخ با فاصله را نمی‌شناسد؛ برای همین فاصله با T جایگزین می‌شود.
 */
export const parseDate = (value) => {
  if (!value) return null;
  if (value instanceof Date) return isNaN(value) ? null : value;
  const m = String(value).trim().match(/^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2})(?::(\d{2}))?)?/);
  if (!m) return null;
  const d = new Date(+m[1], +m[2] - 1, +m[3], +(m[4] || 0), +(m[5] || 0), +(m[6] || 0));
  return isNaN(d) ? null : d;
};

/** خروجی فرمت ورودی سرور: YYYY-MM-DDTHH:MM */
export const toInputDateTime = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}T${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;

export const toJalaliDate = (dateStr) => {
  if (!dateStr) return '---';
  const d = parseDate(dateStr);
  if (!d) return dateStr;
  const [y, m, day] = g2j(d.getFullYear(), d.getMonth() + 1, d.getDate());
  return toPersianNum(`${day} ${JALALI_MONTHS[m - 1]} ${y}`);
};

export const toJalaliDateTime = (dateStr) => {
  if (!dateStr) return '---';
  const d = parseDate(dateStr);
  if (!d) return dateStr;
  const [y, m, day] = g2j(d.getFullYear(), d.getMonth() + 1, d.getDate());
  return toPersianNum(`${day} ${JALALI_MONTHS[m - 1]} ${y} - ساعت ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`);
};

// ---------------------------------------------------------------
// وضعیت رویداد
// ---------------------------------------------------------------
export const EVENT_STATUS = {
  draft: { label: 'پیش‌نویس', badge: 'bg-amber-100 text-amber-700 border-amber-200', card: 'bg-amber-50 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400 border-amber-200 dark:border-amber-800' },
  confirmed: { label: 'قطعی', badge: 'bg-blue-100 text-blue-700 border-blue-200', card: 'bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400 border-blue-200 dark:border-blue-800' },
  in_progress: { label: 'در حال اجرا', badge: 'bg-purple-100 text-purple-700 border-purple-200', card: 'bg-purple-50 dark:bg-purple-900/30 text-purple-700 dark:text-purple-400 border-purple-200 dark:border-purple-800' },
  completed: { label: 'پایان‌یافته', badge: 'bg-emerald-100 text-emerald-700 border-emerald-200', card: 'bg-emerald-50 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400 border-emerald-200 dark:border-emerald-800' },
};
export const statusInfo = (s) => EVENT_STATUS[s] || EVENT_STATUS.draft;

export const TIMINGS = ['پیش‌تولید', 'روز قبل از رویداد', 'روز رویداد', 'پایان رویداد', 'پس‌تولید'];

// ---------------------------------------------------------------
// JSON و CSV
// ---------------------------------------------------------------
export const safeJson = (s, fallback = []) => {
  if (!s) return fallback;
  if (typeof s !== 'string') return s;
  try { const v = JSON.parse(s); return v ?? fallback; } catch (e) { return fallback; }
};

/**
 * @param {object[]} dataList
 * @param {string} filename
 * @param {{key: string, label: string}[]=} columns ستون‌های خروجی (پیش‌فرض: همه کلیدها)
 */
export const exportToCSV = (dataList, filename, columns) => {
  if (!dataList || dataList.length === 0) return toast('داده‌ای برای خروجی وجود ندارد.', 'warning');
  const cols = columns || Object.keys(dataList[0]).map((k) => ({ key: k, label: k }));
  const cell = (v) => {
    let s = v === null || v === undefined ? '' : String(v);
    // جلوگیری از تزریق فرمول در اکسل
    if (/^[=+\-@\t\r]/.test(s)) s = "'" + s;
    return `"${s.replace(/"/g, '""')}"`;
  };
  const header = cols.map((c) => cell(c.label)).join(',') + '\n';
  const rows = dataList.map((obj) => cols.map((c) => cell(typeof c.value === 'function' ? c.value(obj) : obj[c.key])).join(',')).join('\n');
  const blob = new Blob(['﻿' + header + rows], { type: 'text/csv;charset=utf-8;' });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = filename + '.csv';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  setTimeout(() => URL.revokeObjectURL(link.href), 1000);
};

// ---------------------------------------------------------------
// تم (در مرورگر ذخیره می‌شود تا صفحه ورود هم همان تم را داشته باشد)
// ---------------------------------------------------------------
export const applyTheme = (t) => {
  if (t === 'dark') document.documentElement.classList.add('dark'); else document.documentElement.classList.remove('dark');
  try { localStorage.setItem('evm_theme', t); } catch (e) { /* حالت خصوصی */ }
};
export const currentTheme = () => (document.documentElement.classList.contains('dark') ? 'dark' : 'light');

/** فاز جاری رویداد بر اساس زمان */
export const detectPhase = (ev) => {
  const now = new Date();
  const st = parseDate(ev.start_date);
  const en = parseDate(ev.end_date);
  if (!st) return TIMINGS[0];
  if (en && now >= st && now <= en) return 'روز رویداد';
  if (en && now > en) return 'پایان رویداد';
  if (st - now > 0 && st - now < 24 * 60 * 60 * 1000) return 'روز قبل از رویداد';
  if (!en && now >= st) return 'روز رویداد';
  return TIMINGS[0];
};

/** رویداد تمام‌شده؟ (وضعیت پایان‌یافته یا گذشتن بیش از یک هفته از پایان) */
export const isEventOver = (ev) => {
  if (ev.status === 'completed') return true;
  const en = parseDate(ev.end_date);
  return !!en && Date.now() - en.getTime() > 7 * 24 * 3600 * 1000;
};

/** جستجوی فارسی: یکسان‌سازی ی/ک عربی، نیم‌فاصله و ارقام */
export const normalizeSearch = (s) => toEnDigits(String(s ?? ''))
  .replace(/ي/g, 'ی').replace(/ك/g, 'ک').replace(/‌/g, ' ').replace(/\s+/g, ' ')
  .trim().toLowerCase();
export const matches = (query, ...fields) => {
  const q = normalizeSearch(query);
  if (!q) return true;
  const hay = normalizeSearch(fields.join(' '));
  return q.split(' ').every((w) => hay.includes(w));
};

// ---------------------------------------------------------------
// موعد وظایف
// ---------------------------------------------------------------
export const isOverdue = (t) => !isOn(t.is_done) && !!t.due_at && (parseDate(t.due_at)?.getTime() ?? Infinity) < Date.now();

/** متن کوتاه موعد: «امروز ۱۴:۰۰»، «فردا»، «۳ روز دیگر»، «۲ روز گذشته» */
export const dueLabel = (due) => {
  const d = parseDate(due);
  if (!d) return '';
  const now = new Date();
  const day = (x) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const diff = Math.round((day(d) - day(now)) / 86400000);
  const hm = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  if (diff === 0) return toPersianNum(`امروز ${hm}`);
  if (diff === 1) return toPersianNum(`فردا ${hm}`);
  if (diff === -1) return toPersianNum(`دیروز ${hm}`);
  if (diff > 1 && diff <= 7) return toPersianNum(`${diff} روز دیگر`);
  if (diff < -1 && diff >= -7) return toPersianNum(`${-diff} روز گذشته`);
  return toJalaliDate(due);
};

// ---------------------------------------------------------------
// وضعیت پرداخت
// ---------------------------------------------------------------
export const PAY_STATUS = {
  none: { label: 'بدون مبلغ', cls: 'bg-slate-100 text-slate-600 border-slate-200 dark:bg-white/5 dark:text-slate-300 dark:border-white/10' },
  unpaid: { label: 'پرداخت‌نشده', cls: 'bg-red-50 text-red-700 border-red-200 dark:bg-red-900/30 dark:text-red-300 dark:border-red-800' },
  partial: { label: 'بدهکار', cls: 'bg-amber-50 text-amber-800 border-amber-200 dark:bg-amber-900/30 dark:text-amber-300 dark:border-amber-800' },
  settled: { label: 'تسویه', cls: 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-900/30 dark:text-emerald-300 dark:border-emerald-800' },
  over: { label: 'بستانکار', cls: 'bg-sky-50 text-sky-700 border-sky-200 dark:bg-sky-900/30 dark:text-sky-300 dark:border-sky-800' },
};
export const PAYMENT_METHODS = ['نقدی', 'کارت به کارت', 'واریز بانکی', 'چک', 'بیعانه', 'سایر'];
export const ROLE_LABELS = { staff: 'کارمند', manager: 'مدیر پروژه', accountant: 'حسابدار', admin: 'مدیر کل', superadmin: 'مدیر کل' };

export const fileSize = (n) => {
  n = Number(n) || 0;
  if (n < 1024) return toPersianNum(`${n} بایت`);
  if (n < 1048576) return toPersianNum(`${(n / 1024).toFixed(0)} کیلوبایت`);
  return toPersianNum(`${(n / 1048576).toFixed(1)} مگابایت`);
};

/** تبدیل تاریخ Date به YYYY-MM-DD */
export const ymd = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
