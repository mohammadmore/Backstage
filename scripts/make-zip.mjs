// ساخت فایل event-deploy.zip از محتوای dist برای آپلود روی هاست
import { execFileSync } from 'node:child_process';
import { rmSync } from 'node:fs';
rmSync('event-deploy.zip', { force: true });
execFileSync('zip', ['-r', '-q', '../event-deploy.zip', '.'], { cwd: 'dist', stdio: 'inherit' });
console.log('Created event-deploy.zip');
