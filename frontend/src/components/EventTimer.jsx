import React, { useState, useEffect } from 'react';
import { toPersianNum, parseDate } from '../lib/utils';

export const EventTimer = ({ start, end }) => {
    const [text, setText] = useState('در حال محاسبه...'); const [status, setStatus] = useState('upcoming'); 
    useEffect(() => {
        const s0 = parseDate(start); const e0 = parseDate(end);
        if(!s0 || !e0) { setText('تاریخ رویداد ثبت نشده است'); setStatus('upcoming'); return; }
        const calc = () => {
            const now = new Date(); const s = s0; const e = e0;
            if(now < s) {
                const diff = s - now; const hours = diff / (1000 * 60 * 60);
                if(hours > 48) { setText(`${toPersianNum(Math.floor(hours/24))} روز مانده تا شروع عملیات`); setStatus('upcoming'); } 
                else { setText(`${toPersianNum(Math.floor(hours))} ساعت و ${toPersianNum(Math.floor((diff%(1000*60*60))/(1000*60)))} دقیقه تا شروع`); setStatus('near'); }
            } else if (now >= s && now <= e) {
                const diff = e - now; setText(`${toPersianNum(Math.floor(diff/(1000*60*60)))} ساعت و ${toPersianNum(Math.floor((diff%(1000*60*60))/(1000*60)))} دقیقه تا پایان`); setStatus('active');
            } else { setText('خداقوت بابت همه زحماتتون 🎉'); setStatus('done'); }
        };
        calc(); const timer = setInterval(calc, 60000); return () => clearInterval(timer);
    }, [start, end]);
    const gradients = { upcoming: 'from-fuchsia-500/85 via-violet-500/85 to-blue-500/85', near: 'from-amber-500/90 via-pink-500/90 to-fuchsia-500/90 pulse-text', active: 'from-pink-600/90 via-rose-500/90 to-fuchsia-600/90 pulse-text', done: 'from-emerald-500/85 via-teal-500/85 to-sky-500/85' };
    return ( <div className={`w-full bg-gradient-to-r ${gradients[status]} text-white text-center py-2.5 font-semibold text-sm md:text-base relative z-50 backdrop-blur-md border-b border-white/20`}>{text}</div> );
};
