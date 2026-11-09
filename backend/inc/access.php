<?php
declare(strict_types=1);

if (!defined('EVENT_APP')) { http_response_code(403); exit; }

// ---------------------------------------------------------------
// دسترسی سطح رویداد
//   read    : دیدن جزئیات
//   tasks   : مدیریت وظایف، تیم، مهمانان، پیوست‌ها، وضعیت
//   finance : فاکتور، پرداخت‌ها، هزینه نیروها
// مدیر کل: همه رویدادها | مدیر پروژه: فقط رویدادهایی که مدیرشان است
// حسابدار: دیدن همه + بخش مالی
// ---------------------------------------------------------------
function event_access(array $user, int $eventId, string $mode = 'read'): array
{
    $ev = q_one('SELECT * FROM events WHERE id = ?', [$eventId]);
    if (!$ev) throw new ApiError('رویداد یافت نشد.', 404);
    if (!can_event($user, $ev, $mode)) {
        throw new ApiError($user['role'] === 'manager' ? 'این رویداد به شما سپرده نشده است.' : 'شما به این بخش از رویداد دسترسی ندارید.', 403);
    }
    return $ev;
}

function can_event(array $user, array $ev, string $mode = 'read'): bool
{
    if ($user['is_admin']) return true;
    if ($user['role'] === 'manager') {
        if ((int)$ev['manager_id'] === (int)$user['id']) return true;
        return $mode === 'read' && (int)($ev['is_template'] ?? 0) === 1; // قالب‌ها برای همه مدیران قابل استفاده‌اند
    }
    if ($user['role'] === 'accountant') return in_array($mode, ['read', 'finance'], true);
    return false;
}

/** شرط SQL محدودکننده لیست رویدادها برای کاربر */
function event_scope_sql(array $user, string $alias = 'e'): array
{
    if ($user['perms']['all_events']) return ['1=1', []];
    if ($user['role'] === 'manager') return ["$alias.manager_id = ?", [$user['id']]];
    return ['1=0', []];
}

function assignable_sql(string $alias = ''): string
{
    $a = $alias ? "$alias." : '';
    return "{$a}role IN ('" . implode("','", ASSIGNABLE_ROLES) . "')";
}

/** آیا کاربر در این رویداد وظیفه‌ای دارد؟ (برای دسترسی کارمند به پذیرش مهمان و پیوست‌ها) */
function is_event_member(int $userId, int $eventId): bool
{
    return (int)q_val('SELECT COUNT(*) FROM event_tasks WHERE event_id = ? AND assignee_id = ?', [$eventId, $userId]) > 0;
}

// ---------------------------------------------------------------
// اعلان‌ها (داخل برنامه + پیامک)
// ---------------------------------------------------------------
/** مدیران کل (صندوق مشترک) + مدیر پروژه رویداد */
function notify_event_managers(int $eventId, string $msg, string $type = 'info', ?int $refId = null, ?string $smsKey = null): void
{
    notify(0, $msg, $type, $refId ?? $eventId);
    $mgr = (int)(q_val('SELECT manager_id FROM events WHERE id = ?', [$eventId]) ?? 0);
    if ($mgr) notify($mgr, $msg, $type, $refId ?? $eventId);
    if ($smsKey && sms_enabled($smsKey)) {
        $ids = array_map('intval', array_column(q_all("SELECT id FROM users WHERE role IN ('" . implode("','", ADMIN_ROLES) . "') AND phone <> ''"), 'id'));
        if ($mgr) $ids[] = $mgr;
        foreach (array_unique($ids) as $uid) sms_to_user($uid, $msg);
    }
}

/** اطلاع‌رسانی تخصیص وظیفه به متصدی جدید */
function notify_assignment(int $userId, int $eventId, array $taskTitles): void
{
    if (!$userId || !$taskTitles) return;
    $me = current_user();
    if ($me && (int)$me['id'] === $userId) return;
    $ev = (string)q_val('SELECT title FROM events WHERE id = ?', [$eventId]);
    $n = count($taskTitles);
    $msg = $n === 1
        ? "وظیفه «{$taskTitles[0]}» در رویداد «{$ev}» به شما محول شد."
        : "{$n} وظیفه در رویداد «{$ev}» به شما محول شد.";
    notify($userId, $msg, 'info', $eventId);
    if (sms_enabled('assign')) sms_to_user($userId, $msg);
}

// ---------------------------------------------------------------
// موعد وظایف
// ---------------------------------------------------------------
function due_from_offset(?string $start, ?int $offsetMin): ?string
{
    if (!$start || $offsetMin === null) return null;
    return date('Y-m-d H:i:s', strtotime($start) + $offsetMin * 60);
}

/** پس از تغییر زمان شروع رویداد، موعد وظایفی که نسبت به شروع تعریف شده‌اند جابجا می‌شوند */
function recompute_due_dates(int $eventId): void
{
    $start = q_val('SELECT start_date FROM events WHERE id = ?', [$eventId]);
    if ($start) {
        q('UPDATE event_tasks SET due_at = DATE_ADD(?, INTERVAL due_offset_min MINUTE) WHERE event_id = ? AND due_offset_min IS NOT NULL', [$start, $eventId]);
    } else {
        q('UPDATE event_tasks SET due_at = NULL WHERE event_id = ? AND due_offset_min IS NOT NULL', [$eventId]);
    }
}

// ---------------------------------------------------------------
// خلاصه مالی رویداد
// ---------------------------------------------------------------
function event_finance(int $eventId, ?array $ev = null): array
{
    $ev = $ev ?? q_one('SELECT discount, tax_percent FROM events WHERE id = ?', [$eventId]);
    $sub = (float)(q_val('SELECT COALESCE(SUM(frozen_price), 0) FROM event_services WHERE event_id = ?', [$eventId]) ?? 0);
    $tbd = (int)q_val('SELECT COUNT(*) FROM event_services WHERE event_id = ? AND frozen_price IS NULL', [$eventId]);
    $discount = (float)($ev['discount'] ?? 0);
    $tax = (($sub - $discount) * (int)($ev['tax_percent'] ?? 0)) / 100;
    $total = round($sub - $discount + $tax);
    $paid = (float)(q_val('SELECT COALESCE(SUM(amount), 0) FROM payments WHERE event_id = ?', [$eventId]) ?? 0);
    $fees = (float)(q_val('SELECT COALESCE(SUM(amount), 0) FROM event_staff_fees WHERE event_id = ?', [$eventId]) ?? 0);
    return [
        'subtotal' => $sub, 'discount' => $discount, 'tax' => round($tax), 'total' => $total,
        'paid' => $paid, 'remaining' => $total - $paid, 'fees' => $fees, 'profit' => $total - $fees, 'tbd' => $tbd,
        'pay_status' => $total <= 0 ? 'none' : ($paid >= $total ? ($paid > $total ? 'over' : 'settled') : ($paid > 0 ? 'partial' : 'unpaid')),
    ];
}

/** بازه زمانی رویداد برای بررسی تداخل (اگر پایان ندارد ۱۲ ساعت فرض می‌شود) */
function event_window(?string $start, ?string $end): ?array
{
    if (!$start) return null;
    $s = strtotime($start);
    $e = $end ? strtotime($end) : $s + 12 * 3600;
    return [$s, max($e, $s + 60)];
}

/** تداخل مکان و نیرو با سایر رویدادها */
function event_conflicts(int $eventId): array
{
    $ev = q_one('SELECT id, venue_id, start_date, end_date FROM events WHERE id = ?', [$eventId]);
    if (!$ev || !($w = event_window($ev['start_date'], $ev['end_date']))) return ['venue' => [], 'staff' => [], 'busy' => []];
    $from = date('Y-m-d H:i:s', $w[0] - 12 * 3600); $to = date('Y-m-d H:i:s', $w[1]);
    $others = q_all("SELECT e.id, e.title, e.venue_id, e.start_date, e.end_date, v.name AS venue_name FROM events e LEFT JOIN venues v ON v.id = e.venue_id
        WHERE e.id <> ? AND e.is_template = 0 AND e.status <> 'completed' AND e.start_date IS NOT NULL AND e.start_date < ? AND COALESCE(e.end_date, DATE_ADD(e.start_date, INTERVAL 12 HOUR)) > ?", [$eventId, $to, $from]);
    $venue = []; $overIds = [];
    foreach ($others as $o) {
        $ow = event_window($o['start_date'], $o['end_date']);
        if (!$ow || $ow[0] >= $w[1] || $ow[1] <= $w[0]) continue;
        $overIds[(int)$o['id']] = $o;
        if ($ev['venue_id'] && (int)$o['venue_id'] === (int)$ev['venue_id']) $venue[] = ['event_id' => (int)$o['id'], 'title' => $o['title'], 'venue_name' => $o['venue_name'], 'start_date' => $o['start_date'], 'end_date' => $o['end_date']];
    }
    $busy = [];
    if ($overIds) {
        $in = implode(',', array_map('intval', array_keys($overIds)));
        foreach (q_all("SELECT DISTINCT t.assignee_id, t.event_id FROM event_tasks t WHERE t.assignee_id IS NOT NULL AND t.is_done = 0 AND t.event_id IN ($in)") as $r) {
            $busy[(int)$r['assignee_id']][] = $overIds[(int)$r['event_id']]['title'];
        }
    }
    $mine = array_map('intval', array_column(q_all('SELECT DISTINCT assignee_id FROM event_tasks WHERE event_id = ? AND assignee_id IS NOT NULL AND is_done = 0', [$eventId]), 'assignee_id'));
    $staff = [];
    foreach ($mine as $uid) if (isset($busy[$uid])) $staff[] = ['user_id' => $uid, 'full_name' => (string)q_val('SELECT full_name FROM users WHERE id = ?', [$uid]), 'events' => array_values(array_unique($busy[$uid]))];
    foreach ($busy as $k => $v) $busy[$k] = array_values(array_unique($v));
    return ['venue' => $venue, 'staff' => $staff, 'busy' => (object)$busy];
}
