import { useState, useEffect } from 'react';

// مسیریابی ساده مبتنی بر hash (روی هاست اشتراکی بدون تنظیمات سرور کار می‌کند)
// مثال‌ها: #/events  #/events/12/finance  #/events/new  #/master/services  #/my
const parse = () => {
  const h = window.location.hash.replace(/^#\/?/, '');
  const [path, query = ''] = h.split('?');
  return { parts: path.split('/').filter(Boolean).map(decodeURIComponent), query: new URLSearchParams(query) };
};

export function useRoute() {
  const [route, setRoute] = useState(parse);
  useEffect(() => {
    const onChange = () => setRoute(parse());
    window.addEventListener('hashchange', onChange);
    return () => window.removeEventListener('hashchange', onChange);
  }, []);
  return route;
}

/** replace=true: بدون ایجاد سابقه جدید (برای تغییر تب) */
export function navigate(path, { replace = false } = {}) {
  const target = '#/' + path.replace(/^\/+/, '');
  if (window.location.hash === target) return;
  if (replace) {
    window.history.replaceState(null, '', target);
    window.dispatchEvent(new HashChangeEvent('hashchange'));
  } else {
    window.location.hash = target;
  }
}
