<?php
declare(strict_types=1);

if (!defined('EVENT_APP')) { http_response_code(403); exit; }

const SCHEMA_VERSION = 3;

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
        $steps = [1 => 'migration_1', 2 => 'migration_2', 3 => 'migration_3'];
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
