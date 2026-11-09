import React, { useState, useRef } from 'react';
import { Icons } from './Icons';
import ImageCropper from './ImageCropper';
import { toast } from '../lib/ui';

/**
 * آپلود عکس: فقط با دکمه «انتخاب/تغییر عکس» یا کشیدن فایل روی کادر.
 * (قبلاً کل کادر ورودی فایل بود و هر کلیکی پنجره انتخاب فایل را باز می‌کرد)
 */
export default function ImageUploader({ value, onChange, type, placeholder }) {
    const [rawImage, setRawImage] = useState(null);
    const [dragOver, setDragOver] = useState(false);
    const inputRef = useRef(null);

    const readFile = (file) => {
        if (!file) return;
        if (!file.type.startsWith('image/')) return toast('فقط فایل تصویری قابل انتخاب است.', 'warning');
        if (file.size > 15 * 1024 * 1024) return toast('حجم فایل بیش از حد بزرگ است.', 'warning');
        const reader = new FileReader();
        reader.onload = (ev) => setRawImage(ev.target.result);
        reader.readAsDataURL(file);
    };
    const pick = () => inputRef.current && inputRef.current.click();
    const shape = type === 'avatar' ? 'rounded-full' : 'rounded-xl';

    return (
        <div
            onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
            onDragLeave={() => setDragOver(false)}
            onDrop={(e) => { e.preventDefault(); setDragOver(false); readFile(e.dataTransfer.files[0]); }}
            className={`flex flex-col items-center justify-center p-5 border-2 border-dashed rounded-2xl mb-4 transition-colors ${dragOver ? 'border-indigo-500 bg-grad-soft' : 'border-indigo-200 dark:border-indigo-900 dark:bg-slate-800 bg-grad-soft'}`}
        >
            {value ? (
                <div className="flex flex-col items-center gap-3">
                    <img src={value} alt={placeholder} className={`w-24 h-24 object-cover border-4 border-white dark:border-white/10 shadow ${shape}`} />
                    <div className="flex gap-2">
                        <button type="button" onClick={pick} className="glass text-xs font-semibold text-indigo-700 dark:text-indigo-300 border border-indigo-200 px-3 py-1.5 rounded-lg hover:bg-white/60">تغییر عکس</button>
                        <button type="button" onClick={() => onChange('')} className="glass text-xs font-semibold text-red-600 border border-red-200 px-3 py-1.5 rounded-lg hover:bg-red-50 inline-flex items-center gap-1"><Icons.Trash /> حذف</button>
                    </div>
                </div>
            ) : (
                <button type="button" onClick={pick} className="text-center w-full py-2">
                    <span className="glass p-3 rounded-full inline-block text-indigo-500 dark:text-indigo-300 mb-2"><Icons.Camera /></span>
                    <span className="block text-sm font-semibold text-indigo-900 dark:text-indigo-100">{placeholder}</span>
                    <span className="block text-xs text-slate-500 dark:text-slate-400 mt-1">برای انتخاب کلیک کنید یا فایل را اینجا رها کنید</span>
                </button>
            )}
            <input ref={inputRef} type="file" accept="image/*" onChange={(e) => { readFile(e.target.files[0]); e.target.value = null; }} className="hidden" aria-hidden="true" tabIndex={-1} />
            {rawImage && <ImageCropper src={rawImage} type={type} onComplete={(b64) => { onChange(b64); setRawImage(null); }} onCancel={() => setRawImage(null)} />}
        </div>
    );
}
