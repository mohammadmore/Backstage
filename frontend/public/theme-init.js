// اعمال تم ذخیره‌شده قبل از نمایش صفحه (فایل جدا به‌خاطر سیاست امنیت محتوا - CSP)
try {
  var t = localStorage.getItem('evm_theme') || (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
  if (t === 'dark') document.documentElement.classList.add('dark');
} catch (e) { /* */ }
