<?php
declare(strict_types=1);

if (!defined('EVENT_APP')) { http_response_code(403); exit; }

const SCHEMA_VERSION = 4;

/**
 * مهاجرت نسخه‌بندی‌شده دیتابیس.
 * فقط زمانی اجرا می‌شود که نسخه ذخیره‌شده کمتر از SCHEMA_VERSION باشد
 * (به‌جای اجرای ده‌ها دستور CREATE/ALTER در هر درخواست).
 */
function run_migrations(): void
{
    $pdo = db();
    $pdo->exec("CREATE TABLE IF NOT EXISTS `schema_meta` (`k` varchar(50) NOT NULL, `v` varchar(255) NOT NULL, PRIMARY KEY (`k`)) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");
    $version = (int)(q_val("SELECT v FROM schema_meta WHERE k = 'version'") ?? 0);
    if ($version >= SCHEMA_VERSION) return;

    // جلوگیری از اجرای همزمان مهاجرت توسط دو درخواست
    if ((int)q_val("SELECT GET_LOCK('event_master_migrate', 30)") !== 1) {
        throw new ApiError('سیستم در حال به‌روزرسانی است. چند لحظه دیگر تلاش کنید.', 503);
    }
    try {
        $version = (int)(q_val("SELECT v FROM schema_meta WHERE k = 'version'") ?? 0);
        $steps = [1 => 'migration_1', 2 => 'migration_2', 3 => 'migration_3', 4 => 'migration_4'];
        foreach ($steps as $v => $fn) {
            if ($version < $v) {
                $fn($pdo);
                q("INSERT INTO schema_meta (k, v) VALUES ('version', ?) ON DUPLICATE KEY UPDATE v = VALUES(v)", [(string)$v]);
                $version = $v;
            }
        }
    } finally {
        q("SELECT RELEASE_LOCK('event_master_migrate')");
    }
}

function try_exec(PDO $pdo, string $sql): void
{
    try { $pdo->exec($sql); } catch (PDOException $e) { /* ستون/ایندکس از قبل وجود دارد */ }
}

/** ساختار اولیه (همان جداول نسخه قبلی) */
function migration_1(PDO $pdo): void
{
    $pdo->exec("CREATE TABLE IF NOT EXISTS `users` (`id` int(11) NOT NULL AUTO_INCREMENT, `username` varchar(50) NOT NULL, `password` varchar(255) NOT NULL, `full_name` varchar(100) NOT NULL, `role` varchar(50) DEFAULT 'staff', `is_shadow` tinyint(1) DEFAULT 0, `phone` varchar(20) DEFAULT NULL, `phone2` varchar(20) DEFAULT NULL, `skills` text DEFAULT NULL, `iban` varchar(50) DEFAULT NULL, `avatar` text DEFAULT NULL, `sort_order` int(11) DEFAULT 0, `rating_score` decimal(10,2) DEFAULT 5.0, `rating_count` int(11) DEFAULT 1, `can_delegate` tinyint(1) DEFAULT 0, `theme_pref` varchar(10) DEFAULT 'light', PRIMARY KEY (`id`)) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");
    $pdo->exec("CREATE TABLE IF NOT EXISTS `organizations` (`id` int(11) NOT NULL AUTO_INCREMENT, `name` varchar(100) NOT NULL, `national_id` varchar(50) DEFAULT NULL, `contacts` text DEFAULT NULL, `logo` text DEFAULT NULL, `sort_order` int(11) DEFAULT 0, PRIMARY KEY (`id`)) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");
    $pdo->exec("CREATE TABLE IF NOT EXISTS `venues` (`id` int(11) NOT NULL AUTO_INCREMENT, `name` varchar(100) NOT NULL, `capacity` int(11) DEFAULT 0, `address` text DEFAULT NULL, `gps_link` text DEFAULT NULL, `venue_type` varchar(50) DEFAULT NULL, `facilities` text DEFAULT NULL, `sort_order` int(11) DEFAULT 0, `rating_score` decimal(10,2) DEFAULT 5.0, `rating_count` int(11) DEFAULT 1, PRIMARY KEY (`id`)) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");
    $pdo->exec("CREATE TABLE IF NOT EXISTS `categories` (`id` int(11) NOT NULL AUTO_INCREMENT, `name` varchar(100) NOT NULL, `sort_order` int(11) DEFAULT 0, PRIMARY KEY (`id`)) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");
    $pdo->exec("CREATE TABLE IF NOT EXISTS `services` (`id` int(11) NOT NULL AUTO_INCREMENT, `name` varchar(100) NOT NULL, `category_id` int(11) DEFAULT NULL, `cost_type` varchar(50) DEFAULT 'cumulative', `base_price` decimal(15,2) DEFAULT NULL, `packages` text DEFAULT NULL, `sort_order` int(11) DEFAULT 0, PRIMARY KEY (`id`)) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");
    $pdo->exec("CREATE TABLE IF NOT EXISTS `event_logs` (`id` int(11) NOT NULL AUTO_INCREMENT, `event_id` int(11) NOT NULL, `user_name` varchar(100) DEFAULT NULL, `action` text NOT NULL, `created_at` timestamp DEFAULT CURRENT_TIMESTAMP, PRIMARY KEY (`id`)) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");
    $pdo->exec("CREATE TABLE IF NOT EXISTS `events` (`id` int(11) NOT NULL AUTO_INCREMENT, `title` varchar(255) NOT NULL, `event_type` varchar(100) DEFAULT NULL, `org_id` int(11) DEFAULT NULL, `venue_id` int(11) DEFAULT NULL, `guest_count` int(11) DEFAULT 0, `status` varchar(50) DEFAULT 'draft', `created_at` timestamp DEFAULT CURRENT_TIMESTAMP, `start_date` datetime DEFAULT NULL, `end_date` datetime DEFAULT NULL, `contact_name` varchar(100) DEFAULT NULL, `discount` decimal(15,2) DEFAULT 0, `tax_percent` int(11) DEFAULT 0, `deposit` decimal(15,2) DEFAULT 0, PRIMARY KEY (`id`)) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");
    $pdo->exec("CREATE TABLE IF NOT EXISTS `event_services` (`id` int(11) NOT NULL AUTO_INCREMENT, `event_id` int(11) NOT NULL, `service_name` varchar(100) NOT NULL, `frozen_price` decimal(15,2) DEFAULT NULL, `cost_type` varchar(50) NOT NULL, `unit_price` decimal(15,2) DEFAULT NULL, `qty` int(11) DEFAULT 1, PRIMARY KEY (`id`)) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");
    $pdo->exec("CREATE TABLE IF NOT EXISTS `event_tasks` (`id` int(11) NOT NULL AUTO_INCREMENT, `event_id` int(11) NOT NULL, `assignee_id` int(11) DEFAULT NULL, `title` varchar(255) NOT NULL, `role_tag` varchar(100) DEFAULT NULL, `timing_tag` varchar(100) DEFAULT NULL, `is_done` tinyint(1) DEFAULT 0, `has_issue` tinyint(1) DEFAULT 0, `issue_note` text DEFAULT NULL, `depends_on_id` int(11) DEFAULT NULL, PRIMARY KEY (`id`)) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");
    $pdo->exec("CREATE TABLE IF NOT EXISTS `delegations` (`id` int(11) NOT NULL AUTO_INCREMENT, `task_id` int(11) NOT NULL, `event_id` int(11) NOT NULL, `from_user_id` int(11) NOT NULL, `to_user_id` int(11) NOT NULL, `status` varchar(20) DEFAULT 'pending', `created_at` timestamp DEFAULT CURRENT_TIMESTAMP, PRIMARY KEY (`id`)) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");
    $pdo->exec("CREATE TABLE IF NOT EXISTS `notifications` (`id` int(11) NOT NULL AUTO_INCREMENT, `user_id` int(11) NOT NULL, `message` text NOT NULL, `type` varchar(50) DEFAULT 'info', `ref_id` int(11) DEFAULT NULL, `is_read` tinyint(1) DEFAULT 0, `created_at` timestamp DEFAULT CURRENT_TIMESTAMP, PRIMARY KEY (`id`)) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");

    // ستون‌هایی که در نسخه‌های قدیمی‌تر اضافه شده بودند
    try_exec($pdo, "ALTER TABLE `users` ADD COLUMN `can_delegate` tinyint(1) DEFAULT 0");
    try_exec($pdo, "ALTER TABLE `users` ADD COLUMN `theme_pref` varchar(10) DEFAULT 'light'");
    try_exec($pdo, "ALTER TABLE `event_services` ADD COLUMN `unit_price` decimal(15,2) DEFAULT NULL");
    try_exec($pdo, "ALTER TABLE `event_services` ADD COLUMN `qty` int(11) DEFAULT 1");
    try_exec($pdo, "ALTER TABLE `event_tasks` ADD COLUMN `depends_on_id` int(11) DEFAULT NULL");
}

/** امنیت، ایندکس‌ها و اصلاح داده‌های ناسازگار نسخه قبلی */
function migration_2(PDO $pdo): void
{
    // ایندکس‌ها
    try_exec($pdo, "ALTER TABLE `event_tasks` ADD INDEX `idx_tasks_event` (`event_id`)");
    try_exec($pdo, "ALTER TABLE `event_tasks` ADD INDEX `idx_tasks_assignee` (`assignee_id`)");
    try_exec($pdo, "ALTER TABLE `event_services` ADD INDEX `idx_services_event` (`event_id`)");
    try_exec($pdo, "ALTER TABLE `event_logs` ADD INDEX `idx_logs_event` (`event_id`)");
    try_exec($pdo, "ALTER TABLE `notifications` ADD INDEX `idx_notif_user` (`user_id`, `is_read`)");
    try_exec($pdo, "ALTER TABLE `delegations` ADD INDEX `idx_deleg_event` (`event_id`, `status`)");
    try_exec($pdo, "ALTER TABLE `delegations` ADD INDEX `idx_deleg_task` (`task_id`, `status`)");
    try_exec($pdo, "ALTER TABLE `events` ADD INDEX `idx_events_venue` (`venue_id`)");
    try_exec($pdo, "ALTER TABLE `events` ADD INDEX `idx_events_org` (`org_id`)");

    // جدول کنترل تلاش‌های ورود
    $pdo->exec("CREATE TABLE IF NOT EXISTS `login_attempts` (`id` int(11) NOT NULL AUTO_INCREMENT, `ip` varchar(45) NOT NULL, `username` varchar(50) DEFAULT NULL, `created_at` timestamp DEFAULT CURRENT_TIMESTAMP, PRIMARY KEY (`id`), KEY `idx_login_ip` (`ip`, `created_at`)) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");

    // ۱) هش کردن رمزهای متن ساده
    $upd = $pdo->prepare('UPDATE users SET password = ? WHERE id = ?');
    foreach ($pdo->query('SELECT id, password FROM users')->fetchAll() as $u) {
        $p = (string)$u['password'];
        if (password_get_info($p)['algo'] === null || password_get_info($p)['algoName'] === 'unknown') {
            $upd->execute([password_hash($p, PASSWORD_DEFAULT), $u['id']]);
        }
    }

    // ۲) یکتا کردن نام کاربری (فقط اگر داده تکراری وجود نداشته باشد؛ در غیر این صورت کنترل در سطح برنامه انجام می‌شود)
    $dups = (int)$pdo->query('SELECT COUNT(*) FROM (SELECT username FROM users GROUP BY username HAVING COUNT(*) > 1) d')->fetchColumn();
    if ($dups === 0) try_exec($pdo, "ALTER TABLE `users` ADD UNIQUE INDEX `uniq_username` (`username`)");

    // ۳) تبدیل زنجیره پیش‌نیاز قدیمی ("نقش|dep:عنوان") به depends_on_id
    //    پیش‌نیاز همیشه یک تسک قبلی از همان پکیج است و تسک‌های یک پکیج پشت سر هم درج شده‌اند،
    //    پس نزدیک‌ترین تسک قبلی با همان عنوان در همان رویداد، پیش‌نیاز صحیح است.
    $rows = $pdo->query("SELECT id, event_id, role_tag FROM event_tasks WHERE role_tag LIKE '%|dep:%'")->fetchAll();
    $findPrev = $pdo->prepare('SELECT id FROM event_tasks WHERE event_id = ? AND title = ? AND id < ? ORDER BY id DESC LIMIT 1');
    $findAny = $pdo->prepare('SELECT id FROM event_tasks WHERE event_id = ? AND title = ? AND id <> ? ORDER BY id ASC LIMIT 1');
    $fix = $pdo->prepare('UPDATE event_tasks SET role_tag = ?, depends_on_id = COALESCE(depends_on_id, ?) WHERE id = ?');
    foreach ($rows as $r) {
        [$role, $depTitle] = array_pad(explode('|dep:', (string)$r['role_tag'], 2), 2, '');
        $depId = null;
        if ($depTitle !== '') {
            $findPrev->execute([$r['event_id'], $depTitle, $r['id']]);
            $depId = $findPrev->fetchColumn() ?: null;
            if (!$depId) {
                $findAny->execute([$r['event_id'], $depTitle, $r['id']]);
                $depId = $findAny->fetchColumn() ?: null;
            }
        }
        $fix->execute([$role !== '' ? $role : null, $depId, $r['id']]);
    }

    // ۴) تبدیل فرمت پیش‌نیاز داخل پکیج‌های سرویس‌ها به فیلد مجزای dep
    $updSvc = $pdo->prepare('UPDATE services SET packages = ? WHERE id = ?');
    foreach ($pdo->query('SELECT id, packages FROM services')->fetchAll() as $s) {
        $pkgs = json_list($s['packages']);
        $changed = false;
        foreach ($pkgs as &$pkg) {
            if (!is_array($pkg) || empty($pkg['tasks']) || !is_array($pkg['tasks'])) continue;
            foreach ($pkg['tasks'] as &$t) {
                if (is_array($t) && isset($t['role']) && is_string($t['role']) && strpos($t['role'], '|dep:') !== false) {
                    [$t['role'], $t['dep']] = array_pad(explode('|dep:', $t['role'], 2), 2, '');
                    $changed = true;
                }
            }
            unset($t);
        }
        unset($pkg);
        if ($changed) $updSvc->execute([jenc($pkgs), $s['id']]);
    }

    // ۵) ردیف‌های دستی فاکتور فقط «مبلغ کل» داشتند و با ویرایش تعداد، مبلغشان پاک می‌شد
    $pdo->exec('UPDATE event_services SET qty = 1 WHERE qty IS NULL');
    $pdo->exec('UPDATE event_services SET unit_price = frozen_price / GREATEST(qty, 1) WHERE unit_price IS NULL AND frozen_price IS NOT NULL');

    // ۶) سرویس‌هایی که دسته‌بندی‌شان حذف شده بود از ویزارد ناپدید می‌شدند
    $pdo->exec('UPDATE services SET category_id = NULL WHERE category_id IS NOT NULL AND category_id NOT IN (SELECT id FROM categories)');
}

/** اجبار به تغییر رمزهای ضعیف و باطل کردن نشست‌ها پس از تغییر رمز */
function migration_3(PDO $pdo): void
{
    try_exec($pdo, "ALTER TABLE `users` ADD COLUMN `must_change_password` tinyint(1) NOT NULL DEFAULT 0");
    try_exec($pdo, "ALTER TABLE `users` ADD COLUMN `session_version` int(11) NOT NULL DEFAULT 0");
    // رمزهای ضعیف قدیمی (مثل 123456) هنگام اولین ورود تشخیص داده می‌شوند، چون اکنون فقط هش آن‌ها موجود است
}

/** قابلیت‌های نسخه ۳: تقویم، پرداخت‌ها، موعد تسک‌ها، قالب، پورتال، هزینه نیروها، امتیاز، پیوست‌ها، مهمانان، نقش‌ها، ۲FA */
function migration_4(PDO $pdo): void
{
    $T = 'ENGINE=InnoDB DEFAULT CHARSET=utf8mb4';
    $pdo->exec("CREATE TABLE IF NOT EXISTS `settings` (`k` varchar(64) NOT NULL, `v` text, PRIMARY KEY (`k`)) $T");
    $pdo->exec("CREATE TABLE IF NOT EXISTS `payments` (`id` int(11) NOT NULL AUTO_INCREMENT, `event_id` int(11) NOT NULL, `amount` decimal(15,2) NOT NULL, `paid_at` date NOT NULL, `method` varchar(50) DEFAULT NULL, `note` varchar(255) DEFAULT NULL, `created_by` varchar(100) DEFAULT NULL, `created_at` timestamp DEFAULT CURRENT_TIMESTAMP, PRIMARY KEY (`id`), KEY `idx_pay_event` (`event_id`)) $T");
    $pdo->exec("CREATE TABLE IF NOT EXISTS `event_staff_fees` (`id` int(11) NOT NULL AUTO_INCREMENT, `event_id` int(11) NOT NULL, `user_id` int(11) NOT NULL, `amount` decimal(15,2) NOT NULL DEFAULT 0, `note` varchar(255) DEFAULT NULL, `paid_at` date DEFAULT NULL, PRIMARY KEY (`id`), UNIQUE KEY `uniq_fee` (`event_id`, `user_id`), KEY `idx_fee_user` (`user_id`)) $T");
    $pdo->exec("CREATE TABLE IF NOT EXISTS `ratings` (`id` int(11) NOT NULL AUTO_INCREMENT, `event_id` int(11) NOT NULL, `target_type` varchar(10) NOT NULL, `target_id` int(11) NOT NULL, `score` tinyint(1) NOT NULL, `comment` varchar(500) DEFAULT NULL, `rated_by` varchar(100) DEFAULT NULL, `created_at` timestamp DEFAULT CURRENT_TIMESTAMP, PRIMARY KEY (`id`), UNIQUE KEY `uniq_rating` (`event_id`, `target_type`, `target_id`), KEY `idx_rating_target` (`target_type`, `target_id`)) $T");
    $pdo->exec("CREATE TABLE IF NOT EXISTS `attachments` (`id` int(11) NOT NULL AUTO_INCREMENT, `event_id` int(11) NOT NULL, `task_id` int(11) DEFAULT NULL, `stored_name` varchar(100) NOT NULL, `orig_name` varchar(255) NOT NULL, `mime` varchar(100) DEFAULT NULL, `size` int(11) DEFAULT 0, `uploaded_by` varchar(100) DEFAULT NULL, `uploader_id` int(11) DEFAULT NULL, `created_at` timestamp DEFAULT CURRENT_TIMESTAMP, PRIMARY KEY (`id`), KEY `idx_att_event` (`event_id`), KEY `idx_att_task` (`task_id`)) $T");
    $pdo->exec("CREATE TABLE IF NOT EXISTS `notes` (`id` int(11) NOT NULL AUTO_INCREMENT, `event_id` int(11) NOT NULL, `task_id` int(11) DEFAULT NULL, `user_id` int(11) DEFAULT NULL, `user_name` varchar(100) DEFAULT NULL, `body` text NOT NULL, `created_at` timestamp DEFAULT CURRENT_TIMESTAMP, PRIMARY KEY (`id`), KEY `idx_note_event` (`event_id`), KEY `idx_note_task` (`task_id`)) $T");
    $pdo->exec("CREATE TABLE IF NOT EXISTS `guests` (`id` int(11) NOT NULL AUTO_INCREMENT, `event_id` int(11) NOT NULL, `full_name` varchar(150) NOT NULL, `phone` varchar(20) DEFAULT NULL, `organization` varchar(150) DEFAULT NULL, `category` varchar(30) DEFAULT 'عادی', `qr_token` varchar(32) NOT NULL, `checked_in_at` datetime DEFAULT NULL, `checked_in_by` varchar(100) DEFAULT NULL, `created_at` timestamp DEFAULT CURRENT_TIMESTAMP, PRIMARY KEY (`id`), UNIQUE KEY `uniq_guest_token` (`qr_token`), KEY `idx_guest_event` (`event_id`)) $T");
    $pdo->exec("CREATE TABLE IF NOT EXISTS `sms_queue` (`id` int(11) NOT NULL AUTO_INCREMENT, `phone` varchar(20) NOT NULL, `message` text NOT NULL, `status` varchar(10) DEFAULT 'pending', `error` varchar(255) DEFAULT NULL, `attempts` int(11) DEFAULT 0, `created_at` timestamp DEFAULT CURRENT_TIMESTAMP, `sent_at` datetime DEFAULT NULL, PRIMARY KEY (`id`), KEY `idx_sms_status` (`status`)) $T");
    $pdo->exec("CREATE TABLE IF NOT EXISTS `reminders_sent` (`kind` varchar(20) NOT NULL, `ref` varchar(60) NOT NULL, `created_at` timestamp DEFAULT CURRENT_TIMESTAMP, PRIMARY KEY (`kind`, `ref`)) $T");

    try_exec($pdo, "ALTER TABLE `event_tasks` ADD COLUMN `due_at` datetime DEFAULT NULL");
    try_exec($pdo, "ALTER TABLE `event_tasks` ADD COLUMN `due_offset_min` int(11) DEFAULT NULL");
    try_exec($pdo, "ALTER TABLE `event_tasks` ADD INDEX `idx_tasks_due` (`due_at`, `is_done`)");
    try_exec($pdo, "ALTER TABLE `events` ADD COLUMN `manager_id` int(11) DEFAULT NULL");
    try_exec($pdo, "ALTER TABLE `events` ADD COLUMN `is_template` tinyint(1) NOT NULL DEFAULT 0");
    try_exec($pdo, "ALTER TABLE `events` ADD COLUMN `portal_token` varchar(64) DEFAULT NULL");
    try_exec($pdo, "ALTER TABLE `events` ADD COLUMN `client_approved_at` datetime DEFAULT NULL");
    try_exec($pdo, "ALTER TABLE `events` ADD COLUMN `client_approved_name` varchar(100) DEFAULT NULL");
    try_exec($pdo, "ALTER TABLE `events` ADD COLUMN `client_note` varchar(1000) DEFAULT NULL");
    try_exec($pdo, "ALTER TABLE `events` ADD INDEX `idx_events_manager` (`manager_id`)");
    try_exec($pdo, "ALTER TABLE `events` ADD UNIQUE INDEX `uniq_portal_token` (`portal_token`)");
    try_exec($pdo, "ALTER TABLE `users` ADD COLUMN `default_fee` decimal(15,2) DEFAULT NULL");
    try_exec($pdo, "ALTER TABLE `users` ADD COLUMN `totp_secret` varchar(64) DEFAULT NULL");
    try_exec($pdo, "ALTER TABLE `users` ADD COLUMN `totp_enabled` tinyint(1) NOT NULL DEFAULT 0");
    try_exec($pdo, "ALTER TABLE `users` ADD COLUMN `totp_last_step` bigint(20) DEFAULT NULL");
    try_exec($pdo, "ALTER TABLE `users` ADD COLUMN `totp_backup` text DEFAULT NULL");

    // بیعانه قبلی => اولین پرداخت ثبت‌شده
    $pdo->exec("INSERT INTO payments (event_id, amount, paid_at, method, note, created_by)
        SELECT id, deposit, DATE(created_at), 'بیعانه', 'منتقل‌شده از نسخه قبل', 'سیستم' FROM events
        WHERE deposit > 0 AND id NOT IN (SELECT event_id FROM payments)");

    // امتیاز پیش‌فرض ساختگی (۵ از ۱ رای) پاک می‌شود؛ امتیاز واقعی از جدول ratings محاسبه می‌شود
    $pdo->exec('UPDATE users SET rating_score = 0, rating_count = 0');
    $pdo->exec('UPDATE venues SET rating_score = 0, rating_count = 0');

    // موعد وظایف موجود بر اساس فاز
    $tasks = $pdo->query('SELECT t.id, t.timing_tag, e.start_date, e.end_date FROM event_tasks t JOIN events e ON e.id = t.event_id WHERE t.due_at IS NULL')->fetchAll();
    $upd = $pdo->prepare('UPDATE event_tasks SET due_offset_min = ?, due_at = ? WHERE id = ?');
    foreach ($tasks as $t) {
        $off = default_due_offset((string)$t['timing_tag'], $t['start_date'], $t['end_date']);
        if ($off === null) continue;
        $upd->execute([$off, $t['start_date'] ? date('Y-m-d H:i:s', strtotime($t['start_date']) + $off * 60) : null, $t['id']]);
    }
}

/** موعد پیش‌فرض (دقیقه نسبت به شروع) بر اساس فاز */
function default_due_offset(string $timing, ?string $start, ?string $end): ?int
{
    if (!array_key_exists($timing, TIMING_DEFAULT_OFFSET)) return null;
    $v = TIMING_DEFAULT_OFFSET[$timing];
    $len = ($start && $end) ? max(0, (int)((strtotime($end) - strtotime($start)) / 60)) : 8 * 60;
    if ($v === null) return $len;
    if ($v === 'end+3d') return $len + 3 * 1440;
    return (int)$v;
}
