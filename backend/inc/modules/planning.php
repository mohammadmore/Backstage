<?php
declare(strict_types=1);

if (!defined('EVENT_APP')) { http_response_code(403); exit; }

// ===============================================================
// تقویم، تداخل‌ها، وظایف عقب‌افتاده، کپی رویداد و قالب‌ها
// ===============================================================
$ROUTES += [
    'get_calendar'     => ['h_get_calendar', 'office', 'GET'],
    'check_conflicts'  => ['h_check_conflicts', 'office', 'GET'],
    'get_overdue'      => ['h_get_overdue', 'office', 'GET'],
    'duplicate_event'  => ['h_duplicate_event', 'planner', 'POST'],
    'delete_template'  => ['h_delete_template', 'planner', 'POST'],
    'delete_event'     => ['h_delete_event', 'admin', 'POST'],
];

/**
 * رویدادهای یک بازه برای تقویم + تداخل مکان و نیرو.
 * مدیر پروژه همه رویدادها را در تقویم می‌بیند (برای جلوگیری از تداخل) ولی فقط رویدادهای خودش قابل ورود است.
 */
function h_get_calendar(array $in, array $user): array
{
    $from = in_datetime(['v' => ($in['from'] ?? '') . (strlen((string)($in['from'] ?? '')) === 10 ? ' 00:00' : '')], 'v', 'شروع بازه') ?? date('Y-m-01 00:00:00');
    $to = in_datetime(['v' => ($in['to'] ?? '') . (strlen((string)($in['to'] ?? '')) === 10 ? ' 23:59' : '')], 'v', 'پایان بازه') ?? date('Y-m-t 23:59:59');
    $rows = q_all("SELECT e.id, e.title, e.status, e.start_date, e.end_date, e.venue_id, e.manager_id, e.guest_count, v.name AS venue_name, o.name AS org_name
        FROM events e LEFT JOIN venues v ON v.id = e.venue_id LEFT JOIN organizations o ON o.id = e.org_id
        WHERE e.is_template = 0 AND e.start_date IS NOT NULL AND e.start_date <= ? AND COALESCE(e.end_date, DATE_ADD(e.start_date, INTERVAL 12 HOUR)) >= ?
        ORDER BY e.start_date ASC", [$to, $from]);
    $ids = array_map(fn($r) => (int)$r['id'], $rows);
    $staffByEvent = [];
    if ($ids) {
        foreach (q_all('SELECT DISTINCT t.event_id, t.assignee_id, u.full_name FROM event_tasks t JOIN users u ON u.id = t.assignee_id WHERE t.is_done = 0 AND t.event_id IN (' . implode(',', $ids) . ')') as $r) {
            $staffByEvent[(int)$r['event_id']][] = ['id' => (int)$r['assignee_id'], 'name' => $r['full_name']];
        }
    }
    // تشخیص تداخل‌ها
    $win = [];
    foreach ($rows as $r) $win[(int)$r['id']] = event_window($r['start_date'], $r['end_date']);
    $conf = [];
    $n = count($rows);
    for ($i = 0; $i < $n; $i++) for ($j = $i + 1; $j < $n; $j++) {
        $a = $rows[$i]; $b = $rows[$j];
        if ($a['status'] === 'completed' || $b['status'] === 'completed') continue;
        $wa = $win[(int)$a['id']]; $wb = $win[(int)$b['id']];
        if ($wa[0] >= $wb[1] || $wb[0] >= $wa[1]) continue;
        if ($a['venue_id'] && (int)$a['venue_id'] === (int)$b['venue_id']) {
            $conf[(int)$a['id']][] = "هم‌زمانی مکان «{$a['venue_name']}» با «{$b['title']}»";
            $conf[(int)$b['id']][] = "هم‌زمانی مکان «{$b['venue_name']}» با «{$a['title']}»";
        }
        $sa = array_column($staffByEvent[(int)$a['id']] ?? [], 'name', 'id');
        $sb = array_column($staffByEvent[(int)$b['id']] ?? [], 'name', 'id');
        foreach (array_intersect_key($sa, $sb) as $name) {
            $conf[(int)$a['id']][] = "«{$name}» هم‌زمان در «{$b['title']}»";
            $conf[(int)$b['id']][] = "«{$name}» هم‌زمان در «{$a['title']}»";
        }
    }
    foreach ($rows as &$r) {
        $r['can_open'] = can_event($user, $r + ['is_template' => 0], 'read');
        $r['staff'] = $staffByEvent[(int)$r['id']] ?? [];
        $r['conflicts'] = $conf[(int)$r['id']] ?? [];
    }
    unset($r);
    return $rows;
}

/** بررسی تداخل مکان قبل از ثبت (ویزارد و ویرایش رویداد) */
function h_check_conflicts(array $in, array $user): array
{
    $start = in_datetime($in, 'start_date', 'تاریخ شروع');
    $end = in_datetime($in, 'end_date', 'تاریخ پایان');
    $venueId = in_int($in, 'venue_id', 1, null, 'مکان');
    $exclude = in_int($in, 'exclude_id', 1, null, 'رویداد') ?? 0;
    if (!$start) return ['venue' => [], 'venues_busy' => (object)[]];
    $w = event_window($start, $end);
    $rows = q_all("SELECT e.id, e.title, e.venue_id, e.start_date, e.end_date FROM events e
        WHERE e.id <> ? AND e.is_template = 0 AND e.status <> 'completed' AND e.venue_id IS NOT NULL AND e.start_date IS NOT NULL
          AND e.start_date < ? AND COALESCE(e.end_date, DATE_ADD(e.start_date, INTERVAL 12 HOUR)) > ?", [$exclude, date('Y-m-d H:i:s', $w[1]), date('Y-m-d H:i:s', $w[0])]);
    $busy = [];
    foreach ($rows as $r) $busy[(int)$r['venue_id']][] = $r['title'];
    return ['venue' => $venueId && isset($busy[$venueId]) ? $busy[$venueId] : [], 'venues_busy' => (object)$busy];
}

/** وظایف عقب‌افتاده (موعد گذشته و انجام‌نشده) */
function h_get_overdue(array $in, array $user): array
{
    [$where, $params] = event_scope_sql($user);
    return q_all("SELECT t.id, t.title, t.due_at, t.timing_tag, t.event_id, e.title AS event_title, u.full_name AS assignee_name
        FROM event_tasks t JOIN events e ON e.id = t.event_id LEFT JOIN users u ON u.id = t.assignee_id
        WHERE t.is_done = 0 AND t.due_at IS NOT NULL AND t.due_at < NOW() AND e.is_template = 0 AND e.status <> 'completed' AND $where
        ORDER BY t.due_at ASC LIMIT 300", $params);
}

/**
 * کپی رویداد یا ساخت قالب.
 * - as_template=1 : ذخیره رویداد به‌عنوان قالب (بدون تاریخ، بدون متصدی)
 * - از قالب یا رویداد دیگر : رویداد جدید با خدمات، قیمت‌ها و وظایف (و در صورت انتخاب، متصدی‌ها)
 */
function h_duplicate_event(array $in, array $user): array
{
    $srcId = in_id($in, 'event_id', 'رویداد مبدا');
    $src = event_access($user, $srcId, 'read');
    if ((int)$src['is_template'] !== 1) event_access($user, $srcId, 'tasks');
    $asTemplate = in_bool($in, 'as_template');
    $title = in_str($in, 'title', 255, true, 'عنوان');
    $start = $asTemplate ? null : in_datetime($in, 'start_date', 'تاریخ شروع');
    $end = $asTemplate ? null : in_datetime($in, 'end_date', 'تاریخ پایان');
    if ($start && $end && $end < $start) throw new ApiError('تاریخ پایان رویداد نمی‌تواند قبل از تاریخ شروع باشد.');
    $copyAssignees = !$asTemplate && in_bool($in, 'copy_assignees');
    $guests = $asTemplate ? (int)$src['guest_count'] : (in_int($in, 'guest_count', 0, 1000000, 'تعداد مهمانان') ?? (int)$src['guest_count']);
    $managerId = $user['role'] === 'manager' ? (int)$user['id'] : ($asTemplate ? null : ($src['manager_id'] !== null ? (int)$src['manager_id'] : null));
    $venueId = $asTemplate ? $src['venue_id'] : (array_key_exists('venue_id', $in) ? in_int($in, 'venue_id', 1, null, 'مکان') : $src['venue_id']);

    $pdo = db();
    $pdo->beginTransaction();
    q("INSERT INTO events (title, event_type, org_id, contact_name, venue_id, guest_count, start_date, end_date, status, discount, tax_percent, manager_id, is_template)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'draft', ?, ?, ?, ?)", [
        $title, $src['event_type'], $asTemplate ? null : $src['org_id'], $asTemplate ? null : $src['contact_name'], $venueId, $guests, $start, $end,
        $src['discount'], $src['tax_percent'], $managerId, $asTemplate ? 1 : 0,
    ]);
    $newId = (int)$pdo->lastInsertId();
    $qty = individual_qty($guests);
    foreach (q_all('SELECT * FROM event_services WHERE event_id = ? ORDER BY id', [$srcId]) as $sv) {
        $q = $sv['cost_type'] === 'individual' ? $qty : (int)$sv['qty'];
        $unit = $sv['unit_price'] !== null ? (float)$sv['unit_price'] : null;
        q('INSERT INTO event_services (event_id, service_name, frozen_price, cost_type, unit_price, qty) VALUES (?, ?, ?, ?, ?, ?)', [$newId, $sv['service_name'], line_total($unit, $q), $sv['cost_type'], $unit, $q]);
    }
    $map = [];
    $tasks = q_all('SELECT * FROM event_tasks WHERE event_id = ? ORDER BY id', [$srcId]);
    foreach ($tasks as $t) {
        $off = $t['due_offset_min'] !== null ? (int)$t['due_offset_min'] : null;
        q('INSERT INTO event_tasks (event_id, title, role_tag, timing_tag, assignee_id, due_offset_min, due_at) VALUES (?, ?, ?, ?, ?, ?, ?)', [
            $newId, $t['title'], $t['role_tag'], $t['timing_tag'], $copyAssignees ? $t['assignee_id'] : null, $off, due_from_offset($start, $off),
        ]);
        $map[(int)$t['id']] = (int)$pdo->lastInsertId();
    }
    foreach ($tasks as $t) {
        if ($t['depends_on_id'] && isset($map[(int)$t['depends_on_id']])) q('UPDATE event_tasks SET depends_on_id = ? WHERE id = ?', [$map[(int)$t['depends_on_id']], $map[(int)$t['id']]]);
    }
    log_action($newId, $asTemplate ? "قالب از روی رویداد «{$src['title']}» ساخته شد." : "پرونده از روی «{$src['title']}» کپی شد.");
    $pdo->commit();
    if ($copyAssignees) {
        $byUser = [];
        foreach ($tasks as $t) if ($t['assignee_id']) $byUser[(int)$t['assignee_id']][] = $t['title'];
        foreach ($byUser as $uid => $titles) notify_assignment($uid, $newId, $titles);
    }
    return ['success' => true, 'id' => $newId];
}

function h_delete_template(array $in, array $user): array
{
    $id = in_id($in, 'event_id', 'قالب');
    $ev = q_one('SELECT * FROM events WHERE id = ? AND is_template = 1', [$id]);
    if (!$ev) throw new ApiError('قالب یافت نشد.', 404);
    if (!$user['is_admin'] && (int)$ev['manager_id'] !== (int)$user['id']) throw new ApiError('فقط سازنده قالب یا مدیر کل می‌تواند آن را حذف کند.', 403);
    delete_event_cascade($id);
    return ['success' => true];
}

/** حذف کامل رویداد با همه داده‌های وابسته (وظایف، پرداخت‌ها، مهمانان، پیوست‌ها و ...) */
function delete_event_cascade(int $id): void
{
    $files = q_all('SELECT stored_name FROM attachments WHERE event_id = ?', [$id]);
    $delegIds = array_map('intval', array_column(q_all('SELECT id FROM delegations WHERE event_id = ?', [$id]), 'id'));
    $pdo = db();
    $pdo->beginTransaction();
    try {
        foreach (['event_services', 'event_tasks', 'event_logs', 'delegations', 'payments', 'event_staff_fees', 'ratings', 'attachments', 'notes', 'guests'] as $t) {
            q("DELETE FROM `$t` WHERE event_id = ?", [$id]);
        }
        q("DELETE FROM notifications WHERE type <> 'delegation' AND ref_id = ?", [$id]);
        if ($delegIds) {
            q("DELETE FROM notifications WHERE type = 'delegation' AND ref_id IN (" . implode(',', $delegIds) . ')');
        }
        q('DELETE FROM events WHERE id = ?', [$id]);
        $pdo->commit();
    } catch (Throwable $e) {
        $pdo->rollBack();
        throw $e;
    }
    // فایل‌ها پس از ثبت قطعی حذف می‌شوند
    foreach ($files as $f) @unlink(storage_dir('files') . '/' . basename($f['stored_name']));
}

/** حذف رویداد (فقط مدیر کل) — عنوان رویداد باید برای تایید عیناً وارد شود */
function h_delete_event(array $in, array $user): array
{
    $id = in_id($in, 'event_id', 'رویداد');
    $ev = q_one('SELECT id, title FROM events WHERE id = ? AND is_template = 0', [$id]);
    if (!$ev) throw new ApiError('رویداد یافت نشد.', 404);
    $typed = trim((string)($in['confirm_title'] ?? ''));
    if ($typed !== trim((string)$ev['title'])) throw new ApiError('عنوان واردشده با عنوان رویداد یکسان نیست؛ رویداد حذف نشد.');
    delete_event_cascade($id);
    error_log("event #{$id} «{$ev['title']}» deleted by {$user['username']}");
    return ['success' => true];
}
