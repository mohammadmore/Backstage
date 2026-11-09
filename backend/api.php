<?php
declare(strict_types=1);

define('EVENT_APP', true);

ini_set('display_errors', '0');
ini_set('log_errors', '1');
error_reporting(E_ALL);

header('Content-Type: application/json; charset=utf-8');
header('X-Content-Type-Options: nosniff');
header('Cache-Control: no-store');
header('Referrer-Policy: same-origin');

require __DIR__ . '/inc/bootstrap.php';
require __DIR__ . '/inc/migrations.php';

// ---------------------------------------------------------------
// جدول مسیرها: action => [تابع, سطح دسترسی, متد]
// ---------------------------------------------------------------
const ROUTES = [
    'login'               => ['h_login', 'public', 'POST'],
    'logout'              => ['h_logout', 'public', 'POST'],
    'me'                  => ['h_me', 'public', 'GET'],
    'update_theme'        => ['h_update_theme', 'user', 'POST'],
    'change_password'     => ['h_change_password', 'user', 'POST'],

    'get_master_data'     => ['h_get_master_data', 'admin', 'GET'],
    'get_colleagues'      => ['h_get_colleagues', 'user', 'GET'],
    'add_master_item'     => ['h_add_master_item', 'admin', 'POST'],
    'edit_master_item'    => ['h_edit_master_item', 'admin', 'POST'],
    'delete_master_item'  => ['h_delete_master_item', 'admin', 'POST'],
    'update_sort'         => ['h_update_sort', 'admin', 'POST'],
    'set_order'           => ['h_set_order', 'admin', 'POST'],

    'create_event'        => ['h_create_event', 'admin', 'POST'],
    'update_event_details'=> ['h_update_event_details', 'admin', 'POST'],
    'get_events'          => ['h_get_events', 'admin', 'GET'],
    'get_event_detail'    => ['h_get_event_detail', 'admin', 'GET'],
    'update_event_status' => ['h_update_event_status', 'admin', 'POST'],

    'get_my_tasks'        => ['h_get_my_tasks', 'user', 'GET'],
    'update_task'         => ['h_update_task', 'user', 'POST'],
    'assign_role'         => ['h_assign_role', 'admin', 'POST'],
    'quick_replace'       => ['h_quick_replace', 'admin', 'POST'],
    'add_quick_task'      => ['h_add_quick_task', 'admin', 'POST'],
    'update_task_info'    => ['h_update_task_info', 'admin', 'POST'],
    'delete_task'         => ['h_delete_task', 'admin', 'POST'],
    'delete_finance_item' => ['h_delete_finance_item', 'admin', 'POST'],

    'update_finance_item' => ['h_update_finance_item', 'admin', 'POST'],
    'update_finance_totals'=> ['h_update_finance_totals', 'admin', 'POST'],
    'add_adhoc_service'   => ['h_add_adhoc_service', 'admin', 'POST'],

    'request_delegation'  => ['h_request_delegation', 'user', 'POST'],
    'resolve_delegation'  => ['h_resolve_delegation', 'admin', 'POST'],
    'get_notifications'   => ['h_get_notifications', 'user', 'GET'],
    'mark_notif_read'     => ['h_mark_notif_read', 'user', 'POST'],
    'mark_all_notifs_read'=> ['h_mark_all_notifs_read', 'user', 'POST'],
];

$pendingDeletes = [];

try {
    date_default_timezone_set((string)app_config()['timezone']);
    configure_error_log();
    if (is_https()) header('Strict-Transport-Security: max-age=15552000');
    $action = (string)($_GET['action'] ?? '');
    if (!isset(ROUTES[$action])) throw new ApiError('وب‌سرویس نامعتبر', 404);
    [$handler, $access, $method] = ROUTES[$action];

    $reqMethod = $_SERVER['REQUEST_METHOD'] ?? 'GET';
    if ($reqMethod !== $method) throw new ApiError('متد درخواست نامعتبر است.', 405);
    // محافظت در برابر CSRF: درخواست‌های POST باید هدر اختصاصی برنامه را داشته باشند
    // (فرم‌ها و سایت‌های دیگر بدون مجوز CORS قادر به ارسال این هدر نیستند)
    if ($reqMethod === 'POST' && ($_SERVER['HTTP_X_REQUESTED_WITH'] ?? '') !== 'EventMaster') {
        throw new ApiError('درخواست نامعتبر است.', 403);
    }

    run_migrations();
    start_session();

    $input = [];
    if ($reqMethod === 'POST') {
        $raw = file_get_contents('php://input');
        $decoded = $raw !== '' ? json_decode((string)$raw, true) : [];
        if (!is_array($decoded)) throw new ApiError('داده ارسالی نامعتبر است.');
        $input = $decoded;
    } else {
        $input = $_GET;
    }

    // ارسال رمز عبور فقط روی HTTPS (در صورت فعال بودن force_https در تنظیمات)
    if (in_array($action, ['login', 'change_password'], true) && !is_https() && !empty(app_config()['force_https']) && !is_local_request()) {
        throw new ApiError('برای امنیت رمز عبور، سایت را با https:// باز کنید.', 403);
    }

    $user = null;
    if ($access === 'user') $user = require_user();
    if ($access === 'admin') $user = require_admin();
    // کاربری که رمزش ضعیف است تا تغییر رمز، فقط به همین چند عملیات دسترسی دارد
    if ($user && $user['must_change_password'] && !in_array($action, ['change_password', 'logout', 'me'], true)) {
        throw new ApiError('ابتدا باید رمز عبور خود را تغییر دهید.', 403);
    }
    // نوشتن نشست تمام شد؛ قفل فایل نشست آزاد می‌شود تا درخواست‌های موازی معطل نمانند
    if (!in_array($action, ['login', 'logout', 'change_password'], true)) session_write_close();

    $result = $handler($input, $user);
    json_out($result ?? ['success' => true]);

    foreach ($pendingDeletes as $p) delete_upload($p);
} catch (ApiError $e) {
    if (db_in_tx()) db()->rollBack();
    json_out(['error' => $e->getMessage()], $e->status);
} catch (Throwable $e) {
    if (db_in_tx()) db()->rollBack();
    error_log('[' . ($action ?? '') . '] ' . get_class($e) . ': ' . $e->getMessage() . ' @ ' . $e->getFile() . ':' . $e->getLine());
    json_out(['error' => 'خطای داخلی سرور. لطفاً دوباره تلاش کنید.'], 500);
}

function db_in_tx(): bool
{
    try { return db()->inTransaction(); } catch (Throwable $e) { return false; }
}

/** فایل‌های قدیمی فقط پس از موفقیت کامل درخواست حذف می‌شوند */
function delete_after_success(?string $path): void
{
    global $pendingDeletes;
    if ($path) $pendingDeletes[] = $path;
}

// ===============================================================
// احراز هویت
// ===============================================================
function h_login(array $in): array
{
    $username = in_str($in, 'username', 50);
    $password = is_string($in['password'] ?? null) ? $in['password'] : '';
    $ip = client_ip();
    $max = (int)app_config()['max_login_attempts'];

    q('DELETE FROM login_attempts WHERE created_at < (NOW() - INTERVAL 1 DAY)');
    $fails = (int)q_val('SELECT COUNT(*) FROM login_attempts WHERE ip = ? AND created_at > (NOW() - INTERVAL 15 MINUTE)', [$ip]);
    if ($fails >= $max) throw new ApiError('تعداد تلاش‌های ناموفق زیاد است. ۱۵ دقیقه دیگر دوباره تلاش کنید.', 429);

    $found = null;
    if ($username !== '' && $password !== '') {
        $cands = q_all('SELECT * FROM users WHERE username = ? AND is_shadow = 0', [$username]);
        foreach ($cands as $c) {
            $hash = (string)$c['password'];
            $isHash = password_get_info($hash)['algo'] !== null;
            $ok = $isHash ? password_verify($password, $hash) : hash_equals($hash, $password);
            if ($ok) {
                if (!$isHash || password_needs_rehash($hash, PASSWORD_DEFAULT)) {
                    q('UPDATE users SET password = ? WHERE id = ?', [password_hash($password, PASSWORD_DEFAULT), $c['id']]);
                }
                $found = $c;
                break;
            }
        }
    }
    if (!$found) {
        q('INSERT INTO login_attempts (ip, username) VALUES (?, ?)', [$ip, mb_substr($username, 0, 50)]);
        throw new ApiError('نام کاربری یا رمز عبور اشتباه است.', 401);
    }
    q('DELETE FROM login_attempts WHERE ip = ?', [$ip]);
    // رمزهای ضعیف قدیمی (مثل 123456 پیش‌فرض نسخه قبل) => اجبار به تغییر رمز
    if (password_problem($password, (string)$found['username']) !== null && (int)$found['must_change_password'] !== 1) {
        q('UPDATE users SET must_change_password = 1 WHERE id = ?', [$found['id']]);
        $found['must_change_password'] = 1;
    }
    session_regenerate_id(true);
    $_SESSION['uid'] = (int)$found['id'];
    $_SESSION['sv'] = (int)$found['session_version'];
    $_SESSION['last_seen'] = time();
    return ['success' => true, 'user' => public_user($found)];
}

function h_logout(): array
{
    $_SESSION = [];
    if (ini_get('session.use_cookies')) {
        $p = session_get_cookie_params();
        setcookie(session_name(), '', ['expires' => time() - 42000, 'path' => $p['path'], 'secure' => $p['secure'], 'httponly' => true, 'samesite' => 'Strict']);
    }
    session_destroy();
    return ['success' => true];
}

function h_me(): array
{
    return ['user' => current_user()];
}

function h_update_theme(array $in, array $user): array
{
    $theme = ($in['theme'] ?? '') === 'dark' ? 'dark' : 'light';
    q('UPDATE users SET theme_pref = ? WHERE id = ?', [$theme, $user['id']]);
    return ['success' => true];
}

/** تغییر رمز توسط خود کاربر: سایر نشست‌های باز او باطل می‌شوند، نشست فعلی حفظ می‌شود */
function h_change_password(array $in, array $user): array
{
    $current = is_string($in['current_password'] ?? null) ? $in['current_password'] : '';
    $new = is_string($in['new_password'] ?? null) ? $in['new_password'] : '';
    $row = q_one('SELECT password FROM users WHERE id = ?', [$user['id']]);
    $hash = (string)($row['password'] ?? '');
    $isHash = password_get_info($hash)['algo'] !== null;
    if ($current === '' || !($isHash ? password_verify($current, $hash) : hash_equals($hash, $current))) {
        throw new ApiError('رمز عبور فعلی اشتباه است.');
    }
    if ($problem = password_problem($new, $user['username'])) throw new ApiError($problem);
    if (hash_equals($current, $new)) throw new ApiError('رمز جدید باید با رمز فعلی متفاوت باشد.');
    q('UPDATE users SET password = ?, must_change_password = 0, session_version = session_version + 1 WHERE id = ?', [password_hash($new, PASSWORD_DEFAULT), $user['id']]);
    session_regenerate_id(true);
    $_SESSION['sv'] = (int)q_val('SELECT session_version FROM users WHERE id = ?', [$user['id']]);
    forget_current_user();
    return ['success' => true, 'user' => current_user()];
}

// ===============================================================
// اطلاعات پایه
// ===============================================================
function staff_role_sql(): string
{
    return "role NOT IN ('" . implode("','", ADMIN_ROLES) . "')";
}

function h_get_master_data(): array
{
    return [
        'categories' => q_all('SELECT * FROM categories ORDER BY sort_order ASC, id ASC'),
        'services' => q_all('SELECT * FROM services ORDER BY sort_order ASC, id ASC'),
        'staff' => q_all('SELECT id, username, full_name, role, is_shadow, phone, phone2, iban, skills, sort_order, avatar, can_delegate FROM users WHERE ' . staff_role_sql() . ' ORDER BY sort_order ASC, id ASC'),
        'organizations' => q_all('SELECT * FROM organizations ORDER BY sort_order ASC, id ASC'),
        'venues' => q_all('SELECT * FROM venues ORDER BY sort_order ASC, id ASC'),
    ];
}

/** لیست حداقلی همکاران برای فرم واگذاری (بدون تلفن و شبا) */
function h_get_colleagues(array $in, array $user): array
{
    if (!$user['is_admin'] && (int)$user['can_delegate'] !== 1) throw new ApiError('شما مجوز واگذاری وظیفه ندارید.', 403);
    return q_all('SELECT id, full_name, avatar, is_shadow FROM users WHERE ' . staff_role_sql() . ' AND id <> ? ORDER BY sort_order ASC, id ASC', [$user['id']]);
}

function master_type(array $in): string
{
    $type = (string)($in['type'] ?? '');
    if (!isset(MASTER_TABLES[$type])) throw new ApiError('نوع داده نامعتبر');
    return $type;
}

function next_sort(string $table): int
{
    return (int)(q_val("SELECT MAX(sort_order) FROM `$table`") ?? 0) + 1;
}

function h_add_master_item(array $in): array
{
    return save_master_item(master_type($in), $in, null);
}

function h_edit_master_item(array $in): array
{
    return save_master_item(master_type($in), $in, in_id($in, 'id'));
}

function save_master_item(string $type, array $in, ?int $id): array
{
    $table = MASTER_TABLES[$type];
    $existing = null;
    if ($id !== null) {
        $existing = q_one("SELECT * FROM `$table` WHERE id = ?" . ($type === 'staff' ? ' AND ' . staff_role_sql() : ''), [$id]);
        if (!$existing) throw new ApiError('آیتم مورد نظر یافت نشد.', 404);
    }

    if ($type === 'category') {
        $name = in_str($in, 'name', 100, true, 'نام دسته‌بندی');
        if ($id) q('UPDATE categories SET name = ? WHERE id = ?', [$name, $id]);
        else { q('INSERT INTO categories (name, sort_order) VALUES (?, ?)', [$name, next_sort($table)]); $id = (int)db()->lastInsertId(); }
    }

    elseif ($type === 'staff') {
        $fullName = in_str($in, 'full_name', 100, true, 'نام و نام خانوادگی');
        $isShadow = in_bool($in, 'is_shadow');
        $username = in_str($in, 'username', 50, false, 'نام کاربری');
        $password = is_string($in['password'] ?? null) ? $in['password'] : '';
        if ($username === '' && $existing) $username = (string)$existing['username'];
        if ($username === '') {
            if (!$isShadow) throw new ApiError('کاربران فعال به نام کاربری نیاز دارند.');
            $username = 'shadow_' . bin2hex(random_bytes(4));
        }
        if (preg_match('/\s/u', $username)) throw new ApiError('نام کاربری نباید فاصله داشته باشد.');
        if ((int)q_val('SELECT COUNT(*) FROM users WHERE username = ? AND id <> ?', [$username, $id ?? 0]) > 0) {
            throw new ApiError('این نام کاربری قبلاً استفاده شده است.');
        }
        $hash = null;
        if ($password !== '') {
            if ($problem = password_problem($password, $username)) throw new ApiError($problem);
            $hash = password_hash($password, PASSWORD_DEFAULT);
        } elseif (!$existing) {
            if (!$isShadow) throw new ApiError('برای کاربر فعال، رمز عبور الزامی است.');
            $hash = password_hash(bin2hex(random_bytes(16)), PASSWORD_DEFAULT);
        } elseif ((int)$existing['is_shadow'] === 1 && !$isShadow) {
            throw new ApiError('برای فعال کردن کاربر خاموش، یک رمز عبور تعیین کنید.');
        }
        [$avatar, $oldFile] = process_image($in['avatar'] ?? ($existing['avatar'] ?? ''), 'avatar', $existing['avatar'] ?? null);
        $fields = [
            'username' => $username,
            'full_name' => $fullName,
            'avatar' => $avatar,
            'is_shadow' => $isShadow ? 1 : 0,
            'phone' => in_str($in, 'phone', 20, false, 'شماره موبایل'),
            'phone2' => in_str($in, 'phone2', 20, false, 'شماره تماس ۲'),
            'iban' => in_str($in, 'iban', 50, false, 'شماره شبا'),
            'skills' => jenc(in_str_list($in, 'skills')),
            'can_delegate' => in_bool($in, 'can_delegate') ? 1 : 0,
        ];
        if ($hash !== null) {
            $fields['password'] = $hash;
            // رمزی که مدیر تعیین می‌کند موقت است: کاربر در اولین ورود باید آن را عوض کند
            if (!$isShadow && $password !== '') $fields['must_change_password'] = 1;
        }
        if ($id) {
            $set = implode(', ', array_map(fn($k) => "`$k` = ?", array_keys($fields)));
            // تغییر رمز یا خاموش کردن کاربر => نشست‌های باز او باطل می‌شوند
            if ($hash !== null || $isShadow) $set .= ', session_version = session_version + 1';
            q("UPDATE users SET $set WHERE id = ?", [...array_values($fields), $id]);
        } else {
            $fields['role'] = 'staff';
            $fields['sort_order'] = next_sort($table);
            $cols = implode(', ', array_map(fn($k) => "`$k`", array_keys($fields)));
            q("INSERT INTO users ($cols) VALUES (" . implode(', ', array_fill(0, count($fields), '?')) . ')', array_values($fields));
            $id = (int)db()->lastInsertId();
        }
        delete_after_success($oldFile);
    }

    elseif ($type === 'org') {
        $name = in_str($in, 'name', 100, true, 'نام سازمان');
        $contacts = [];
        foreach ((is_array($in['contacts'] ?? null) ? $in['contacts'] : []) as $c) {
            if (!is_array($c)) continue;
            $cn = in_str($c, 'name', 100);
            if ($cn === '') continue;
            $contacts[] = ['name' => $cn, 'phone' => in_str($c, 'phone', 30)];
        }
        [$logo, $oldFile] = process_image($in['logo'] ?? ($existing['logo'] ?? ''), 'logo', $existing['logo'] ?? null);
        $vals = [$name, $logo, in_str($in, 'national_id', 50, false, 'شناسه ملی'), jenc($contacts)];
        if ($id) q('UPDATE organizations SET name = ?, logo = ?, national_id = ?, contacts = ? WHERE id = ?', [...$vals, $id]);
        else { q('INSERT INTO organizations (name, logo, national_id, contacts, sort_order) VALUES (?, ?, ?, ?, ?)', [...$vals, next_sort($table)]); $id = (int)db()->lastInsertId(); }
        delete_after_success($oldFile);
    }

    elseif ($type === 'venue') {
        $gps = in_str($in, 'gps_link', 1000, false, 'لینک لوکیشن');
        if ($gps !== '') {
            if (!preg_match('#^[a-z][a-z0-9+.-]*://#i', $gps)) $gps = 'https://' . $gps;
            if (!preg_match('#^https?://#i', $gps) || !filter_var($gps, FILTER_VALIDATE_URL)) throw new ApiError('لینک لوکیشن نامعتبر است.');
        }
        $vals = [
            in_str($in, 'name', 100, true, 'نام مکان'),
            in_str($in, 'venue_type', 50),
            in_int($in, 'capacity', 0, 1000000, 'ظرفیت') ?? 0,
            $gps,
            in_str($in, 'address', 2000, false, 'آدرس'),
            jenc(in_str_list($in, 'facilities')),
        ];
        if ($id) q('UPDATE venues SET name = ?, venue_type = ?, capacity = ?, gps_link = ?, address = ?, facilities = ? WHERE id = ?', [...$vals, $id]);
        else { q('INSERT INTO venues (name, venue_type, capacity, gps_link, address, facilities, sort_order) VALUES (?, ?, ?, ?, ?, ?, ?)', [...$vals, next_sort($table)]); $id = (int)db()->lastInsertId(); }
    }

    elseif ($type === 'service') {
        $name = in_str($in, 'name', 100, true, 'نام سرویس');
        $catId = in_int($in, 'category_id', 1, null, 'دسته‌بندی');
        if ($catId !== null && !q_val('SELECT id FROM categories WHERE id = ?', [$catId])) throw new ApiError('دسته‌بندی انتخاب‌شده وجود ندارد.');
        $costType = ($in['cost_type'] ?? '') === 'individual' ? 'individual' : 'cumulative';
        $packages = sanitize_packages($in['packages'] ?? []);
        $vals = [$name, $catId, $costType, jenc($packages)];
        if ($id) q('UPDATE services SET name = ?, category_id = ?, cost_type = ?, packages = ? WHERE id = ?', [...$vals, $id]);
        else { q('INSERT INTO services (name, category_id, cost_type, packages, sort_order) VALUES (?, ?, ?, ?, ?)', [...$vals, next_sort($table)]); $id = (int)db()->lastInsertId(); }
    }

    return ['success' => true, 'id' => $id];
}

/** پاکسازی ساختار پکیج‌ها: {name, price, tasks:[{title, role, timing, dep}]} */
function sanitize_packages($raw, bool $strict = true): array
{
    if (!is_array($raw)) return [];
    $out = [];
    foreach ($raw as $p) {
        // در حالت غیرسخت‌گیرانه اندیس‌ها حفظ می‌شوند تا با اندیس انتخاب‌شده در فرانت یکی باشند
        if (!is_array($p)) { if (!$strict) $out[] = ['name' => 'بدون نام', 'price' => null, 'tasks' => []]; continue; }
        $pname = in_str($p, 'name', 150, $strict, 'نام پکیج');
        if ($pname === '') $pname = 'بدون نام';
        try { $price = in_money($p, 'price', 'قیمت پکیج'); } catch (ApiError $e) { if ($strict) throw $e; $price = null; }
        $tasks = [];
        $titles = [];
        foreach ((is_array($p['tasks'] ?? null) ? $p['tasks'] : []) as $t) {
            if (!is_array($t)) continue;
            $title = in_str($t, 'title', 255, false, 'عنوان تسک');
            if ($title === '') continue;
            $role = in_str($t, 'role', 200, false, 'نقش');
            $dep = in_str($t, 'dep', 255);
            if (strpos($role, '|dep:') !== false) { // فرمت قدیمی
                [$role, $legacyDep] = array_pad(explode('|dep:', $role, 2), 2, '');
                if ($dep === '') $dep = trim($legacyDep);
            }
            $role = mb_substr(trim($role), 0, 100) ?: 'عمومی';
            if ($strict && in_array($title, $titles, true)) throw new ApiError("عنوان تسک «{$title}» در پکیج «{$pname}» تکراری است.");
            // پیش‌نیاز باید یکی از تسک‌های قبلی همین پکیج باشد
            if ($dep !== '' && !in_array($dep, $titles, true)) $dep = '';
            $timing = (string)($t['timing'] ?? '');
            $tasks[] = ['title' => $title, 'role' => $role, 'timing' => in_array($timing, TIMINGS, true) ? $timing : TIMINGS[0], 'dep' => $dep];
            $titles[] = $title;
        }
        $out[] = ['name' => $pname, 'price' => $price, 'tasks' => $tasks];
    }
    return $out;
}

function h_delete_master_item(array $in): array
{
    $type = master_type($in);
    $id = in_id($in, 'id');
    $pdo = db();
    $pdo->beginTransaction();

    if ($type === 'category') {
        q('UPDATE services SET category_id = NULL WHERE category_id = ?', [$id]);
        q('DELETE FROM categories WHERE id = ?', [$id]);
    } elseif ($type === 'service') {
        // اقلام فاکتور رویدادها کپی مستقل دارند؛ حذف سرویس روی آن‌ها اثری ندارد
        q('DELETE FROM services WHERE id = ?', [$id]);
    } elseif ($type === 'venue') {
        $n = (int)q_val('SELECT COUNT(*) FROM events WHERE venue_id = ?', [$id]);
        if ($n > 0) throw new ApiError("این مکان در {$n} رویداد استفاده شده و قابل حذف نیست.");
        q('DELETE FROM venues WHERE id = ?', [$id]);
    } elseif ($type === 'org') {
        $n = (int)q_val('SELECT COUNT(*) FROM events WHERE org_id = ?', [$id]);
        if ($n > 0) throw new ApiError("این سازمان در {$n} رویداد ثبت شده و قابل حذف نیست.");
        $logo = q_val('SELECT logo FROM organizations WHERE id = ?', [$id]);
        q('DELETE FROM organizations WHERE id = ?', [$id]);
        delete_after_success($logo);
    } elseif ($type === 'staff') {
        $u = q_one('SELECT id, avatar FROM users WHERE id = ? AND ' . staff_role_sql(), [$id]);
        if (!$u) throw new ApiError('کاربر یافت نشد.', 404);
        $open = (int)q_val("SELECT COUNT(*) FROM event_tasks t JOIN events e ON e.id = t.event_id WHERE t.assignee_id = ? AND e.status <> 'completed'", [$id]);
        if ($open > 0) throw new ApiError("این همکار متصدی {$open} وظیفه در رویدادهای جاری است. ابتدا وظایف را به فرد دیگری منتقل کنید (یا کاربر را خاموش کنید).");
        $dels = q_all("SELECT id FROM delegations WHERE status = 'pending' AND (from_user_id = ? OR to_user_id = ?)", [$id, $id]);
        foreach ($dels as $d) q("UPDATE notifications SET is_read = 1 WHERE type = 'delegation' AND ref_id = ?", [$d['id']]);
        q("UPDATE delegations SET status = 'cancelled' WHERE status = 'pending' AND (from_user_id = ? OR to_user_id = ?)", [$id, $id]);
        q('DELETE FROM notifications WHERE user_id = ?', [$id]);
        q('DELETE FROM users WHERE id = ?', [$id]);
        delete_after_success($u['avatar']);
    }

    $pdo->commit();
    return ['success' => true];
}

/** ترتیب کامل جدید (کشیدن و رها کردن): لیست شناسه‌ها باید دقیقاً همه آیتم‌های جدول باشد */
function h_set_order(array $in): array
{
    $type = master_type($in);
    $table = MASTER_TABLES[$type];
    $ids = is_array($in['ids'] ?? null) ? array_values(array_map('intval', $in['ids'])) : [];
    $where = $type === 'staff' ? ' WHERE ' . staff_role_sql() : '';
    $pdo = db();
    $pdo->beginTransaction();
    $current = array_map('intval', $pdo->query("SELECT id FROM `$table`$where FOR UPDATE")->fetchAll(PDO::FETCH_COLUMN));
    $a = $ids; $b = $current; sort($a); sort($b);
    if ($a !== $b) throw new ApiError('لیست تغییر کرده است. صفحه را بارگذاری مجدد کنید.', 409);
    $st = $pdo->prepare("UPDATE `$table` SET sort_order = ? WHERE id = ?");
    foreach ($ids as $i => $rid) $st->execute([$i + 1, $rid]);
    $pdo->commit();
    return ['success' => true];
}

function h_update_sort(array $in): array
{
    $type = master_type($in);
    $table = MASTER_TABLES[$type];
    $id = in_id($in, 'id');
    $dir = (string)($in['direction'] ?? '');
    if (!in_array($dir, ['top', 'up', 'down', 'bottom'], true)) throw new ApiError('جهت نامعتبر است.');

    $where = $type === 'staff' ? ' WHERE ' . staff_role_sql() : '';
    $pdo = db();
    $pdo->beginTransaction();
    $ids = array_map('intval', $pdo->query("SELECT id FROM `$table`$where ORDER BY sort_order ASC, id ASC FOR UPDATE")->fetchAll(PDO::FETCH_COLUMN));
    $pos = array_search($id, $ids, true);
    if ($pos === false) throw new ApiError('آیتم یافت نشد.', 404);
    array_splice($ids, $pos, 1);
    $newPos = ['top' => 0, 'bottom' => count($ids), 'up' => max(0, $pos - 1), 'down' => min(count($ids), $pos + 1)][$dir];
    array_splice($ids, $newPos, 0, [$id]);
    // بازشماره‌گذاری کامل (ترتیب‌های تکراری نسخه قبلی هم اصلاح می‌شوند)
    $st = $pdo->prepare("UPDATE `$table` SET sort_order = ? WHERE id = ?");
    foreach ($ids as $i => $rid) $st->execute([$i + 1, $rid]);
    $pdo->commit();
    return ['success' => true];
}

// ===============================================================
// رویدادها
// ===============================================================
function get_event_or_fail(int $eventId): array
{
    $ev = q_one('SELECT * FROM events WHERE id = ?', [$eventId]);
    if (!$ev) throw new ApiError('رویداد یافت نشد.', 404);
    return $ev;
}

function individual_qty(int $guests): int
{
    return $guests > 0 ? $guests : 1;
}

function line_total(?float $unit, int $qty): ?float
{
    return $unit === null ? null : round($unit * $qty, 2);
}

/** اعتبارسنجی مشترک فیلدهای مکان/تعداد/زمان */
function event_core_fields(array $in): array
{
    $venueId = in_int($in, 'venue_id', 1, null, 'مکان');
    if ($venueId !== null && !q_val('SELECT id FROM venues WHERE id = ?', [$venueId])) throw new ApiError('مکان انتخاب‌شده وجود ندارد.');
    $guests = in_int($in, 'guest_count', 0, 1000000, 'تعداد مهمانان') ?? 0;
    $start = in_datetime($in, 'start_date', 'تاریخ شروع');
    $end = in_datetime($in, 'end_date', 'تاریخ پایان');
    if ($start && $end && $end < $start) throw new ApiError('تاریخ پایان رویداد نمی‌تواند قبل از تاریخ شروع باشد.');
    return [$venueId, $guests, $start, $end];
}

function h_create_event(array $in): array
{
    $title = in_str($in, 'title', 255, true, 'نام رویداد');
    $orgId = in_int($in, 'org_id', 1, null, 'سازمان');
    if ($orgId !== null && !q_val('SELECT id FROM organizations WHERE id = ?', [$orgId])) throw new ApiError('سازمان انتخاب‌شده وجود ندارد.');
    [$venueId, $guests, $start, $end] = event_core_fields($in);

    $selected = is_array($in['selected_services'] ?? null) ? $in['selected_services'] : [];
    $pdo = db();
    $pdo->beginTransaction();
    q("INSERT INTO events (title, event_type, org_id, contact_name, venue_id, guest_count, start_date, end_date, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'draft')", [
        $title, in_str($in, 'event_type', 100), $orgId, in_str($in, 'contact_name', 100), $venueId, $guests, $start, $end,
    ]);
    $eventId = (int)$pdo->lastInsertId();
    log_action($eventId, 'پرونده رویداد ایجاد شد.');

    $insSvc = $pdo->prepare('INSERT INTO event_services (event_id, service_name, frozen_price, cost_type, unit_price, qty) VALUES (?, ?, ?, ?, ?, ?)');
    $insTask = $pdo->prepare('INSERT INTO event_tasks (event_id, title, role_tag, timing_tag, depends_on_id) VALUES (?, ?, ?, ?, ?)');
    $seen = [];
    foreach ($selected as $sel) {
        if (!is_array($sel)) continue;
        $svcId = in_id($sel, 'service_id', 'سرویس');
        $pkgIdx = in_int($sel, 'package_index', 0, null, 'پکیج') ?? 0;
        if (isset($seen[$svcId])) continue; // از هر سرویس فقط یک پکیج
        $seen[$svcId] = true;
        $svc = q_one('SELECT * FROM services WHERE id = ?', [$svcId]);
        if (!$svc) throw new ApiError('یکی از سرویس‌های انتخاب‌شده دیگر وجود ندارد. صفحه را بارگذاری مجدد کنید.');
        $pkgs = sanitize_packages(json_list($svc['packages']), false);
        if (!isset($pkgs[$pkgIdx])) throw new ApiError("پکیج انتخاب‌شده برای «{$svc['name']}» وجود ندارد. صفحه را بارگذاری مجدد کنید.");
        $pkg = $pkgs[$pkgIdx];

        $costType = $svc['cost_type'] === 'individual' ? 'individual' : 'cumulative';
        $qty = $costType === 'individual' ? individual_qty($guests) : 1;
        $unit = $pkg['price'];
        $insSvc->execute([$eventId, mb_substr($svc['name'] . ' - ' . $pkg['name'], 0, 100), line_total($unit, $qty), $costType, $unit, $qty]);

        $idsByTitle = []; // پیش‌نیازها فقط داخل همین پکیج جستجو می‌شوند
        foreach ($pkg['tasks'] as $t) {
            $depId = ($t['dep'] !== '' && isset($idsByTitle[$t['dep']])) ? $idsByTitle[$t['dep']] : null;
            $insTask->execute([$eventId, $t['title'], $t['role'], $t['timing'], $depId]);
            if (!isset($idsByTitle[$t['title']])) $idsByTitle[$t['title']] = (int)$pdo->lastInsertId();
        }
    }
    $pdo->commit();
    return ['success' => true, 'id' => $eventId];
}

function h_update_event_details(array $in): array
{
    $eventId = in_id($in, 'event_id', 'رویداد');
    $ev = get_event_or_fail($eventId);
    [$venueId, $guests, $start, $end] = event_core_fields($in);
    $pdo = db();
    $pdo->beginTransaction();
    q('UPDATE events SET venue_id = ?, guest_count = ?, start_date = ?, end_date = ? WHERE id = ?', [$venueId, $guests, $start, $end, $eventId]);
    $qty = individual_qty($guests);
    q("UPDATE event_services SET qty = ?, frozen_price = CASE WHEN unit_price IS NULL THEN NULL ELSE unit_price * ? END WHERE event_id = ? AND cost_type = 'individual'", [$qty, $qty, $eventId]);

    $changes = [];
    if ((int)$ev['guest_count'] !== $guests) $changes[] = "تعداد مهمانان از {$ev['guest_count']} به {$guests}";
    if ((int)$ev['venue_id'] !== (int)$venueId) $changes[] = 'مکان برگزاری';
    if ($ev['start_date'] !== $start || $ev['end_date'] !== $end) $changes[] = 'زمان‌بندی';
    log_action($eventId, $changes ? 'اطلاعات پایه رویداد ویرایش شد: ' . implode('، ', $changes) . '.' : 'اطلاعات پایه رویداد بدون تغییر ذخیره شد.');
    $pdo->commit();
    return ['success' => true];
}

function h_get_events(): array
{
    return q_all('SELECT e.*, o.name AS org_name, o.logo AS org_logo, v.name AS venue_name FROM events e LEFT JOIN organizations o ON e.org_id = o.id LEFT JOIN venues v ON e.venue_id = v.id ORDER BY e.id DESC');
}

function h_get_event_detail(array $in): array
{
    $eventId = in_id($in, 'id', 'رویداد');
    $event = q_one('SELECT e.*, o.name AS org_name, o.logo AS org_logo, v.name AS venue_name FROM events e LEFT JOIN organizations o ON e.org_id = o.id LEFT JOIN venues v ON e.venue_id = v.id WHERE e.id = ?', [$eventId]);
    if (!$event) throw new ApiError('رویداد یافت نشد.', 404);
    return [
        'event' => $event,
        'tasks' => q_all('SELECT t.*, u.avatar AS assignee_avatar, u.full_name AS assignee_name, p.title AS dep_title, p.is_done AS dep_done FROM event_tasks t LEFT JOIN users u ON t.assignee_id = u.id LEFT JOIN event_tasks p ON p.id = t.depends_on_id WHERE t.event_id = ? ORDER BY t.id ASC', [$eventId]),
        'services' => q_all('SELECT * FROM event_services WHERE event_id = ? ORDER BY id ASC', [$eventId]),
        'logs' => q_all('SELECT * FROM event_logs WHERE event_id = ? ORDER BY id DESC', [$eventId]),
        'delegations' => q_all("SELECT d.*, uf.full_name AS from_name, ut.full_name AS to_name, t.title AS task_title FROM delegations d JOIN users uf ON d.from_user_id = uf.id JOIN users ut ON d.to_user_id = ut.id JOIN event_tasks t ON d.task_id = t.id WHERE d.event_id = ? AND d.status = 'pending' ORDER BY d.id ASC", [$eventId]),
    ];
}

function h_update_event_status(array $in): array
{
    $eventId = in_id($in, 'event_id', 'رویداد');
    $ev = get_event_or_fail($eventId);
    $status = (string)($in['status'] ?? '');
    if (!isset(EVENT_STATUSES[$status])) throw new ApiError('وضعیت نامعتبر است.');
    if ($ev['status'] === $status) return ['success' => true];
    q('UPDATE events SET status = ? WHERE id = ?', [$status, $eventId]);
    log_action($eventId, 'وضعیت رویداد از «' . (EVENT_STATUSES[$ev['status']] ?? $ev['status']) . '» به «' . EVENT_STATUSES[$status] . '» تغییر یافت.');
    return ['success' => true];
}

// ===============================================================
// وظایف
// ===============================================================
/** وظایف کاربر جاری (فقط وظایف خودش؛ وضعیت پیش‌نیاز از سمت سرور محاسبه می‌شود) */
function h_get_my_tasks(array $in, array $user): array
{
    $rows = q_all('SELECT t.id, t.event_id, t.title, t.role_tag, t.timing_tag, t.is_done, t.has_issue, t.issue_note, t.depends_on_id, p.title AS dep_title, p.is_done AS dep_done,
            e.title AS event_title, e.start_date, e.end_date, e.status AS event_status, v.name AS venue_name, o.logo AS org_logo,
            (SELECT COUNT(*) FROM delegations d WHERE d.task_id = t.id AND d.status = \'pending\') AS pending_delegation
        FROM event_tasks t
        JOIN events e ON e.id = t.event_id
        LEFT JOIN venues v ON v.id = e.venue_id
        LEFT JOIN organizations o ON o.id = e.org_id
        LEFT JOIN event_tasks p ON p.id = t.depends_on_id
        WHERE t.assignee_id = ?
        ORDER BY e.id DESC, t.id ASC', [$user['id']]);
    $groups = [];
    foreach ($rows as $r) {
        $eid = (int)$r['event_id'];
        if (!isset($groups[$eid])) {
            $groups[$eid] = ['event' => [
                'id' => $eid, 'title' => $r['event_title'], 'start_date' => $r['start_date'], 'end_date' => $r['end_date'],
                'status' => $r['event_status'], 'venue_name' => $r['venue_name'], 'org_logo' => $r['org_logo'],
            ], 'tasks' => []];
        }
        foreach (['event_title', 'start_date', 'end_date', 'event_status', 'venue_name', 'org_logo'] as $k) unset($r[$k]);
        $groups[$eid]['tasks'][] = $r;
    }
    return array_values($groups);
}

function task_with_event(int $taskId): array
{
    $t = q_one('SELECT t.*, p.is_done AS dep_done, p.title AS dep_title FROM event_tasks t LEFT JOIN event_tasks p ON p.id = t.depends_on_id WHERE t.id = ?', [$taskId]);
    if (!$t) throw new ApiError('وظیفه یافت نشد.', 404);
    return $t;
}

function staff_user_or_fail(int $id): array
{
    $u = q_one('SELECT id, full_name, is_shadow FROM users WHERE id = ? AND ' . staff_role_sql(), [$id]);
    if (!$u) throw new ApiError('همکار انتخاب‌شده یافت نشد.');
    return $u;
}

function h_update_task(array $in, array $user): array
{
    $task = task_with_event(in_id($in, 'task_id', 'وظیفه'));
    $eventId = (int)$task['event_id'];
    $isOwner = (int)$task['assignee_id'] === $user['id'];
    if (!$user['is_admin'] && !$isOwner) throw new ApiError('این وظیفه به شما تعلق ندارد.', 403);
    $title = $task['title'];

    if (array_key_exists('assignee_id', $in)) {
        if (!$user['is_admin']) throw new ApiError('فقط مدیر می‌تواند متصدی وظیفه را تغییر دهد.', 403);
        $aid = in_int($in, 'assignee_id', 1, null, 'متصدی');
        $name = $aid ? staff_user_or_fail($aid)['full_name'] : null;
        q('UPDATE event_tasks SET assignee_id = ? WHERE id = ?', [$aid, $task['id']]);
        log_action($eventId, $name ? "متصدی وظیفه «{$title}» به «{$name}» تغییر کرد." : "متصدی وظیفه «{$title}» حذف شد.");
    } elseif (array_key_exists('is_done', $in)) {
        $done = in_bool($in, 'is_done');
        if ($done && $task['depends_on_id'] && (int)$task['dep_done'] !== 1) {
            throw new ApiError("این تسک قفل است و باید منتظر انجام پیش‌نیاز آن («{$task['dep_title']}») باشید!");
        }
        q('UPDATE event_tasks SET is_done = ? WHERE id = ?', [$done ? 1 : 0, $task['id']]);
        log_action($eventId, $done ? "وظیفه «{$title}» انجام شد." : "وظیفه «{$title}» از حالت انجام‌شده خارج شد.");
    } elseif (array_key_exists('has_issue', $in)) {
        $has = in_bool($in, 'has_issue');
        $note = $has ? in_str($in, 'issue_note', 1000, true, 'شرح مانع') : null;
        q('UPDATE event_tasks SET has_issue = ?, issue_note = ? WHERE id = ?', [$has ? 1 : 0, $note, $task['id']]);
        log_action($eventId, $has ? "برای وظیفه «{$title}» مانع اعلام شد: {$note}" : "مانع وظیفه «{$title}» برطرف شد.");
        if ($has) {
            $evTitle = (string)q_val('SELECT title FROM events WHERE id = ?', [$eventId]);
            notify(0, "گزارش مانع در رویداد «{$evTitle}» / وظیفه «{$title}» توسط {$user['full_name']}: {$note}", 'issue', $eventId);
        }
    } else {
        throw new ApiError('تغییری ارسال نشده است.');
    }
    return ['success' => true];
}

function h_assign_role(array $in): array
{
    $eventId = in_id($in, 'event_id', 'رویداد');
    get_event_or_fail($eventId);
    $role = in_str($in, 'role', 100, true, 'نقش');
    $aid = in_int($in, 'assignee_id', 1, null, 'متصدی');
    $name = $aid ? staff_user_or_fail($aid)['full_name'] : null;
    $n = q('UPDATE event_tasks SET assignee_id = ? WHERE event_id = ? AND role_tag = ?', [$aid, $eventId, $role])->rowCount();
    log_action($eventId, $name ? "تمام وظایف نقش «{$role}» به «{$name}» محول شد ({$n} وظیفه)." : "متصدی وظایف نقش «{$role}» حذف شد.");
    return ['success' => true];
}

function h_quick_replace(array $in): array
{
    $eventId = in_id($in, 'event_id', 'رویداد');
    get_event_or_fail($eventId);
    $old = staff_user_or_fail(in_id($in, 'old_user_id', 'همکار غایب'));
    $new = staff_user_or_fail(in_id($in, 'new_user_id', 'همکار جایگزین'));
    if ((int)$old['id'] === (int)$new['id']) throw new ApiError('همکار غایب و جایگزین نمی‌توانند یکسان باشند.');
    // فقط وظایف انجام‌نشده منتقل می‌شوند تا سابقه انجام کارها حفظ شود
    $n = q('UPDATE event_tasks SET assignee_id = ? WHERE event_id = ? AND assignee_id = ? AND is_done = 0', [$new['id'], $eventId, $old['id']])->rowCount();
    log_action($eventId, "جایگزینی سریع نیرو: {$n} وظیفه از «{$old['full_name']}» به «{$new['full_name']}» منتقل شد.");
    return ['success' => true, 'moved' => $n];
}

function h_add_quick_task(array $in): array
{
    $eventId = in_id($in, 'event_id', 'رویداد');
    get_event_or_fail($eventId);
    $title = in_str($in, 'title', 255, true, 'عنوان وظیفه');
    $timing = (string)($in['timing'] ?? '');
    q("INSERT INTO event_tasks (event_id, title, timing_tag, role_tag) VALUES (?, ?, ?, 'بدون پکیج')", [$eventId, $title, in_array($timing, TIMINGS, true) ? $timing : null]);
    log_action($eventId, "وظیفه آزاد «{$title}» افزوده شد.");
    return ['success' => true];
}

/** ویرایش عنوان، نقش و فاز یک وظیفه */
function h_update_task_info(array $in): array
{
    $task = task_with_event(in_id($in, 'task_id', 'وظیفه'));
    $title = in_str($in, 'title', 255, true, 'عنوان وظیفه');
    $role = in_str($in, 'role_tag', 100, false, 'نقش');
    $timing = (string)($in['timing_tag'] ?? '');
    $timing = in_array($timing, TIMINGS, true) ? $timing : null;
    q('UPDATE event_tasks SET title = ?, role_tag = ?, timing_tag = ? WHERE id = ?', [$title, $role !== '' ? $role : null, $timing, $task['id']]);
    $changes = [];
    if ($task['title'] !== $title) $changes[] = "عنوان به «{$title}»";
    if ((string)$task['role_tag'] !== $role) $changes[] = 'نقش';
    if ((string)$task['timing_tag'] !== (string)$timing) $changes[] = 'فاز';
    if ($changes) log_action((int)$task['event_id'], "وظیفه «{$task['title']}» ویرایش شد: " . implode('، ', $changes) . '.');
    return ['success' => true];
}

/** حذف وظیفه: وظایف وابسته آزاد و درخواست‌های واگذاری آن لغو می‌شوند */
function h_delete_task(array $in): array
{
    $task = task_with_event(in_id($in, 'task_id', 'وظیفه'));
    $pdo = db();
    $pdo->beginTransaction();
    q('UPDATE event_tasks SET depends_on_id = NULL WHERE depends_on_id = ?', [$task['id']]);
    foreach (q_all("SELECT id FROM delegations WHERE task_id = ? AND status = 'pending'", [$task['id']]) as $d) {
        q("UPDATE notifications SET is_read = 1 WHERE type = 'delegation' AND ref_id = ?", [$d['id']]);
    }
    q("UPDATE delegations SET status = 'cancelled' WHERE task_id = ? AND status = 'pending'", [$task['id']]);
    q('DELETE FROM event_tasks WHERE id = ?', [$task['id']]);
    log_action((int)$task['event_id'], "وظیفه «{$task['title']}» حذف شد.");
    $pdo->commit();
    return ['success' => true];
}

// ===============================================================
// مالی
// ===============================================================
function h_update_finance_item(array $in): array
{
    $row = q_one('SELECT * FROM event_services WHERE id = ?', [in_id($in, 'service_id', 'ردیف فاکتور')]);
    if (!$row) throw new ApiError('ردیف فاکتور یافت نشد.', 404);
    $qty = in_int($in, 'qty', 0, 1000000, 'تعداد') ?? 0;
    $unit = in_money($in, 'unit_price', 'فی');
    $name = array_key_exists('service_name', $in) ? in_str($in, 'service_name', 100, true, 'شرح خدمات') : $row['service_name'];
    q('UPDATE event_services SET service_name = ?, qty = ?, unit_price = ?, frozen_price = ? WHERE id = ?', [$name, $qty, $unit, line_total($unit, $qty), $row['id']]);
    $rename = $name !== $row['service_name'] ? " (شرح جدید: «{$name}»)" : '';
    log_action((int)$row['event_id'], "ردیف فاکتور «{$row['service_name']}» ویرایش شد{$rename}.");
    return ['success' => true];
}

function h_delete_finance_item(array $in): array
{
    $row = q_one('SELECT * FROM event_services WHERE id = ?', [in_id($in, 'service_id', 'ردیف فاکتور')]);
    if (!$row) throw new ApiError('ردیف فاکتور یافت نشد.', 404);
    q('DELETE FROM event_services WHERE id = ?', [$row['id']]);
    log_action((int)$row['event_id'], "ردیف فاکتور «{$row['service_name']}» حذف شد.");
    return ['success' => true];
}

function h_update_finance_totals(array $in): array
{
    $eventId = in_id($in, 'event_id', 'رویداد');
    get_event_or_fail($eventId);
    $discount = in_money($in, 'discount', 'تخفیف') ?? 0;
    $tax = in_int($in, 'tax_percent', 0, 100, 'درصد مالیات') ?? 0;
    $deposit = in_money($in, 'deposit', 'بیعانه') ?? 0;
    q('UPDATE events SET discount = ?, tax_percent = ?, deposit = ? WHERE id = ?', [$discount, $tax, $deposit, $eventId]);
    log_action($eventId, 'ضرایب فاکتور نهایی (تخفیف/مالیات/بیعانه) به‌روزرسانی شد.');
    return ['success' => true];
}

function h_add_adhoc_service(array $in): array
{
    $eventId = in_id($in, 'event_id', 'رویداد');
    get_event_or_fail($eventId);
    $name = in_str($in, 'name', 100, true, 'نام سرویس');
    $price = in_money($in, 'price', 'مبلغ');
    q("INSERT INTO event_services (event_id, service_name, frozen_price, cost_type, unit_price, qty) VALUES (?, ?, ?, 'cumulative', ?, 1)", [$eventId, $name, $price, $price]);
    log_action($eventId, "سرویس درخواستی «{$name}» به فاکتور اضافه شد.");
    return ['success' => true];
}

// ===============================================================
// واگذاری و اعلان‌ها
// ===============================================================
function h_request_delegation(array $in, array $user): array
{
    if ((int)$user['can_delegate'] !== 1) throw new ApiError('شما مجوز واگذاری وظیفه ندارید.', 403);
    $task = task_with_event(in_id($in, 'task_id', 'وظیفه'));
    if ((int)$task['assignee_id'] !== $user['id']) throw new ApiError('فقط وظایف خودتان را می‌توانید واگذار کنید.', 403);
    if ((int)$task['is_done'] === 1) throw new ApiError('وظیفه انجام‌شده قابل واگذاری نیست.');
    $to = staff_user_or_fail(in_id($in, 'to_user_id', 'همکار جایگزین'));
    if ((int)$to['id'] === $user['id']) throw new ApiError('نمی‌توانید وظیفه را به خودتان واگذار کنید.');
    if ((int)q_val("SELECT COUNT(*) FROM delegations WHERE task_id = ? AND status = 'pending'", [$task['id']]) > 0) {
        throw new ApiError('برای این وظیفه یک درخواست واگذاری در انتظار بررسی وجود دارد.');
    }
    q('INSERT INTO delegations (task_id, event_id, from_user_id, to_user_id) VALUES (?, ?, ?, ?)', [$task['id'], $task['event_id'], $user['id'], $to['id']]);
    notify(0, 'SYSTEM_DELEGATION_REQUEST', 'delegation', (int)db()->lastInsertId());
    return ['success' => true];
}

function h_resolve_delegation(array $in): array
{
    $delId = in_id($in, 'delegation_id', 'درخواست واگذاری');
    $status = (string)($in['status'] ?? '');
    if (!in_array($status, ['approved', 'rejected'], true)) throw new ApiError('وضعیت نامعتبر است.');

    $pdo = db();
    $pdo->beginTransaction();
    $d = q_one('SELECT d.*, t.id AS task_exists, t.title AS task_title, t.assignee_id, t.is_done, u.id AS to_exists, u.full_name AS to_name FROM delegations d LEFT JOIN event_tasks t ON t.id = d.task_id LEFT JOIN users u ON u.id = d.to_user_id WHERE d.id = ? FOR UPDATE', [$delId]);
    if (!$d) throw new ApiError('درخواست واگذاری یافت نشد.', 404);
    q("UPDATE notifications SET is_read = 1 WHERE type = 'delegation' AND ref_id = ?", [$delId]);
    if ($d['status'] !== 'pending') {
        $pdo->commit();
        throw new ApiError('این درخواست قبلاً بررسی شده است.');
    }
    if (!$d['task_exists'] || !$d['to_exists']) {
        q("UPDATE delegations SET status = 'cancelled' WHERE id = ?", [$delId]);
        $pdo->commit();
        throw new ApiError('وظیفه یا همکار مقصد این درخواست حذف شده و درخواست لغو شد.');
    }
    $eventId = (int)$d['event_id'];
    $title = $d['task_title'];
    if ($status === 'approved' && ((int)$d['assignee_id'] !== (int)$d['from_user_id'] || (int)$d['is_done'] === 1)) {
        q("UPDATE delegations SET status = 'cancelled' WHERE id = ?", [$delId]);
        $pdo->commit();
        throw new ApiError('این وظیفه در این فاصله تغییر کرده (جابجا یا انجام شده) و درخواست واگذاری لغو شد.');
    }
    q('UPDATE delegations SET status = ? WHERE id = ?', [$status, $delId]);
    if ($status === 'approved') {
        q('UPDATE event_tasks SET assignee_id = ? WHERE id = ?', [$d['to_user_id'], $d['task_id']]);
        notify((int)$d['from_user_id'], "مدیریت با درخواست واگذاری وظیفه «{$title}» موافقت کرد.", 'success', $eventId);
        notify((int)$d['to_user_id'], "وظیفه «{$title}» از سوی مدیریت به شما محول شد.", 'info', $eventId);
        log_action($eventId, "وظیفه «{$title}» از طریق سیستم واگذاری به «{$d['to_name']}» منتقل شد.");
    } else {
        notify((int)$d['from_user_id'], "مدیریت با واگذاری وظیفه «{$title}» مخالفت کرد.", 'error', $eventId);
        log_action($eventId, "درخواست واگذاری وظیفه «{$title}» رد شد.");
    }
    $pdo->commit();
    return ['success' => true];
}

function h_get_notifications(array $in, array $user): array
{
    $where = $user['is_admin'] ? '(n.user_id = ? OR n.user_id = 0)' : 'n.user_id = ?';
    $rows = q_all("SELECT n.*, d.task_id, d.event_id AS deleg_event_id, d.to_user_id, d.from_user_id, d.status AS deleg_status, t.title AS task_title, u_from.full_name AS from_name, u_to.full_name AS to_name
        FROM notifications n
        LEFT JOIN delegations d ON n.ref_id = d.id AND n.type = 'delegation'
        LEFT JOIN event_tasks t ON d.task_id = t.id
        LEFT JOIN users u_from ON d.from_user_id = u_from.id
        LEFT JOIN users u_to ON d.to_user_id = u_to.id
        WHERE $where AND n.is_read = 0
        ORDER BY n.id DESC LIMIT 100", [$user['id']]);
    foreach ($rows as &$r) {
        if ($r['type'] === 'delegation') {
            $r['message'] = $r['from_name']
                ? "همکار ({$r['from_name']}) درخواست واگذاری وظیفه «{$r['task_title']}» را به ({$r['to_name']}) دارد."
                : 'درخواست واگذاری نامعتبر (کاربر یا وظیفه حذف شده است).';
        }
    }
    unset($r);
    return $rows;
}

function h_mark_notif_read(array $in, array $user): array
{
    $id = in_id($in, 'id', 'اعلان');
    $sql = $user['is_admin'] ? 'UPDATE notifications SET is_read = 1 WHERE id = ? AND (user_id = ? OR user_id = 0)' : 'UPDATE notifications SET is_read = 1 WHERE id = ? AND user_id = ?';
    q($sql, [$id, $user['id']]);
    return ['success' => true];
}

function h_mark_all_notifs_read(array $in, array $user): array
{
    // درخواست‌های واگذاری در انتظار، فقط با تایید/رد بسته می‌شوند
    $sql = $user['is_admin']
        ? "UPDATE notifications SET is_read = 1 WHERE (user_id = ? OR user_id = 0) AND type <> 'delegation'"
        : 'UPDATE notifications SET is_read = 1 WHERE user_id = ?';
    q($sql, [$user['id']]);
    return ['success' => true];
}
