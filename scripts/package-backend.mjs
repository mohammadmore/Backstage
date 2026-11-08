// کپی فایل‌های PHP و تنظیمات امنیتی کنار خروجی Vite در پوشه dist
import { cpSync, existsSync, mkdirSync, rmSync } from 'node:fs';
import { join, relative, sep } from 'node:path';

const src = 'backend';
const dest = 'dist';
const skip = (p) => {
  const rel = relative(src, p).split(sep).join('/');
  if (rel === 'inc/config.php') return true;          // تنظیمات واقعی هرگز در بسته قرار نمی‌گیرد
  if (rel.startsWith('inc/sessions') || rel.startsWith('inc/logs')) return true;
  if (rel.startsWith('uploads/') && rel !== 'uploads/.htaccess') return true; // عکس‌های کاربران روی هاست می‌مانند
  return false;
};
if (!existsSync(dest)) mkdirSync(dest, { recursive: true });
cpSync(src, dest, { recursive: true, filter: (p) => !skip(p) });
for (const d of ['inc/sessions', 'inc/logs']) rmSync(join(dest, d), { recursive: true, force: true });
console.log('Backend files copied to dist/');
