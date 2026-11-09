<?php
declare(strict_types=1);

if (!defined('EVENT_APP')) { http_response_code(403); exit; }

// ===============================================================
// پرداخت‌ها و اقساط، دستمزد نیروها، تسویه، گزارش‌ها، امتیازدهی
// ===============================================================
$ROUTES += [
    'add_payment'      => ['h_add_payment', 'office', 'POST'],
    'delete_payment'   => ['h_delete_payment', 'office', 'POST'],
    'set_staff_fee'    => ['h_set_staff_fee', 'office', 'POST'],
    'fill_default_fees'=> ['h_fill_default_fees', 'office', 'POST'],
    'mark_fee_paid'    => ['h_mark_fee_paid', 'office', 'POST'],
    'delete_staff_fee' => ['h_delete_staff_fee', 'office', 'POST'],
    'get_payouts'      => ['h_get_payouts', 'office', 'GET'],
    'get_reports'      => ['h_get_reports', 'office', 'GET'],
    'rate'             => ['h_rate', 'planner', 'POST'],
];

function in_date(array $in, string $key, string $label): ?string
{
    $v = trim(to_en_digits((string)($in[$key] ?? '')));
    if ($v === '') return null;
    $v = substr(str_replace('T', ' ', $v), 0, 10);
    $d = DateTime::createFromFormat('!Y-m-d', $v);
    if (!$d || $d->format('Y-m-d') !== $v) throw new ApiError("$label نامعتبر است.");
    return $v;
}

// ---------- پرداخت‌ها ----------
function h_add_payment(array $in, array $user): array
{
    $eventId = in_id($in, 'event_id', 'رویداد');
    event_access($user, $eventId, 'finance');
    $amount = in_money($in, 'amount', 'مبلغ');
    if (!$amount || $amount <= 0) throw new ApiError('مبلغ پرداخت را وارد کنید.');
    $date = in_date($in, 'paid_at', 'تاریخ پرداخت') ?? date('Y-m-d');
    $method = in_str($in, 'method', 50, false, 'روش پرداخت');
    if ($method !== '' && !in_array($method, PAYMENT_METHODS, true)) $method = 'سایر';
    $note = in_str($in, 'note', 255, false, 'توضیح');
    q('INSERT INTO payments (event_id, amount, paid_at, method, note, created_by) VALUES (?, ?, ?, ?, ?, ?)', [$eventId, $amount, $date, $method ?: null, $note ?: null, $user['full_name']]);
    log_action($eventId, 'پرداخت ' . number_format($amount) . ' تومانی' . ($method ? " ($method)" : '') . ' ثبت شد.');
    return ['success' => true, 'fin' => event_finance($eventId)];
}

function h_delete_payment(array $in, array $user): array
{
    $p = q_one('SELECT * FROM payments WHERE id = ?', [in_id($in, 'id', 'پرداخت')]);
    if (!$p) throw new ApiError('پرداخت یافت نشد.', 404);
    event_access($user, (int)$p['event_id'], 'finance');
    q('DELETE FROM payments WHERE id = ?', [$p['id']]);
    log_action((int)$p['event_id'], 'پرداخت ' . number_format((float)$p['amount']) . ' تومانی مورخ ' . $p['paid_at'] . ' حذف شد.');
    return ['success' => true];
}

// ---------- دستمزد نیروها ----------
function h_set_staff_fee(array $in, array $user): array
{
    $eventId = in_id($in, 'event_id', 'رویداد');
    event_access($user, $eventId, 'finance');
    $uid = in_id($in, 'user_id', 'همکار');
    $u = q_one('SELECT id, full_name FROM users WHERE id = ? AND ' . staff_role_sql(), [$uid]);
    if (!$u) throw new ApiError('همکار یافت نشد.');
    $amount = in_money($in, 'amount', 'دستمزد') ?? 0;
    $note = in_str($in, 'note', 255, false, 'توضیح');
    q('INSERT INTO event_staff_fees (event_id, user_id, amount, note) VALUES (?, ?, ?, ?) ON DUPLICATE KEY UPDATE amount = VALUES(amount), note = VALUES(note)', [$eventId, $uid, $amount, $note ?: null]);
    log_action($eventId, "دستمزد «{$u['full_name']}» برای این رویداد " . number_format($amount) . ' تومان ثبت شد.');
    return ['success' => true];
}

/** پر کردن دستمزد پیش‌فرض برای همه نیروهای درگیر که هنوز دستمزد ندارند */
function h_fill_default_fees(array $in, array $user): array
{
    $eventId = in_id($in, 'event_id', 'رویداد');
    event_access($user, $eventId, 'finance');
    $n = q('INSERT IGNORE INTO event_staff_fees (event_id, user_id, amount)
        SELECT DISTINCT ?, u.id, COALESCE(u.default_fee, 0) FROM event_tasks t JOIN users u ON u.id = t.assignee_id WHERE t.event_id = ?', [$eventId, $eventId])->rowCount();
    if ($n) log_action($eventId, "دستمزد پیش‌فرض برای {$n} همکار ثبت شد.");
    return ['success' => true, 'added' => $n];
}

function h_mark_fee_paid(array $in, array $user): array
{
    $f = q_one('SELECT f.*, u.full_name FROM event_staff_fees f JOIN users u ON u.id = f.user_id WHERE f.id = ?', [in_id($in, 'id', 'دستمزد')]);
    if (!$f) throw new ApiError('ردیف دستمزد یافت نشد.', 404);
    event_access($user, (int)$f['event_id'], 'finance');
    $paid = in_bool($in, 'paid');
    $date = $paid ? (in_date($in, 'paid_at', 'تاریخ تسویه') ?? date('Y-m-d')) : null;
    q('UPDATE event_staff_fees SET paid_at = ? WHERE id = ?', [$date, $f['id']]);
    log_action((int)$f['event_id'], $paid ? "دستمزد «{$f['full_name']}» تسویه شد." : "تسویه دستمزد «{$f['full_name']}» لغو شد.");
    return ['success' => true];
}

function h_delete_staff_fee(array $in, array $user): array
{
    $f = q_one('SELECT * FROM event_staff_fees WHERE id = ?', [in_id($in, 'id', 'دستمزد')]);
    if (!$f) throw new ApiError('ردیف دستمزد یافت نشد.', 404);
    event_access($user, (int)$f['event_id'], 'finance');
    q('DELETE FROM event_staff_fees WHERE id = ?', [$f['id']]);
    return ['success' => true];
}

/** دستمزدهای تسویه‌نشده به تفکیک همکار (با شماره شبا) */
function h_get_payouts(array $in, array $user): array
{
    if (!$user['perms']['payouts']) throw new ApiError('شما به گزارش تسویه نیروها دسترسی ندارید.', 403);
    $rows = q_all("SELECT f.id, f.event_id, f.amount, f.note, f.paid_at, e.title AS event_title, e.start_date, u.id AS user_id, u.full_name, u.iban, u.phone
        FROM event_staff_fees f JOIN events e ON e.id = f.event_id JOIN users u ON u.id = f.user_id
        WHERE " . (!empty($in['all']) ? '1=1' : 'f.paid_at IS NULL') . ' AND f.amount > 0 ORDER BY u.full_name, e.start_date');
    $by = [];
    foreach ($rows as $r) {
        $k = (int)$r['user_id'];
        if (!isset($by[$k])) $by[$k] = ['user_id' => $k, 'full_name' => $r['full_name'], 'iban' => $r['iban'], 'phone' => $r['phone'], 'total' => 0, 'items' => []];
        $by[$k]['total'] += (float)$r['amount'];
        $by[$k]['items'][] = $r;
    }
    return array_values($by);
}

// ---------- گزارش‌ها ----------
function h_get_reports(array $in, array $user): array
{
    $from = in_date($in, 'from', 'شروع بازه') ?? date('Y-m-d', strtotime('-11 months', strtotime(date('Y-m-01'))));
    $to = in_date($in, 'to', 'پایان بازه') ?? date('Y-m-d');
    [$scope, $sp] = event_scope_sql($user);
    $events = q_all("SELECT e.* FROM events e WHERE e.is_template = 0 AND $scope AND DATE(COALESCE(e.start_date, e.created_at)) BETWEEN ? AND ?", [...$sp, $from, $to]);
    $tot = ['events' => count($events), 'revenue' => 0, 'paid' => 0, 'outstanding' => 0, 'fees' => 0, 'profit' => 0, 'tbd_rows' => 0];
    $status = array_fill_keys(array_keys(EVENT_STATUSES), 0);
    $months = [];
    $receivables = [];
    foreach ($events as $e) {
        $f = event_finance((int)$e['id'], $e);
        $tot['revenue'] += $f['total']; $tot['paid'] += $f['paid']; $tot['fees'] += $f['fees']; $tot['tbd_rows'] += $f['tbd'];
        if ($f['remaining'] > 0) { $tot['outstanding'] += $f['remaining']; $receivables[] = ['id' => (int)$e['id'], 'title' => $e['title'], 'start_date' => $e['start_date'], 'total' => $f['total'], 'paid' => $f['paid'], 'remaining' => $f['remaining']]; }
        $status[$e['status']] = ($status[$e['status']] ?? 0) + 1;
        $m = substr((string)($e['start_date'] ?? $e['created_at']), 0, 7);
        $months[$m] = $months[$m] ?? ['month' => $m, 'revenue' => 0, 'paid' => 0, 'events' => 0];
        $months[$m]['revenue'] += $f['total']; $months[$m]['paid'] += $f['paid']; $months[$m]['events']++;
    }
    $tot['profit'] = $tot['revenue'] - $tot['fees'];
    ksort($months);
    usort($receivables, fn($a, $b) => $b['remaining'] <=> $a['remaining']);
    $ids = array_map(fn($e) => (int)$e['id'], $events) ?: [0];
    $in = implode(',', $ids);
    $tasks = q_one("SELECT COUNT(*) AS total, SUM(is_done = 1) AS done, SUM(is_done = 0 AND due_at IS NOT NULL AND due_at < NOW()) AS overdue, SUM(has_issue = 1) AS issues FROM event_tasks WHERE event_id IN ($in)");
    $topStaff = q_all("SELECT u.id, u.full_name, u.rating_score, u.rating_count, COUNT(*) AS tasks, SUM(t.is_done = 1) AS done, COUNT(DISTINCT t.event_id) AS events
        FROM event_tasks t JOIN users u ON u.id = t.assignee_id WHERE t.event_id IN ($in) GROUP BY u.id ORDER BY done DESC, tasks DESC LIMIT 10");
    $topServices = q_all("SELECT SUBSTRING_INDEX(service_name, ' - ', 1) AS name, COUNT(*) AS cnt, COALESCE(SUM(frozen_price), 0) AS revenue
        FROM event_services WHERE event_id IN ($in) GROUP BY name ORDER BY revenue DESC, cnt DESC LIMIT 10");
    $topVenues = q_all("SELECT v.name, COUNT(*) AS cnt, v.rating_score, v.rating_count FROM events e JOIN venues v ON v.id = e.venue_id WHERE e.id IN ($in) GROUP BY v.id ORDER BY cnt DESC LIMIT 5");
    $fin = $user['perms']['finance'];
    if (!$fin) { foreach (['revenue', 'paid', 'outstanding', 'fees', 'profit'] as $k) unset($tot[$k]); $receivables = []; }
    return [
        'range' => ['from' => $from, 'to' => $to],
        'totals' => $tot, 'status' => $status, 'months' => array_values($months), 'tasks' => $tasks,
        'top_staff' => $topStaff, 'top_services' => $topServices, 'top_venues' => $topVenues,
        'receivables' => array_slice($receivables, 0, 20),
    ];
}

// ---------- امتیازدهی ----------
function h_rate(array $in, array $user): array
{
    $eventId = in_id($in, 'event_id', 'رویداد');
    $ev = event_access($user, $eventId, 'tasks');
    $type = ($in['target_type'] ?? '') === 'venue' ? 'venue' : 'staff';
    $tid = in_id($in, 'target_id', 'مورد امتیازدهی');
    $score = in_int($in, 'score', 0, 5, 'امتیاز') ?? 0;
    if ($type === 'venue' && (int)$ev['venue_id'] !== $tid) throw new ApiError('این مکان مربوط به این رویداد نیست.');
    if ($type === 'staff' && !is_event_member($tid, $eventId)) throw new ApiError('این همکار در این رویداد وظیفه‌ای نداشته است.');
    if ($score === 0) {
        q('DELETE FROM ratings WHERE event_id = ? AND target_type = ? AND target_id = ?', [$eventId, $type, $tid]);
    } else {
        q('INSERT INTO ratings (event_id, target_type, target_id, score, comment, rated_by) VALUES (?, ?, ?, ?, ?, ?)
            ON DUPLICATE KEY UPDATE score = VALUES(score), comment = VALUES(comment), rated_by = VALUES(rated_by)', [$eventId, $type, $tid, $score, in_str($in, 'comment', 500) ?: null, $user['full_name']]);
    }
    $agg = q_one('SELECT COALESCE(AVG(score), 0) AS avg, COUNT(*) AS cnt FROM ratings WHERE target_type = ? AND target_id = ?', [$type, $tid]);
    q(($type === 'venue' ? 'UPDATE venues' : 'UPDATE users') . ' SET rating_score = ?, rating_count = ? WHERE id = ?', [round((float)$agg['avg'], 2), (int)$agg['cnt'], $tid]);
    return ['success' => true, 'avg' => round((float)$agg['avg'], 2), 'count' => (int)$agg['cnt']];
}
