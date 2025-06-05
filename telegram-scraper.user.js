// ==UserScript==
// @name         Telegram Scraper (Menu Commands v2.3.2 - Auto Start & Random Channels)
// @name:ru      Telegram Scraper (Команды меню v2.3.2 - Автозапуск и Случайные каналы)
// @namespace    http://tampermonkey.net/
// @version      2.3.2
// @description  Scrapes Telegram, sends to n8n. GUI settings, auto-start, random channels. See GitHub for full instructions.
// @description:ru Собирает сообщения из Telegram, отправляет в n8n. GUI настроек, автозапуск, случайный порядок каналов. Полная инструкция на GitHub.
// @author       Igor Lebedev (Adapted by Gemini Pro)
// @license      MIT
// @homepageURL  https://github.com/LebedevIV/telegram-web-scraper
// @supportURL   https://github.com/LebedevIV/telegram-web-scraper/issues
// @match        https://web.telegram.org/k/*
// @match        https://web.telegram.org/a/*
// @match        https://web.telegram.org/z/*
// @require      https://openuserjs.org/src/libs/sizzle/GM_config.js
// @grant        GM_xmlhttpRequest
// @grant        GM_registerMenuCommand
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_info
// @run-at       document-idle
// ==/UserScript==

/*
    ENGLISH COMMENTS:
    This script is designed to scrape messages from specified Telegram channels
    when viewed in a web browser (web.telegram.org). It extracts relevant data
    (title, text, link, publication date, source, message ID) and sends it to
    a configured n8n webhook.

    Key Features:
    - Scrapes single currently viewed channel or all predefined channels.
    - Uses GM_config library for a graphical user interface for settings.
    - Handles message age limits to avoid scraping very old messages.
    - Navigates between channels in multi-channel mode.
    - Includes randomized delays to mimic human behavior.
    - Provides Tampermonkey menu commands for control.
    - Scheduled auto-start for multi-channel scraping (runs when the Telegram Web page is open at the specified time).
    - Option to randomize the order of channels for multi-channel scraping.

    РУССКИЕ КОММЕНТАРИИ:
    Этот скрипт предназначен для сбора сообщений из указанных Telegram-каналов
    при их просмотре в веб-браузере (web.telegram.org). Он извлекает релевантные данные
    (заголовок, текст, ссылку, дату публикации, источник, ID сообщения) и отправляет их
    на настроенный веб-хук n8n.

    Ключевые особенности:
    - Сбор данных с одного текущего канала или со всех предустановленных каналов.
    - Использует библиотеку GM_config для графического интерфейса настроек.
    - Учитывает максимальный возраст сообщений, чтобы не собирать слишком старые.
    - Осуществляет навигацию между каналами в многоканальном режиме.
    - Включает рандомизированные задержки для имитации человеческого поведения.
    - Предоставляет команды управления через меню Tampermonkey.
    - Автоматический запуск сбора со всех каналов по расписанию (срабатывает, если страница Telegram Web открыта в указанное время).
    - Опция случайного порядка сбора каналов при многоканальном сборе.
*/

(function() {
    'use strict';

    // --- GLOBAL SCRIPT VARIABLES (NOT SETTINGS) ---
    // --- ГЛОБАЛЬНЫЕ ПЕРЕМЕННЫЕ СКРИПТА (НЕ НАСТРОЙКИ) ---
    let isScrapingSingle = false; // Flag: true if single channel scraping is active
                                  // Флаг: true, если активен сбор с одного канала
    let isMultiChannelScrapingActive = false; // Flag: true if multi-channel scraping is active
                                              // Флаг: true, если активен многоканальный сбор
    let currentChannelIndex = 0; // Index for iterating through target channels in multi-channel mode
                                 // Индекс для перебора целевых каналов в многоканальном режиме
    let currentScrapingChannelInfo = null; // Object holding info of the channel currently being scraped
                                           // Объект с информацией о канале, который скрапится в данный момент
    let consecutiveScrollsWithoutNewFound = 0; // Counter for scrolls without finding new messages (to stop early)
                                               // Счетчик прокруток без нахождения новых сообщений (для ранней остановки)
    let autoStartCheckInterval = null; // Interval ID for checking auto-start time
                                       // ID интервала для проверки времени автозапуска
    const LAST_AUTO_SCRAPE_DATE_KEY = 'TeleScraper_lastAutoScrapeDate'; // GM_setValue key for last auto-scrape date (prefixed for uniqueness)
                                                                       // Ключ GM_setValue для даты последнего авто-сбора (с префиксом для уникальности)

    // --- SCRIPT CONSTANTS ---
    // --- КОНСТАНТЫ СКРИПТА ---

    // Original list of target channels. This list is used as the base.
    // Исходный список целевых каналов. Этот список используется как основа.
    const TARGET_CHANNELS_DATA_ORIGINAL = [
        { name: '@e1_news', id: '-1049795479' }, { name: '@RU66RU', id: '-1278627542' },
        { name: '@ekb4tv', id: '-1184077858' }, { name: '@rentv_news', id: '-1310155678' },
        { name: '@TauNewsEkb', id: '-1424016223' }, { name: '@BEZUMEKB', id: '-1739473739' },
        { name: '@zhest_dtp66', id: '-2454557093' }, { name: '@sverdlovskaya_oblasti', id: '-1673288653' },
        { name: '@novosti_ekb66', id: '-1662411694' }
    ];
    // Working copy of channels; this array can be shuffled if randomization is enabled.
    // Рабочая копия списка каналов; этот массив может быть перемешан, если включена рандомизация.
    let currentTargetChannels = [...TARGET_CHANNELS_DATA_ORIGINAL];

    // Settings keys that require a page reload or script restart to take full effect.
    // Ключи настроек, требующие перезагрузки страницы или перезапуска скрипта для полного вступления в силу.
    const SETTINGS_REQUIRING_RELOAD = [
        'N8N_WEBHOOK_URL'
    ];

    // --- HELPER FUNCTIONS ---
    // --- ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ ---

    /**
     * Custom console logger with a script prefix.
     * @param {string} message - The message to log.
     * @param {boolean} [isError=false] - If true, logs as an error.
     *
     * Пользовательский логгер консоли с префиксом скрипта.
     * @param {string} message - Сообщение для лога.
     * @param {boolean} [isError=false] - Если true, логируется как ошибка.
     */
    function consoleLog(message, isError = false) {
        const prefix = "[TeleScraper]";
        if (isError) { console.error(`${prefix} ${message}`); }
        else { console.log(`${prefix} ${message}`); }
    }

    /**
     * Updates status for console, primarily for user feedback during scraping.
     * @param {string} message - The status message.
     * @param {boolean} [isError=false] - If true, logs as an error.
     *
     * Обновляет статус в консоли, в основном для обратной связи с пользователем во время сбора данных.
     * @param {string} message - Статусное сообщение.
     * @param {boolean} [isError=false] - Если true, логируется как ошибка.
     */
    function updateStatusForConsole(message, isError = false) {
        consoleLog(message, isError);
        // In a more complex UI, this could update a status display element on the page.
        // В более сложном пользовательском интерфейсе это могло бы обновлять элемент отображения статуса на странице.
    }

    consoleLog(`v${GM_info.script.version} Script execution started.`);

    // --- GM_CONFIG SETUP ---
    // --- НАСТРОЙКА GM_CONFIG ---

    // Generate a unique ID for GM_config storage based on script version to avoid conflicts between script versions.
    // Генерация уникального ID для хранилища GM_config на основе версии скрипта во избежание конфликтов между версиями скрипта.
    const GM_CONFIG_ID = `TeleScraperConfig_v${GM_info.script.version.replace(/\./g, '_')}`;

    // Define the fields for the GM_config settings GUI.
    // Определение полей для графического интерфейса настроек GM_config.
    let configFields = {
        'N8N_WEBHOOK_URL': {
            'label': 'N8N Webhook URL:',
            'type': 'text',
            'default': 'http://localhost:5678/webhook/telegram-scraped-news',
            'section': ['Основные настройки / Main Settings'], // Section header in GUI / Заголовок секции в GUI
        },
        'MAX_MESSAGE_AGE_HOURS': {
            'label': 'Max message age (hours):',
            'type': 'int',
            'default': 24, // Good for daily auto-runs / Подходит для ежедневных автозапусков
            'min': 1,
            'max': 720 // 30 days / 30 дней
        },
        'BASE_SCRAPE_INTERVAL_MS': {
            'label': 'Base scrape interval (ms) (scroll up frequency):',
            'label:ru': 'Базовый интервал скрапинга (мс) (частота прокрутки вверх):',
            'type': 'int',
            'default': 60000,
            'min': 1000
        },
        'BASE_SCROLL_PAUSE_MS': {
            'label': 'Pause after scroll action (ms):',
            'label:ru': 'Пауза после действия прокрутки (мс):',
            'type': 'int',
            'default': 10000,
            'min': 500
        },
        'BASE_SEND_DELAY_MS': {
            'label': 'Delay before sending each message to n8n (ms):',
            'label:ru': 'Задержка перед отправкой каждого сообщения в n8n (мс):',
            'type': 'int',
            'default': 2500,
            'min': 100
        },
        'CONSECUTIVE_SCROLLS_LIMIT': {
            'label': 'Empty scrolls limit (stops channel if no new messages found after N scrolls):',
            'label:ru': 'Лимит пустых скроллов (останавливает канал, если нет новых сообщений после N прокруток):',
            'type': 'int',
            'default': 5,
            'min': 1
        },
        // Auto Start Section / Секция Автоматического Запуска
        'AUTO_START_ENABLED': {
            'label': 'Enable Automatic Scraping (All Channels):',
            'label:ru': 'Включить автоматический сбор (Все каналы):',
            'type': 'checkbox',
            'default': false,
            'section': ['Автоматический запуск / Automatic Start'],
            'title': 'If checked, the script will attempt to run "Scrape All Listed Channels" daily at the specified time, provided the Telegram Web tab is open. / Если отмечено, скрипт попытается запустить "Собрать со всех каналов" ежедневно в указанное время, если вкладка Telegram Web открыта.'
        },
        'AUTO_START_TIME': {
            'label': 'Scheduled Start Time (HH:MM, 24-hour local time):',
            'label:ru': 'Время запуска по расписанию (ЧЧ:ММ, 24-часовой формат, местное время):',
            'type': 'text', // Using text for HH:MM format, user must ensure correct format / Используется текст для формата ЧЧ:ММ, пользователь должен обеспечить правильный формат
            'default': '10:00',
            'size': 5, // Visual hint for input size / Визуальная подсказка размера поля ввода
            'title': 'Example: 09:30 for 9:30 AM, 22:15 for 10:15 PM'
        },
        // Fine-tuning Section / Секция Тонких Настроек
        'RANDOMIZE_CHANNEL_ORDER': {
            'label': 'Randomize channel order for multi-scrape:',
            'label:ru': 'Случайный порядок каналов при мульти-сборе:',
            'type': 'checkbox',
            'default': true,
            'section': ['Тонкие настройки (паузы и попытки) / Fine-tuning (pauses and attempts)'],
            'title': 'If checked, the order of channels from TARGET_CHANNELS_DATA will be shuffled before each multi-channel scrape. / Если отмечено, порядок каналов из TARGET_CHANNELS_DATA будет перемешан перед каждым многоканальным сбором.'
        },
        'NAVIGATION_INITIATION_PAUSE_MS': { 'label': 'Pause after navigation hash change (ms):', 'type': 'int', 'default': 5000, 'min': 500 },
        'CHANNEL_ACTIVATION_ATTEMPT_PAUSE_MS': { 'label': 'Pause between channel activation attempts (ms):', 'type': 'int', 'default': 1500, 'min': 100 },
        'MAX_CHANNEL_ACTIVATION_ATTEMPTS': { 'label': 'Max channel activation attempts:', 'type': 'int', 'default': 25, 'min': 1 },
        'BASE_SCROLL_ACTION_PAUSE_MS': { 'label': 'Short pause before/after scroll action (ms):', 'type': 'int', 'default': 1000, 'min': 50 },
        'BASE_SCROLL_BOTTOM_PROG_PAUSE_MS': { 'label': 'Pause during programmatic scroll to bottom (ms):', 'type': 'int', 'default': 2000, 'min': 100 },
        'BASE_SCROLL_BOTTOM_CLICK_PAUSE_MS': { 'label': 'Pause after "scroll to bottom" button click (ms):', 'type': 'int', 'default': 2500, 'min': 500 },
        'SCROLL_BOTTOM_PROGRAMMATIC_ITERATIONS': { 'label': 'Programmatic scroll to bottom iterations:', 'type': 'int', 'default': 3, 'min': 1 },
        'MAX_GO_TO_BOTTOM_CLICKS': { 'label': 'Max clicks on "scroll to bottom" button (with badge):', 'type': 'int', 'default': 3, 'min': 0 },
        'RANDOMNESS_FACTOR_MAJOR': { 'label': 'Randomness factor for major pauses (0.0-1.0):', 'type': 'float', 'default': 0.4, 'min': 0, 'max': 1 },
        'RANDOMNESS_FACTOR_MINOR': { 'label': 'Randomness factor for minor pauses (0.0-1.0):', 'type': 'float', 'default': 0.2, 'min': 0, 'max': 1 },
        'USE_FOCUS_IN_SCROLL_UP': { 'label': 'Use focus() during scroll up (experimental):', 'type': 'checkbox', 'default': false }
    };

    // Modify labels to include default values and reload info.
    // Модификация меток для включения значений по умолчанию и информации о перезагрузке.
    for (const key in configFields) {
        if (configFields.hasOwnProperty(key)) {
            let labelSuffix = ` (по умолчанию: ${configFields[key].default})`;
            if (SETTINGS_REQUIRING_RELOAD.includes(key)) {
                labelSuffix += ' [требуется перезагрузка / reload required]';
            }
            configFields[key].label += labelSuffix;
        }
    }

    // Event handlers for GM_config GUI.
    // Обработчики событий для GUI GM_config.
    const configEventHandlers = {
        'open': function(doc) { // 'doc' is the GM_config iframe's document / 'doc' - это документ iframe GM_config
            const urlFieldInputId = `${GM_CONFIG_ID}_field_N8N_WEBHOOK_URL`; // ID for the URL input field / ID для поля ввода URL

            // Styles for the content INSIDE the GM_config iframe.
            // Стили для содержимого ВНУТРИ iframe GM_config.
            const style = doc.createElement('style');
            style.textContent = `
                #${GM_CONFIG_ID}_wrapper { font-family: Arial, sans-serif; }
                #${GM_CONFIG_ID}_header { background-color: #4a4a4a; color: white; padding: 10px; font-size: 1.2em; margin-bottom: 10px; }
                .section_header { background-color: #f0f0f0; padding: 8px; margin-top: 15px; margin-bottom: 5px; border-top: 1px solid #ddd; border-bottom: 1px solid #ddd; font-weight: bold; color: #333; }
                .config_var { margin: 10px 15px; padding: 8px 0; border-bottom: 1px solid #eee; display: flex; flex-direction: column; }
                .config_var label { display: block; margin-bottom: 5px; color: #555; font-size: 0.9em; font-weight: normal; text-align: left; }
                .config_var input { padding: 6px; border: 1px solid #ccc; border-radius: 4px; box-sizing: border-box; margin-left: 0; width: 280px; max-width: 100%; }
                #${urlFieldInputId} { width: 100% !important; min-width: 450px !important; } /* Specific width for URL field / Особая ширина для поля URL */
                .config_var input[type="checkbox"] { width: auto !important; margin-right: auto; align-self: flex-start; }
                #${GM_CONFIG_ID}_buttons_holder { padding: 15px; text-align: right; border-top: 1px solid #ddd; background-color: #f9f9f9; }
                #${GM_CONFIG_ID}_saveBtn, #${GM_CONFIG_ID}_resetBtn, #${GM_CONFIG_ID}_closeBtn { padding: 8px 15px; margin-left: 10px; border: none; border-radius: 4px; cursor: pointer; font-weight: bold; }
                #${GM_CONFIG_ID}_saveBtn { background-color: #4CAF50; color: white; }
                #${GM_CONFIG_ID}_resetBtn { background-color: #f44336; color: white; }
                #${GM_CONFIG_ID}_closeBtn { background-color: #bbb; color: black; }
            `;
            doc.head.appendChild(style);

            const firstInput = doc.querySelector('input[type="text"], input[type="number"], input[type="checkbox"]');
            if (firstInput) {
                firstInput.focus();
            }
        },
        'save': function() {
            consoleLog("Настройки сохранены через GM_config GUI. / Settings saved via GM_config GUI.");
            alert("Настройки сохранены! Некоторые изменения (URL, автозапуск) могут потребовать перезагрузки или вступят в силу при следующей проверке.\n\nSettings saved! Some changes (URL, auto-start) may require a reload or will take effect on the next check.");
            setupAutoStart(); // Re-initialize auto-start check with new settings / Переинициализация проверки автозапуска с новыми настройками
        },
        'reset': function() {
            consoleLog("Настройки сброшены через GM_config GUI. / Settings reset via GM_config GUI.");
            alert("Настройки сброшены к значениям по умолчанию! Пожалуйста, перезагрузите страницу.\n\nSettings have been reset to default! Please reload the page.");
            setupAutoStart(); // Re-evaluate auto-start with default settings / Переоценка автозапуска с настройками по умолчанию
        }
    };

    let gmConfigInitialized = false;
    try {
        if (typeof GM_config !== 'undefined' && typeof GM_info !== 'undefined') {
            GM_config.init({
                'id': GM_CONFIG_ID,
                'title': `Настройки Telegram Scraper v${GM_info.script.version}`,
                'fields': configFields,
                'events': configEventHandlers,
                'frameStyle': { // Styles for the GM_config iframe itself / Стили для самого iframe GM_config
                    width: '1000px',
                    height: '75vh', // Relative to viewport height / Относительно высоты окна просмотра
                    minHeight: '500px',
                    border: '1px solid rgb(0, 0, 0)', // Default GM_config style / Стиль GM_config по умолчанию
                    margin: '0px',
                    maxHeight: '95%', // Limit to 95% of viewport height / Ограничение до 95% высоты окна просмотра
                    maxWidth: '95%',  // Limit to 95% of viewport width / Ограничение до 95% ширины окна просмотра
                    opacity: '1',
                    overflow: 'auto',
                    padding: '0px',
                    position: 'fixed',
                    zIndex: '9999' // Ensure it's on top / Гарантируем, что он поверх всего
                }
            });
            gmConfigInitialized = true;
            consoleLog("GM_config инициализирован. / GM_config initialized.");
        } else {
            if (typeof GM_config === 'undefined') consoleLog("GM_config не определен. Библиотека не загрузилась или есть конфликт. / GM_config is not defined. Library might not have loaded or there's a conflict.", true);
            if (typeof GM_info === 'undefined') consoleLog("GM_info не определен. Не могу получить версию скрипта. / GM_info is not defined. Cannot get script version.", true);
        }
    } catch (e) {
        consoleLog("Ошибка инициализации GM_config: / Error initializing GM_config: " + e, true);
        alert("Ошибка инициализации GM_config. Скрипт может работать некорректно. / Error initializing GM_config. The script might not work correctly.");
    }

    /**
     * Retrieves a configuration value using GM_config, with a fallback to default.
     * Includes checks for GM_config readiness.
     * @param {string} key - The configuration key.
     * @param {*} defaultValue - The default value if the key is not found or GM_config is not ready.
     * @returns {*} The configuration value or the default.
     *
     * Получает значение конфигурации с помощью GM_config, с возвратом к значению по умолчанию.
     * Включает проверки готовности GM_config.
     * @param {string} key - Ключ конфигурации.
     * @param {*} defaultValue - Значение по умолчанию, если ключ не найден или GM_config не готов.
     * @returns {*} Значение конфигурации или значение по умолчанию.
     */
    function getConfigValue(key, defaultValue) {
        if (gmConfigInitialized && typeof GM_config.get === 'function' && (typeof GM_config.isInit === 'undefined' || GM_config.isInit) ) {
            try {
                const val = GM_config.get(key);
                return typeof val !== 'undefined' ? val : defaultValue;
            } catch (e) {
                consoleLog(`Ошибка при вызове GM_config.get('${key}'): ${e}. Используется значение по умолчанию. / Error calling GM_config.get('${key}'): ${e}. Using default value.`, true);
                const field = configFields[key]; // Fallback to hardcoded defaults if GM_config fails post-init
                                                 // Возврат к жестко заданным значениям по умолчанию, если GM_config не срабатывает после init
                return field && typeof field.default !== 'undefined' ? field.default : defaultValue;
            }
        }
        // Fallback if GM_config is not initialized or not ready
        // Фоллбэк, если GM_config не инициализирован или не готов
        const field = configFields[key];
        return field && typeof field.default !== 'undefined' ? field.default : defaultValue;
    }

    /**
     * Returns a randomized interval based on a base interval and a randomness factor.
     * @param {number} baseInterval - The base interval in milliseconds.
     * @param {string} [randomnessFactorKey='RANDOMNESS_FACTOR_MAJOR'] - The key for the randomness factor in settings.
     * @returns {number} The randomized interval in milliseconds.
     *
     * Возвращает рандомизированный интервал на основе базового интервала и коэффициента случайности.
     * @param {number} baseInterval - Базовый интервал в миллисекундах.
     * @param {string} [randomnessFactorKey='RANDOMNESS_FACTOR_MAJOR'] - Ключ для коэффициента случайности в настройках.
     * @returns {number} Рандомизированный интервал в миллисекундах.
     */
    function getRandomizedInterval(baseInterval, randomnessFactorKey = 'RANDOMNESS_FACTOR_MAJOR') {
        const defaultFactor = configFields[randomnessFactorKey] ? configFields[randomnessFactorKey].default : 0.3;
        const factor = getConfigValue(randomnessFactorKey, defaultFactor);
        const delta = baseInterval * factor * (Math.random() - 0.5) * 2;
        return Math.max(50, Math.round(baseInterval + delta));
    }

    // --- AUTO-START LOGIC ---
    // --- ЛОГИКА АВТОЗАПУСКА ---

    /**
     * Checks if auto-scraping should run based on settings and current time.
     * This function is called periodically by an interval timer if auto-start is enabled.
     *
     * Проверяет, должен ли запуститься автоматический сбор на основе настроек и текущего времени.
     * Эта функция вызывается периодически таймером интервала, если автозапуск включен.
     */
    async function checkAndRunAutoScrape() {
        // Ensure GM_config is fully initialized before attempting to read values.
        // Убеждаемся, что GM_config полностью инициализирован перед попыткой чтения значений.
        if (!gmConfigInitialized || (typeof GM_config !== 'undefined' && typeof GM_config.isInit !== 'undefined' && !GM_config.isInit) ) {
            consoleLog("[AutoStart] GM_config еще не готов для проверки автозапуска. / GM_config not yet ready for auto-start check.");
            return;
        }

        if (!getConfigValue('AUTO_START_ENABLED', false)) {
            // consoleLog("[AutoStart] Auto-start is disabled in settings."); // Optional: log if disabled
            return;
        }
        if (isScrapingSingle || isMultiChannelScrapingActive) {
            // consoleLog("[AutoStart] Scraping is already in progress. Auto-start skipped for this interval.");
            return;
        }

        const scheduledTimeStr = getConfigValue('AUTO_START_TIME', '10:00');
        const parts = scheduledTimeStr.split(':');
        if (parts.length !== 2) {
            consoleLog(`[AutoStart] Неверный формат времени автозапуска: ${scheduledTimeStr}. Используйте ЧЧ:ММ. / Invalid auto-start time format: ${scheduledTimeStr}. Use HH:MM.`, true);
            return;
        }
        const scheduledHour = parseInt(parts[0], 10);
        const scheduledMinute = parseInt(parts[1], 10);

        if (isNaN(scheduledHour) || isNaN(scheduledMinute) || scheduledHour < 0 || scheduledHour > 23 || scheduledMinute < 0 || scheduledMinute > 59) {
            consoleLog(`[AutoStart] Неверные значения времени автозапуска: ${scheduledTimeStr}. / Invalid auto-start time values: ${scheduledTimeStr}.`, true);
            return;
        }

        const now = new Date();
        const todayStr = now.toISOString().split('T')[0]; // Format: YYYY-MM-DD / Формат: ГГГГ-ММ-ДД
        const lastRunDate = GM_getValue(LAST_AUTO_SCRAPE_DATE_KEY, null);

        if (lastRunDate === todayStr) {
            // consoleLog(`[AutoStart] Автоматический сбор уже выполнялся сегодня (${todayStr}). / Auto-scrape already ran today (${todayStr}).`);
            return;
        }

        if (now.getHours() === scheduledHour && now.getMinutes() === scheduledMinute) {
            consoleLog(`[AutoStart] Наступило время для автоматического запуска (${scheduledTimeStr})! / Scheduled time (${scheduledTimeStr}) reached for auto-start!`);
            updateStatusForConsole(`Автозапуск в ${scheduledTimeStr}... / Auto-starting at ${scheduledTimeStr}...`);
            GM_setValue(LAST_AUTO_SCRAPE_DATE_KEY, todayStr); // Mark as run for today / Пометить как выполненный сегодня
            await startMultiChannelScrapeMenu(true); // Pass true to indicate it's an auto-run / Передача true, чтобы указать, что это автозапуск
        } else {
            // Optional: Log that it's not time yet, can be verbose.
            // Опционально: Логировать, что время еще не наступило, может быть избыточным.
            // consoleLog(`[AutoStart] Current time ${now.getHours()}:${String(now.getMinutes()).padStart(2,'0')}. Scheduled for ${scheduledTimeStr}. Last run: ${lastRunDate || 'never'}`);
        }
    }

    /**
     * Sets up or clears the interval timer for checking the auto-start time.
     * Called on script load and after settings are saved/reset.
     *
     * Устанавливает или очищает таймер интервала для проверки времени автозапуска.
     * Вызывается при загрузке скрипта и после сохранения/сброса настроек.
     */
    function setupAutoStart() {
        if (autoStartCheckInterval) {
            clearInterval(autoStartCheckInterval);
            autoStartCheckInterval = null;
        }
        // This getConfigValue call is critical and needs GM_config to be ready.
        // Этот вызов getConfigValue критичен и требует, чтобы GM_config был готов.
        if (getConfigValue('AUTO_START_ENABLED', false)) {
            consoleLog("[AutoStart] Автозапуск включен. Проверка времени каждую минуту. / Auto-start enabled. Checking time every minute.");
            checkAndRunAutoScrape(); // Perform an initial check immediately / Немедленная первоначальная проверка
            autoStartCheckInterval = setInterval(checkAndRunAutoScrape, 60000); // Check every 60 seconds / Проверка каждые 60 секунд
        } else {
            consoleLog("[AutoStart] Автозапуск выключен. / Auto-start disabled.");
        }
    }

    // --- CORE SCRAPING FUNCTIONS (Definitions) ---
    // --- ОСНОВНЫЕ ФУНКЦИИ СКРАПИНГА (Определения) ---
    // (isTargetChannelActive, parseTimestampFromBubble, extractDataFromMessageElement, sendToN8N, processCurrentMessages, tryScrollUp, scrollToBottom, scrapingLoopSingleChannel, scrapeSingleChannelProcess)
    // These functions are defined below, after helper and config functions, to ensure all dependencies are met.
    // Эти функции определены ниже, после вспомогательных функций и функций конфигурации, чтобы обеспечить выполнение всех зависимостей.

    function isTargetChannelActive() { /* ... (Implementation as in v2.3.1 - no changes) ... */
        if (!currentScrapingChannelInfo || !currentScrapingChannelInfo.id) { return false; }
        const chatInfoContainer = document.querySelector('#column-center .chat.active .sidebar-header .chat-info');
        if (!chatInfoContainer) { return false; }
        const avatarElement = chatInfoContainer.querySelector('.avatar[data-peer-id]');
        if (avatarElement && avatarElement.dataset && avatarElement.dataset.peerId) {
            const displayedPeerId = avatarElement.dataset.peerId;
            if (displayedPeerId === currentScrapingChannelInfo.id) {
                consoleLog(`[isTargetActive] Channel "${currentScrapingChannelInfo.name}" (ID: ${currentScrapingChannelInfo.id}) IS ACTIVE.`);
                return true;
            }
        }
        return false;
    }
    function parseTimestampFromBubble(bubbleElement) { /* ... (Implementation as in v2.3.1 - no changes) ... */
        if (bubbleElement && bubbleElement.dataset && bubbleElement.dataset.timestamp) {
            return parseInt(bubbleElement.dataset.timestamp, 10) * 1000;
        }
        return null;
    }
    function extractDataFromMessageElement(messageElement) { /* ... (Implementation as in v2.3.1 - no changes) ... */
        const channelNameForSource = currentScrapingChannelInfo ? currentScrapingChannelInfo.name : 'unknown_channel';
        const data = {
            title: '', text: '', link: null, pubDate: null,
            source: `t.me/${channelNameForSource.replace('@','')}`,
            messageId: null, rawHtmlContent: messageElement.innerHTML
        };
        const parentBubble = messageElement.closest('.bubble.channel-post');
        if (!parentBubble) { consoleLog(`[Extractor] Parent bubble not found: ${messageElement.textContent.substring(0,50)}...`, true); return null; }
        data.messageId = parentBubble.dataset.mid;
        if (!data.messageId) { consoleLog(`[Extractor] Message ID not found: ${parentBubble.outerHTML.substring(0,100)}...`, true); return null; }
        const timestamp = parseTimestampFromBubble(parentBubble);
        if (!timestamp) { consoleLog(`[Extractor] Timestamp not parsed for ID ${data.messageId} in ${channelNameForSource}`, true); return null; }
        data.pubDate = new Date(timestamp).toISOString();
        const oldestAllowedDate = new Date();
        oldestAllowedDate.setHours(oldestAllowedDate.getHours() - getConfigValue('MAX_MESSAGE_AGE_HOURS', 24));
        if (new Date(timestamp) < oldestAllowedDate) {
            consoleLog(`[Extractor] Msg ID ${data.messageId} (PubDate: ${data.pubDate}) in ${channelNameForSource} OLDER than ${getConfigValue('MAX_MESSAGE_AGE_HOURS', 24)} hours. STOP_SCROLLING.`);
            return 'STOP_SCROLLING';
        }
        const strongElements = Array.from(messageElement.querySelectorAll('strong'));
        if (strongElements.length > 0) {
            const firstStrong = strongElements.find(s => {
                const anchor = s.closest('a');
                return !anchor || !(anchor.href.includes(`/${channelNameForSource.replace('@','')}`) || anchor.href.includes(`/${channelNameForSource}`));
            });
            if (firstStrong) data.title = firstStrong.innerText.trim();
        }
        let fullText = '';
        const channelNamePartForLinkComparison = channelNameForSource.replace('@','');
        messageElement.childNodes.forEach(node => {
            if (node.nodeType === Node.TEXT_NODE) { fullText += node.textContent; }
            else if (node.nodeType === Node.ELEMENT_NODE) {
                if (node.tagName === 'A' && node.classList.contains('anchor-url')) {
                    fullText += node.innerText;
                    if (!data.link && node.href && node.target === '_blank' && !node.href.startsWith('https://t.me/')) data.link = node.href;
                }
                else if (node.tagName !== 'STRONG' || (data.title && !node.innerText.trim().startsWith(data.title) && !data.title.includes(node.innerText.trim()))) {
                    const isCustomEmoji = node.matches && (node.matches('img.custom-emoji') || node.matches('custom-emoji-element') || node.querySelector('img.custom-emoji'));
                    const isSticker = node.matches && (node.matches('.media-sticker-wrapper') || node.matches('tg-sticker'));
                    const isReactions = node.matches && (node.matches('reactions-element') || node.classList.contains('reactions'));
                    let isChannelSignatureLink = false;
                    if (node.tagName === 'A' && node.href) {
                        const hrefLower = node.href.toLowerCase();
                        if (hrefLower.includes(`t.me/${channelNamePartForLinkComparison.toLowerCase()}`) || hrefLower.includes(`/${channelNamePartForLinkComparison.toLowerCase()}`)) {
                            if (node.innerText.toLowerCase().includes(channelNamePartForLinkComparison.toLowerCase())) isChannelSignatureLink = true;
                        }
                    }
                    if (!isChannelSignatureLink && node.querySelector(`a[href*="/${channelNamePartForLinkComparison}"]`)) {
                        const nestedLink = node.querySelector(`a[href*="/${channelNamePartForLinkComparison}"]`);
                        if (nestedLink.innerText.toLowerCase().includes(channelNamePartForLinkComparison.toLowerCase())) isChannelSignatureLink = true;
                    }
                    if (!isCustomEmoji && !isSticker && !isReactions && !isChannelSignatureLink) fullText += node.innerText || node.textContent;
                }
            }
        });
        data.text = fullText.replace(/\s+/g, ' ').trim();
        if (!data.title && data.text) data.title = data.text.substring(0, 120) + (data.text.length > 120 ? '...' : '');
        if (data.title && data.text.toLowerCase().startsWith(data.title.toLowerCase())) data.text = data.text.substring(data.title.length).trim();
        return data;
    }
    function sendToN8N(payload) { /* ... (Implementation as in v2.3.1 - no changes) ... */
        const n8nWebhookUrl = getConfigValue('N8N_WEBHOOK_URL', '');
        if (!n8nWebhookUrl) { updateStatusForConsole('N8N URL не настроен!', true); return; }
        const channelName = currentScrapingChannelInfo ? currentScrapingChannelInfo.name : 'N/A';
        const channelId = currentScrapingChannelInfo ? currentScrapingChannelInfo.id : 'N/A';
        updateStatusForConsole(`Отправка ID ${payload.messageId} (Канал: ${channelName} [${channelId}], Date: ${payload.pubDate})...`);
        GM_xmlhttpRequest({
            method: "POST", url: n8nWebhookUrl, data: JSON.stringify(payload), headers: { "Content-Type": "application/json" },
            onload: function(response) { updateStatusForConsole(`n8n ответ для ID ${payload.messageId}: ${response.status}`); consoleLog(`[Sender] N8N Response for ID ${payload.messageId}: ${response.status} ${response.responseText.substring(0,100)}`); },
            onerror: function(response) { updateStatusForConsole(`n8n ошибка для ID ${payload.messageId}: ${response.status}`, true); consoleLog(`[Sender] N8N Error for ID ${payload.messageId}: ${response.status} ${response.responseText.substring(0,100)}`, true); }
        });
    }
    async function processCurrentMessages() { /* ... (Implementation as in v2.3.1 - no changes) ... */
        if (!isScrapingSingle && !isMultiChannelScrapingActive) return { foundNew: false, stopScrolling: false };
        if (!currentScrapingChannelInfo) { consoleLog("processCurrentMessages: currentScrapingChannelInfo is not set.", true); return { foundNew: false, stopScrolling: true, error: "Канал не установлен" };}
        if (!isTargetChannelActive()) { updateStatusForConsole(`Канал ${currentScrapingChannelInfo.name} не активен (process).`, true); return { foundNew: false, stopScrolling: true, error: `Канал ${currentScrapingChannelInfo.name} не активен` }; }
        updateStatusForConsole(`Поиск в ${currentScrapingChannelInfo.name}...`);
        const messageElements = document.querySelectorAll('.bubble.channel-post .message span.translatable-message, .bubble.channel-post .text-content');
        let foundNew = false; let stopDueToAge = false;
        for (let i = messageElements.length - 1; i >= 0; i--) {
            if (!isScrapingSingle && !isMultiChannelScrapingActive) break;
            const el = messageElements[i]; const parentBubble = el.closest('.bubble.channel-post'); const msgId = parentBubble ? parentBubble.dataset.mid : null;
            if (msgId) {
                const articleData = extractDataFromMessageElement(el);
                if (articleData === 'STOP_SCROLLING') { stopDueToAge = true; const ts = parentBubble?.dataset.timestamp ? new Date(parseInt(parentBubble.dataset.timestamp,10)*1000).toISOString() : 'N/A'; updateStatusForConsole(`Старые сообщения (ID: ${msgId}, Date: ${ts}). Стоп.`); break; }
                if (articleData && articleData.title && (articleData.text || articleData.link)) {
                    consoleLog(`[Proc] ID ${msgId} (${articleData.pubDate.substring(11,19)}) к отправке.`); sendToN8N(articleData); foundNew = true;
                    await new Promise(r => setTimeout(r, getRandomizedInterval(getConfigValue('BASE_SEND_DELAY_MS', 1000), 'RANDOMNESS_FACTOR_MINOR')));
                } else if (articleData) { consoleLog(`[Proc] ID ${msgId} пропущено (нет данных).`); }
                else { consoleLog(`[Proc] ID ${msgId} ошибка извлечения.`, true); }
            }
        }
        return { foundNew, stopScrolling: stopDueToAge };
    }
    async function tryScrollUp() { /* ... (Implementation as in v2.3.1 - no changes) ... */
        if (!isScrapingSingle && !isMultiChannelScrapingActive) return;
        await new Promise(r => setTimeout(r, getRandomizedInterval(getConfigValue('BASE_SCROLL_ACTION_PAUSE_MS', 300), 'RANDOMNESS_FACTOR_MINOR')));
        updateStatusForConsole('Скролл вверх...');
        const messageBubbles = document.querySelectorAll('.bubbles-inner .bubble.channel-post');
        if (messageBubbles.length > 0) {
            const topBubble = messageBubbles[0]; if (typeof topBubble.tabIndex === 'undefined' || topBubble.tabIndex === -1) topBubble.tabIndex = -1;
            try {
                consoleLog(`Скролл к верхнему ID: ${topBubble.dataset.mid} (scrollIntoView)`); topBubble.scrollIntoView({ behavior: 'auto', block: 'start' });
                await new Promise(r => setTimeout(r, getRandomizedInterval(getConfigValue('BASE_SCROLL_ACTION_PAUSE_MS', 300), 'RANDOMNESS_FACTOR_MINOR')));
                if (getConfigValue('USE_FOCUS_IN_SCROLL_UP', false)) { consoleLog(`Фокус на верхний ID: ${topBubble.dataset.mid}`); topBubble.focus({ preventScroll: true }); }
                await new Promise(r => setTimeout(r, getRandomizedInterval(getConfigValue('BASE_SCROLL_PAUSE_MS', 5000))));
            } catch (e) {
                consoleLog(`Ошибка scrollIntoView/focus: ${e.message}`, true); updateStatusForConsole('Ошибка скролла вверх. Стандартный метод...', true);
                const scrollArea = document.querySelector('div.bubbles-inner')?.parentElement || document.querySelector('.scrollable-y.chat-history-list') || document.querySelector('.bubbles > .scrollable-y');
                if (scrollArea) { scrollArea.scrollTop = 0; scrollArea.dispatchEvent(new WheelEvent('wheel', { deltaY: -1000, bubbles: true, cancelable: true })); await new Promise(r => setTimeout(r, getRandomizedInterval(getConfigValue('BASE_SCROLL_PAUSE_MS', 5000))));}
            }
        } else {
            updateStatusForConsole('Нет сообщений для скролла вверх. Стандартный метод.');
            const scrollArea = document.querySelector('div.bubbles-inner')?.parentElement || document.querySelector('.scrollable-y.chat-history-list') || document.querySelector('.bubbles > .scrollable-y');
            if (scrollArea) { scrollArea.scrollTop = 0; scrollArea.dispatchEvent(new WheelEvent('wheel', { deltaY: -1000, bubbles: true, cancelable: true })); await new Promise(r => setTimeout(r, getRandomizedInterval(getConfigValue('BASE_SCROLL_PAUSE_MS', 5000))));}
            else { updateStatusForConsole('Нет области скролла и нет сообщений.', true); }
        }
    }
    async function scrollToBottom() { /* ... (Implementation as in v2.3.1 - no changes) ... */
        updateStatusForConsole('Прокрутка к последним сообщениям...');
        const scrollableArea = document.querySelector('div.bubbles-inner')?.parentElement || document.querySelector('.scrollable-y.chat-history-list') || document.querySelector('.bubbles > .scrollable-y');
        if (!scrollableArea) { updateStatusForConsole('Ошибка: Не найдена область для прокрутки вниз.', true); return false; }
        let goToBottomButton; let clicksMade = 0; const maxClicks = getConfigValue('MAX_GO_TO_BOTTOM_CLICKS', 3);
        await new Promise(r => setTimeout(r, getRandomizedInterval(getConfigValue('BASE_SCROLL_ACTION_PAUSE_MS', 300), 'RANDOMNESS_FACTOR_MINOR')));
        while (clicksMade < maxClicks) {
            if (!isScrapingSingle && !isMultiChannelScrapingActive && clicksMade > 0) { updateStatusForConsole('Прокрутка вниз прервана.'); return false; }
            goToBottomButton = document.querySelector('.bubbles-go-down.chat-secondary-button:not(.is-hidden):not([style*="display: none"])');
            const badge = goToBottomButton ? goToBottomButton.querySelector('.badge:not(.is-badge-empty)') : null;
            if (goToBottomButton && badge && typeof goToBottomButton.click === 'function') {
                const unreadCountText = badge.textContent; updateStatusForConsole(`Клик по кнопке "вниз" (${unreadCountText || 'несколько'} непрочитанных)...`);
                consoleLog(`[ScrollToBottom] Clicking "go to bottom" button (unread: ${unreadCountText}). Click ${clicksMade + 1}`);
                goToBottomButton.click(); clicksMade++;
                await new Promise(resolve => setTimeout(resolve, getRandomizedInterval(getConfigValue('BASE_SCROLL_BOTTOM_CLICK_PAUSE_MS', 2500))));
            } else { consoleLog('[ScrollToBottom] "Go to bottom" button with counter not found or empty.'); break; }
        }
        updateStatusForConsole('Программная прокрутка вниз...'); let prevScrollHeight = 0; const scrollIterations = getConfigValue('SCROLL_BOTTOM_PROGRAMMATIC_ITERATIONS', 3);
        for (let i = 0; i < scrollIterations; i++) {
            if (!isScrapingSingle && !isMultiChannelScrapingActive) { updateStatusForConsole('Прокрутка вниз прервана.'); return false; }
            prevScrollHeight = scrollableArea.scrollHeight; scrollableArea.scrollTop = scrollableArea.scrollHeight;
            updateStatusForConsole(`Прокрутка вниз... (итерация ${i + 1}/${scrollIterations})`);
            await new Promise(resolve => setTimeout(resolve, getRandomizedInterval(getConfigValue('BASE_SCROLL_BOTTOM_PROG_PAUSE_MS', 700), 'RANDOMNESS_FACTOR_MINOR')));
            if (i > 0 && scrollableArea.scrollHeight - prevScrollHeight < 50) { consoleLog('[ScrollToBottom] Scroll height changed minimally.'); break; }
        }
        const lastMessageGroup = document.querySelector('.bubbles-inner .bubbles-group-last');
        if (lastMessageGroup) {
            consoleLog('[ScrollToBottom] Found .bubbles-group-last, scrolling to it.'); updateStatusForConsole('Точная прокрутка к последней группе...');
            lastMessageGroup.scrollIntoView({ behavior: 'auto', block: 'end' });
            await new Promise(resolve => setTimeout(resolve, getRandomizedInterval(getConfigValue('BASE_SCROLL_BOTTOM_PROG_PAUSE_MS', 700) / 2, 'RANDOMNESS_FACTOR_MINOR')));
        } else { consoleLog('[ScrollToBottom] .bubbles-group-last not found.'); }
        goToBottomButton = document.querySelector('.bubbles-go-down.chat-secondary-button:not(.is-hidden):not([style*="display: none"])');
        if (goToBottomButton && typeof goToBottomButton.click === 'function' && clicksMade < maxClicks) {
            const finalBadge = goToBottomButton.querySelector('.badge:not(.is-badge-empty)');
            if (!finalBadge) { consoleLog('[ScrollToBottom] "Go to bottom" button (no counter) is active, final click.'); updateStatusForConsole('Финальный клик по кнопке "вниз"...'); goToBottomButton.click(); await new Promise(resolve => setTimeout(resolve, getRandomizedInterval(getConfigValue('BASE_SCROLL_BOTTOM_CLICK_PAUSE_MS', 2500) / 2))); }
        }
        updateStatusForConsole('Прокрутка к последним сообщениям завершена.'); return true;
    }
    async function scrapingLoopSingleChannel() { /* ... (Implementation as in v2.3.1 - no changes) ... */
        if (!isScrapingSingle) { consoleLog(`[Loop-${currentScrapingChannelInfo.name}] Остановлен (isScrapingSingle=false).`); return; }
        if (isMultiChannelScrapingActive && !isScrapingSingle) { consoleLog(`[Loop-${currentScrapingChannelInfo.name}] Остановлен (multi active, single false).`); return; }
        await new Promise(r => setTimeout(r, getRandomizedInterval(getConfigValue('BASE_SCROLL_ACTION_PAUSE_MS', 300), 'RANDOMNESS_FACTOR_MINOR')));
        const { foundNew, stopScrolling, error } = await processCurrentMessages();
        if (error) { updateStatusForConsole(error + `. Прерываю для ${currentScrapingChannelInfo.name}.`, true); return; }
        if (stopScrolling) { updateStatusForConsole(`Лимит по дате для ${currentScrapingChannelInfo.name}. Завершаю.`); return; }
        if (foundNew) { consecutiveScrollsWithoutNewFound = 0; }
        else { consecutiveScrollsWithoutNewFound++; consoleLog(`[Loop-${currentScrapingChannelInfo.name}] Ничего нового. Счетчик: ${consecutiveScrollsWithoutNewFound}`);}
        if (consecutiveScrollsWithoutNewFound >= getConfigValue('CONSECUTIVE_SCROLLS_LIMIT', 5)) {
            updateStatusForConsole(`Нет новых сообщений для ${currentScrapingChannelInfo.name} после ${getConfigValue('CONSECUTIVE_SCROLLS_LIMIT', 5)} прокруток. Завершаю.`); return;
        }
        await tryScrollUp();
        if (isScrapingSingle) {
           const baseNextInterval = !foundNew ? getConfigValue('BASE_SCRAPE_INTERVAL_MS', 30000) : getConfigValue('BASE_SCRAPE_INTERVAL_MS', 30000) / 2;
           await new Promise(r => setTimeout(r, getRandomizedInterval(baseNextInterval)));
           if (isScrapingSingle) await scrapingLoopSingleChannel();
        }
    }
    async function scrapeSingleChannelProcess(channelInfoObject) { /* ... (Implementation as in v2.3.1 - no changes) ... */
        if (!channelInfoObject || !channelInfoObject.id || !channelInfoObject.name) { consoleLog("Ошибка: Некорректные данные канала в scrapeSingleChannelProcess", true); return false; }
        if (!isScrapingSingle && !isMultiChannelScrapingActive) { consoleLog(`scrapeSingleChannelProcess для ${channelInfoObject.name} не может быть запущен (флаги).`); return false; }
        currentScrapingChannelInfo = channelInfoObject;
        consoleLog(`--- Начало скрапинга канала: ${currentScrapingChannelInfo.name} (ID: ${currentScrapingChannelInfo.id}) ---`);
        updateStatusForConsole(`Скрапинг: ${currentScrapingChannelInfo.name}`);
        const targetHashForNavigation = `#${currentScrapingChannelInfo.name}`;
        let navigationNeeded = true;
        const chatInfoContainerInitial = document.querySelector('#column-center .chat.active .sidebar-header .chat-info');
        let initialDisplayedPeerId = null;
        if (chatInfoContainerInitial) {
            const avatarElementInitial = chatInfoContainerInitial.querySelector('.avatar[data-peer-id]');
            if (avatarElementInitial) { initialDisplayedPeerId = avatarElementInitial.dataset.peerId; }
        }
        if (initialDisplayedPeerId === currentScrapingChannelInfo.id) { consoleLog(`[Nav] Уже на канале ${currentScrapingChannelInfo.name} (peerId совпадает).`); navigationNeeded = false; }
        else if (window.location.hash.toLowerCase() === targetHashForNavigation.toLowerCase() && initialDisplayedPeerId) { consoleLog(`[Nav] URL hash is ${targetHashForNavigation} or peerId (${initialDisplayedPeerId}) present, but expecting ${currentScrapingChannelInfo.id}. Will wait for peerId activation.`); navigationNeeded = false; }
        if (navigationNeeded) {
            consoleLog(`Перехожу на канал ${targetHashForNavigation}...`); window.location.hash = targetHashForNavigation;
            await new Promise(r => setTimeout(r, getRandomizedInterval(getConfigValue('NAVIGATION_INITIATION_PAUSE_MS', 2500), 'RANDOMNESS_FACTOR_MAJOR')));
        }
        let activationAttempts = 0; const maxActivationAttempts = getConfigValue('MAX_CHANNEL_ACTIVATION_ATTEMPTS', 25);
        consoleLog(`Ожидание активации канала ${currentScrapingChannelInfo.name} (ID: ${currentScrapingChannelInfo.id}) по peer-id...`);
        while (activationAttempts < maxActivationAttempts) {
            if (!isScrapingSingle && !isMultiChannelScrapingActive) { consoleLog("Остановка во время ожидания активации канала."); return false; }
            if (isTargetChannelActive()) break;
            activationAttempts++; updateStatusForConsole(`Ожидание ${currentScrapingChannelInfo.name} (${activationAttempts}/${maxActivationAttempts})`);
            await new Promise(r => setTimeout(r, getRandomizedInterval(getConfigValue('CHANNEL_ACTIVATION_ATTEMPT_PAUSE_MS', 700), 'RANDOMNESS_FACTOR_MINOR')));
        }
        if (!isTargetChannelActive()) { updateStatusForConsole(`Не удалось активировать ${currentScrapingChannelInfo.name} (ID: ${currentScrapingChannelInfo.id}) по peer-id. Пропускаю.`, true); return false; }
        consoleLog(`Канал ${currentScrapingChannelInfo.name} активен. Прокрутка вниз.`);
        const scrolledToBottom = await scrollToBottom();
        if (!scrolledToBottom) { if (isScrapingSingle || isMultiChannelScrapingActive) { updateStatusForConsole(`Ошибка прокрутки вниз для ${currentScrapingChannelInfo.name}.`, true); } return false; }
        if (!isScrapingSingle && !isMultiChannelScrapingActive) { consoleLog("Остановка после прокрутки вниз."); return false;}
        updateStatusForConsole(`Скрапинг вверх для ${currentScrapingChannelInfo.name}...`);
        consecutiveScrollsWithoutNewFound = 0; await scrapingLoopSingleChannel();
        consoleLog(`--- Скрапинг канала ${currentScrapingChannelInfo.name} завершен/остановлен ---`); return true;
    }

    // --- MENU COMMAND HANDLERS ---
    /**
     * Shuffles array in place. ES6 version
     * @param {Array} a items An array containing the items.
     * Перемешивает массив на месте. Версия ES6.
     * @param {Array} a Массив, содержащий элементы.
     */
    function shuffleArray(a) { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }

    async function startSingleChannelScrapeMenu() { /* ... (Implementation as in v2.3.1 - no changes) ... */
        consoleLog("Команда 'Scrape Current Channel' вызвана.");
        if (isScrapingSingle || isMultiChannelScrapingActive) { alert("Скрапинг уже запущен."); consoleLog("Скрапинг уже запущен.", true); return; }
        let displayedPeerId = null;
        const chatInfoContainer = document.querySelector('#column-center .chat.active .sidebar-header .chat-info');
        if (chatInfoContainer) { const avatarElement = chatInfoContainer.querySelector('.avatar[data-peer-id]'); if (avatarElement && avatarElement.dataset && avatarElement.dataset.peerId) displayedPeerId = avatarElement.dataset.peerId; }
        let channelInfoToScrape = null;
        if (displayedPeerId) {
            channelInfoToScrape = TARGET_CHANNELS_DATA_ORIGINAL.find(ch => ch.id === displayedPeerId);
            if (channelInfoToScrape) consoleLog(`[startSingle] Канал определен по peer-id: ${channelInfoToScrape.name}`);
            else consoleLog(`[startSingle] Peer-id ${displayedPeerId} не найден в TARGET_CHANNELS_DATA.`);
        } else consoleLog(`[startSingle] Не удалось получить peer-id.`);
        if (!channelInfoToScrape) {
            let hash = window.location.hash.substring(1);
            if (hash) {
                const queryParamIndex = hash.indexOf('?'); if (queryParamIndex !== -1) hash = hash.substring(0, queryParamIndex);
                channelInfoToScrape = TARGET_CHANNELS_DATA_ORIGINAL.find(ch => ch.id === hash);
                if (!channelInfoToScrape) { let nameToCompare = hash; if (!hash.startsWith('@') && isNaN(parseInt(hash))) nameToCompare = '@' + hash; channelInfoToScrape = TARGET_CHANNELS_DATA_ORIGINAL.find(ch => ch.name.toLowerCase() === nameToCompare.toLowerCase()); }
                if (channelInfoToScrape) consoleLog(`[startSingle] Канал определен по hash "${hash}": ${channelInfoToScrape.name}`);
                else consoleLog(`[startSingle] Канал не определен по hash "${hash}".`);
            }
        }
        if (!channelInfoToScrape) { alert("Не удалось определить текущий канал."); consoleLog("Не удалось определить текущий канал.", true); return; }
        isScrapingSingle = true; consoleLog(`--- Начало ОДИНОЧНОЙ сессии для ${channelInfoToScrape.name} ---`);
        alert(`Начинаю скрапинг текущего канала: ${channelInfoToScrape.name}.`);
        await scrapeSingleChannelProcess(channelInfoToScrape);
        isScrapingSingle = false;
        if (!isMultiChannelScrapingActive) { updateStatusForConsole("Скрапинг текущего канала завершен."); consoleLog("--- ОДИНОЧНАЯ сессия скрапинга завершена ---"); alert(`Скрапинг канала ${channelInfoToScrape.name} завершен.`); }
        currentScrapingChannelInfo = null;
    }
    async function startMultiChannelScrapeMenu(isAutoStart = false) { /* ... (Implementation as in v2.3.1 - no changes) ... */
        if (!isAutoStart) {
            consoleLog("Команда 'Scrape All Listed Channels' вызвана.");
            if (isScrapingSingle || isMultiChannelScrapingActive) { alert("Скрапинг уже запущен."); consoleLog("Скрапинг уже запущен.", true); return; }
            if (!confirm(`Начать скрапинг ${TARGET_CHANNELS_DATA_ORIGINAL.length} каналов?`)) { consoleLog("Мульти-скрапинг отменен."); return; }
        } else {
            if (isScrapingSingle || isMultiChannelScrapingActive) { consoleLog("[AutoStart] Скрапинг уже запущен, автозапуск пропущен."); return; }
            consoleLog("[AutoStart] Запуск мульти-скрапинга по расписанию.");
        }
        isMultiChannelScrapingActive = true; currentChannelIndex = 0;
        if (getConfigValue('RANDOMIZE_CHANNEL_ORDER', true)) { consoleLog("Перемешивание порядка каналов..."); currentTargetChannels = shuffleArray([...TARGET_CHANNELS_DATA_ORIGINAL]); }
        else { currentTargetChannels = [...TARGET_CHANNELS_DATA_ORIGINAL]; }
        consoleLog("--- Начало МУЛЬТИ-СКРАПИНГА ---");
        if (!isAutoStart) alert("Начинаю скрапинг всех каналов.");
        while (currentChannelIndex < currentTargetChannels.length && isMultiChannelScrapingActive) {
            isScrapingSingle = true; const channelInfo = currentTargetChannels[currentChannelIndex];
            updateStatusForConsole(`[${currentChannelIndex + 1}/${currentTargetChannels.length}] Запуск для: ${channelInfo.name}`);
            const success = await scrapeSingleChannelProcess(channelInfo);
            isScrapingSingle = false;
            if (!isMultiChannelScrapingActive) { consoleLog("Мульти-скрапинг остановлен."); break; }
            if (!success) consoleLog(`Проблема со скрапингом канала ${channelInfo.name}, пропускаю.`, true);
            currentChannelIndex++;
            if (currentChannelIndex < currentTargetChannels.length && isMultiChannelScrapingActive) {
                const pauseDuration = getRandomizedInterval(getConfigValue('BASE_SCROLL_PAUSE_MS', 5000) * 1.5, 'RANDOMNESS_FACTOR_MAJOR');
                updateStatusForConsole(`Пауза ${Math.round(pauseDuration/1000)}с перед ${currentTargetChannels[currentChannelIndex].name}`);
                await new Promise(r => setTimeout(r, pauseDuration));
            }
        }
        if (isMultiChannelScrapingActive) {
            updateStatusForConsole("Скрапинг ВСЕХ каналов завершен.");
            if (!isAutoStart) alert("Скрапинг всех каналов завершен!");
            else consoleLog("[AutoStart] Автоматический сбор завершен.");
        }
        isMultiChannelScrapingActive = false; isScrapingSingle = false; currentScrapingChannelInfo = null;
    }
    function stopAllScrapingActivitiesMenu() { /* ... (Implementation as in v2.3.1 - no changes) ... */
        consoleLog("Команда 'Stop All Scraping' вызвана.", true);
        isScrapingSingle = false; isMultiChannelScrapingActive = false;
        updateStatusForConsole('Скрапинг остановлен пользователем.'); alert("Все процессы скрапинга остановлены.");
    }
    function toggleAutoStartMenu() { /* ... (Implementation as in v2.3.1 - no changes) ... */
        const currentAutoStart = getConfigValue('AUTO_START_ENABLED', false);
        const newAutoStart = !currentAutoStart;
        GM_config.set('AUTO_START_ENABLED', newAutoStart); GM_config.save();
        alert(`Автозапуск ${newAutoStart ? 'ВКЛЮЧЕН' : 'ВЫКЛЮЧЕН'}.`);
        consoleLog(`Автозапуск ${newAutoStart ? 'ВКЛЮЧЕН' : 'ВЫКЛЮЧЕН'} через меню.`);
        setupAutoStart();
    }

    // --- REGISTER MENU COMMANDS ---
    if (typeof GM_registerMenuCommand === 'function') {
        if (gmConfigInitialized) {
            GM_registerMenuCommand("Scrape Current Channel / Собрать с текущего канала", startSingleChannelScrapeMenu, "C");
            GM_registerMenuCommand("Scrape All Listed Channels / Собрать со всех каналов", () => startMultiChannelScrapeMenu(false), "A");
            GM_registerMenuCommand("Toggle Auto-Start / Вкл/Выкл Автозапуск", toggleAutoStartMenu, "T");
            GM_registerMenuCommand("Stop All Scraping / Остановить всё", stopAllScrapingActivitiesMenu, "S");
            GM_registerMenuCommand("Настройки скрипта... / Script Settings...", () => GM_config.open(), "O");
            consoleLog("Команды меню Tampermonkey зарегистрированы.");
        } else {
            consoleLog("GM_config не был успешно инициализирован.", true); alert("Ошибка: GM_config не инициализирован.");
            GM_registerMenuCommand("Scrape Current Channel / Собрать с текущего канала", startSingleChannelScrapeMenu, "C");
            GM_registerMenuCommand("Scrape All Listed Channels / Собрать со всех каналов",() => startMultiChannelScrapeMenu(false), "A");
            GM_registerMenuCommand("Stop All Scraping / Остановить всё", stopAllScrapingActivitiesMenu, "S");
            consoleLog("Основные команды меню Tampermonkey зарегистрированы.");
        }
    } else {
        consoleLog("GM_registerMenuCommand не доступна.", true); alert("Tampermonkey API GM_registerMenuCommand не доступно.");
    }

    // Initialize auto-start check after a short delay to ensure GM_config is fully ready.
    // Инициализация проверки автозапуска после небольшой задержки, чтобы GM_config был полностью готов.
    if (gmConfigInitialized) {
        setTimeout(() => {
            consoleLog("Первоначальная настройка автозапуска после задержки. / Initial auto-start setup after delay.");
            setupAutoStart();
        }, 1000); // 1 second delay / Задержка в 1 секунду
    }

})();
console.log(`[Telegram Scraper v${GM_info.script.version}] Script IIFE execution completed.`);
