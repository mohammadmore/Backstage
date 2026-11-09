<?php
declare(strict_types=1);

if (!defined('EVENT_APP')) { http_response_code(403); exit; }

// ===============================================================
// تنظیمات مدیر: پیامک، ورود دومرحله‌ای، پشتیبان‌گیری
// ===============================================================
$ROUTES += [
    'get_settings'        => ['h_get_settings', 'admin', 'GET'],
    'save_settings'       => ['h_save_settings', 'admin', 'POST'],
    'sms_test'            => ['h_sms_test', 'admin', 'POST'],
    'sms_log'             => ['h_sms_log', 'admin', 'GET'],
    'twofa_setup_begin'   => ['h_twofa_setup_begin', 'user', 'POST'],
    'twofa_setup_confirm' => ['h_twofa_setup_confirm', 'user', 'POST'],
    'twofa_disable'       => ['h_twofa_disable', 'user', 'POST'],
    'twofa_reset_user'    => ['h_twofa_reset_user', 'admin', 'POST'],
    'backup_list'         => ['h_backup_list', 'admin', 'GET'],
    'backup_create'       => ['h_backup_create', 'admin', 'POST'],
    'backup_download'     => ['h_backup_download', 'admin', 'GET'],
    'backup_delete'       => ['h_backup_delete', 'admin', 'POST'],
];

const SETTING_KEYS = [
    'twofa_mode' => ['off', 'optional', 'required_office'],
    'sms_provider' => ['none', 'kavenegar', 'log'],
    'sms_sender' => 'str', 'sms_signature' => 'str', 'sms_api_key' => 'secret',
    'sms_on_assign' => 'bool', 'sms_on_issue' => 'bool', 'sms_on_delegation' => 'bool', 'sms_on_reminder' => 'bool', 'sms_on_portal' => 'bool',
    'reminder_hour' => 'hour',
    'backup_auto' => 'bool', 'backup_keep' => 'int',
    'company_name' => 'str',
];

function h_get_settings(): array
{
    $out = [];
    foreach (SETTING_KEYS as $k => $type) {
        $v = get_setting($k, null);
        if ($type === 'secret') { $out[$k . '_set'] = (string)$v !== ''; $out[$k] = (string)$v !== '' ? '••••' . substr((string)$v, -4) : ''; continue; }
        $out[$k] = $v;
    }
    $out['twofa_mode'] = twofa_mode();
    $out['sms_provider'] = sms_provider();
    $out['reminder_hour'] = $out['reminder_hour'] ?? '18';
    $out['backup_keep'] = $out['backup_keep'] ?? '7';
    $out['sms_events'] = SMS_EVENTS;
    $out['cron_last_run'] = get_setting('cron_last_run', null);
    $out['curl'] = function_exists('curl_init');
    $out['office_without_2fa'] = q_all("SELECT id, full_name, role FROM users WHERE role IN ('" . implode("','", OFFICE_ROLES) . "') AND is_shadow = 0 AND totp_enabled = 0");
    return $out;
}

function h_save_settings(array $in, array $user): array
{
    foreach (SETTING_KEYS as $k => $type) {
        if (!array_key_exists($k, $in)) continue;
        $v = $in[$k];
        if (is_array($type)) { if (!in_array($v, $type, true)) throw new ApiError("مقدار «$k» نامعتبر است."); }
        elseif ($type === 'bool') $v = in_bool($in, $k) ? '1' : '0';
        elseif ($type === 'int') $v = (string)max(1, min(90, (int)to_en_digits((string)$v)));
        elseif ($type === 'hour') $v = (string)max(0, min(23, (int)to_en_digits((string)$v)));
        elseif ($type === 'secret') { $v = trim((string)$v); if ($v === '' || str_starts_with($v, '••••')) continue; if (mb_strlen($v) > 200) throw new ApiError('کلید API بیش از حد طولانی است.'); }
        else $v = in_str($in, $k, 100);
        // مدیری که خودش ۲FA ندارد نمی‌تواند آن را برای همه اجباری کند (قفل شدن حساب)
        if ($k === 'twofa_mode' && $v === 'required_office' && !$user['totp_enabled']) throw new ApiError('ابتدا ورود دومرحله‌ای را برای حساب خودتان فعال کنید، سپس آن را برای همه اجباری کنید.');
        set_setting($k, (string)$v);
    }
    return ['success' => true];
}

function h_sms_test(array $in): array
{
    $phone = normalize_mobile((string)($in['phone'] ?? ''));
    if (!$phone) throw new ApiError('شماره موبایل معتبر نیست (مثال: ۰۹۱۲۱۲۳۴۵۶۷).');
    if (sms_provider() === 'none') throw new ApiError('ابتدا سرویس پیامک را انتخاب و ذخیره کنید.');
    [$ok, $err] = sms_send_now($phone, 'پیامک آزمایشی سامانه ای‌ونت مستر');
    q('INSERT INTO sms_queue (phone, message, status, error, attempts, sent_at) VALUES (?, ?, ?, ?, 1, ?)', [$phone, 'پیامک آزمایشی', $ok ? 'sent' : 'failed', $err, $ok ? date('Y-m-d H:i:s') : null]);
    if (!$ok) throw new ApiError('ارسال ناموفق: ' . $err);
    return ['success' => true, 'mode' => sms_provider()];
}

function h_sms_log(): array
{
    return q_all('SELECT id, phone, message, status, error, attempts, created_at, sent_at FROM sms_queue ORDER BY id DESC LIMIT 100');
}

// ---------- ورود دومرحله‌ای ----------
function h_twofa_setup_begin(array $in, array $user): array
{
    if (twofa_mode() === 'off') throw new ApiError('ورود دومرحله‌ای توسط مدیر سیستم غیرفعال است.');
    $secret = totp_new_secret();
    $_SESSION['totp_pending'] = $secret;
    return ['secret' => $secret, 'uri' => totp_uri($secret, $user['username'])];
}

function h_twofa_setup_confirm(array $in, array $user): array
{
    $secret = $_SESSION['totp_pending'] ?? null;
    if (!$secret) throw new ApiError('ابتدا مرحله فعال‌سازی را شروع کنید.');
    $step = totp_verify($secret, (string)($in['code'] ?? ''));
    if ($step === null) throw new ApiError('کد واردشده صحیح نیست. ساعت گوشی را بررسی کنید و کد جدید را وارد کنید.');
    $codes = totp_backup_codes();
    q('UPDATE users SET totp_secret = ?, totp_enabled = 1, totp_last_step = ?, totp_backup = ?, session_version = session_version + 1 WHERE id = ?',
        [$secret, $step, jenc(array_map(fn($c) => password_hash($c, PASSWORD_DEFAULT), $codes)), $user['id']]);
    unset($_SESSION['totp_pending']);
    // نشست فعلی معتبر می‌ماند، سایر نشست‌ها بسته می‌شوند
    $_SESSION['sv'] = (int)q_val('SELECT session_version FROM users WHERE id = ?', [$user['id']]);
    forget_current_user();
    return ['success' => true, 'backup_codes' => $codes, 'user' => current_user()];
}

function h_twofa_disable(array $in, array $user): array
{
    if (twofa_required_for($user['role'])) throw new ApiError('ورود دومرحله‌ای برای نقش شما الزامی است و قابل غیرفعال‌سازی نیست.');
    $hash = (string)q_val('SELECT password FROM users WHERE id = ?', [$user['id']]);
    if (!password_verify((string)($in['password'] ?? ''), $hash)) throw new ApiError('رمز عبور اشتباه است.');
    q('UPDATE users SET totp_enabled = 0, totp_secret = NULL, totp_backup = NULL, totp_last_step = NULL WHERE id = ?', [$user['id']]);
    forget_current_user();
    return ['success' => true, 'user' => current_user()];
}

/** مدیر کل: بازنشانی ۲FA همکاری که گوشی‌اش را گم کرده */
function h_twofa_reset_user(array $in, array $user): array
{
    $id = in_id($in, 'user_id', 'کاربر');
    if ($id === (int)$user['id']) throw new ApiError('برای حساب خودتان از بخش «امنیت حساب» استفاده کنید.');
    $u = q_one('SELECT id, full_name FROM users WHERE id = ? AND ' . staff_role_sql(), [$id]);
    if (!$u) throw new ApiError('کاربر یافت نشد.', 404);
    q('UPDATE users SET totp_enabled = 0, totp_secret = NULL, totp_backup = NULL, totp_last_step = NULL, session_version = session_version + 1 WHERE id = ?', [$id]);
    return ['success' => true];
}

// ---------- پشتیبان‌گیری ----------
function backup_dir(): string { return storage_dir('backups'); }

/** خروجی کامل SQL دیتابیس (ساختار + داده) به‌صورت فشرده */
function backup_make(): string
{
    @set_time_limit(300);
    $name = 'event-backup-' . date('Ymd-His') . '-' . bin2hex(random_bytes(3)) . '.sql.gz';
    $path = backup_dir() . '/' . $name;
    $gz = function_exists('gzopen');
    if (!$gz) { $name = substr($name, 0, -3); $path = substr($path, 0, -3); }
    $fh = $gz ? gzopen($path, 'wb6') : fopen($path, 'wb');
    $w = fn($s) => $gz ? gzwrite($fh, $s) : fwrite($fh, $s);
    $pdo = db();
    $w("-- EventMaster backup " . date('c') . "\nSET NAMES utf8mb4;\nSET FOREIGN_KEY_CHECKS=0;\n\n");
    foreach ($pdo->query('SHOW TABLES')->fetchAll(PDO::FETCH_COLUMN) as $table) {
        if (in_array($table, ['login_attempts'], true)) continue;
        $create = $pdo->query("SHOW CREATE TABLE `$table`")->fetch(PDO::FETCH_NUM)[1];
        $w("DROP TABLE IF EXISTS `$table`;\n$create;\n");
        $st = $pdo->query("SELECT * FROM `$table`", PDO::FETCH_NUM);
        $batch = [];
        while ($row = $st->fetch()) {
            $batch[] = '(' . implode(',', array_map(fn($v) => $v === null ? 'NULL' : $pdo->quote((string)$v), $row)) . ')';
            if (count($batch) >= 200) { $w("INSERT INTO `$table` VALUES\n" . implode(",\n", $batch) . ";\n"); $batch = []; }
        }
        if ($batch) $w("INSERT INTO `$table` VALUES\n" . implode(",\n", $batch) . ";\n");
        $w("\n");
    }
    $w("SET FOREIGN_KEY_CHECKS=1;\n");
    $gz ? gzclose($fh) : fclose($fh);
    // حذف نسخه‌های قدیمی
    $keep = max(1, (int)get_setting('backup_keep', '7'));
    $files = glob(backup_dir() . '/event-backup-*') ?: [];
    rsort($files);
    foreach (array_slice($files, $keep) as $old) @unlink($old);
    return $name;
}

function h_backup_list(): array
{
    $files = glob(backup_dir() . '/event-backup-*') ?: [];
    rsort($files);
    return array_map(fn($f) => ['name' => basename($f), 'size' => filesize($f), 'created_at' => date('Y-m-d H:i:s', filemtime($f))], $files);
}

function h_backup_create(): array
{
    $name = backup_make();
    return ['success' => true, 'name' => $name];
}

function backup_path_or_fail($name): string
{
    $name = basename((string)$name);
    if (!preg_match('/^event-backup-[\w-]+\.sql(\.gz)?$/', $name)) throw new ApiError('نام فایل نامعتبر است.');
    $path = backup_dir() . '/' . $name;
    if (!is_file($path)) throw new ApiError('فایل پشتیبان یافت نشد.', 404);
    return $path;
}

function h_backup_download(array $in): array
{
    $path = backup_path_or_fail($in['name'] ?? '');
    header_remove('Content-Type');
    header('Content-Type: application/octet-stream');
    header('Content-Length: ' . filesize($path));
    header('Content-Disposition: attachment; filename="' . basename($path) . '"');
    readfile($path);
    return ['__raw' => true];
}

function h_backup_delete(array $in): array
{
    @unlink(backup_path_or_fail($in['name'] ?? ''));
    return ['success' => true];
}
