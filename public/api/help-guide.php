<?php
declare(strict_types=1);

// Public, approved answers. Keep all three language versions aligned with the app.
return [
    'demo' => [
        'source' => ['label' => 'Demo workspaces', 'labelTl' => 'Mga demo workspace', 'href' => '#workspaces'],
        'terms' => ['demo', 'sample account', 'sample data', 'try the app', 'try udd go', 'subukan', 'paano subukan', 'walang account', 'without an account'],
        'en' => 'In demo mode, choose a fleet admin, driver, or student workspace. The demo uses sample records. Changes you make there stay in your browser.',
        'tl' => 'Sa demo mode, pumili ng workspace para sa fleet admin, driver, o student. Halimbawang datos ang gamit sa demo, at sa browser mo lang naka-save ang mga pagbabagong gagawin mo.',
        'tgl' => 'Sa demo mode, choose a fleet admin, driver, or student workspace. Sample records ang gamit, at sa browser mo lang naka-save ang changes mo.',
    ],
    'sign-in' => [
        'source' => ['label' => 'Landing page FAQ', 'labelTl' => 'Mga karaniwang tanong', 'href' => '#questions'],
        'terms' => ['sign in', 'log in', 'login', 'school credentials', 'password', 'school account', 'credentials', 'mag sign in', 'mag login', 'mag log in', 'makapasok'],
        'en' => 'Choose Open school portal to sign in. A connected school workspace uses your school credentials. If you are trying the demo, choose Demo access and select a sample account for your role.',
        'tl' => 'Piliin ang Open school portal para mag-sign in gamit ang school credentials mo. Kung susubukan mo ang demo, piliin ang Demo access at pumili ng sample account para sa role mo.',
        'tgl' => 'Click Open school portal at mag-sign in gamit ang school credentials mo. Kung demo lang, choose Demo access, then pick a sample account for your role.',
    ],
    'pickup' => [
        'source' => ['label' => 'School run guidelines', 'labelTl' => 'Gabay sa pagsakay', 'href' => '#guidelines'],
        'terms' => ['pickup', 'pick up', 'pickup stop', 'pickup location', 'bus stop', 'wait for the bus', 'saan ako sasakay', 'saan sasakay', 'saan maghihintay', 'sakayan', 'susunduin', 'saan ang hintayan', 'hintayan'],
        'en' => 'Open My journey in the student portal and check the trip’s pickup stop, assigned bus, and scheduled departure. Wait at the assigned stop and have your boarding ID ready.',
        'tl' => 'Buksan ang My journey sa student portal para makita ang iyong sakayan, nakatalagang bus, at oras ng pag-alis ayon sa iskedyul. Maghintay sa nakatalagang sakayan at ihanda ang boarding ID mo.',
        'tgl' => 'Open My journey sa student portal. Nandoon ang pickup stop, assigned bus, at scheduled departure mo. Wait sa assigned stop at ihanda ang boarding ID mo.',
    ],
    'boarding' => [
        'source' => ['label' => 'Student workspace', 'labelTl' => 'Student workspace', 'href' => '#workspace-student'],
        'terms' => ['boarding id', 'boarding code', 'boarding pass', 'show boarding id', 'id sa pagsakay', 'ipakita ang id', 'paano mag board', 'code sa pagsakay', 'boarding'],
        'en' => 'Before you board, open My journey and choose Show boarding ID. Show the code to your driver. When the driver records boarding, My journey switches to show your drop-off stop.',
        'tl' => 'Bago sumakay, buksan ang My journey at piliin ang Show boarding ID. Ipakita ang code sa driver. Kapag naitala na ng driver ang pagsakay mo, ang bababaan mo naman ang ipapakita sa My journey.',
        'tgl' => 'Before boarding, open My journey at tap Show boarding ID. Ipakita ang code sa driver. Once recorded na ang boarding mo, makikita mo naman ang drop-off stop sa My journey.',
    ],
    'tracking' => [
        'source' => ['label' => 'Landing page FAQ', 'labelTl' => 'Mga karaniwang tanong', 'href' => '#questions'],
        'terms' => ['track', 'tracking', 'gps', 'live', 'bus location', 'where is my bus', 'where is the bus', 'is my bus late', 'bus arrival', 'nasaan', 'asan na ang bus', 'saan na ang bus', 'nandiyan na', 'malapit na ba', 'anong oras darating', 'lokasyon ng bus'],
        'en' => 'Open My journey to check your bus. A current location is available during an active trip when your driver shares GPS. The map on this landing page shows a sample route.',
        'tl' => 'Buksan ang My journey para tingnan ang bus mo. Makikita ang kasalukuyang lokasyon habang bumibiyahe ang bus at nagbabahagi ng GPS ang driver. Halimbawang ruta ang nasa mapa ng landing page.',
        'tgl' => 'Open My journey para i-check ang bus mo. Live location appears during an active trip kapag nag-share ng GPS ang driver. Sample route lang ang map sa landing page.',
    ],
    'issue' => [
        'source' => ['label' => 'Trip reports guide', 'labelTl' => 'Gabay sa trip reports', 'href' => 'https://github.com/Theshy691/UDD-Go#explore-the-interface'],
        'terms' => ['report a trip issue', 'report', 'missed pickup', 'bus did not stop', 'bus didn’t stop', 'bus left me', 'wrong pickup', 'missing boarding', 'wasn t recorded', 'complaint', 'hindi huminto', 'di huminto', 'hindi tumigil', 'hindi ako nasundo', 'iniwan ako ng bus', 'mali ang sakayan', 'magreklamo', 'magsumbong', 'problema sa biyahe'],
        'related' => ['issue-status'],
        'en' => 'Open My journey and choose Report a trip issue. Pick a reason and add a note if needed. Fleet dispatch reviews the report, and you can see its Sent, Received, or Resolved status on the trip. For immediate help, use Call UDD Security in My journey.',
        'tl' => 'Buksan ang My journey at piliin ang Report a trip issue. Pumili ng dahilan at magdagdag ng note kung kailangan. Susuriin ito ng fleet dispatch, at makikita mo sa biyahe kung Sent, Received, o Resolved na. Kung kailangan mo agad ng tulong, piliin ang Call UDD Security sa My journey.',
        'tgl' => 'Sa My journey, tap Report a trip issue. Pick a reason at mag-add ng note kung kailangan. Fleet dispatch ang magre-review, at makikita mo sa trip kung Sent, Received, o Resolved na. For urgent help, tap Call UDD Security sa My journey.',
    ],
    'issue-status' => [
        'source' => ['label' => 'Trip reports guide', 'labelTl' => 'Gabay sa trip reports', 'href' => 'https://github.com/Theshy691/UDD-Go#explore-the-interface'],
        'terms' => ['report status', 'status ng report', 'status ng sinumbong', 'report received', 'report resolved', 'mark received', 'mark resolved'],
        'follow' => ['after that', 'got it', 'get it', 'get my note', 'know they', 'next', 'natanggap', 'na receive', 'inayos na', 'status', 'naayos', 'solved', 'see it', 'what happens'],
        'en' => 'Check Trip reports on the affected trip in My journey or Trips & history. Sent means the report was submitted, Received means dispatch acknowledged it, and Resolved means dispatch closed it. Open reports appear under Overview → Needs attention for fleet admins.',
        'tl' => 'Tingnan ang Trip reports ng biyahe sa My journey o Trips & history. Ang Sent ay naipadala na, ang Received ay kinilala na ng fleet dispatch, at ang Resolved ay isinara na nila ang report. Makikita ng fleet admin ang mga bukas na report sa Overview → Needs attention.',
        'tgl' => 'Check Trip reports sa mismong trip sa My journey o Trips & history. Sent means na-submit na, Received means na-acknowledge ng dispatch, at Resolved means closed na ang report. Sa admin Overview, open reports are under Needs attention.',
    ],
    'dispatch' => [
        'source' => ['label' => 'Fleet admin workspace', 'labelTl' => 'Fleet admin workspace', 'href' => '#workspace-admin'],
        'terms' => ['admin', 'dispatch', 'prepare trip', 'assign a bus', 'assign a driver', 'assign driver', 'maintenance', 'needs attention', 'magtalaga', 'maghanda ng biyahe', 'maghanda ng ruta'],
        'en' => 'Fleet admins use Services & calendar to plan scheduled service and assign vehicles and drivers. Use Prepare trip to create a dated trip. Overview shows active buses and items under Needs attention.',
        'tl' => 'Sa Services & calendar, nagpaplano ang fleet admin ng iskedyul at nagtatalaga ng bus at driver. Gamitin ang Prepare trip para gumawa ng biyahe na may petsa. Makikita sa Overview ang mga bumibiyaheng bus at mga kailangang asikasuhin sa Needs attention.',
        'tgl' => 'Sa Services & calendar, fleet admins set the schedule at nag-a-assign ng bus at driver. Choose Prepare trip para gumawa ng dated trip. Sa Overview makikita ang active buses at ang Needs attention list.',
    ],
    'driver' => [
        'source' => ['label' => 'Driver workspace', 'labelTl' => 'Driver workspace', 'href' => '#workspace-driver'],
        'terms' => ['my route', 'driver workspace', 'driver demo', 'driver see', 'cabin check', 'drop off', 'dropoff', 'view passengers', 'ruta ng driver', 'paano mag start ng trip', 'magbaba', 'mga pasahero'],
        'en' => 'In My route, drivers can see assigned trips and the next passenger stop, share GPS, record boarding and drop-offs, and complete the cabin check at the end.',
        'tl' => 'Sa My route, makikita ng driver ang nakatalagang biyahe at susunod na sakayan o babaan. Dito rin puwedeng magbahagi ng GPS, magtala ng pagsakay at pagbaba, at kumpirmahing wala nang pasahero sa dulo ng biyahe.',
        'tgl' => 'Sa My route makikita ng driver ang assigned trips at next passenger stop. Dito puwedeng mag-share ng GPS, mag-record ng boarding at drop-off, at mag-cabin check pagkatapos ng trip.',
    ],
    'route-preview' => [
        'source' => ['label' => 'Dagupan route demo', 'labelTl' => 'Demo ng mga ruta sa Dagupan', 'href' => '#routes'],
        'terms' => ['route preview', 'route demo', 'simulation', 'sample route', 'two seconds', 'play trip', 'map demo', 'demo ng ruta', 'halimbawang ruta', 'dalawang segundo'],
        'en' => 'Use the Dagupan route demo to pick a sample route, play the simulation, or jump to a stop. The simulated bus waits two seconds at each stop.',
        'tl' => 'Sa demo ng mga ruta sa Dagupan, puwede kang pumili ng ruta, patakbuhin ang simulation, o direktang pumunta sa isang stop. Naghihintay nang dalawang segundo ang demo bus sa bawat stop.',
        'tgl' => 'Sa Dagupan route demo, pick a sample route, play the simulation, o jump to a stop. The demo bus waits two seconds sa bawat stop.',
    ],
    'traffic' => [
        'source' => ['label' => 'Driver route traffic guide', 'labelTl' => 'Gabay sa route traffic ng driver', 'href' => 'https://github.com/Theshy691/UDD-Go#driver-route-traffic'],
        'terms' => ['traffic', 'traffic delay', 'tomtom', 'matrapik', 'trapik', 'trapiko'],
        'en' => 'A driver can check Traffic in My route for an estimated driving delay and the most affected stretch. Demo mode uses sample delays. A connected school workspace needs the TomTom Routing setup for current estimates.',
        'tl' => 'Puwedeng tingnan ng driver ang Traffic sa My route para makita ang tinatayang dagdag sa oras ng biyahe at ang bahaging pinakamatrapik. Halimbawa lang ang mga delay sa demo. Kailangan ang TomTom Routing setup para sa kasalukuyang tantiya sa school workspace.',
        'tgl' => 'Sa My route, puwedeng i-check ng driver ang Traffic para makita ang estimated delay at pinaka-apektadong stretch. Sample delays lang ang demo. A connected workspace needs TomTom Routing para sa current estimates.',
    ],
    'trip-history' => [
        'source' => ['label' => 'Trips and history workflow', 'labelTl' => 'Gabay sa Trips & history', 'href' => 'https://github.com/Theshy691/UDD-Go/blob/main/md/README.md#included-workflows'],
        'terms' => ['trip history', 'trips history', 'previous trips', 'past trips', 'completed trips', 'dating biyahe', 'nakaraang biyahe', 'biyahe kahapon'],
        'en' => 'Open Trips & history to find your trips by date. Choose a trip to see its details. A student can also check their passenger record and report status there.',
        'tl' => 'Buksan ang Trips & history para maghanap ng biyahe ayon sa petsa. Piliin ang biyahe para tingnan ang detalye. Makikita rin ng estudyante ang sariling passenger record at estado ng report doon.',
        'tgl' => 'Open Trips & history para maghanap ng trips by date. Select a trip for details. Students can also check their passenger record at report status doon.',
    ],
];
