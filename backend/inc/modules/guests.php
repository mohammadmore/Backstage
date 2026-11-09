<?php
declare(strict_types=1);

if (!defined('EVENT_APP')) { http_response_code(403); exit; }

// ===============================================================
// لیست مهمانان و پذیرش با QR
// مدیریت لیست: مدیر / مدیر پروژه رویداد
// پذیرش (چک‌این): همان‌ها + همکارانی که در رویداد وظیفه دارند
// ===============================================================
$ROUTES += [
    'get_guests'     => ['h_get_guests', 'user', 'GET'],
    'save_guest'     => ['h_save_guest', 'planner', 'POST'],
    'delete_guest'   => ['h_delete_guest', 'planner', 'POST'],
    'import_guests'  => ['h_import_guests', 'planner', 'POST'],
    'guest_checkin'  => ['h_guest_checkin', 'user', 'POST'],
];

/** دسترسی به مهمانان: manage=true برای ویرایش لیست */
function guest_event_access(array $user, int $eventId, bool $manage): array
{
    $ev = q_one('SELECT * FROM events WHERE id = ?', [$eventId]);
    if (!$ev) throw new ApiError('رویداد یافت نشد.', 404);
    if (can_event($user, $ev, 'tasks')) return $ev;
    if (!$manage && is_event_member((int)$user['id'], $eventId)) return $ev;
    throw new ApiError('شما به مهمانان این رویداد دسترسی ندارید.', 403);
}

function h_get_guests(array $in, array $user): array
{
    $eventId = in_id($in, 'event_id', 'رویداد');
    $ev = guest_event_access($user, $eventId, false);
    $canManage = can_event($user, $ev, 'tasks');
    // همکاران پذیرش تلفن مهمانان را نمی‌بینند
    $cols = 'id, full_name, organization, category, qr_token, checked_in_at, checked_in_by' . ($canManage ? ', phone' : '');
    return [
        'event' => ['id' => $eventId, 'title' => $ev['title'], 'start_date' => $ev['start_date']],
        'can_manage' => $canManage,
        'guests' => q_all("SELECT $cols FROM guests WHERE event_id = ? ORDER BY full_name", [$eventId]),
        'categories' => GUEST_CATEGORIES,
    ];
}

function guest_fields(array $in): array
{
    $cat = in_str($in, 'category', 30);
    return [
        in_str($in, 'full_name', 150, true, 'نام مهمان'),
        in_str($in, 'phone', 20, false, 'تلفن'),
        in_str($in, 'organization', 150, false, 'سازمان'),
        in_array($cat, GUEST_CATEGORIES, true) ? $cat : 'عادی',
    ];
}

function h_save_guest(array $in, array $user): array
{
    $eventId = in_id($in, 'event_id', 'رویداد');
    guest_event_access($user, $eventId, true);
    $id = in_int($in, 'id', 1, null, 'مهمان');
    [$name, $phone, $org, $cat] = guest_fields($in);
    if ($id) {
        if (!q_val('SELECT id FROM guests WHERE id = ? AND event_id = ?', [$id, $eventId])) throw new ApiError('مهمان یافت نشد.', 404);
        q('UPDATE guests SET full_name = ?, phone = ?, organization = ?, category = ? WHERE id = ?', [$name, $phone, $org, $cat, $id]);
    } else {
        q('INSERT INTO guests (event_id, full_name, phone, organization, category, qr_token) VALUES (?, ?, ?, ?, ?, ?)', [$eventId, $name, $phone, $org, $cat, bin2hex(random_bytes(12))]);
        $id = (int)db()->lastInsertId();
    }
    return ['success' => true, 'id' => $id];
}

function h_delete_guest(array $in, array $user): array
{
    $g = q_one('SELECT * FROM guests WHERE id = ?', [in_id($in, 'id', 'مهمان')]);
    if (!$g) throw new ApiError('مهمان یافت نشد.', 404);
    guest_event_access($user, (int)$g['event_id'], true);
    q('DELETE FROM guests WHERE id = ?', [$g['id']]);
    return ['success' => true];
}

/** ورود گروهی (ردیف‌ها از فایل CSV/اکسل در مرورگر خوانده می‌شوند) */
function h_import_guests(array $in, array $user): array
{
    $eventId = in_id($in, 'event_id', 'رویداد');
    guest_event_access($user, $eventId, true);
    $rows = is_array($in['rows'] ?? null) ? array_slice($in['rows'], 0, 5000) : [];
    $existing = array_flip(array_map(fn($r) => mb_strtolower(trim($r['full_name'])) . '|' . trim((string)$r['phone']), q_all('SELECT full_name, phone FROM guests WHERE event_id = ?', [$eventId])));
    $added = 0; $skipped = 0; $errors = [];
    $ins = db()->prepare('INSERT INTO guests (event_id, full_name, phone, organization, category, qr_token) VALUES (?, ?, ?, ?, ?, ?)');
    db()->beginTransaction();
    foreach ($rows as $i => $r) {
        if (!is_array($r)) continue;
        try { [$name, $phone, $org, $cat] = guest_fields($r); }
        catch (ApiError $e) { if (count($errors) < 10) $errors[] = 'ردیف ' . ($i + 1) . ': ' . $e->getMessage(); $skipped++; continue; }
        $key = mb_strtolower($name) . '|' . $phone;
        if (isset($existing[$key])) { $skipped++; continue; }
        $ins->execute([$eventId, $name, $phone, $org, $cat, bin2hex(random_bytes(12))]);
        $existing[$key] = true; $added++;
    }
    db()->commit();
    if ($added) log_action($eventId, "{$added} مهمان از فایل وارد شد.");
    return ['success' => true, 'added' => $added, 'skipped' => $skipped, 'errors' => $errors];
}

/** پذیرش با کد QR یا شناسه مهمان؛ undo=true برای لغو پذیرش */
function h_guest_checkin(array $in, array $user): array
{
    $eventId = in_id($in, 'event_id', 'رویداد');
    guest_event_access($user, $eventId, false);
    $raw = trim((string)($in['token'] ?? ''));
    if (str_starts_with($raw, 'EVG:')) $raw = substr($raw, 4);
    if ($raw !== '') {
        $g = preg_match('/^[a-f0-9]{24}$/', $raw) ? q_one('SELECT * FROM guests WHERE qr_token = ?', [$raw]) : null;
        if (!$g) throw new ApiError('کد QR معتبر نیست.', 404);
        if ((int)$g['event_id'] !== $eventId) throw new ApiError('این کارت ورود مربوط به رویداد دیگری است.');
    } else {
        $g = q_one('SELECT * FROM guests WHERE id = ? AND event_id = ?', [in_id($in, 'guest_id', 'مهمان'), $eventId]);
        if (!$g) throw new ApiError('مهمان یافت نشد.', 404);
    }
    if (in_bool($in, 'undo')) {
        q('UPDATE guests SET checked_in_at = NULL, checked_in_by = NULL WHERE id = ?', [$g['id']]);
        return ['success' => true, 'guest' => ['id' => (int)$g['id'], 'full_name' => $g['full_name'], 'category' => $g['category']], 'status' => 'undone'];
    }
    $already = $g['checked_in_at'] !== null;
    if (!$already) q('UPDATE guests SET checked_in_at = NOW(), checked_in_by = ? WHERE id = ?', [$user['full_name'], $g['id']]);
    return [
        'success' => true,
        'status' => $already ? 'already' : 'ok',
        'guest' => ['id' => (int)$g['id'], 'full_name' => $g['full_name'], 'category' => $g['category'], 'organization' => $g['organization'], 'checked_in_at' => $already ? $g['checked_in_at'] : date('Y-m-d H:i:s'), 'checked_in_by' => $already ? $g['checked_in_by'] : $user['full_name']],
    ];
}
