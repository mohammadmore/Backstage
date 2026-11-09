import React, { useEffect, useRef, useState } from 'react';
import jsQR from 'jsqr';
import { api } from '../lib/api';
import { toPersianNum, matches } from '../lib/utils';
import { Icons } from '../components/Icons';

/**
 * پذیرش مهمانان در ورودی رویداد: اسکن QR با دوربین (BarcodeDetector یا jsQR) + جستجوی دستی.
 * در دسترس مدیران رویداد و همکارانی که در رویداد وظیفه دارند.
 */
export default function CheckinPage({ eventId, onBack }) {
    const [data, setData] = useState(null);
    const [scanning, setScanning] = useState(false);
    const [result, setResult] = useState(null); // {kind: ok|already|error, guest?, message?}
    const [q, setQ] = useState('');
    const [camError, setCamError] = useState('');
    const videoRef = useRef(null);
    const canvasRef = useRef(null);
    const streamRef = useRef(null);
    const lastRef = useRef({ text: '', at: 0 });
    const busyRef = useRef(false);

    const load = async () => { const r = await api('get_guests', null, { event_id: eventId }); if (r) setData(r); };
    useEffect(() => { load(); return () => stop(); }, [eventId]);

    const feedback = (kind) => {
        try { navigator.vibrate && navigator.vibrate(kind === 'ok' ? 80 : [60, 60, 60]); } catch (e) { /* */ }
        try {
            const ctx = new (window.AudioContext || window.webkitAudioContext)();
            const o = ctx.createOscillator(); o.frequency.value = kind === 'ok' ? 880 : 300; o.connect(ctx.destination); o.start(); o.stop(ctx.currentTime + 0.15);
        } catch (e) { /* */ }
    };

    const checkin = async (payload) => {
        if (busyRef.current) return;
        busyRef.current = true;
        const r = await api('guest_checkin', { event_id: eventId, ...payload }, {}, { silent: true });
        busyRef.current = false;
        if (r) { setResult({ kind: r.status === 'already' ? 'already' : 'ok', guest: r.guest }); feedback(r.status === 'already' ? 'warn' : 'ok'); load(); }
        else { setResult({ kind: 'error', message: 'کد نامعتبر است یا مربوط به این رویداد نیست.' }); feedback('error'); }
    };

    const onCode = (text) => {
        const now = Date.now();
        if (text === lastRef.current.text && now - lastRef.current.at < 3000) return; // جلوگیری از اسکن تکراری پشت‌سرهم
        lastRef.current = { text, at: now };
        checkin({ token: text });
    };

    const start = async () => {
        setCamError('');
        if (!navigator.mediaDevices?.getUserMedia) { setCamError('مرورگر شما به دوربین دسترسی ندارد (سایت باید با https باز شود).'); return; }
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' }, audio: false });
            streamRef.current = stream;
            setScanning(true);
            setTimeout(() => { if (videoRef.current) { videoRef.current.srcObject = stream; videoRef.current.play(); loop(); } }, 50);
        } catch (e) { setCamError('اجازه دسترسی به دوربین داده نشد. از تنظیمات مرورگر اجازه دوربین را فعال کنید.'); }
    };
    const stop = () => { if (streamRef.current) streamRef.current.getTracks().forEach(t => t.stop()); streamRef.current = null; setScanning(false); };

    const loop = async () => {
        const detector = ('BarcodeDetector' in window) ? new window.BarcodeDetector({ formats: ['qr_code'] }) : null;
        const tick = async () => {
            if (!streamRef.current || !videoRef.current) return;
            const v = videoRef.current;
            if (v.readyState >= 2) {
                try {
                    if (detector) {
                        const codes = await detector.detect(v);
                        if (codes[0]) onCode(codes[0].rawValue);
                    } else {
                        const c = canvasRef.current; const w = 480; const h = Math.round((v.videoHeight / v.videoWidth) * w) || 360;
                        c.width = w; c.height = h;
                        const ctx = c.getContext('2d', { willReadFrequently: true });
                        ctx.drawImage(v, 0, 0, w, h);
                        const code = jsQR(ctx.getImageData(0, 0, w, h).data, w, h, { inversionAttempts: 'dontInvert' });
                        if (code) onCode(code.data);
                    }
                } catch (e) { /* فریم بعدی */ }
            }
            setTimeout(tick, 250);
        };
        tick();
    };

    if (!data) return <p className="text-center py-20 text-slate-500 pulse-text">در حال بارگذاری...</p>;
    const checked = data.guests.filter(g => g.checked_in_at).length;
    const list = q.trim() ? data.guests.filter(g => matches(q, g.full_name, g.organization)).slice(0, 30) : [];
    const R = { ok: 'bg-emerald-600', already: 'bg-amber-500', error: 'bg-red-600' };

    return (
        <div className="max-w-xl mx-auto py-5 fade-in space-y-4">
            <div className="flex items-center justify-between gap-3">
                <button type="button" onClick={onBack} className="glass border px-3.5 py-2 rounded-xl text-sm font-semibold inline-flex items-center gap-2"><Icons.ArrowRight /> بازگشت</button>
                <div className="text-left"><div className="text-xs text-slate-500 dark:text-slate-400">پذیرش‌شده</div><div className="font-bold text-lg text-slate-800 dark:text-white">{toPersianNum(checked)} / {toPersianNum(data.guests.length)}</div></div>
            </div>
            <h1 className="text-xl font-bold text-slate-800 dark:text-white">پذیرش مهمانان — {toPersianNum(data.event.title)}</h1>

            <div className="glass border rounded-3xl p-4">
                {scanning ? (
                    <div className="relative">
                        <video ref={videoRef} playsInline muted className="w-full rounded-2xl bg-black aspect-[4/3] object-cover" />
                        <div className="absolute inset-[18%] border-4 border-white/80 rounded-3xl pointer-events-none" aria-hidden="true" />
                        <button type="button" onClick={stop} className="mt-3 w-full glass-soft border py-2.5 rounded-xl font-semibold">توقف دوربین</button>
                    </div>
                ) : (
                    <button type="button" onClick={start} className="w-full btn-grad py-5 rounded-2xl font-bold text-lg">📷 شروع اسکن QR</button>
                )}
                <canvas ref={canvasRef} className="hidden" />
                {camError && <p className="text-sm text-red-600 mt-3" role="alert">{camError}</p>}
            </div>

            {result && (
                <div className={`${R[result.kind]} text-white rounded-3xl p-5 slide-up`} role="status" aria-live="assertive">
                    <div className="text-sm opacity-90">{result.kind === 'ok' ? 'خوش آمدید ✓' : result.kind === 'already' ? 'قبلاً پذیرش شده است' : 'خطا'}</div>
                    {result.guest ? (
                        <>
                            <div className="text-2xl font-bold mt-1">{toPersianNum(result.guest.full_name)}</div>
                            <div className="text-sm opacity-90 mt-1">{[result.guest.category, result.guest.organization].filter(Boolean).join(' · ')}</div>
                            {result.kind === 'already' && <div className="text-xs opacity-90 mt-2">توسط {result.guest.checked_in_by}</div>}
                        </>
                    ) : <div className="font-semibold mt-1">{result.message}</div>}
                </div>
            )}

            <div className="glass border rounded-3xl p-4">
                <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-2" htmlFor="ck-search">جستجوی دستی (بدون کارت)</label>
                <input id="ck-search" type="search" value={q} onChange={e => setQ(e.target.value)} placeholder="نام مهمان..." className="w-full glass-field border-2 p-3 rounded-xl" />
                <ul className="mt-3 space-y-2">
                    {list.map(g => (
                        <li key={g.id} className="glass-soft border rounded-xl p-3 flex items-center justify-between gap-3">
                            <span><b className="text-slate-800 dark:text-white">{toPersianNum(g.full_name)}</b> <span className="text-xs text-slate-500">{g.category}</span></span>
                            {g.checked_in_at ? <span className="text-xs text-emerald-700 dark:text-emerald-400 font-semibold">✓ پذیرش‌شده</span>
                                : <button type="button" onClick={() => checkin({ guest_id: g.id })} className="bg-emerald-600 text-white px-3 py-1.5 rounded-lg text-sm font-semibold">پذیرش</button>}
                        </li>
                    ))}
                    {q.trim() && list.length === 0 && <li className="text-sm text-slate-500 text-center py-3">مهمانی پیدا نشد.</li>}
                </ul>
            </div>
        </div>
    );
}
