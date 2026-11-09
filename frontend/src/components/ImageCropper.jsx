import React, { useState, useRef, useEffect } from 'react';
import { Icons } from './Icons';

/** برش مربعی عکس با کشیدن کادر، اسلایدر زوم و چرخ ماوس */
export default function ImageCropper({ src, onComplete, onCancel, type = 'avatar' }) {
    const imageRef = useRef(null);
    const [crop, setCrop] = useState({ x: 0, y: 0, size: 150 });
    const [bounds, setBounds] = useState({ w: 0, h: 0 });
    const [dragging, setDragging] = useState(false);
    const [startPos, setStartPos] = useState({ x: 0, y: 0 });

    const constrain = (x, y, size, w = bounds.w, h = bounds.h) => {
        const s = Math.max(40, Math.min(size, w, h));
        return { x: Math.max(0, Math.min(x, w - s)), y: Math.max(0, Math.min(y, h - s)), size: s };
    };
    const onImageLoad = (e) => {
        const { clientWidth: w, clientHeight: h } = e.target;
        setBounds({ w, h });
        const size = Math.min(w, h) * 0.8;
        setCrop(constrain((w - size) / 2, (h - size) / 2, size, w, h));
    };
    const point = (e) => (e.touches ? { x: e.touches[0].clientX, y: e.touches[0].clientY } : { x: e.clientX, y: e.clientY });
    const onDown = (e) => { e.preventDefault(); setDragging(true); const p = point(e); setStartPos({ x: p.x - crop.x, y: p.y - crop.y }); };
    const onMove = (e) => { if (!dragging) return; const p = point(e); setCrop(constrain(p.x - startPos.x, p.y - startPos.y, crop.size)); };
    const onUp = () => setDragging(false);
    const resize = (newSize) => {
        const cx = crop.x + crop.size / 2, cy = crop.y + crop.size / 2;
        setCrop(constrain(cx - newSize / 2, cy - newSize / 2, newSize));
    };
    const maxSize = Math.max(40, Math.min(bounds.w, bounds.h));

    useEffect(() => {
        const onKey = (e) => { if (e.key === 'Escape') onCancel(); };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, []);

    const applyCrop = () => {
        const img = imageRef.current; if (!img) return;
        const sX = img.naturalWidth / img.clientWidth, sY = img.naturalHeight / img.clientHeight;
        const canvas = document.createElement('canvas'); canvas.width = 400; canvas.height = 400;
        const ctx = canvas.getContext('2d'); ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, 400, 400);
        ctx.drawImage(img, crop.x * sX, crop.y * sY, crop.size * sX, crop.size * sY, 0, 0, 400, 400);
        onComplete(canvas.toDataURL('image/jpeg', 0.85));
    };

    return (
        <div className="fixed inset-0 z-[350] glass-overlay flex flex-col items-center justify-center p-4 fade-in crop-container" role="dialog" aria-modal="true" aria-label="برش عکس">
            <div className="glass-strong p-6 rounded-3xl w-full max-w-sm text-center flex flex-col">
                <h3 className="font-bold text-slate-800 dark:text-white mb-1">برش عکس</h3>
                <p className="text-xs text-slate-500 dark:text-slate-400 mb-3">کادر را بکشید و با اسلایدر یا چرخ ماوس اندازه آن را تنظیم کنید.</p>
                <div className="glass-soft relative mx-auto rounded-lg" style={{ display: 'inline-block', maxWidth: '100%', maxHeight: '300px' }}
                    onMouseMove={onMove} onMouseUp={onUp} onMouseLeave={onUp} onTouchMove={onMove} onTouchEnd={onUp}
                    onWheel={(e) => resize(crop.size - Math.sign(e.deltaY) * 15)}>
                    <img ref={imageRef} src={src} onLoad={onImageLoad} alt="" className="block w-auto h-auto max-w-full max-h-[300px] pointer-events-none rounded-lg" />
                    <div className="absolute inset-0 pointer-events-none overflow-hidden rounded-lg">
                        <div className="absolute bg-black/60" style={{ top: 0, left: 0, right: 0, height: crop.y }}></div>
                        <div className="absolute bg-black/60" style={{ top: crop.y, left: 0, width: crop.x, height: crop.size }}></div>
                        <div className="absolute bg-black/60" style={{ top: crop.y, right: 0, left: crop.x + crop.size, height: crop.size }}></div>
                        <div className="absolute bg-black/60" style={{ top: crop.y + crop.size, left: 0, right: 0, bottom: 0 }}></div>
                        <div className={`absolute border-[3px] border-white cursor-move flex items-center justify-center text-white/60 ${type === 'avatar' ? 'rounded-full' : 'rounded-xl'}`} style={{ left: crop.x, top: crop.y, width: crop.size, height: crop.size, pointerEvents: 'auto' }} onMouseDown={onDown} onTouchStart={onDown}><Icons.Move /></div>
                    </div>
                </div>
                <label className="flex items-center gap-3 mt-5 mb-5 text-sm text-slate-600 dark:text-slate-300">
                    <span className="shrink-0">اندازه</span>
                    <input type="range" min={40} max={maxSize} value={crop.size} onChange={(e) => resize(Number(e.target.value))} className="flex-1 accent-indigo-600" aria-label="اندازه کادر برش" />
                </label>
                <div className="flex gap-3 mt-auto">
                    <button type="button" onClick={onCancel} className="glass-soft flex-1 p-3 rounded-xl font-semibold text-slate-700 dark:text-slate-200">انصراف</button>
                    <button type="button" onClick={applyCrop} className="btn-grad flex-1 p-3 rounded-xl font-bold text-white">برش و ذخیره</button>
                </div>
            </div>
        </div>
    );
}
