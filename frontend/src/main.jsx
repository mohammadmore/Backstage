import React from 'react';
import ReactDOM from 'react-dom/client';
import 'vazirmatn/Vazirmatn-Variable-font-face.css';
import './index.css';
import App from './App';
import { AppErrorBoundary } from './components/ErrorBoundary';
import { UIHost } from './lib/ui';

ReactDOM.createRoot(document.getElementById('root')).render(<AppErrorBoundary><App /></AppErrorBoundary>);

// پیام‌ها و پنجره‌ها در ریشه جداگانه رندر می‌شوند تا هنگام چاپ پنهان بمانند
const host = document.createElement('div');
host.id = 'ui-host';
document.body.appendChild(host);
ReactDOM.createRoot(host).render(<UIHost />);

// نصب به‌عنوان برنامه (PWA): فقط در نسخه نهایی و روی https یا localhost
if ('serviceWorker' in navigator && import.meta.env.PROD && (location.protocol === 'https:' || location.hostname === 'localhost' || location.hostname === '127.0.0.1')) {
  window.addEventListener('load', () => { navigator.serviceWorker.register('./sw.js').catch(() => { /* بدون PWA ادامه می‌دهیم */ }); });
}
