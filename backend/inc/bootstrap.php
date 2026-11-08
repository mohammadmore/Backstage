<?php
declare(strict_types=1);

if (!defined('EVENT_APP')) { http_response_code(403); exit; }

const ADMIN_ROLES = ['superadmin', 'admin'];
const TIMINGS = ['پیش‌تولید', 'روز قبل از رویداد', 'روز رویداد', 'پایان رویداد', 'پس‌تولید'];
const MASTER_TABLES = ['staff' => 'users', 'category' => 'categories', 'org' => 'organizations', 'venue' => 'venues', 'service' => 'services'];
const EVENT_STATUSES = [
    'draft' => 'پیش‌نویس',
    'confirmed' => 'قطعی',
    'in_progress' => 'در حال اجرا',
    'completed' => 'پایان‌یافته',
];

/** خطای قابل نمایش به کاربر */
class ApiError extends RuntimeException
{
    public int $status;
    public function __construct(string $message, int $status = 400)
    {
        parent::__construct($message);
        $this->status = $status;
    }
}

// ---------------------------------------------------------------
// تنظیمات و اتصال دیتابیس
// ---------------------------------------------------------------
function app_config(): array
{
    static $cfg = null;
    if ($cfg === null) {
        $file = __DIR__ . '/config.php';
        if (!is_file($file)) {
            throw new ApiError('فایل تنظیمات (inc/config.php) یافت نشد. فایل config.sample.php را کپی و تکمیل کنید.', 500);
        }
        $loaded = require $file;
        if (!is_array($loaded) || empty($loaded['db'])) {
            throw new ApiError('فایل تنظیمات نامعتبر است.', 500);
        }
        $cfg = $loaded + [
            'timezone' => 'Asia/Tehran',
            'max_login_attempts' => 10,
            'max_upload_bytes' => 3 * 1024 * 1024,
            'session_lifetime' => 12 * 3600,
        ];
    }
    return $cfg;
}

function db(): PDO
{
    static $pdo = null;
    if ($pdo === null) {
        $c = app_config()['db'];
        try {
            $pdo = new PDO(
                "mysql:host={$c['host']};dbname={$c['name']};charset=utf8mb4",
                $c['user'],
                $c['pass'],
                [
                    PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
                    PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
                    PDO::ATTR_EMULATE_PREPARES => false,
                    PDO::ATTR_STRINGIFY_FETCHES => false,
                ]
            );
        } catch (PDOException $e) {
            error_log('DB connection failed: ' . $e->getMessage());
            throw new ApiError('اتصال به دیتابیس برقرار نشد.', 500);
        }
    }
    return $pdo;
}

function q(string $sql, array $params = []): PDOStatement
{
    $st = db()->prepare($sql);
    $st->execute($params);
    return $st;
}

function q_one(string $sql, array $params = []): ?array
{
    $row = q($sql, $params)->fetch();
    return $row === false ? null : $row;
}

function q_all(string $sql, array $params = []): array
{
    return q($sql, $params)->fetchAll();
}

function q_val(string $sql, array $params = [])
{
    $v = q($sql, $params)->fetchColumn();
    return $v === false ? null : $v;
}

// ---------------------------------------------------------------
// خروجی JSON
// ---------------------------------------------------------------
function json_out($data, int $status = 200): void
{
    http_response_code($status);
    echo json_encode($data, JSON_UNESCAPED_UNICODE | JSON_INVALID_UTF8_SUBSTITUTE);
}

// ---------------------------------------------------------------
// نشست و احراز هویت
// ---------------------------------------------------------------
function is_https(): bool
{
    return (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off')
        || (($_SERVER['HTTP_X_FORWARDED_PROTO'] ?? '') === 'https')
        || ((int)($_SERVER['SERVER_PORT'] ?? 0) === 443);
}

function start_session(): void
{
    $lifetime = (int)app_config()['session_lifetime'];
    $dir = __DIR__ . '/sessions';
    if (!is_dir($dir)) { @mkdir($dir, 0700, true); }
    if (is_dir($dir) && is_writable($dir)) {
        session_save_path($dir);
        ini_set('session.gc_probability', '1');
        ini_set('session.gc_divisor', '100');
    }
    ini_set('session.gc_maxlifetime', (string)$lifetime);
    ini_set('session.use_strict_mode', '1');
    ini_set('session.use_only_cookies', '1');
    $path = rtrim(str_replace('\\', '/', dirname($_SERVER['SCRIPT_NAME'] ?? '/')), '/') . '/';
    session_name('EVMSESSID');
    session_set_cookie_params([
        'lifetime' => 0,
        'path' => $path,
        'secure' => is_https(),
        'httponly' => true,
        'samesite' => 'Strict',
    ]);
    session_start();

    // انقضای نشست در صورت عدم فعالیت
    $now = time();
    if (isset($_SESSION['last_seen']) && $now - (int)$_SESSION['last_seen'] > $lifetime) {
        $_SESSION = [];
        session_regenerate_id(true);
    }
    $_SESSION['last_seen'] = $now;
}

function is_admin_role(?string $role): bool
{
    return in_array($role, ADMIN_ROLES, true);
}

/** کاربر جاری (از دیتابیس خوانده می‌شود تا تغییر نقش/حذف کاربر بلافاصله اعمال شود) */
function current_user(): ?array
{
    static $cached = false;
    if ($cached !== false) return $cached;
    $cached = null;
    $uid = (int)($_SESSION['uid'] ?? 0);
    if ($uid > 0) {
        $u = q_one('SELECT id, username, full_name, role, avatar, can_delegate, theme_pref, is_shadow FROM users WHERE id = ?', [$uid]);
        if ($u && (int)$u['is_shadow'] === 0) {
            $cached = public_user($u);
        } else {
            unset($_SESSION['uid']);
        }
    }
    return $cached;
}

function public_user(array $u): array
{
    return [
        'id' => (int)$u['id'],
        'username' => $u['username'],
        'full_name' => $u['full_name'],
        'role' => $u['role'],
        'avatar' => $u['avatar'],
        'can_delegate' => (int)$u['can_delegate'],
        'theme_pref' => $u['theme_pref'] === 'dark' ? 'dark' : 'light',
        'is_admin' => is_admin_role($u['role']),
    ];
}

function require_user(): array
{
    $u = current_user();
    if (!$u) throw new ApiError('نشست شما منقضی شده است. لطفاً دوباره وارد شوید.', 401);
    return $u;
}

function require_admin(): array
{
    $u = require_user();
    if (!$u['is_admin']) throw new ApiError('شما به این بخش دسترسی ندارید.', 403);
    return $u;
}

function client_ip(): string
{
    return substr((string)($_SERVER['REMOTE_ADDR'] ?? '0.0.0.0'), 0, 45);
}

// ---------------------------------------------------------------
// اعتبارسنجی ورودی
// ---------------------------------------------------------------
function to_en_digits(string $s): string
{
    return strtr($s, [
        '۰' => '0', '۱' => '1', '۲' => '2', '۳' => '3', '۴' => '4', '۵' => '5', '۶' => '6', '۷' => '7', '۸' => '8', '۹' => '9',
        '٠' => '0', '١' => '1', '٢' => '2', '٣' => '3', '٤' => '4', '٥' => '5', '٦' => '6', '٧' => '7', '٨' => '8', '٩' => '9',
        '٫' => '.', '٬' => '', ',' => '', '،' => '',
    ]);
}

function in_str(array $in, string $key, int $max = 255, bool $required = false, string $label = ''): string
{
    $v = $in[$key] ?? '';
    if (is_int($v) || is_float($v)) $v = (string)$v;
    if (!is_string($v)) $v = '';
    $v = trim($v);
    if ($required && $v === '') throw new ApiError(($label ?: $key) . ' الزامی است.');
    if (mb_strlen($v) > $max) throw new ApiError(($label ?: $key) . " نباید بیشتر از $max کاراکتر باشد.");
    return $v;
}

/** عدد صحیح؛ مقدار خالی => null */
function in_int(array $in, string $key, ?int $min = null, ?int $max = null, string $label = ''): ?int
{
    $v = $in[$key] ?? null;
    if ($v === null || $v === '' || $v === false) return null;
    if (is_string($v)) $v = trim(to_en_digits($v));
    if (is_bool($v) || !is_numeric($v) || (float)$v != (int)$v) throw new ApiError(($label ?: $key) . ' باید یک عدد صحیح باشد.');
    $v = (int)$v;
    if ($min !== null && $v < $min) throw new ApiError(($label ?: $key) . " نباید کمتر از $min باشد.");
    if ($max !== null && $v > $max) throw new ApiError(($label ?: $key) . " نباید بیشتر از $max باشد.");
    return $v;
}

/** عدد اعشاری (مبلغ)؛ مقدار خالی => null */
function in_money(array $in, string $key, string $label = ''): ?float
{
    $v = $in[$key] ?? null;
    if ($v === null || $v === '' || $v === false) return null;
    if (is_string($v)) $v = trim(to_en_digits($v));
    if (is_bool($v) || !is_numeric($v)) throw new ApiError(($label ?: $key) . ' باید یک عدد معتبر باشد.');
    $v = round((float)$v, 2);
    if ($v < 0) throw new ApiError(($label ?: $key) . ' نمی‌تواند منفی باشد.');
    if ($v > 9999999999999) throw new ApiError(($label ?: $key) . ' بیش از حد بزرگ است.');
    return $v;
}

function in_bool(array $in, string $key): bool
{
    $v = $in[$key] ?? false;
    if (is_string($v)) return in_array(strtolower(trim($v)), ['1', 'true', 'yes', 'on'], true);
    return (bool)$v;
}

function in_id(array $in, string $key, string $label = 'شناسه'): int
{
    $v = in_int($in, $key, 1, null, $label);
    if ($v === null) throw new ApiError("$label نامعتبر است.");
    return $v;
}

/** تاریخ/ساعت ورودی => 'Y-m-d H:i:s' یا null */
function in_datetime(array $in, string $key, string $label): ?string
{
    $v = $in[$key] ?? null;
    if ($v === null || $v === '') return null;
    if (!is_string($v)) throw new ApiError("$label نامعتبر است.");
    $v = trim(to_en_digits($v));
    foreach (['Y-m-d\TH:i', 'Y-m-d\TH:i:s', 'Y-m-d H:i', 'Y-m-d H:i:s'] as $fmt) {
        $d = DateTime::createFromFormat('!' . $fmt, $v);
        if ($d && $d->format($fmt) === $v) return $d->format('Y-m-d H:i:s');
    }
    throw new ApiError("$label نامعتبر است.");
}

function in_str_list(array $in, string $key, int $maxItems = 100, int $maxLen = 100): array
{
    $v = $in[$key] ?? [];
    if (!is_array($v)) return [];
    $out = [];
    foreach ($v as $item) {
        if (!is_string($item) && !is_int($item)) continue;
        $item = trim((string)$item);
        if ($item === '' || mb_strlen($item) > $maxLen) continue;
        if (!in_array($item, $out, true)) $out[] = $item;
        if (count($out) >= $maxItems) break;
    }
    return $out;
}

function json_list(?string $json): array
{
    if (!$json) return [];
    $v = json_decode($json, true);
    return is_array($v) ? $v : [];
}

function jenc($v): string
{
    return json_encode($v, JSON_UNESCAPED_UNICODE);
}

// ---------------------------------------------------------------
// آپلود عکس
// ---------------------------------------------------------------
function uploads_dir(): string
{
    return dirname(__DIR__) . '/uploads';
}

function is_own_upload(?string $path): bool
{
    return is_string($path) && preg_match('#^uploads/[A-Za-z0-9_.-]+\.(jpe?g|png|gif|webp)$#', $path) === 1;
}

function delete_upload(?string $path): void
{
    if (is_own_upload($path)) {
        $file = dirname(__DIR__) . '/' . $path;
        if (is_file($file)) @unlink($file);
    }
}

/**
 * پردازش مقدار تصویر ارسالی از فرانت.
 * - رشته data:image/... => اعتبارسنجی، بازسازی با GD و ذخیره
 * - همان مسیر قبلی => بدون تغییر
 * - رشته خالی => حذف تصویر
 * - هر مقدار دیگر => نادیده گرفته می‌شود (تصویر قبلی حفظ می‌شود)
 * خروجی: [مسیر جدید, مسیر فایلی که پس از ذخیره موفق باید حذف شود]
 */
function process_image($value, string $prefix, ?string $old): array
{
    $old = $old ?: '';
    if (!is_string($value)) return [$old, null];
    if ($value === '') return ['', $old !== '' ? $old : null];
    if ($value === $old) return [$old, null];
    if (!preg_match('#^data:image/[a-z0-9.+-]+;base64,#i', $value)) return [$old, null];

    $raw = base64_decode(substr($value, strpos($value, ',') + 1), true);
    if ($raw === false || $raw === '') throw new ApiError('فایل تصویر نامعتبر است.');
    if (strlen($raw) > (int)app_config()['max_upload_bytes']) throw new ApiError('حجم تصویر بیش از حد مجاز است.');
    $info = @getimagesizefromstring($raw);
    $allowed = [IMAGETYPE_JPEG => 'jpg', IMAGETYPE_PNG => 'png', IMAGETYPE_GIF => 'gif', IMAGETYPE_WEBP => 'webp'];
    if (!$info || !isset($allowed[$info[2]])) throw new ApiError('فقط تصاویر JPG، PNG، GIF یا WEBP مجاز هستند.');
    if ($info[0] > 6000 || $info[1] > 6000) throw new ApiError('ابعاد تصویر بیش از حد بزرگ است.');

    $dir = uploads_dir();
    if (!is_dir($dir) && !@mkdir($dir, 0755, true)) throw new ApiError('پوشه آپلود قابل ایجاد نیست.', 500);
    $name = $prefix . '_' . time() . '_' . bin2hex(random_bytes(6));

    if (function_exists('imagecreatefromstring') && function_exists('imagejpeg')) {
        // بازسازی تصویر: هرگونه محتوای مخفی داخل فایل حذف می‌شود
        $img = @imagecreatefromstring($raw);
        if (!$img) throw new ApiError('فایل تصویر قابل پردازش نیست.');
        $w = imagesx($img); $h = imagesy($img);
        $canvas = imagecreatetruecolor($w, $h);
        imagefill($canvas, 0, 0, imagecolorallocate($canvas, 255, 255, 255));
        imagecopy($canvas, $img, 0, 0, 0, 0, $w, $h);
        $rel = "uploads/$name.jpg";
        $ok = imagejpeg($canvas, dirname(__DIR__) . '/' . $rel, 85);
        imagedestroy($img); imagedestroy($canvas);
        if (!$ok) throw new ApiError('ذخیره تصویر با خطا مواجه شد.', 500);
    } else {
        $rel = "uploads/$name." . $allowed[$info[2]];
        if (file_put_contents(dirname(__DIR__) . '/' . $rel, $raw) === false) throw new ApiError('ذخیره تصویر با خطا مواجه شد.', 500);
    }
    return [$rel, $old !== '' ? $old : null];
}

// ---------------------------------------------------------------
// لاگ و اعلان
// ---------------------------------------------------------------
function log_action(int $eventId, string $text): void
{
    $u = current_user();
    q('INSERT INTO event_logs (event_id, user_name, action) VALUES (?, ?, ?)', [$eventId, $u['full_name'] ?? 'سیستم', $text]);
}

/** $userId = 0 یعنی صندوق مشترک مدیران */
function notify(int $userId, string $msg, string $type = 'info', ?int $refId = null): void
{
    q('INSERT INTO notifications (user_id, message, type, ref_id) VALUES (?, ?, ?, ?)', [$userId, $msg, $type, $refId]);
}
