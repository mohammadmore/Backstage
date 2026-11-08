<?php
error_reporting(0); // سپر امنیتی: جلوگیری از چاپ خطاهای سرور که باعث خرابی JSON می‌شوند
ini_set('display_errors', 0);
header('Content-Type: application/json; charset=utf-8');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, POST, OPTIONS');

$host = 'localhost';
$dbname = 'DB_NAME_OR_USER'; 
$user = 'DB_NAME_OR_USER'; 
$pass = 'CHANGE_ME';   

try {
    $pdo = new PDO("mysql:host=$host;dbname=$dbname;charset=utf8mb4", $user, $pass);
    $pdo->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
    
    $pdo->exec("CREATE TABLE IF NOT EXISTS `users` (`id` int(11) NOT NULL AUTO_INCREMENT, `username` varchar(50) NOT NULL, `password` varchar(255) NOT NULL, `full_name` varchar(100) NOT NULL, `role` varchar(50) DEFAULT 'staff', `is_shadow` tinyint(1) DEFAULT 0, `phone` varchar(20) DEFAULT NULL, `phone2` varchar(20) DEFAULT NULL, `skills` text DEFAULT NULL, `iban` varchar(50) DEFAULT NULL, `avatar` text DEFAULT NULL, `sort_order` int(11) DEFAULT 0, `rating_score` decimal(10,2) DEFAULT 5.0, `rating_count` int(11) DEFAULT 1, `can_delegate` tinyint(1) DEFAULT 0, `theme_pref` varchar(10) DEFAULT 'light', PRIMARY KEY (`id`)) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;");
    $pdo->exec("CREATE TABLE IF NOT EXISTS `organizations` (`id` int(11) NOT NULL AUTO_INCREMENT, `name` varchar(100) NOT NULL, `national_id` varchar(50) DEFAULT NULL, `contacts` text DEFAULT NULL, `logo` text DEFAULT NULL, `sort_order` int(11) DEFAULT 0, PRIMARY KEY (`id`)) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;");
    $pdo->exec("CREATE TABLE IF NOT EXISTS `venues` (`id` int(11) NOT NULL AUTO_INCREMENT, `name` varchar(100) NOT NULL, `capacity` int(11) DEFAULT 0, `address` text DEFAULT NULL, `gps_link` text DEFAULT NULL, `venue_type` varchar(50) DEFAULT NULL, `facilities` text DEFAULT NULL, `sort_order` int(11) DEFAULT 0, `rating_score` decimal(10,2) DEFAULT 5.0, `rating_count` int(11) DEFAULT 1, PRIMARY KEY (`id`)) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;");
    $pdo->exec("CREATE TABLE IF NOT EXISTS `categories` (`id` int(11) NOT NULL AUTO_INCREMENT, `name` varchar(100) NOT NULL, `sort_order` int(11) DEFAULT 0, PRIMARY KEY (`id`)) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;");
    $pdo->exec("CREATE TABLE IF NOT EXISTS `services` (`id` int(11) NOT NULL AUTO_INCREMENT, `name` varchar(100) NOT NULL, `category_id` int(11) DEFAULT NULL, `cost_type` varchar(50) DEFAULT 'cumulative', `base_price` decimal(15,2) DEFAULT NULL, `packages` text DEFAULT NULL, `sort_order` int(11) DEFAULT 0, PRIMARY KEY (`id`)) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;");
    
    $pdo->exec("CREATE TABLE IF NOT EXISTS `event_logs` (`id` int(11) NOT NULL AUTO_INCREMENT, `event_id` int(11) NOT NULL, `user_name` varchar(100) DEFAULT NULL, `action` text NOT NULL, `created_at` timestamp DEFAULT CURRENT_TIMESTAMP, PRIMARY KEY (`id`)) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;");
    $pdo->exec("CREATE TABLE IF NOT EXISTS `events` (`id` int(11) NOT NULL AUTO_INCREMENT, `title` varchar(255) NOT NULL, `event_type` varchar(100) DEFAULT NULL, `org_id` int(11) DEFAULT NULL, `venue_id` int(11) DEFAULT NULL, `guest_count` int(11) DEFAULT 0, `status` varchar(50) DEFAULT 'draft', `created_at` timestamp DEFAULT CURRENT_TIMESTAMP, `start_date` datetime DEFAULT NULL, `end_date` datetime DEFAULT NULL, `contact_name` varchar(100) DEFAULT NULL, `discount` decimal(15,2) DEFAULT 0, `tax_percent` int(11) DEFAULT 0, `deposit` decimal(15,2) DEFAULT 0, PRIMARY KEY (`id`)) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;");
    $pdo->exec("CREATE TABLE IF NOT EXISTS `event_services` (`id` int(11) NOT NULL AUTO_INCREMENT, `event_id` int(11) NOT NULL, `service_name` varchar(100) NOT NULL, `frozen_price` decimal(15,2) DEFAULT NULL, `cost_type` varchar(50) NOT NULL, `unit_price` decimal(15,2) DEFAULT NULL, `qty` int(11) DEFAULT 1, PRIMARY KEY (`id`)) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;");
    $pdo->exec("CREATE TABLE IF NOT EXISTS `event_tasks` (`id` int(11) NOT NULL AUTO_INCREMENT, `event_id` int(11) NOT NULL, `assignee_id` int(11) DEFAULT NULL, `title` varchar(255) NOT NULL, `role_tag` varchar(100) DEFAULT NULL, `timing_tag` varchar(100) DEFAULT NULL, `is_done` tinyint(1) DEFAULT 0, `has_issue` tinyint(1) DEFAULT 0, `issue_note` text DEFAULT NULL, `depends_on_id` int(11) DEFAULT NULL, PRIMARY KEY (`id`)) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;");
    
    $pdo->exec("CREATE TABLE IF NOT EXISTS `delegations` (`id` int(11) NOT NULL AUTO_INCREMENT, `task_id` int(11) NOT NULL, `event_id` int(11) NOT NULL, `from_user_id` int(11) NOT NULL, `to_user_id` int(11) NOT NULL, `status` varchar(20) DEFAULT 'pending', `created_at` timestamp DEFAULT CURRENT_TIMESTAMP, PRIMARY KEY (`id`)) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;");
    $pdo->exec("CREATE TABLE IF NOT EXISTS `notifications` (`id` int(11) NOT NULL AUTO_INCREMENT, `user_id` int(11) NOT NULL, `message` text NOT NULL, `type` varchar(50) DEFAULT 'info', `ref_id` int(11) DEFAULT NULL, `is_read` tinyint(1) DEFAULT 0, `created_at` timestamp DEFAULT CURRENT_TIMESTAMP, PRIMARY KEY (`id`)) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;");

    $migrations = [
        "ALTER TABLE `users` ADD COLUMN `can_delegate` tinyint(1) DEFAULT 0",
        "ALTER TABLE `users` ADD COLUMN `theme_pref` varchar(10) DEFAULT 'light'",
        "ALTER TABLE `event_services` ADD COLUMN `unit_price` decimal(15,2) DEFAULT NULL",
        "ALTER TABLE `event_services` ADD COLUMN `qty` int(11) DEFAULT 1",
        "ALTER TABLE `event_tasks` ADD COLUMN `depends_on_id` int(11) DEFAULT NULL"
    ];
    foreach ($migrations as $mig) { try { $pdo->exec($mig); } catch(Exception $e) {} }

} catch (PDOException $e) { echo json_encode(["error" => "خطای دیتابیس: " . $e->getMessage()]); exit; }

function saveBase64Image($b64_string, $prefix) {
    if (!$b64_string || !preg_match('/^data:image\/(\w+);base64,/', $b64_string)) return $b64_string;
    $data = base64_decode(substr($b64_string, strpos($b64_string, ',') + 1));
    if ($data === false) return null;
    $dir = 'uploads/'; if (!is_dir($dir)) mkdir($dir, 0777, true);
    $filename = $dir . $prefix . '_' . time() . '_' . rand(1000,9999) . '.jpg';
    file_put_contents($filename, $data); return $filename;
}

function logAction($pdo, $eventId, $userName, $actionText) {
    $stmt = $pdo->prepare("INSERT INTO event_logs (event_id, user_name, action) VALUES (?, ?, ?)");
    $stmt->execute([$eventId, $userName, $actionText]);
}

function sendNotification($pdo, $userId, $msg, $type='info', $refId=null) {
    $stmt = $pdo->prepare("INSERT INTO notifications (user_id, message, type, ref_id) VALUES (?, ?, ?, ?)");
    $stmt->execute([$userId, $msg, $type, $refId]);
}

$action = $_GET['action'] ?? '';
$input = json_decode(file_get_contents('php://input'), true);

try {
    if ($action === 'login') {
        $stmt = $pdo->prepare("SELECT id, username, full_name, role, avatar, can_delegate, theme_pref FROM users WHERE username = ? AND password = ? AND is_shadow = 0");
        $stmt->execute([$input['username'] ?? '', $input['password'] ?? '']);
        $user = $stmt->fetch(PDO::FETCH_ASSOC);
        if ($user) echo json_encode(["success" => true, "user" => $user]); else echo json_encode(["success" => false, "error" => "نام کاربری یا رمز عبور اشتباه است."]);
    }
    elseif ($action === 'update_theme') {
        $stmt = $pdo->prepare("UPDATE users SET theme_pref = ? WHERE id = ?"); $stmt->execute([$input['theme'], $input['user_id']]); echo json_encode(["success" => true]);
    }
    elseif ($action === 'get_master_data') {
        $cats = $pdo->query("SELECT * FROM categories ORDER BY sort_order ASC, id ASC")->fetchAll(PDO::FETCH_ASSOC) ?: [];
        $services = $pdo->query("SELECT * FROM services ORDER BY sort_order ASC, id ASC")->fetchAll(PDO::FETCH_ASSOC) ?: [];
        $staff = $pdo->query("SELECT id, username, full_name, role, is_shadow, phone, phone2, iban, skills, sort_order, avatar, can_delegate FROM users WHERE role != 'superadmin' ORDER BY sort_order ASC, id ASC")->fetchAll(PDO::FETCH_ASSOC) ?: [];
        $orgs = $pdo->query("SELECT * FROM organizations ORDER BY sort_order ASC, id ASC")->fetchAll(PDO::FETCH_ASSOC) ?: [];
        $venues = $pdo->query("SELECT * FROM venues ORDER BY sort_order ASC, id ASC")->fetchAll(PDO::FETCH_ASSOC) ?: [];
        echo json_encode(["categories" => $cats, "services" => $services, "staff" => $staff, "organizations" => $orgs, "venues" => $venues]);
    }
    elseif ($action === 'add_master_item') {
        $type = $input['type'] ?? ''; $tableName = '';
        if ($type === 'staff') $tableName = 'users'; elseif ($type === 'category') $tableName = 'categories'; elseif ($type === 'org') $tableName = 'organizations'; elseif ($type === 'venue') $tableName = 'venues'; elseif ($type === 'service') $tableName = 'services';
        if (!$tableName) { echo json_encode(["error" => "نوع داده نامعتبر"]); exit; }
        $maxSort = $pdo->query("SELECT MAX(sort_order) FROM $tableName")->fetchColumn() ?: 0; $newOrder = $maxSort + 1;

        if ($type === 'staff') {
            $u = !empty($input['username']) ? $input['username'] : 'user'.time(); $p = !empty($input['password']) ? $input['password'] : '123456'; $av = saveBase64Image($input['avatar'] ?? '', 'avatar');
            $stmt = $pdo->prepare("INSERT INTO users (username, password, full_name, avatar, role, is_shadow, phone, phone2, iban, skills, can_delegate, sort_order) VALUES (?, ?, ?, ?, 'staff', ?, ?, ?, ?, ?, ?, ?)");
            $stmt->execute([$u, $p, $input['full_name'], $av, $input['is_shadow'] ? 1 : 0, $input['phone'] ?? '', $input['phone2'] ?? '', $input['iban'] ?? '', json_encode($input['skills'] ?? [], JSON_UNESCAPED_UNICODE), $input['can_delegate'] ? 1 : 0, $newOrder]);
        } elseif ($type === 'category') {
            $stmt = $pdo->prepare("INSERT INTO categories (name, sort_order) VALUES (?, ?)"); $stmt->execute([$input['name'], $newOrder]);
        } elseif ($type === 'org') {
            $logo = saveBase64Image($input['logo'] ?? '', 'logo');
            $stmt = $pdo->prepare("INSERT INTO organizations (name, logo, national_id, contacts, sort_order) VALUES (?, ?, ?, ?, ?)");
            $stmt->execute([$input['name'], $logo, $input['national_id'] ?? '', json_encode($input['contacts'] ?? [], JSON_UNESCAPED_UNICODE), $newOrder]);
        } elseif ($type === 'venue') {
            $stmt = $pdo->prepare("INSERT INTO venues (name, venue_type, capacity, gps_link, address, facilities, sort_order) VALUES (?, ?, ?, ?, ?, ?, ?)");
            $stmt->execute([$input['name'], $input['venue_type'] ?? '', (int)($input['capacity'] ?? 0), $input['gps_link'] ?? '', $input['address'] ?? '', json_encode($input['facilities'] ?? [], JSON_UNESCAPED_UNICODE), $newOrder]);
        } elseif ($type === 'service') {
            $stmt = $pdo->prepare("INSERT INTO services (name, category_id, cost_type, packages, sort_order) VALUES (?, ?, ?, ?, ?)");
            $stmt->execute([$input['name'], $input['category_id'], $input['cost_type'] ?? 'cumulative', json_encode($input['packages'] ?? [], JSON_UNESCAPED_UNICODE), $newOrder]);
        }
        echo json_encode(["success" => true]);
    }
    elseif ($action === 'edit_master_item') {
        $type = $input['type'] ?? ''; $id = (int)($input['id'] ?? 0);
        if ($type === 'staff') {
            $av = saveBase64Image($input['avatar'] ?? '', 'avatar');
            if (!empty($input['password'])) { 
                $stmt = $pdo->prepare("UPDATE users SET username=?, password=?, full_name=?, avatar=?, is_shadow=?, phone=?, phone2=?, iban=?, skills=?, can_delegate=? WHERE id=?"); 
                $stmt->execute([$input['username'], $input['password'], $input['full_name'], $av, $input['is_shadow']?1:0, $input['phone']??'', $input['phone2']??'', $input['iban']??'', json_encode($input['skills']??[], JSON_UNESCAPED_UNICODE), $input['can_delegate']?1:0, $id]); 
            } else { 
                $stmt = $pdo->prepare("UPDATE users SET username=?, full_name=?, avatar=?, is_shadow=?, phone=?, phone2=?, iban=?, skills=?, can_delegate=? WHERE id=?"); 
                $stmt->execute([$input['username']??'', $input['full_name'], $av, $input['is_shadow']?1:0, $input['phone']??'', $input['phone2']??'', $input['iban']??'', json_encode($input['skills']??[], JSON_UNESCAPED_UNICODE), $input['can_delegate']?1:0, $id]); 
            }
        } elseif ($type === 'category') { 
            $stmt = $pdo->prepare("UPDATE categories SET name=? WHERE id=?"); $stmt->execute([$input['name'], $id]); 
        } elseif ($type === 'org') { 
            $logo = saveBase64Image($input['logo'] ?? '', 'logo'); $stmt = $pdo->prepare("UPDATE organizations SET name=?, logo=?, national_id=?, contacts=? WHERE id=?"); $stmt->execute([$input['name'], $logo, $input['national_id']??'', json_encode($input['contacts']??[], JSON_UNESCAPED_UNICODE), $id]); 
        } elseif ($type === 'venue') { 
            $stmt = $pdo->prepare("UPDATE venues SET name=?, venue_type=?, capacity=?, gps_link=?, address=?, facilities=? WHERE id=?"); $stmt->execute([$input['name'], $input['venue_type']??'', (int)($input['capacity']??0), $input['gps_link']??'', $input['address']??'', json_encode($input['facilities']??[], JSON_UNESCAPED_UNICODE), $id]); 
        } elseif ($type === 'service') { 
            $stmt = $pdo->prepare("UPDATE services SET name=?, category_id=?, cost_type=?, packages=? WHERE id=?"); $stmt->execute([$input['name'], $input['category_id'], $input['cost_type']??'cumulative', json_encode($input['packages']??[], JSON_UNESCAPED_UNICODE), $id]); 
        }
        echo json_encode(["success" => true]);
    }
    elseif ($action === 'delete_master_item') {
        $t = $input['type']??''; $id = (int)($input['id']??0); $tbl = '';
        if ($t === 'staff') $tbl = 'users'; elseif ($t === 'category') $tbl = 'categories'; elseif ($t === 'org') $tbl = 'organizations'; elseif ($t === 'venue') $tbl = 'venues'; elseif ($t === 'service') $tbl = 'services';
        if ($tbl && $id) { $pdo->exec("DELETE FROM $tbl WHERE id = $id"); echo json_encode(["success" => true]); } else { echo json_encode(["error" => "نامعتبر"]); }
    }
    elseif ($action === 'update_sort') {
        $t = $input['table']??''; $id = (int)$input['id']; $dir = $input['direction'];
        $c = $pdo->query("SELECT sort_order FROM $t WHERE id = $id")->fetchColumn();
        if ($dir === 'top') { $m = $pdo->query("SELECT MIN(sort_order) FROM $t")->fetchColumn() ?: 0; $pdo->exec("UPDATE $t SET sort_order = ".($m-1)." WHERE id = $id"); } 
        elseif ($dir === 'bottom') { $m = $pdo->query("SELECT MAX(sort_order) FROM $t")->fetchColumn() ?: 0; $pdo->exec("UPDATE $t SET sort_order = ".($m+1)." WHERE id = $id"); } 
        elseif ($dir === 'up') { $p = $pdo->query("SELECT id, sort_order FROM $t WHERE sort_order < $c ORDER BY sort_order DESC LIMIT 1")->fetch(PDO::FETCH_ASSOC); if ($p) { $pdo->exec("UPDATE $t SET sort_order = {$p['sort_order']} WHERE id = $id"); $pdo->exec("UPDATE $t SET sort_order = $c WHERE id = {$p['id']}"); } } 
        elseif ($dir === 'down') { $n = $pdo->query("SELECT id, sort_order FROM $t WHERE sort_order > $c ORDER BY sort_order ASC LIMIT 1")->fetch(PDO::FETCH_ASSOC); if ($n) { $pdo->exec("UPDATE $t SET sort_order = {$n['sort_order']} WHERE id = $id"); $pdo->exec("UPDATE $t SET sort_order = $c WHERE id = {$n['id']}"); } }
        echo json_encode(["success" => true]);
    }
    elseif ($action === 'create_event') {
        $pdo->beginTransaction();
        $stmt = $pdo->prepare("INSERT INTO events (title, event_type, org_id, contact_name, venue_id, guest_count, start_date, end_date, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'draft')");
        $stmt->execute([$input['title'], $input['event_type'], $input['org_id']?:null, $input['contact_name'], $input['venue_id']?:null, (int)$input['guest_count'], $input['start_date']?:null, $input['end_date']?:null]);
        $eventId = $pdo->lastInsertId();

        logAction($pdo, $eventId, $input['admin_name'] ?? 'سیستم', "پرونده رویداد ایجاد شد.");

        if (!empty($input['selected_services'])) {
            foreach ($input['selected_services'] as $svc) {
                $unitPrice = $svc['unit_price'] ?? null; $qty = $svc['qty'] ?? 1; $frozenPrice = $svc['price'] ?? null;
                $stmtService = $pdo->prepare("INSERT INTO event_services (event_id, service_name, frozen_price, cost_type, unit_price, qty) VALUES (?, ?, ?, ?, ?, ?)");
                $stmtService->execute([$eventId, $svc['name'], $frozenPrice !== '' ? $frozenPrice : null, $svc['cost_type'] ?? 'cumulative', $unitPrice !== '' ? $unitPrice : null, $qty]);
                
                if (!empty($svc['tasks'])) {
                    $stmtTask = $pdo->prepare("INSERT INTO event_tasks (event_id, title, role_tag, timing_tag, depends_on_id) VALUES (?, ?, ?, ?, ?)");
                    foreach($svc['tasks'] as $task) { $stmtTask->execute([$eventId, $task['title'], $task['role'], $task['timing'] ?? null, $task['depends_on_id'] ?? null]); }
                }
            }
        }
        $pdo->commit();
        echo json_encode(["success" => true]);
    }
    elseif ($action === 'update_event_details') {
        $pdo->beginTransaction();
        $stmt = $pdo->prepare("UPDATE events SET venue_id=?, guest_count=?, start_date=?, end_date=? WHERE id=?");
        $stmt->execute([$input['venue_id']?:null, (int)$input['guest_count'], $input['start_date']?:null, $input['end_date']?:null, $input['event_id']]);
        $stmt2 = $pdo->prepare("UPDATE event_services SET qty=?, frozen_price = unit_price * ? WHERE event_id=? AND cost_type='individual'");
        $stmt2->execute([(int)$input['guest_count'], (int)$input['guest_count'], $input['event_id']]);
        logAction($pdo, $input['event_id'], $input['user_name'], "ابعاد، مکان یا زمان‌بندی رویداد ویرایش شد.");
        $pdo->commit();
        echo json_encode(["success" => true]);
    }
    elseif ($action === 'get_events') {
        $stmt = $pdo->query("SELECT e.*, o.name as org_name, o.logo as org_logo, v.name as venue_name FROM events e LEFT JOIN organizations o ON e.org_id = o.id LEFT JOIN venues v ON e.venue_id = v.id ORDER BY e.id DESC");
        echo json_encode($stmt->fetchAll(PDO::FETCH_ASSOC) ?: []);
    }
    elseif ($action === 'get_event_detail') {
        $eventId = (int)$_GET['id'];
        $event = $pdo->query("SELECT e.*, o.name as org_name, o.logo as org_logo, v.name as venue_name FROM events e LEFT JOIN organizations o ON e.org_id = o.id LEFT JOIN venues v ON e.venue_id = v.id WHERE e.id = $eventId")->fetch(PDO::FETCH_ASSOC);
        $tasks = $pdo->query("SELECT t.*, u.avatar as assignee_avatar, u.full_name as assignee_name FROM event_tasks t LEFT JOIN users u ON t.assignee_id = u.id WHERE t.event_id = $eventId ORDER BY t.id ASC")->fetchAll(PDO::FETCH_ASSOC) ?: [];
        $services = $pdo->query("SELECT * FROM event_services WHERE event_id = $eventId")->fetchAll(PDO::FETCH_ASSOC) ?: [];
        $logs = $pdo->query("SELECT * FROM event_logs WHERE event_id = $eventId ORDER BY id DESC")->fetchAll(PDO::FETCH_ASSOC) ?: [];
        $delegations = $pdo->query("SELECT d.*, u.full_name as from_name, t.title as task_title FROM delegations d JOIN users u ON d.from_user_id = u.id JOIN event_tasks t ON d.task_id = t.id WHERE d.event_id = $eventId AND d.status = 'pending'")->fetchAll(PDO::FETCH_ASSOC) ?: [];
        echo json_encode(["event" => $event, "tasks" => $tasks, "services" => $services, "logs" => $logs, "delegations" => $delegations]);
    }
    elseif ($action === 'update_task') {
        $userName = $input['user_name'] ?? 'کاربر';
        if(isset($input['assignee_id'])) { 
            $stmt = $pdo->prepare("UPDATE event_tasks SET assignee_id = ? WHERE id = ?"); $stmt->execute([$input['assignee_id'] ?: null, $input['task_id']]); 
            logAction($pdo, $input['event_id'], $userName, "متصدی یک وظیفه تغییر کرد.");
        } 
        elseif(isset($input['is_done'])) { 
            $stmt = $pdo->prepare("UPDATE event_tasks SET is_done = ? WHERE id = ?"); $stmt->execute([$input['is_done'] ? 1 : 0, $input['task_id']]); 
            $st = $input['is_done'] ? 'انجام شد' : 'از حالت انجام‌شده خارج شد';
            logAction($pdo, $input['event_id'], $userName, "وضعیت وظیفه‌ای تغییر کرد.");
        } 
        elseif(isset($input['has_issue'])) { 
            $stmt = $pdo->prepare("UPDATE event_tasks SET has_issue = ?, issue_note = ? WHERE id = ?"); $stmt->execute([$input['has_issue'] ? 1 : 0, $input['issue_note'] ?? null, $input['task_id']]); 
            $st = $input['has_issue'] ? "اعلام مانع: {$input['issue_note']}" : "مانع برطرف شد.";
            logAction($pdo, $input['event_id'], $userName, "برای یک وظیفه, $st");
            if ($input['has_issue']) sendNotification($pdo, 0, "گزارش مانع: {$input['issue_note']}", 'issue', $input['event_id']);
        }
        echo json_encode(["success" => true]);
    }
    elseif ($action === 'update_finance_item') {
        $stmt = $pdo->prepare("UPDATE event_services SET qty=?, unit_price=?, frozen_price=? WHERE id=?");
        $total = ((float)$input['unit_price'] * (int)$input['qty']);
        $stmt->execute([(int)$input['qty'], $input['unit_price'] !== '' ? $input['unit_price'] : null, $total ?: null, $input['service_id']]);
        logAction($pdo, $input['event_id'], $input['user_name'], "ردیف فاکتور ویرایش شد.");
        echo json_encode(["success" => true]);
    }
    elseif ($action === 'update_finance_totals') {
        $stmt = $pdo->prepare("UPDATE events SET discount=?, tax_percent=?, deposit=? WHERE id=?");
        $stmt->execute([$input['discount']?:0, $input['tax_percent']?:0, $input['deposit']?:0, $input['event_id']]);
        logAction($pdo, $input['event_id'], $input['user_name'], "ضرایب فاکتور نهایی آپدیت شد.");
        echo json_encode(["success" => true]);
    }
    elseif ($action === 'update_event_status') {
        $stmt = $pdo->prepare("UPDATE events SET status = ? WHERE id = ?"); $stmt->execute([$input['status'], $input['event_id']]);
        logAction($pdo, $input['event_id'], $input['user_name'], "وضعیت رویداد تغییر یافت.");
        echo json_encode(["success" => true]);
    }
    elseif ($action === 'quick_replace') {
        $stmt = $pdo->prepare("UPDATE event_tasks SET assignee_id = ? WHERE event_id = ? AND assignee_id = ?");
        $stmt->execute([$input['new_user_id'], $input['event_id'], $input['old_user_id']]);
        logAction($pdo, $input['event_id'], $input['user_name'], "جایگزینی سریع نیرو انجام شد.");
        echo json_encode(["success" => true]);
    }
    elseif ($action === 'add_quick_task') {
        $stmt = $pdo->prepare("INSERT INTO event_tasks (event_id, title, timing_tag, role_tag) VALUES (?, ?, ?, 'بدون پکیج')");
        $stmt->execute([$input['event_id'], $input['title'], $input['timing']]);
        logAction($pdo, $input['event_id'], $input['user_name'], "وظیفه آزاد افزوده شد.");
        echo json_encode(["success" => true]);
    }
    elseif ($action === 'add_adhoc_service') {
        $stmt = $pdo->prepare("INSERT INTO event_services (event_id, service_name, frozen_price, cost_type) VALUES (?, ?, ?, 'cumulative')");
        $stmt->execute([$input['event_id'], $input['name'], $input['price'] !== '' ? $input['price'] : null]);
        logAction($pdo, $input['event_id'], $input['user_name'], "سرویس درخواستی اضافه شد.");
        echo json_encode(["success" => true]);
    }
    elseif ($action === 'request_delegation') {
        $stmt = $pdo->prepare("INSERT INTO delegations (task_id, event_id, from_user_id, to_user_id) VALUES (?, ?, ?, ?)");
        $stmt->execute([$input['task_id'], $input['event_id'], $input['from_user_id'], $input['to_user_id']]);
        $delId = $pdo->lastInsertId();
        sendNotification($pdo, 0, "SYSTEM_DELEGATION_REQUEST", 'delegation', $delId);
        echo json_encode(["success" => true]);
    }
    elseif ($action === 'get_notifications') {
        $uid = (int)$_GET['user_id'];
        $role = $_GET['role'] ?? 'staff';
        $stmt = $pdo->query("SELECT n.*, d.task_id, d.to_user_id, d.from_user_id, t.title as task_title, u_from.full_name as from_name, u_to.full_name as to_name FROM notifications n LEFT JOIN delegations d ON n.ref_id = d.id AND n.type = 'delegation' LEFT JOIN event_tasks t ON d.task_id = t.id LEFT JOIN users u_from ON d.from_user_id = u_from.id LEFT JOIN users u_to ON d.to_user_id = u_to.id WHERE (n.user_id = $uid OR (n.user_id = 0 AND 'superadmin' = '$role')) AND n.is_read = 0 ORDER BY n.id DESC");
        $res = $stmt->fetchAll(PDO::FETCH_ASSOC) ?: [];
        foreach($res as &$r) {
            if($r['type'] === 'delegation' && $r['from_name']) {
                $r['message'] = "همکار ({$r['from_name']}) درخواست واگذاری وظیفه‌ای را به ({$r['to_name']}) دارد.";
            }
        }
        echo json_encode($res);
    }
    elseif ($action === 'resolve_delegation') {
        $pdo->beginTransaction();
        $stmt = $pdo->prepare("UPDATE delegations SET status=? WHERE id=?");
        $stmt->execute([$input['status'], $input['delegation_id']]);
        if($input['status'] === 'approved') {
            $pdo->prepare("UPDATE event_tasks SET assignee_id=? WHERE id=?")->execute([$input['to_user_id'], $input['task_id']]);
            sendNotification($pdo, $input['from_user_id'], "مدیریت با درخواست واگذاری شما موافقت کرد.", 'success');
            sendNotification($pdo, $input['to_user_id'], "یک وظیفه جدید از سوی مدیریت به شما محول شد.", 'info', $input['event_id']);
            logAction($pdo, $input['event_id'], $input['user_name'], "وظیفه‌ای از طریق سیستم واگذاری منتقل شد.");
        } else {
            sendNotification($pdo, $input['from_user_id'], "مدیریت با واگذاری وظیفه مخالفت کرد.", 'error');
        }
        $pdo->prepare("UPDATE notifications SET is_read=1 WHERE id=?")->execute([$input['notif_id']]);
        $pdo->commit();
        echo json_encode(["success" => true]);
    }
    elseif ($action === 'mark_notif_read') {
        $pdo->prepare("UPDATE notifications SET is_read=1 WHERE id=?")->execute([(int)$input['id']]);
        echo json_encode(["success" => true]);
    }
    else { echo json_encode(["error" => "وب‌سرویس نامعتبر"]); }
} catch (Exception $e) {
    if($pdo->inTransaction()) $pdo->rollBack();
    echo json_encode(["error" => "خطای سرور: " . $e->getMessage()]);
}
// بدون علامت بسته شدن پی‌اچ‌پی در انتهای فایل برای جلوگیری از باگ‌های فاصله خالی