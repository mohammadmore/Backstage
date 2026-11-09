<?php
declare(strict_types=1);

if (!defined('EVENT_APP')) { http_response_code(403); exit; }

// ===============================================================
// پیوست فایل و یادداشت روی رویداد یا وظیفه
// فایل‌ها بیرون از وب‌روت ذخیره و فقط از طریق API (با بررسی دسترسی) دانلود می‌شوند.
// ===============================================================
$ROUTES += [
    'get_extras'          => ['h_get_extras', 'user', 'GET'],
    'upload_attachment'   => ['h_upload_attachment', 'user', 'POST'],
    'download_attachment' => ['h_download_attachment', 'user', 'GET'],
    'delete_attachment'   => ['h_delete_attachment', 'user', 'POST'],
    'add_note'            => ['h_add_note', 'user', 'POST'],
    'delete_note'         => ['h_delete_note', 'user', 'POST'],
];

const ATTACH_TYPES = [
    'pdf' => 'application/pdf', 'jpg' => 'image/jpeg', 'jpeg' => 'image/jpeg', 'png' => 'image/png', 'webp' => 'image/webp', 'gif' => 'image/gif',
    'doc' => 'application/msword', 'docx' => 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'xls' => 'application/vnd.ms-excel', 'xlsx' => 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'ppt' => 'application/vnd.ms-powerpoint', 'pptx' => 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    'txt' => 'text/plain', 'csv' => 'text/csv', 'zip' => 'application/zip', 'rar' => 'application/vnd.rar', 'dwg' => 'application/acad',
];

/**
 * دسترسی به پیوست/یادداشت:
 * - مدیر / مدیر پروژه / حسابدار رویداد: همه موارد رویداد (حسابدار فقط خواندن)
 * - کارمند: فقط موارد مربوط به وظایف خودش
 * خروجی: [رویداد, سطح] که سطح یکی از manage | read | task است
 */
function extras_access(array $user, int $eventId, ?int $taskId): array
{
    $ev = q_one('SELECT * FROM events WHERE id = ?', [$eventId]);
    if (!$ev) throw new ApiError('رویداد یافت نشد.', 404);
    if (can_event($user, $ev, 'tasks')) return [$ev, 'manage'];
    if (can_event($user, $ev, 'read')) return [$ev, 'read'];
    if ($taskId && (int)q_val('SELECT COUNT(*) FROM event_tasks WHERE id = ? AND event_id = ? AND assignee_id = ?', [$taskId, $eventId, $user['id']]) > 0) return [$ev, 'task'];
    throw new ApiError('شما به این بخش دسترسی ندارید.', 403);
}

function h_get_extras(array $in, array $user): array
{
    $eventId = in_id($in, 'event_id', 'رویداد');
    $taskId = in_int($in, 'task_id', 1, null, 'وظیفه');
    [, $level] = extras_access($user, $eventId, $taskId);
    $where = 'event_id = ?'; $params = [$eventId];
    if ($taskId) { $where .= ' AND task_id = ?'; $params[] = $taskId; }
    elseif ($level === 'task') throw new ApiError('شما به این بخش دسترسی ندارید.', 403);
    return [
        'level' => $level,
        'attachments' => q_all("SELECT a.id, a.task_id, a.orig_name, a.mime, a.size, a.uploaded_by, a.uploader_id, a.created_at, t.title AS task_title FROM attachments a LEFT JOIN event_tasks t ON t.id = a.task_id WHERE a.$where ORDER BY a.id DESC", $params),
        'notes' => q_all("SELECT n.id, n.task_id, n.user_id, n.user_name, n.body, n.created_at, t.title AS task_title FROM notes n LEFT JOIN event_tasks t ON t.id = n.task_id WHERE n.$where ORDER BY n.id DESC", $params),
    ];
}

function h_upload_attachment(array $in, array $user): array
{
    $eventId = in_id($in, 'event_id', 'رویداد');
    $taskId = in_int($in, 'task_id', 1, null, 'وظیفه');
    [, $level] = extras_access($user, $eventId, $taskId);
    if ($level === 'read') throw new ApiError('شما اجازه افزودن فایل ندارید.', 403);
    if ($taskId && !q_val('SELECT id FROM event_tasks WHERE id = ? AND event_id = ?', [$taskId, $eventId])) throw new ApiError('وظیفه انتخاب‌شده مربوط به این رویداد نیست.');
    $f = $_FILES['file'] ?? null;
    if (!$f || !is_array($f) || ($f['error'] ?? UPLOAD_ERR_NO_FILE) !== UPLOAD_ERR_OK) {
        $code = is_array($f) ? (int)$f['error'] : UPLOAD_ERR_NO_FILE;
        throw new ApiError(in_array($code, [UPLOAD_ERR_INI_SIZE, UPLOAD_ERR_FORM_SIZE], true) ? 'حجم فایل بیش از حد مجاز سرور است.' : 'فایلی دریافت نشد.');
    }
    $max = (int)(app_config()['max_attachment_bytes'] ?? 10 * 1024 * 1024);
    if ((int)$f['size'] > $max) throw new ApiError('حجم فایل بیشتر از ' . round($max / 1048576) . ' مگابایت است.');
    $orig = mb_substr(preg_replace('/[\\x00-\\x1f\\/\\\\:*?"<>|]+/u', '_', basename((string)$f['name'])), 0, 200) ?: 'file';
    $ext = strtolower(pathinfo($orig, PATHINFO_EXTENSION));
    if (!isset(ATTACH_TYPES[$ext])) throw new ApiError('این نوع فایل مجاز نیست. فرمت‌های مجاز: ' . implode('، ', array_keys(ATTACH_TYPES)));
    if (str_starts_with(ATTACH_TYPES[$ext], 'image/') && !@getimagesize($f['tmp_name'])) throw new ApiError('فایل تصویر معتبر نیست.');
    $dir = storage_dir('files');
    $stored = bin2hex(random_bytes(16)) . '.' . $ext;
    if (!move_uploaded_file($f['tmp_name'], $dir . '/' . $stored)) throw new ApiError('ذخیره فایل با خطا مواجه شد.', 500);
    q('INSERT INTO attachments (event_id, task_id, stored_name, orig_name, mime, size, uploaded_by, uploader_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?)', [$eventId, $taskId, $stored, $orig, ATTACH_TYPES[$ext], (int)$f['size'], $user['full_name'], $user['id']]);
    $newId = (int)db()->lastInsertId();
    log_action($eventId, "فایل «{$orig}» پیوست شد.");
    return ['success' => true, 'id' => $newId];
}

function attachment_or_fail(array $user, int $id, bool $write): array
{
    $a = q_one('SELECT * FROM attachments WHERE id = ?', [$id]);
    if (!$a) throw new ApiError('فایل یافت نشد.', 404);
    [, $level] = extras_access($user, (int)$a['event_id'], $a['task_id'] ? (int)$a['task_id'] : null);
    if ($write && !($level === 'manage' || (int)$a['uploader_id'] === (int)$user['id'])) throw new ApiError('فقط مدیر یا بارگذارکننده می‌تواند این فایل را حذف کند.', 403);
    return $a;
}

function h_download_attachment(array $in, array $user): array
{
    $a = attachment_or_fail($user, in_id($in, 'id', 'فایل'), false);
    $path = storage_dir('files') . '/' . basename($a['stored_name']);
    if (!is_file($path)) throw new ApiError('فایل روی سرور پیدا نشد.', 404);
    $inline = !empty($in['inline']) && (str_starts_with((string)$a['mime'], 'image/') || $a['mime'] === 'application/pdf');
    header_remove('Content-Type');
    header('Content-Type: ' . ($a['mime'] ?: 'application/octet-stream'));
    header('Content-Length: ' . filesize($path));
    header("Content-Disposition: " . ($inline ? 'inline' : 'attachment') . "; filename*=UTF-8''" . rawurlencode($a['orig_name']));
    header("Content-Security-Policy: default-src 'none'; img-src 'self'; style-src 'unsafe-inline'; sandbox");
    header('Cache-Control: private, max-age=0');
    readfile($path);
    return ['__raw' => true];
}

function h_delete_attachment(array $in, array $user): array
{
    $a = attachment_or_fail($user, in_id($in, 'id', 'فایل'), true);
    q('DELETE FROM attachments WHERE id = ?', [$a['id']]);
    @unlink(storage_dir('files') . '/' . basename($a['stored_name']));
    log_action((int)$a['event_id'], "فایل «{$a['orig_name']}» حذف شد.");
    return ['success' => true];
}

function h_add_note(array $in, array $user): array
{
    $eventId = in_id($in, 'event_id', 'رویداد');
    $taskId = in_int($in, 'task_id', 1, null, 'وظیفه');
    [$ev, $level] = extras_access($user, $eventId, $taskId);
    if ($level === 'read' && !$user['perms']['finance']) throw new ApiError('شما اجازه افزودن یادداشت ندارید.', 403);
    if ($taskId && !q_val('SELECT id FROM event_tasks WHERE id = ? AND event_id = ?', [$taskId, $eventId])) throw new ApiError('وظیفه انتخاب‌شده مربوط به این رویداد نیست.');
    $body = in_str($in, 'body', 3000, true, 'متن یادداشت');
    q('INSERT INTO notes (event_id, task_id, user_id, user_name, body) VALUES (?, ?, ?, ?, ?)', [$eventId, $taskId, $user['id'], $user['full_name'], $body]);
    // یادداشت کارمند روی وظیفه به مدیران اطلاع داده می‌شود و یادداشت مدیر به متصدی
    if ($taskId) {
        $t = q_one('SELECT title, assignee_id FROM event_tasks WHERE id = ?', [$taskId]);
        if ($level === 'task') notify_event_managers($eventId, "یادداشت {$user['full_name']} روی «{$t['title']}»: " . mb_substr($body, 0, 120), 'info', $eventId);
        elseif ($t['assignee_id'] && (int)$t['assignee_id'] !== (int)$user['id']) notify((int)$t['assignee_id'], "یادداشت جدید روی وظیفه «{$t['title']}»: " . mb_substr($body, 0, 120), 'info', $eventId);
    }
    return ['success' => true];
}

function h_delete_note(array $in, array $user): array
{
    $n = q_one('SELECT * FROM notes WHERE id = ?', [in_id($in, 'id', 'یادداشت')]);
    if (!$n) throw new ApiError('یادداشت یافت نشد.', 404);
    [, $level] = extras_access($user, (int)$n['event_id'], $n['task_id'] ? (int)$n['task_id'] : null);
    if ($level !== 'manage' && (int)$n['user_id'] !== (int)$user['id']) throw new ApiError('فقط نویسنده یا مدیر می‌تواند این یادداشت را حذف کند.', 403);
    q('DELETE FROM notes WHERE id = ?', [$n['id']]);
    return ['success' => true];
}
