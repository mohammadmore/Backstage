// ارتباط با api.php
// - کوکی نشست به‌صورت خودکار ارسال می‌شود (same-origin)
// - درخواست‌های POST هدر اختصاصی برنامه را دارند (محافظت CSRF سمت سرور)
// - پاسخ 401 یعنی نشست منقضی شده: پنجره ورود مجدد باز می‌شود و داده‌های صفحه حفظ می‌شوند
import { toast, busyStart, busyEnd } from './ui';

let unauthorizedHandler = null;
export const setUnauthorizedHandler = (fn) => { unauthorizedHandler = fn; };

/**
 * @param {string} action نام وب‌سرویس
 * @param {object|null} body بدنه درخواست POST (null => GET)
 * @param {object} params پارامترهای کوئری اضافه برای GET
 * @param {{silent?: boolean}} opts silent: خطا نمایش داده نشود
 * @returns {Promise<any|null>} در صورت خطا null برمی‌گرداند
 */
export async function api(action, body = null, params = {}, opts = {}) {
  const qs = new URLSearchParams({ action, ...params });
  const init = { method: body ? 'POST' : 'GET', credentials: 'same-origin', headers: { Accept: 'application/json' } };
  if (body) {
    init.headers['Content-Type'] = 'application/json';
    init.headers['X-Requested-With'] = 'EventMaster';
    init.body = JSON.stringify(body);
    busyStart();
  }
  let res;
  let data = null;
  try {
    res = await fetch(`api.php?${qs.toString()}`, init);
    data = await res.json();
  } catch (err) {
    if (!opts.silent) toast('ارتباط با سرور برقرار نشد. اتصال اینترنت را بررسی کنید.', 'error');
    return null;
  } finally {
    if (body) busyEnd();
  }
  if (res.status === 401 && action !== 'login' && action !== 'me') {
    if (unauthorizedHandler) unauthorizedHandler();
    return null;
  }
  if (!res.ok || (data && data.error)) {
    if (!opts.silent) toast((data && data.error) || 'خطای ناشناخته', 'error');
    return null;
  }
  return data;
}

/** آپلود فایل (multipart) */
export async function apiUpload(action, fields, file, opts = {}) {
  const fd = new FormData();
  Object.entries(fields || {}).forEach(([k, v]) => { if (v !== null && v !== undefined) fd.append(k, v); });
  fd.append('file', file);
  busyStart();
  let res, data = null;
  try {
    res = await fetch(`api.php?action=${encodeURIComponent(action)}`, { method: 'POST', credentials: 'same-origin', headers: { 'X-Requested-With': 'EventMaster' }, body: fd });
    data = await res.json();
  } catch (e) {
    if (!opts.silent) toast('ارسال فایل ناموفق بود.', 'error');
    return null;
  } finally { busyEnd(); }
  if (res.status === 401) { if (unauthorizedHandler) unauthorizedHandler(); return null; }
  if (!res.ok || data.error) { if (!opts.silent) toast(data.error || 'خطای ناشناخته', 'error'); return null; }
  return data;
}

/** آدرس دانلود فایل‌ها (کوکی نشست ارسال می‌شود) */
export const apiUrl = (action, params = {}) => `api.php?${new URLSearchParams({ action, ...params }).toString()}`;
