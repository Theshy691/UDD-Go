<?php
declare(strict_types=1);

// Optional PHP middleware. Supabase verifies each forwarded bearer token and enforces RLS.
header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');
header('X-Content-Type-Options: nosniff');

$url = rtrim(getenv('SUPABASE_URL') ?: '', '/');
$key = getenv('SUPABASE_ANON_KEY') ?: '';
$action = $_GET['action'] ?? '';
if ($action === 'config' && $_SERVER['REQUEST_METHOD'] === 'GET') {
    echo json_encode(['url' => $url, 'key' => $key, 'cartoKey' => getenv('CARTO_API_KEY') ?: '', 'middleware' => true], JSON_THROW_ON_ERROR);
    exit;
}
if (!$url || !$key) {
    http_response_code(503);
    echo json_encode(['error' => 'Supabase is not configured. Set SUPABASE_URL and SUPABASE_ANON_KEY.']);
    exit;
}
$authorization = $_SERVER['HTTP_AUTHORIZATION'] ?? '';
if (!preg_match('/^Bearer [A-Za-z0-9_.\-]+$/', $authorization)) {
    http_response_code(401);
    echo json_encode(['error' => 'A valid bearer token is required.']);
    exit;
}
$method = $_SERVER['REQUEST_METHOD'];
$resource = $_GET['resource'] ?? '';
$allowed = ['users', 'buses', 'routes', 'route_stops', 'student_assignments', 'activity'];
if ($action === 'list' && $method === 'GET' && in_array($resource, $allowed, true)) {
    $path = '/rest/v1/' . $resource . '?select=*&limit=10000';
    $body = null;
} elseif ($action === 'mutate' && $method === 'POST') {
    if ((int)($_SERVER['CONTENT_LENGTH'] ?? 0) > 65536) {
        http_response_code(413); echo json_encode(['error' => 'Request too large.']); exit;
    }
    $body = file_get_contents('php://input', false, null, 0, 65537);
    if (strlen($body) > 65536 || json_decode($body, true) === null) {
        http_response_code(400); echo json_encode(['error' => 'A JSON RPC payload is required.']); exit;
    }
    $path = '/rest/v1/rpc/fleet_action';
} else {
    http_response_code(404); echo json_encode(['error' => 'Endpoint not found.']); exit;
}
$curl = curl_init($url . $path);
curl_setopt_array($curl, [
    CURLOPT_RETURNTRANSFER => true,
    CURLOPT_TIMEOUT => 15,
    CURLOPT_HTTPHEADER => ['apikey: ' . $key, 'Authorization: ' . $authorization, 'Content-Type: application/json'],
    CURLOPT_CUSTOMREQUEST => $method,
    CURLOPT_PROTOCOLS => CURLPROTO_HTTPS,
]);
if ($body !== null) { curl_setopt($curl, CURLOPT_POSTFIELDS, $body); }
$result = curl_exec($curl);
if ($result === false) {
    http_response_code(502); echo json_encode(['error' => 'The fleet service is unavailable. Try again shortly.']);
} else {
    http_response_code(curl_getinfo($curl, CURLINFO_HTTP_CODE)); echo $result;
}
curl_close($curl);
