import React, { useEffect, useState } from 'react';
import QRCode from 'qrcode';

/** تصویر QR از یک متن (به‌صورت data URL ساخته می‌شود؛ بدون سرویس خارجی) */
export default function QrImage({ text, size = 160, className = '', alt = 'کد QR' }) {
    const [src, setSrc] = useState('');
    useEffect(() => {
        let alive = true;
        QRCode.toDataURL(text || ' ', { width: size * 2, margin: 1, errorCorrectionLevel: 'M' }).then(u => { if (alive) setSrc(u); });
        return () => { alive = false; };
    }, [text, size]);
    return src ? <img src={src} width={size} height={size} alt={alt} className={className} /> : <span style={{ width: size, height: size, display: 'inline-block' }} />;
}

export const qrDataUrl = (text, size = 240) => QRCode.toDataURL(text, { width: size, margin: 1, errorCorrectionLevel: 'M' });
