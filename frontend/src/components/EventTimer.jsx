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
    const gradients = { upcoming: 'from-blue-600 to-indigo-600', near: 'from-amber-500 to-orange-500 pulse-text', active: 'from-red-500 to-pink-600 pulse-text', done: 'from-emerald-500 to-teal-500' };
    return ( <div className={`w-full bg-gradient-to-r ${gradients[status]} text-white text-center py-2.5 font-black text-sm md:text-base shadow-md relative z-50`}>{text}</div> );
};
