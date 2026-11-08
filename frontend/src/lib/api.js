// ارتباط با api.php
// - کوکی نشست به‌صورت خودکار ارسال می‌شود (same-origin)
// - درخواست‌های POST هدر اختصاصی برنامه را دارند (محافظت CSRF سمت سرور)
// - پاسخ 401 یعنی نشست منقضی شده و کاربر به صفحه ورود برمی‌گردد

let unauthorizedHandler = null;
export const setUnauthorizedHandler = (fn) => { unauthorizedHandler = fn; };

/**
 * @param {string} action نام وب‌سرویس
 * @param {object|null} body بدنه درخواست POST (null => GET)
 * @param {object} params پارامترهای کوئری اضافه برای GET
 * @param {{silent?: boolean}} opts
 * @returns {Promise<any|null>} در صورت خطا null برمی‌گرداند
 */
export async function api(action, body = null, params = {}, opts = {}) {
  const qs = new URLSearchParams({ action, ...params });
  const init = { method: body ? 'POST' : 'GET', credentials: 'same-origin', headers: { Accept: 'application/json' } };
  if (body) {
    init.headers['Content-Type'] = 'application/json';
    init.headers['X-Requested-With'] = 'EventMaster';
    init.body = JSON.stringify(body);
  }
  let res;
  let data = null;
  try {
    res = await fetch(`api.php?${qs.toString()}`, init);
    data = await res.json();
  } catch (err) {
    if (!opts.silent) alert('خطای ارتباط با سرور!');
    return null;
  }
  if (res.status === 401 && action !== 'login') {
    if (unauthorizedHandler) unauthorizedHandler(data && data.error);
    return null;
  }
  if (!res.ok || (data && data.error)) {
    if (!opts.silent) alert('پیام سیستم: ' + ((data && data.error) || 'خطای ناشناخته'));
    return null;
  }
  return data;
}
