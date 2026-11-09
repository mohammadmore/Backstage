import React, { useEffect, useRef, useState } from 'react';
import { api, apiUpload, apiUrl } from '../lib/api';
import { toast, confirmDialog } from '../lib/ui';
import { toPersianNum, toJalaliDateTime, fileSize } from '../lib/utils';
import { Icons } from './Icons';

const ACCEPT = '.pdf,.jpg,.jpeg,.png,.webp,.gif,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.csv,.zip,.rar,.dwg';

/**
 * پیوست‌ها و یادداشت‌های یک رویداد یا یک وظیفه.
 * taskId خالی => همه موارد رویداد (برای مدیران)
 */
export default function ExtrasPanel({ eventId, taskId = null, tasks = [], currentUserId, onChanged }) {
    const [data, setData] = useState(null);
    const [note, setNote] = useState('');
    const [noteTask, setNoteTask] = useState(taskId || '');
    const [drag, setDrag] = useState(false);
    const fileRef = useRef(null);

    const load = async () => { const r = await api('get_extras', null, { event_id: eventId, ...(taskId ? { task_id: taskId } : {}) }); if (r) setData(r); };
    useEffect(() => { load(); }, [eventId, taskId]);
    const changed = () => { load(); onChanged && onChanged(); };

    const upload = async (files) => {
        for (const f of Array.from(files || [])) {
            const r = await apiUpload('upload_attachment', { event_id: eventId, task_id: taskId || noteTask || '' }, f);
            if (r) toast(`«${f.name}» بارگذاری شد.`);
        }
        changed();
    };
    const addNote = async (e) => {
        e.preventDefault();
        if (!note.trim()) return;
        if (await api('add_note', { event_id: eventId, task_id: taskId || noteTask || null, body: note.trim() })) { setNote(''); changed(); }
    };
    const delFile = async (a) => { if (await confirmDialog({ title: 'حذف فایل', message: `«${a.orig_name}» حذف شود؟`, confirmText: 'حذف', danger: true })) { if (await api('delete_attachment', { id: a.id })) changed(); } };
    const delNote = async (n) => { if (await confirmDialog({ title: 'حذف یادداشت', message: 'این یادداشت حذف شود؟', confirmText: 'حذف', danger: true })) { if (await api('delete_note', { id: n.id })) changed(); } };

    if (!data) return <p className="text-sm text-slate-500 py-6 text-center pulse-text">در حال بارگذاری...</p>;
    const canWrite = data.level !== 'read';
    const canDel = (ownerId) => data.level === 'manage' || Number(ownerId) === Number(currentUserId);
    const isImg = (m) => String(m).startsWith('image/');

    return (
        <div className="grid lg:grid-cols-2 gap-5">
            <section aria-labelledby="files-h">
                <h3 id="files-h" className="font-bold text-slate-800 dark:text-white mb-3 flex items-center gap-2">📎 فایل‌ها <span className="text-sm font-normal text-slate-500">({toPersianNum(data.attachments.length)})</span></h3>
                {canWrite && (
                    <div onDragOver={e => { e.preventDefault(); setDrag(true); }} onDragLeave={() => setDrag(false)} onDrop={e => { e.preventDefault(); setDrag(false); upload(e.dataTransfer.files); }}
                        className={`mb-3 border-2 border-dashed rounded-2xl p-4 text-center transition-colors ${drag ? 'border-violet-500 bg-grad-soft' : 'border-violet-200 dark:border-white/15'}`}>
                        <button type="button" onClick={() => fileRef.current.click()} className="btn-grad px-4 py-2 rounded-xl font-semibold text-sm">انتخاب فایل</button>
                        <p className="text-xs text-slate-500 dark:text-slate-400 mt-2">یا فایل را اینجا رها کنید — PDF، تصویر، Word، Excel، فایل فشرده (حداکثر ۱۰ مگابایت)</p>
                        {!taskId && tasks.length > 0 && (
                            <select aria-label="مربوط به وظیفه" value={noteTask} onChange={e => setNoteTask(e.target.value)} className="mt-3 glass-field border rounded-lg px-2 py-1.5 text-xs max-w-full">
                                <option value="">مربوط به کل رویداد</option>
                                {tasks.map(t => <option key={t.id} value={t.id}>وظیفه: {t.title}</option>)}
                            </select>
                        )}
                        <input ref={fileRef} type="file" multiple accept={ACCEPT} className="hidden" onChange={e => { upload(e.target.files); e.target.value = null; }} />
                    </div>
                )}
                <ul className="space-y-2">
                    {data.attachments.length === 0 && <li className="text-sm text-slate-500 text-center py-4">فایلی پیوست نشده است.</li>}
                    {data.attachments.map(a => (
                        <li key={a.id} className="glass-soft border rounded-xl p-3 flex items-center gap-3">
                            {isImg(a.mime)
                                ? <img src={apiUrl('download_attachment', { id: a.id, inline: 1 })} alt="" className="w-11 h-11 rounded-lg object-cover bg-white shrink-0" loading="lazy" />
                                : <span className="w-11 h-11 rounded-lg bg-grad text-white flex items-center justify-center text-[10px] font-bold uppercase shrink-0" aria-hidden="true">{String(a.orig_name).split('.').pop()}</span>}
                            <div className="min-w-0 flex-1">
                                <a href={apiUrl('download_attachment', { id: a.id })} className="font-semibold text-sm text-violet-700 dark:text-violet-300 hover:underline break-all">{a.orig_name}</a>
                                <p className="text-[11px] text-slate-500 dark:text-slate-400">{fileSize(a.size)} · {a.uploaded_by} · <bdi>{toJalaliDateTime(a.created_at)}</bdi>{!taskId && a.task_title && <> · وظیفه «{a.task_title}»</>}</p>
                            </div>
                            {canDel(a.uploader_id) && <button type="button" onClick={() => delFile(a)} className="p-2 text-red-500 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/20" aria-label={`حذف ${a.orig_name}`}><Icons.Trash /></button>}
                        </li>
                    ))}
                </ul>
            </section>

            <section aria-labelledby="notes-h">
                <h3 id="notes-h" className="font-bold text-slate-800 dark:text-white mb-3 flex items-center gap-2">💬 یادداشت‌ها <span className="text-sm font-normal text-slate-500">({toPersianNum(data.notes.length)})</span></h3>
                {canWrite && (
                    <form onSubmit={addNote} className="mb-3 flex gap-2">
                        <textarea aria-label="متن یادداشت" rows={2} value={note} onChange={e => setNote(e.target.value)} placeholder="یادداشت بنویسید..." className="flex-1 glass-field border-2 rounded-xl p-2.5 text-sm" />
                        <button type="submit" disabled={!note.trim()} className="btn-grad px-4 rounded-xl font-semibold text-sm disabled:opacity-50">ثبت</button>
                    </form>
                )}
                <ul className="space-y-2">
                    {data.notes.length === 0 && <li className="text-sm text-slate-500 text-center py-4">یادداشتی ثبت نشده است.</li>}
                    {data.notes.map(n => (
                        <li key={n.id} className="glass-soft border rounded-xl p-3">
                            <div className="flex justify-between gap-2">
                                <p className="text-sm text-slate-800 dark:text-slate-100 whitespace-pre-line leading-relaxed">{n.body}</p>
                                {canDel(n.user_id) && <button type="button" onClick={() => delNote(n)} className="p-1 text-red-500 shrink-0" aria-label="حذف یادداشت"><Icons.Trash /></button>}
                            </div>
                            <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1">{n.user_name} · <bdi>{toJalaliDateTime(n.created_at)}</bdi>{!taskId && n.task_title && <> · وظیفه «{n.task_title}»</>}</p>
                        </li>
                    ))}
                </ul>
            </section>
        </div>
    );
}

/** پنجره پیوست/یادداشت یک وظیفه */
export function TaskExtrasModal({ eventId, task, currentUserId, onClose, onChanged }) {
    useEffect(() => { const k = (e) => { if (e.key === 'Escape' && !document.querySelector('#ui-host [role="dialog"]')) onClose(); }; window.addEventListener('keydown', k); return () => window.removeEventListener('keydown', k); }, []);
    return (
        <div className="fixed inset-0 z-[250] glass-overlay flex items-end sm:items-center justify-center sm:p-4" role="dialog" aria-modal="true" aria-label={`فایل‌ها و یادداشت‌های ${task.title}`} onMouseDown={e => { if (e.target === e.currentTarget) onClose(); }}>
            <div className="glass-strong w-full sm:max-w-4xl max-h-[92vh] overflow-y-auto custom-scroll rounded-t-3xl sm:rounded-3xl p-5 sm:p-7">
                <div className="flex justify-between items-center mb-4">
                    <h2 className="font-bold text-lg text-slate-800 dark:text-white">«{task.title}»</h2>
                    <button type="button" onClick={onClose} aria-label="بستن" className="w-9 h-9 rounded-full glass-soft border">✕</button>
                </div>
                <ExtrasPanel eventId={eventId} taskId={task.id} currentUserId={currentUserId} onChanged={onChanged} />
            </div>
        </div>
    );
}
