<?php
declare(strict_types=1);

$api = getenv('UDD_HELP_API_DIR') ?: dirname(__DIR__) . '/public/api';
require $api . '/help-chat.php';
$guide = require $api . '/help-guide.php';

function check(bool $condition, string $message): void
{
    if (!$condition) throw new RuntimeException($message);
}

$mock = static function (string $question, string $preference, array $candidates): array {
    check(array_keys($candidates) === ['issue'], 'Retrieve only relevant public help.');
    return ['language' => 'tl', 'passages' => ['issue'], 'text' => 'Unapproved model text'];
};
$answer = helpAnswer('Paano kung hindi huminto ang bus?', 'auto', $guide, $mock);
check($answer['mode'] === 'model' && $answer['language'] === 'tl', 'Use a valid model selection in Tagalog.');
check($answer['passages'][0]['text'] === $guide['issue']['tl'], 'Display only approved text.');
check($answer['passages'][0]['href'] === $guide['issue']['source']['href'], 'Source link must come from the guide.');
$english = helpAnswer('Paano kung hindi huminto ang bus?', 'en', $guide, $mock);
check($english['passages'][0]['text'] === $guide['issue']['en'], 'Honor explicit preferences.');

$noMatch = helpAnswer('Magkano ang tuition?', 'tl', $guide, static function (): array {
    throw new RuntimeException('Unrelated questions should not reach the model.');
});
check($noMatch['passages'] === [], 'Return no answer for unrelated questions.');
$invalid = helpAnswer('Where is my pickup stop?', 'en', $guide, static fn (): array => [
    'language' => 'en', 'passages' => ['tracking'],
]);
check($invalid['mode'] === 'reference' && $invalid['passages'][0]['text'] === $guide['pickup']['en'], 'Reject IDs outside the retrieval result.');
$offline = helpAnswer('Nasaan na ang bus?', 'auto', $guide, static fn () => null);
check($offline['language'] === 'tl' && $offline['passages'][0]['text'] === $guide['tracking']['tl'], 'Use the bilingual guide if the model is offline.');
$decline = helpAnswer('Does live tracking show the bus fare?', 'en', $guide, static fn (): array => [
    'language' => 'en', 'passages' => [],
]);
check($decline['mode'] === 'model' && $decline['passages'] === [], 'Honor a valid model abstention.');

$mixed = helpAnswer('Paano ko i-check ang pickup stop?', 'auto', $guide, static fn () => null);
check($mixed['language'] === 'tgl' && $mixed['passages'][0]['text'] === $guide['pickup']['tgl'], 'Detect and use approved Taglish copy.');
$follow = helpAnswer('And how do I know they got it?', 'auto', $guide,
    static function (string $question, string $preference, array $candidates): array {
        check($candidates['issue']['previous'] && !$candidates['issue-status']['previous'], 'Retrieve the previous topic and related passages.');
        return ['language' => 'en', 'passages' => ['issue', 'issue-status']];
    }, $answer['topics']);
check($follow['topics'] === ['issue-status'] && $follow['passages'][0]['text'] === $guide['issue-status']['en'], 'Use the relevant follow-up and omit a weakly matched passage.');
$topicReset = helpAnswer('How much is tuition?', 'auto', $guide, static function (): array {
    throw new RuntimeException('Old context should not carry over to an unrelated question.');
}, ['unknown-topic', 'issue']);
check($topicReset['topics'] === [] && $topicReset['passages'] === [], 'Use only retrieved guide topics.');

foreach ($guide as $id => $entry) {
    foreach (['en', 'tl', 'tgl'] as $language) {
        check(trim($entry[$language] ?? '') !== '', "Missing $language text for $id.");
    }
    check(!empty($entry['terms']) && !empty($entry['source']['href']), "Missing aliases or source for $id.");
    foreach ($entry['related'] ?? [] as $related) {
        check(isset($guide[$related]), "Unknown related topic $related for $id.");
    }
}

// Exercise the retriever independently of the local model with public workflow questions.
$examples = [
    ['What is UDD Go?', 'about', 'en'],
    ['Where is my route?', 'find-route', 'en'],
    ['Nasaan ang ruta ko?', 'find-route', 'tl'],
    ['Saan ang route ko?', 'find-route', 'tgl'],
    ['How can I generate trips for the week?', 'prepare-trips', 'en'],
    ['Paano gumawa ng ruta na may bagong stop?', 'route-editing', 'tl'],
    ['How ko i-enable ang GPS sharing?', 'gps-sharing', 'tgl'],
    ['What happens on a school holiday?', 'calendar-exception', 'en'],
    ['Paano mag-assign ng student?', 'service-passengers', 'tl'],
    ['What is a cabin check?', 'driver-finish', 'en'],
    ['How do I record an active handover?', 'resource-handover', 'en'],
    ['How do I export passenger record?', 'export-records', 'en'],
    ['Kailan due na ang bus?', 'maintenance', 'tl'],
];
foreach ($examples as [$question, $id, $language]) {
    $result = helpAnswer($question, 'auto', $guide, static fn () => null);
    check($result['topics'] === [$id], "Incorrect retrieval for: $question");
    check($result['language'] === $language, "Incorrect language for: $question");
}

echo 'Help retrieval, three languages, follow-ups, sources, and fallback passed for a guide with ' . count($guide) . " topics.\n";
