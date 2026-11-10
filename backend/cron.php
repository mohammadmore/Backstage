<?php
// ---------------------------------------------------------------
// کارهای زمان‌بندی‌شده — هر ۱۵ دقیقه از cPanel → Cron Jobs اجرا شود:
//   */15 * * * * php /home/USERNAME/public_html/event/cron.php >/dev/null 2>&1
// از وب قابل اجرا نیست (.htaccess و بررسی CLI)
// ---------------------------------------------------------------
declare(strict_types=1);
if (PHP_SAPI !== 'cli') { http_response_code(403); exit('CLI only'); }

define('EVENT_APP', true);
require __DIR__ . '/inc/bootstrap.php';
require __DIR__ . '/inc/migrations.php';
require __DIR__ . '/inc/access.php';
require __DIR__ . '/inc/sms.php';
require __DIR__ . '/inc/totp.php';
$ROUTES = [];
foreach (glob(__DIR__ . '/inc/modules/*.php') as $__m) require $__m;

date_default_timezone_set((string)app_config()['timezone']);
configure_error_log();
run_migrations();

$out = fn(string $m) => print('[' . date('Y-m-d H:i:s') . "] $m\n");

/** هر کار فقط یک بار برای هر مرجع انجام می‌شود */
function once(string $kind, string $ref): bool
{
    return q('INSERT IGNORE INTO reminders_sent (kind, ref) VALUES (?, ?)', [$kind, $ref])->rowCount() === 1;
}

try {
    // ۱) یادآوری روز قبل از رویداد (از ساعت تعیین‌شده در تنظیمات)
    if ((int)date('G') >= (int)get_setting('reminder_hour', '18')) {
        $tomorrow = date('Y-m-d', strtotime('+1 day'));
        $rows = q_all("SELECT e.id AS event_id, e.title, e.start_date, t.assignee_id, COUNT(*) AS cnt
            FROM events e JOIN event_tasks t ON t.event_id = e.id
            WHERE e.is_template = 0 AND e.status <> 'completed' AND e.archived_at IS NULL AND DATE(e.start_date) = ? AND t.assignee_id IS NOT NULL AND t.is_done = 0
            GROUP BY e.id, t.assignee_id", [$tomorrow]);
        $n = 0;
        foreach ($rows as $r) {
            if (!once('dayb', $r['event_id'] . ':' . $r['assignee_id'])) continue;
            $time = date('H:i', strtotime($r['start_date']));
            $msg = "یادآوری: فردا ساعت {$time} رویداد «{$r['title']}» را دارید ({$r['cnt']} کار باقیمانده).";
            notify((int)$r['assignee_id'], $msg, 'info', (int)$r['event_id']);
            if (sms_enabled('reminder')) sms_to_user((int)$r['assignee_id'], $msg);
            $n++;
        }
        if ($n) $out("reminders: $n");
    }

    // ۲) وظایف عقب‌افتاده: اعلان به متصدی (یک بار برای هر وظیفه) + خلاصه روزانه به مدیران
    $over = q_all("SELECT t.id, t.title, t.assignee_id, t.event_id, e.title AS event_title FROM event_tasks t JOIN events e ON e.id = t.event_id
        WHERE t.is_done = 0 AND t.due_at IS NOT NULL AND t.due_at < NOW() AND e.is_template = 0 AND e.status <> 'completed' AND e.archived_at IS NULL");
    $byEvent = [];
    foreach ($over as $t) {
        $byEvent[(int)$t['event_id']][] = $t;
        if ($t['assignee_id'] && once('overdue', (string)$t['id'])) notify((int)$t['assignee_id'], "موعد وظیفه «{$t['title']}» در رویداد «{$t['event_title']}» گذشته است.", 'error', (int)$t['event_id']);
    }
    foreach ($byEvent as $eid => $list) {
        if (once('overdue_digest', date('Y-m-d') . ':' . $eid)) notify_event_managers($eid, count($list) . " وظیفه در رویداد «{$list[0]['event_title']}» از موعد گذشته است.", 'issue', $eid);
    }

    // ۳) پشتیبان‌گیری خودکار روزانه
    if (get_setting('backup_auto', '0') === '1' && once('backup', date('Y-m-d'))) $out('backup: ' . backup_make());

    // ۳-ب) بایگانی خودکار رویدادهای پایان‌یافته پس از N روز از تاریخ پایان (۰ = غیرفعال)
    $days = (int)get_setting('archive_after_days', '0');
    if ($days > 0) {
        $old = q_all("SELECT id FROM events WHERE is_template = 0 AND archived_at IS NULL AND status = 'completed'
            AND COALESCE(end_date, start_date) IS NOT NULL AND COALESCE(end_date, start_date) < (NOW() - INTERVAL $days DAY)");
        foreach ($old as $r) {
            q("UPDATE events SET archived_at = NOW(), archived_by = 'بایگانی خودکار' WHERE id = ?", [$r['id']]);
            log_action((int)$r['id'], "رویداد به‌صورت خودکار ({$days} روز پس از پایان) بایگانی شد.");
        }
        if ($old) $out('archived: ' . count($old));
    }

    // ۴) ارسال پیامک‌های صف
    $sent = sms_process_queue(100);
    if ($sent) $out("sms sent: $sent");

    // پاکسازی سوابق قدیمی
    q('DELETE FROM reminders_sent WHERE created_at < (NOW() - INTERVAL 60 DAY)');
    q("DELETE FROM sms_queue WHERE created_at < (NOW() - INTERVAL 90 DAY)");
    set_setting('cron_last_run', date('Y-m-d H:i:s'));
} catch (Throwable $e) {
    error_log('[cron] ' . $e->getMessage() . ' @ ' . $e->getFile() . ':' . $e->getLine());
    $out('ERROR ' . $e->getMessage());
    exit(1);
}
