<?php
declare(strict_types=1);

if (!defined('EVENT_APP')) { http_response_code(403); exit; }

// ---------------------------------------------------------------
// پیامک: صف ارسال + سرویس‌دهنده (کاوه‌نگار) یا حالت آزمایشی (فقط ثبت در صف)
// تنظیمات از پنل مدیر: sms_provider, sms_api_key, sms_sender, sms_on_*
// ---------------------------------------------------------------
const SMS_EVENTS = [
    'assign' => 'محول شدن وظیفه به همکار',
    'issue' => 'گزارش مانع (به مدیران)',
    'delegation' => 'نتیجه درخواست واگذاری',
    'reminder' => 'یادآوری روز قبل از رویداد',
    'portal' => 'تایید پیش‌فاکتور توسط کارفرما (به مدیران)',
];

function sms_provider(): string
{
    $p = (string)get_setting('sms_provider', 'none');
    return in_array($p, ['none', 'kavenegar', 'log'], true) ? $p : 'none';
}

function sms_enabled(string $event): bool
{
    return sms_provider() !== 'none' && get_setting('sms_on_' . $event, '0') === '1';
}

/** شماره موبایل ایران => 09xxxxxxxxx یا null */
function normalize_mobile(?string $phone): ?string
{
    $p = preg_replace('/\D/', '', to_en_digits((string)$phone));
    if (preg_match('/^(?:0098|98)?0?(9\d{9})$/', $p, $m)) return '0' . $m[1];
    return null;
}

function sms_queue(?string $phone, string $message): bool
{
    $to = normalize_mobile($phone);
    if (!$to || sms_provider() === 'none') return false;
    $sig = trim((string)get_setting('sms_signature', ''));
    q('INSERT INTO sms_queue (phone, message) VALUES (?, ?)', [$to, mb_substr($message . ($sig !== '' ? "\n" . $sig : ''), 0, 600)]);
    $GLOBALS['__sms_pending'] = true;
    return true;
}

function sms_to_user(int $userId, string $message): void
{
    $phone = q_val('SELECT phone FROM users WHERE id = ?', [$userId]);
    sms_queue($phone ? (string)$phone : null, $message);
}

/** ارسال واقعی یک پیامک؛ خروجی: [موفق؟, خطا] */
function sms_send_now(string $phone, string $message): array
{
    $provider = sms_provider();
    if ($provider === 'log') return [true, null];
    if ($provider !== 'kavenegar') return [false, 'سرویس پیامک غیرفعال است'];
    $key = trim((string)get_setting('sms_api_key', ''));
    if ($key === '') return [false, 'کلید API پیامک تنظیم نشده است'];
    if (!function_exists('curl_init')) return [false, 'افزونه curl روی سرور فعال نیست'];
    $params = ['receptor' => $phone, 'message' => $message];
    $sender = trim((string)get_setting('sms_sender', ''));
    if ($sender !== '') $params['sender'] = $sender;
    $ch = curl_init('https://api.kavenegar.com/v1/' . rawurlencode($key) . '/sms/send.json');
    curl_setopt_array($ch, [CURLOPT_POST => true, CURLOPT_POSTFIELDS => http_build_query($params), CURLOPT_RETURNTRANSFER => true, CURLOPT_TIMEOUT => 8, CURLOPT_CONNECTTIMEOUT => 4]);
    $body = curl_exec($ch);
    $err = curl_error($ch);
    $code = (int)curl_getinfo($ch, CURLINFO_HTTP_CODE);
    curl_close($ch);
    if ($body === false) return [false, 'خطای ارتباط: ' . mb_substr($err, 0, 150)];
    $json = json_decode((string)$body, true);
    $status = (int)($json['return']['status'] ?? $code);
    if ($status === 200) return [true, null];
    return [false, mb_substr('کاوه‌نگار: ' . ($json['return']['message'] ?? "HTTP $code"), 0, 250)];
}

/** پردازش صف (پس از پاسخ به کاربر و در cron) */
function sms_process_queue(int $limit = 20): int
{
    $rows = q_all("SELECT * FROM sms_queue WHERE status = 'pending' AND attempts < 3 ORDER BY id ASC LIMIT " . (int)$limit);
    $sent = 0;
    foreach ($rows as $r) {
        [$ok, $err] = sms_send_now($r['phone'], $r['message']);
        if ($ok) { q("UPDATE sms_queue SET status = 'sent', sent_at = NOW(), attempts = attempts + 1, error = NULL WHERE id = ?", [$r['id']]); $sent++; }
        else q("UPDATE sms_queue SET attempts = attempts + 1, error = ?, status = IF(attempts + 1 >= 3, 'failed', 'pending') WHERE id = ?", [$err, $r['id']]);
    }
    return $sent;
}
