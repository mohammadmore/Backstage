<?php
declare(strict_types=1);

if (!defined('EVENT_APP')) { http_response_code(403); exit; }

// ===============================================================
// پورتال کارفرما: لینک امن فقط‌خواندنی + تایید آنلاین پیش‌فاکتور
// توکن ۳۲ بایتی تصادفی است؛ اطلاعات تیم (نام، تلفن، شبا) و لاگ‌ها نمایش داده نمی‌شوند.
// ===============================================================
$ROUTES += [
    'portal_enable'   => ['h_portal_enable', 'office', 'POST'],
    'portal_disable'  => ['h_portal_disable', 'office', 'POST'],
    'portal_view'     => ['h_portal_view', 'public', 'GET'],
    'portal_approve'  => ['h_portal_approve', 'public', 'POST'],
];

function h_portal_enable(array $in, array $user): array
{
    $eventId = in_id($in, 'event_id', 'رویداد');
    $ev = event_access($user, $eventId, 'finance');
    $token = (!empty($in['regenerate']) || !$ev['portal_token']) ? bin2hex(random_bytes(32)) : $ev['portal_token'];
    q('UPDATE events SET portal_token = ? WHERE id = ?', [$token, $eventId]);
    if ($token !== $ev['portal_token']) log_action($eventId, $ev['portal_token'] ? 'لینک پورتال کارفرما تعویض شد (لینک قبلی باطل شد).' : 'لینک پورتال کارفرما ساخته شد.');
    return ['success' => true, 'token' => $token];
}

function h_portal_disable(array $in, array $user): array
{
    $eventId = in_id($in, 'event_id', 'رویداد');
    event_access($user, $eventId, 'finance');
    q('UPDATE events SET portal_token = NULL WHERE id = ?', [$eventId]);
    log_action($eventId, 'لینک پورتال کارفرما غیرفعال شد.');
    return ['success' => true];
}

function portal_event_or_fail($token): array
{
    $token = is_string($token) ? $token : '';
    $ip = client_ip();
    $fails = (int)q_val("SELECT COUNT(*) FROM login_attempts WHERE ip = ? AND username = '#portal' AND created_at > (NOW() - INTERVAL 15 MINUTE)", [$ip]);
    if ($fails >= 20) throw new ApiError('تعداد درخواست‌های نامعتبر زیاد است. کمی بعد دوباره تلاش کنید.', 429);
    $ev = preg_match('/^[a-f0-9]{64}$/', $token) ? q_one('SELECT e.*, o.name AS org_name, o.logo AS org_logo, v.name AS venue_name, v.address AS venue_address FROM events e LEFT JOIN organizations o ON o.id = e.org_id LEFT JOIN venues v ON v.id = e.venue_id WHERE e.portal_token = ? AND e.is_template = 0', [$token]) : null;
    if (!$ev) {
        q("INSERT INTO login_attempts (ip, username) VALUES (?, '#portal')", [$ip]);
        throw new ApiError('این لینک معتبر نیست یا غیرفعال شده است.', 404);
    }
    return $ev;
}

function h_portal_view(array $in): array
{
    $ev = portal_event_or_fail($in['token'] ?? '');
    $id = (int)$ev['id'];
    $fin = event_finance($id, $ev);
    $phases = [];
    foreach (q_all('SELECT timing_tag, COUNT(*) AS total, SUM(is_done = 1) AS done FROM event_tasks WHERE event_id = ? GROUP BY timing_tag', [$id]) as $r) {
        $phases[] = ['phase' => $r['timing_tag'] ?: 'سایر', 'total' => (int)$r['total'], 'done' => (int)$r['done']];
    }
    $ord = fn($p) => ($i = array_search($p, TIMINGS, true)) === false ? 99 : $i;
    usort($phases, fn($a, $b) => $ord($a['phase']) <=> $ord($b['phase']));
    return [
        'event' => [
            'id' => $id, 'title' => $ev['title'], 'status' => $ev['status'], 'status_label' => EVENT_STATUSES[$ev['status']] ?? $ev['status'],
            'start_date' => $ev['start_date'], 'end_date' => $ev['end_date'], 'guest_count' => (int)$ev['guest_count'],
            'org_name' => $ev['org_name'], 'org_logo' => $ev['org_logo'], 'venue_name' => $ev['venue_name'], 'venue_address' => $ev['venue_address'],
            'contact_name' => $ev['contact_name'], 'discount' => $ev['discount'], 'tax_percent' => $ev['tax_percent'],
            'client_approved_at' => $ev['client_approved_at'], 'client_approved_name' => $ev['client_approved_name'], 'client_note' => $ev['client_note'],
        ],
        'services' => q_all('SELECT service_name, cost_type, qty, unit_price, frozen_price FROM event_services WHERE event_id = ? ORDER BY id', [$id]),
        'payments' => q_all('SELECT amount, paid_at, method FROM payments WHERE event_id = ? ORDER BY paid_at', [$id]),
        'fin' => ['subtotal' => $fin['subtotal'], 'discount' => $fin['discount'], 'tax' => $fin['tax'], 'total' => $fin['total'], 'paid' => $fin['paid'], 'remaining' => $fin['remaining'], 'tbd' => $fin['tbd']],
        'phases' => $phases,
    ];
}

function h_portal_approve(array $in): array
{
    $ev = portal_event_or_fail($in['token'] ?? '');
    if ($ev['client_approved_at']) throw new ApiError('این پیش‌فاکتور قبلاً تایید شده است.');
    $name = in_str($in, 'name', 100, true, 'نام تاییدکننده');
    $note = in_str($in, 'note', 1000, false, 'توضیحات');
    q('UPDATE events SET client_approved_at = NOW(), client_approved_name = ?, client_note = ? WHERE id = ?', [$name, $note ?: null, $ev['id']]);
    q('INSERT INTO event_logs (event_id, user_name, action) VALUES (?, ?, ?)', [$ev['id'], 'کارفرما: ' . $name, 'پیش‌فاکتور از طریق پورتال کارفرما تایید شد.' . ($note ? " توضیح: $note" : '')]);
    $msg = "کارفرما ({$name}) پیش‌فاکتور رویداد «{$ev['title']}» را تایید کرد.";
    notify_event_managers((int)$ev['id'], $msg, 'success', (int)$ev['id'], 'portal');
    return ['success' => true];
}
