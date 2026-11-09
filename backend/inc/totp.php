<?php
declare(strict_types=1);

if (!defined('EVENT_APP')) { http_response_code(403); exit; }

// ---------------------------------------------------------------
// رمز یکبار مصرف زمانی (TOTP - RFC 6238) سازگار با Google Authenticator و مشابه‌ها
// ---------------------------------------------------------------
const B32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

function totp_new_secret(): string
{
    $bytes = random_bytes(20); $out = ''; $bits = '';
    foreach (str_split($bytes) as $c) $bits .= str_pad(decbin(ord($c)), 8, '0', STR_PAD_LEFT);
    foreach (str_split($bits, 5) as $chunk) $out .= B32[bindec(str_pad($chunk, 5, '0'))];
    return $out;
}

function totp_b32decode(string $s): string
{
    $s = strtoupper(preg_replace('/[^A-Z2-7]/i', '', $s)); $bits = ''; $out = '';
    foreach (str_split($s) as $c) $bits .= str_pad(decbin(strpos(B32, $c)), 5, '0', STR_PAD_LEFT);
    foreach (str_split($bits, 8) as $byte) if (strlen($byte) === 8) $out .= chr(bindec($byte));
    return $out;
}

function totp_code(string $secret, int $step): string
{
    $h = hash_hmac('sha1', pack('J', $step), totp_b32decode($secret), true);
    $o = ord($h[19]) & 0x0f;
    $n = ((ord($h[$o]) & 0x7f) << 24) | (ord($h[$o + 1]) << 16) | (ord($h[$o + 2]) << 8) | ord($h[$o + 3]);
    return str_pad((string)($n % 1000000), 6, '0', STR_PAD_LEFT);
}

/** بررسی کد با تحمل ±۱ بازه ۳۰ ثانیه‌ای؛ کد استفاده‌شده دوباره پذیرفته نمی‌شود. خروجی: شماره بازه یا null */
function totp_verify(string $secret, string $code, ?int $lastStep = null): ?int
{
    $code = preg_replace('/\D/', '', to_en_digits($code));
    if (strlen($code) !== 6) return null;
    $now = intdiv(time(), 30);
    for ($i = -1; $i <= 1; $i++) {
        $s = $now + $i;
        if ($lastStep !== null && $s <= $lastStep) continue;
        if (hash_equals(totp_code($secret, $s), $code)) return $s;
    }
    return null;
}

function totp_uri(string $secret, string $account): string
{
    $issuer = 'EventMaster';
    return 'otpauth://totp/' . rawurlencode($issuer . ':' . $account) . '?secret=' . $secret . '&issuer=' . $issuer . '&digits=6&period=30';
}

/** ۸ کد پشتیبان یکبار مصرف؛ فقط هش آن‌ها ذخیره می‌شود */
function totp_backup_codes(): array
{
    $codes = [];
    for ($i = 0; $i < 8; $i++) $codes[] = substr(bin2hex(random_bytes(5)), 0, 10);
    return $codes;
}
