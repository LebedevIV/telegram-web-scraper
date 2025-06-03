// ==UserScript==
// @name         Telegram Scraper (Menu Commands v2.2.15 - GM_config GUI Final Field Widths)
// @name:ru      Telegram Scraper (Команды меню v2.2.15 - GM_config GUI Финальная ширина полей)
// @namespace    http://tampermonkey.net/
// @version      2.2.15
// @description  Scrapes messages from Telegram channels and sends them to an n8n webhook. Features a GM_config GUI for settings.
// @description:ru Собирает сообщения из Telegram-каналов и отправляет их на веб-хук n8n. Имеет графический интерфейс настроек через GM_config.
// @author       Igor Lebedev (Adapted by Gemini Pro)
// @license      MIT
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
*/

(function() {
    'use strict';

    // --- GLOBAL SCRIPT VARIABLES (NOT SETTINGS) ---
    // --- ГЛОБАЛЬНЫЕ ПЕРЕМЕННЫЕ СКРИПТА (НЕ НАСТРОЙКИ) ---
    let isScrapingSingle = false; // Flag: true if single channel scraping is active
                                  // Флаг: true, если активен сбор с одного канала
    let isMultiChannelScrapingActive = false; // Flag: true if multi-channel scraping is active
                                              // Флаг: true, если активен многоканальный сбор
    let currentChannelIndex = 0; // Index for iterating through TARGET_CHANNELS_DATA in multi-channel mode
                                 // Индекс для перебора TARGET_CHANNELS_DATA в многоканальном режиме
    let currentScrapingChannelInfo = null; // Object holding info of the channel currently being scraped
                                           // Объект с информацией о канале, который скрапится в данный момент
    let consecutiveScrollsWithoutNewFound = 0; // Counter for scrolls without finding new messages (to stop early)
                                               // Счетчик прокруток без нахождения новых сообщений (для ранней остановки)

    // --- SCRIPT CONSTANTS (NOT USER-CONFIGURABLE VIA GUI) ---
    // --- КОНСТАНТЫ СКРИПТА (НЕ НАСТРАИВАЮТСЯ ПОЛЬЗОВАТЕЛЕМ ЧЕРЕЗ GUI) ---

    // List of target channels with their names (used for navigation hash) and peer IDs (used for verification)
    // Список целевых каналов с их именами (используются для хэша навигации) и peer ID (используются для проверки)
    const TARGET_CHANNELS_DATA = [
        { name: '@e1_news', id: '-1049795479' },
        { name: '@RU66RU', id: '-1278627542' },
        { name: '@ekb4tv', id: '-1184077858' },
        { name: '@rentv_news', id: '-1310155678' },
        { name: '@TauNewsEkb', id: '-1424016223' },
        { name: '@BEZUMEKB', id: '-1739473739' },
        { name: '@zhest_dtp66', id: '-2454557093' },
        { name: '@sverdlovskaya_oblasti', id: '-1673288653' },
        { name: '@novosti_ekb66', id: '-1662411694' }
    ];

    // Settings keys that require a page reload or script restart to take full effect
    // Ключи настроек, требующие перезагрузки страницы или перезапуска скрипта для полного вступления в силу
    const SETTINGS_REQUIRING_RELOAD = [
        'N8N_WEBHOOK_URL' // Example: Changing the webhook URL might need a fresh start for connections
                          // Пример: Изменение URL веб-хука может потребовать нового старта для соединений
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
        if (isError) {
            console.error(`${prefix} ${message}`);
        } else {
            console.log(`${prefix} ${message}`);
        }
    }
    consoleLog(`v${GM_info.script.version} Script execution started.`);

    // --- GM_CONFIG SETUP ---
    // --- НАСТРОЙКА GM_CONFIG ---

    // Generate a unique ID for GM_config storage based on script version to avoid conflicts
    // Генерация уникального ID для хранилища GM_config на основе версии скрипта во избежание конфликтов
    const GM_CONFIG_ID = `TeleScraperConfig_v${GM_info.script.version.replace(/\./g, '_')}`;

    // Define the fields for the GM_config settings GUI
    // Определение полей для графического интерфейса настроек GM_config
    let configFields = {
        'N8N_WEBHOOK_URL': {
            'label': 'N8N Webhook URL:', // English label
            'label:ru': 'URL веб-хука n8n:', // Russian label (GM_config might not support this directly, but good for comments)
            'type': 'text',
            'default': 'http://localhost:5678/webhook/telegram-scraped-news',
            'section': ['Основные настройки'], // Section header in GUI / Заголовок секции в GUI
        },
        'MAX_MESSAGE_AGE_HOURS': {
            'label': 'Max message age (hours):',
            'label:ru': 'Макс. возраст сообщений (часы):',
            'type': 'int',
            'default': 24,
            'min': 1,
            'max': 720 // 30 days / 30 дней
        },
        'BASE_SCRAPE_INTERVAL_MS': {
            'label': 'Base scrape interval (ms):',
            'label:ru': 'Базовый интервал скрапинга (мс):',
            'type': 'int',
            'default': 30000,
            'min': 1000
        },
        'BASE_SCROLL_PAUSE_MS': {
            'label': 'Pause after scroll (ms):',
            'label:ru': 'Пауза после скролла (мс):',
            'type': 'int',
            'default': 5000,
            'min': 500
        },
        'BASE_SEND_DELAY_MS': {
            'label': 'Delay before sending message (ms):',
            'label:ru': 'Задержка перед отправкой сообщения (мс):',
            'type': 'int',
            'default': 1000,
            'min': 100
        },
        'CONSECUTIVE_SCROLLS_LIMIT': {
            'label': 'Empty scrolls limit before stop:',
            'label:ru': 'Лимит пустых скроллов до остановки:',
            'type': 'int',
            'default': 5,
            'min': 1
        },
        'NAVIGATION_INITIATION_PAUSE_MS': {
            'label': 'Pause after navigation (ms):',
            'label:ru': 'Пауза после навигации (мс):',
            'type': 'int',
            'default': 2500,
            'min': 500,
            'section': ['Тонкие настройки (паузы и попытки)'], // Fine-tuning (pauses and attempts)
        },
        'CHANNEL_ACTIVATION_ATTEMPT_PAUSE_MS': {
            'label': 'Pause between channel activation attempts (ms):',
            'label:ru': 'Пауза между попытками активации канала (мс):',
            'type': 'int',
            'default': 700,
            'min': 100
        },
        'MAX_CHANNEL_ACTIVATION_ATTEMPTS': {
            'label': 'Max channel activation attempts:',
            'label:ru': 'Макс. попыток активации канала:',
            'type': 'int',
            'default': 25,
            'min': 1
        },
        'BASE_SCROLL_ACTION_PAUSE_MS': {
            'label': 'Pause before/after scroll action (ms):',
            'label:ru': 'Пауза перед/после действия скролла (мс):',
            'type': 'int',
            'default': 300,
            'min': 50
        },
        'BASE_SCROLL_BOTTOM_PROG_PAUSE_MS': {
            'label': 'Pause during programmatic scroll down (ms):',
            'label:ru': 'Пауза при программном скролле вниз (мс):',
            'type': 'int',
            'default': 700,
            'min': 100
        },
        'BASE_SCROLL_BOTTOM_CLICK_PAUSE_MS': {
            'label': 'Pause after "scroll to bottom" button click (ms):',
            'label:ru': 'Пауза после клика по кнопке "вниз" (мс):',
            'type': 'int',
            'default': 2500,
            'min': 500
        },
        'SCROLL_BOTTOM_PROGRAMMATIC_ITERATIONS': {
            'label': 'Programmatic scroll down iterations:',
            'label:ru': 'Итераций программного скролла вниз:',
            'type': 'int',
            'default': 3,
            'min': 1
        },
        'MAX_GO_TO_BOTTOM_CLICKS': {
            'label': 'Max clicks on "scroll to bottom" button:',
            'label:ru': 'Макс. кликов по кнопке "вниз":',
            'type': 'int',
            'default': 3,
            'min': 0
        },
        'RANDOMNESS_FACTOR_MAJOR': {
            'label': 'Randomness factor for major pauses (0.0-1.0):',
            'label:ru': 'Коэф. случайности для основных пауз (0.0-1.0):',
            'type': 'float',
            'default': 0.3,
            'min': 0,
            'max': 1
        },
        'RANDOMNESS_FACTOR_MINOR': {
            'label': 'Randomness factor for minor pauses (0.0-1.0):',
            'label:ru': 'Коэф. случайности для малых пауз (0.0-1.0):',
            'type': 'float',
            'default': 0.15,
            'min': 0,
            'max': 1
        },
        'USE_FOCUS_IN_SCROLL_UP': {
            'label': 'Use focus() during scroll up:',
            'label:ru': 'Использовать focus() при скролле вверх:',
            'type': 'checkbox',
            'default': false
        }
    };

    // Modify labels to include default values and reload info
    // Модификация меток для включения значений по умолчанию и информации о перезагрузке
    for (const key in configFields) {
        if (configFields.hasOwnProperty(key)) {
            let labelSuffix = ` (по умолчанию: ${configFields[key].default})`;
            if (SETTINGS_REQUIRING_RELOAD.includes(key)) {
                labelSuffix += ' [требуется перезагрузка]';
            }
            configFields[key].label += labelSuffix;
        }
    }

    // Event handlers for GM_config GUI
    // Обработчики событий для GUI GM_config
    const configEventHandlers = {
        'open': function(doc) { // 'doc' is the GM_config iframe's document / 'doc' - это документ iframe GM_config
            const urlFieldInputId = `${GM_CONFIG_ID}_field_N8N_WEBHOOK_URL`; // ID for the URL input field / ID для поля ввода URL

            // Styles for the content INSIDE the GM_config iframe
            // Стили для содержимого ВНУТРИ iframe GM_config
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
            alert("Настройки сохранены! Некоторые изменения могут потребовать перезагрузки страницы или перезапуска скрапинга (см. пометки [требуется перезагрузка] у параметров).\n\nSettings saved! Some changes may require a page reload or script restart to take full effect (see [требуется перезагрузка] notes on parameters).");
        },
        'reset': function() {
            consoleLog("Настройки сброшены через GM_config GUI. / Settings reset via GM_config GUI.");
            alert("Настройки сброшены к значениям по умолчанию! Пожалуйста, перезагрузите страницу.\n\nSettings have been reset to default! Please reload the page.");
        }
    };

    let gmConfigInitialized = false;
    try {
        if (typeof GM_config !== 'undefined' && typeof GM_info !== 'undefined') {
            GM_config.init({
                'id': GM_CONFIG_ID, // Unique ID for this script's config / Уникальный ID для конфигурации этого скрипта
                'title': `Настройки Telegram Scraper v${GM_info.script.version}`, // Title of the config window / Заголовок окна настроек
                'fields': configFields, // Defined fields / Определенные поля
                'events': configEventHandlers, // Event handlers (open, save, reset) / Обработчики событий (open, save, reset)
                'frameStyle': { // Styles for the GM_config iframe itself / Стили для самого iframe GM_config
                    width: '1000px',
                    height: '75vh',
                    minHeight: '500px',
                    border: '1px solid rgb(0, 0, 0)',
                    margin: '0px',
                    maxHeight: '95%',
                    maxWidth: '95%', // Limits width to 95% of viewport if 1000px is too wide / Ограничивает ширину до 95% окна просмотра, если 1000px слишком широко
                    opacity: '1',
                    overflow: 'auto',
                    padding: '0px',
                    position: 'fixed',
                    zIndex: '9999'
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
     * @param {string} key - The configuration key.
     * @param {*} defaultValue - The default value if the key is not found or GM_config is not ready.
     * @returns {*} The configuration value or the default.
     *
     * Получает значение конфигурации с помощью GM_config, с возвратом к значению по умолчанию.
     * @param {string} key - Ключ конфигурации.
     * @param {*} defaultValue - Значение по умолчанию, если ключ не найден или GM_config не готов.
     * @returns {*} Значение конфигурации или значение по умолчанию.
     */
    function getConfigValue(key, defaultValue) {
        if (gmConfigInitialized && typeof GM_config.get === 'function') {
            const val = GM_config.get(key);
            // GM_config.get might return undefined if the value isn't set and no default is in its fields,
            // or if the type doesn't match. So, check for undefined.
            // GM_config.get может вернуть undefined, если значение не установлено и нет значения по умолчанию в его полях,
            // или если тип не совпадает. Поэтому проверяем на undefined.
            return typeof val !== 'undefined' ? val : defaultValue;
        }
        // Fallback if GM_config is not initialized
        // Фоллбэк, если GM_config не инициализирован
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
        const delta = baseInterval * factor * (Math.random() - 0.5) * 2; // Randomness: -factor/2 to +factor/2
                                                                        // Случайность: от -factor/2 до +factor/2
        return Math.max(50, Math.round(baseInterval + delta)); // Ensure interval is at least 50ms / Гарантируем, что интервал не менее 50 мс
    }

    // --- CORE SCRAPING FUNCTIONS ---
    // --- ОСНОВНЫЕ ФУНКЦИИ СКРАПИНГА ---

    /**
     * Checks if the currently active chat in the center column matches the target scraping channel.
     * It verifies this by comparing the 'data-peer-id' of the avatar in the chat header.
     * @returns {boolean} True if the target channel is active, false otherwise.
     *
     * Проверяет, соответствует ли текущий активный чат в центральной колонке целевому каналу для скрапинга.
     * Проверка осуществляется путем сравнения 'data-peer-id' аватара в заголовке чата.
     * @returns {boolean} True, если целевой канал активен, иначе false.
     */
    function isTargetChannelActive() {
        if (!currentScrapingChannelInfo || !currentScrapingChannelInfo.id) {
            // consoleLog("[isTargetActive] No currentScrapingChannelInfo or ID set.", true);
            return false;
        }
        // Select the chat info container within the currently active chat view
        // Выбираем контейнер информации о чате внутри текущего активного представления чата
        const chatInfoContainer = document.querySelector('#column-center .chat.active .sidebar-header .chat-info');
        if (!chatInfoContainer) {
            // consoleLog(`[isTargetActive] Chat info container (.chat.active .sidebar-header .chat-info) not found for "${currentScrapingChannelInfo.name}".`);
            return false;
        }

        const avatarElement = chatInfoContainer.querySelector('.avatar[data-peer-id]');
        if (avatarElement && avatarElement.dataset && avatarElement.dataset.peerId) {
            const displayedPeerId = avatarElement.dataset.peerId;
            if (displayedPeerId === currentScrapingChannelInfo.id) {
                consoleLog(`[isTargetActive] Channel "${currentScrapingChannelInfo.name}" (ID: ${currentScrapingChannelInfo.id}) IS ACTIVE (peerId ${displayedPeerId} matches).`);
                return true;
            } else {
                // consoleLog(`[isTargetActive] Waiting: Displayed peerId: ${displayedPeerId}, expected: ${currentScrapingChannelInfo.id} for "${currentScrapingChannelInfo.name}"`);
                return false;
            }
        }
        // consoleLog(`[isTargetActive] Avatar element with data-peer-id not found within active chat's .chat-info for "${currentScrapingChannelInfo.name}".`);
        return false;
    }

    /**
     * Parses the timestamp from a message bubble element.
     * @param {HTMLElement} bubbleElement - The message bubble HTML element.
     * @returns {number|null} The timestamp in milliseconds, or null if not found.
     *
     * Извлекает временную метку из элемента "пузыря" сообщения.
     * @param {HTMLElement} bubbleElement - HTML-элемент "пузыря" сообщения.
     * @returns {number|null} Временная метка в миллисекундах или null, если не найдена.
     */
    function parseTimestampFromBubble(bubbleElement) {
        if (bubbleElement && bubbleElement.dataset && bubbleElement.dataset.timestamp) {
            return parseInt(bubbleElement.dataset.timestamp, 10) * 1000; // Telegram timestamp is in seconds
                                                                        // Временная метка Telegram в секундах
        }
        return null;
    }

    /**
     * Extracts structured data from a single message HTML element.
     * @param {HTMLElement} messageElement - The HTML element containing the message text (e.g., span.translatable-message).
     * @returns {object|string|null} An object with extracted data, 'STOP_SCROLLING' if message is too old, or null on error.
     *
     * Извлекает структурированные данные из одного HTML-элемента сообщения.
     * @param {HTMLElement} messageElement - HTML-элемент, содержащий текст сообщения (например, span.translatable-message).
     * @returns {object|string|null} Объект с извлеченными данными, 'STOP_SCROLLING', если сообщение слишком старое, или null в случае ошибки.
     */
    function extractDataFromMessageElement(messageElement) {
        const channelNameForSource = currentScrapingChannelInfo ? currentScrapingChannelInfo.name : 'unknown_channel';
        const data = {
            title: '',
            text: '',
            link: null,
            pubDate: null,
            source: `t.me/${channelNameForSource.replace('@','')}`, // Construct source URL / Формируем URL источника
            messageId: null,
            rawHtmlContent: messageElement.innerHTML // For debugging or further processing / Для отладки или дальнейшей обработки
        };

        const parentBubble = messageElement.closest('.bubble.channel-post');
        if (!parentBubble) {
            consoleLog(`[Extractor] Parent bubble (.bubble.channel-post) not found for message: ${messageElement.textContent.substring(0,50)}...`, true);
            return null;
        }

        data.messageId = parentBubble.dataset.mid;
        if (!data.messageId) {
            consoleLog(`[Extractor] Message ID (data-mid) not found on parent bubble: ${parentBubble.outerHTML.substring(0,100)}...`, true);
            return null;
        }

        const timestamp = parseTimestampFromBubble(parentBubble);
        if (!timestamp) {
            consoleLog(`[Extractor] Timestamp could not be parsed for message ID ${data.messageId} in channel ${channelNameForSource}`, true);
            return null;
        }
        data.pubDate = new Date(timestamp).toISOString();

        // Check if the message is older than the configured limit
        // Проверка, не старше ли сообщение установленного лимита
        const oldestAllowedDate = new Date();
        oldestAllowedDate.setHours(oldestAllowedDate.getHours() - getConfigValue('MAX_MESSAGE_AGE_HOURS', 5));
        if (new Date(timestamp) < oldestAllowedDate) {
            consoleLog(`[Extractor] Message ID ${data.messageId} (PubDate: ${data.pubDate}) in ${channelNameForSource} is OLDER than ${getConfigValue('MAX_MESSAGE_AGE_HOURS', 5)} hours. Indicating STOP_SCROLLING.`);
            return 'STOP_SCROLLING';
        }

        // Attempt to extract title from the first <strong> element not part of a channel signature link
        // Попытка извлечь заголовок из первого элемента <strong>, не являющегося частью ссылки-подписи канала
        const strongElements = Array.from(messageElement.querySelectorAll('strong'));
        if (strongElements.length > 0) {
            const firstStrong = strongElements.find(s => {
                const anchor = s.closest('a');
                // A strong tag is NOT a title if it's inside a link pointing back to the same channel (signature)
                // Тег strong НЕ является заголовком, если он находится внутри ссылки, ведущей обратно на тот же канал (подпись)
                return !anchor || !(anchor.href.includes(`/${channelNameForSource.replace('@','')}`) || anchor.href.includes(`/${channelNameForSource}`));
            });
            if (firstStrong) {
                data.title = firstStrong.innerText.trim();
            }
        }

        // Extract full text content, excluding certain elements like custom emojis, stickers, reactions, and channel signature links
        // Извлечение полного текстового содержимого, исключая определенные элементы, такие как кастомные эмодзи, стикеры, реакции и ссылки-подписи канала
        let fullText = '';
        const channelNamePartForLinkComparison = channelNameForSource.replace('@','');

        messageElement.childNodes.forEach(node => {
            if (node.nodeType === Node.TEXT_NODE) {
                fullText += node.textContent;
            } else if (node.nodeType === Node.ELEMENT_NODE) {
                // If it's an external link, add its text and try to capture the href
                // Если это внешняя ссылка, добавляем ее текст и пытаемся захватить href
                if (node.tagName === 'A' && node.classList.contains('anchor-url')) {
                    fullText += node.innerText;
                    if (!data.link && node.href && node.target === '_blank' && !node.href.startsWith('https://t.me/')) {
                        data.link = node.href;
                    }
                }
                // If it's not a <strong> tag that we already used for the title
                // Если это не тег <strong>, который мы уже использовали для заголовка
                else if (node.tagName !== 'STRONG' || (data.title && !node.innerText.trim().startsWith(data.title) && !data.title.includes(node.innerText.trim()))) {
                    const isCustomEmoji = node.matches && (node.matches('img.custom-emoji') || node.matches('custom-emoji-element') || node.querySelector('img.custom-emoji'));
                    const isSticker = node.matches && (node.matches('.media-sticker-wrapper') || node.matches('tg-sticker'));
                    const isReactions = node.matches && (node.matches('reactions-element') || node.classList.contains('reactions'));

                    // Check for channel signature links (e.g., "t.me/channelname" or "/channelname" that also contains the channel name as text)
                    // Проверка на ссылки-подписи канала (например, "t.me/channelname" или "/channelname", которые также содержат имя канала в тексте)
                    let isChannelSignatureLink = false;
                    if (node.tagName === 'A' && node.href) {
                        const hrefLower = node.href.toLowerCase();
                        if (hrefLower.includes(`t.me/${channelNamePartForLinkComparison.toLowerCase()}`) || hrefLower.includes(`/${channelNamePartForLinkComparison.toLowerCase()}`)) {
                            if (node.innerText.toLowerCase().includes(channelNamePartForLinkComparison.toLowerCase())) {
                                isChannelSignatureLink = true;
                            }
                        }
                    }
                    // Check for nested signature links
                    // Проверка на вложенные ссылки-подписи
                    if (!isChannelSignatureLink && node.querySelector(`a[href*="/${channelNamePartForLinkComparison}"]`)) {
                        const nestedLink = node.querySelector(`a[href*="/${channelNamePartForLinkComparison}"]`);
                        if (nestedLink.innerText.toLowerCase().includes(channelNamePartForLinkComparison.toLowerCase())) {
                             isChannelSignatureLink = true;
                        }
                    }

                    if (!isCustomEmoji && !isSticker && !isReactions && !isChannelSignatureLink) {
                        fullText += node.innerText || node.textContent; // Prefer innerText to avoid hidden elements' textContent
                                                                        // Предпочитаем innerText, чтобы избежать textContent скрытых элементов
                    }
                }
            }
        });
        data.text = fullText.replace(/\s+/g, ' ').trim(); // Normalize whitespace / Нормализация пробелов

        // If no title was found from <strong>, use the beginning of the text as title
        // Если заголовок не был найден из <strong>, используем начало текста как заголовок
        if (!data.title && data.text) {
            data.title = data.text.substring(0, 120) + (data.text.length > 120 ? '...' : '');
        }

        // If the text starts with the title, remove the title part from the text
        // Если текст начинается с заголовка, удаляем часть заголовка из текста
        if (data.title && data.text.toLowerCase().startsWith(data.title.toLowerCase())) {
            data.text = data.text.substring(data.title.length).trim();
        }

        return data;
    }

    /**
     * Sends the scraped data payload to the configured n8n webhook.
     * @param {object} payload - The data object to send.
     *
     * Отправляет собранные данные на настроенный веб-хук n8n.
     * @param {object} payload - Объект данных для отправки.
     */
    function sendToN8N(payload) {
        const n8nWebhookUrl = getConfigValue('N8N_WEBHOOK_URL', '');
        if (!n8nWebhookUrl) {
            updateStatusForConsole('N8N Webhook URL не настроен! / N8N Webhook URL is not configured!', true);
            return;
        }
        const channelName = currentScrapingChannelInfo ? currentScrapingChannelInfo.name : 'N/A';
        const channelId = currentScrapingChannelInfo ? currentScrapingChannelInfo.id : 'N/A';

        updateStatusForConsole(`Отправка ID ${payload.messageId} (Канал: ${channelName} [${channelId}], Date: ${payload.pubDate})... / Sending ID ${payload.messageId} (Channel: ${channelName} [${channelId}], Date: ${payload.pubDate})...`);
        GM_xmlhttpRequest({
            method: "POST",
            url: n8nWebhookUrl,
            data: JSON.stringify(payload),
            headers: { "Content-Type": "application/json" },
            onload: function(response) {
                updateStatusForConsole(`n8n ответ для ID ${payload.messageId} (Канал: ${channelName}): ${response.status} / n8n response for ID ${payload.messageId} (Channel: ${channelName}): ${response.status}`);
                consoleLog(`[Sender] N8N Response for ID ${payload.messageId}: ${response.status} ${response.responseText.substring(0,100)}`);
            },
            onerror: function(response) {
                updateStatusForConsole(`n8n ошибка для ID ${payload.messageId} (Канал: ${channelName}): ${response.status} / n8n error for ID ${payload.messageId} (Channel: ${channelName}): ${response.status}`, true);
                consoleLog(`[Sender] N8N Error for ID ${payload.messageId}: ${response.status} ${response.responseText.substring(0,100)}`, true);
            }
        });
    }

    /**
     * Processes currently visible messages in the active channel.
     * Extracts data and sends it to n8n.
     * @returns {Promise<object>} An object { foundNew: boolean, stopScrolling: boolean, error?: string }.
     *
     * Обрабатывает видимые в данный момент сообщения в активном канале.
     * Извлекает данные и отправляет их в n8n.
     * @returns {Promise<object>} Объект { foundNew: boolean, stopScrolling: boolean, error?: string }.
     */
    async function processCurrentMessages() {
        if (!isScrapingSingle && !isMultiChannelScrapingActive) {
            return { foundNew: false, stopScrolling: false };
        }
        if (!currentScrapingChannelInfo) {
            consoleLog("processCurrentMessages: currentScrapingChannelInfo is not set.", true);
            return { foundNew: false, stopScrolling: true, error: "Канал не установлен / Channel not set" };
        }
        if (!isTargetChannelActive()) {
            updateStatusForConsole(`Канал ${currentScrapingChannelInfo.name} не активен (process). / Channel ${currentScrapingChannelInfo.name} is not active (process).`, true);
            return { foundNew: false, stopScrolling: true, error: `Канал ${currentScrapingChannelInfo.name} не активен / Channel ${currentScrapingChannelInfo.name} is not active` };
        }

        updateStatusForConsole(`Поиск в ${currentScrapingChannelInfo.name}... / Searching in ${currentScrapingChannelInfo.name}...`);
        // Query for message text containers
        // Запрос контейнеров текста сообщений
        const messageElements = document.querySelectorAll('.bubble.channel-post .message span.translatable-message, .bubble.channel-post .text-content');
        let foundNew = false;
        let stopDueToAge = false;

        // Iterate backwards to process older messages first if needed, or to find the "stop scrolling" point sooner
        // Итерация в обратном порядке для обработки сначала более старых сообщений, если необходимо, или для более быстрого нахождения точки "остановки прокрутки"
        for (let i = messageElements.length - 1; i >= 0; i--) {
            if (!isScrapingSingle && !isMultiChannelScrapingActive) break; // Stop if scraping is cancelled / Остановка, если сбор отменен

            const el = messageElements[i];
            const parentBubble = el.closest('.bubble.channel-post');
            const msgId = parentBubble ? parentBubble.dataset.mid : null;

            if (msgId) {
                const articleData = extractDataFromMessageElement(el);

                if (articleData === 'STOP_SCROLLING') {
                    stopDueToAge = true;
                    const ts = parentBubble?.dataset.timestamp ? new Date(parseInt(parentBubble.dataset.timestamp,10)*1000).toISOString() : 'N/A';
                    updateStatusForConsole(`Старые сообщения (ID: ${msgId}, Date: ${ts}). Стоп. / Old messages (ID: ${msgId}, Date: ${ts}). Stop.`);
                    break; // Stop processing further messages on this page / Прекратить обработку дальнейших сообщений на этой странице
                }

                if (articleData && articleData.title && (articleData.text || articleData.link)) {
                    consoleLog(`[Proc] ID ${msgId} (${articleData.pubDate.substring(11,19)}) к отправке. / to be sent.`);
                    sendToN8N(articleData);
                    foundNew = true;
                    await new Promise(r => setTimeout(r, getRandomizedInterval(getConfigValue('BASE_SEND_DELAY_MS', 1000), 'RANDOMNESS_FACTOR_MINOR')));
                } else if (articleData) {
                    consoleLog(`[Proc] ID ${msgId} пропущено (нет данных). / skipped (no data).`);
                } else {
                    consoleLog(`[Proc] ID ${msgId} ошибка извлечения. / extraction error.`, true);
                }
            }
        }
        return { foundNew, stopScrolling: stopDueToAge };
    }

    /**
     * Attempts to scroll the message list up to load older messages.
     *
     * Пытается прокрутить список сообщений вверх для загрузки более старых сообщений.
     */
    async function tryScrollUp() {
        if (!isScrapingSingle && !isMultiChannelScrapingActive) return;
        await new Promise(r => setTimeout(r, getRandomizedInterval(getConfigValue('BASE_SCROLL_ACTION_PAUSE_MS', 300), 'RANDOMNESS_FACTOR_MINOR')));
        updateStatusForConsole('Скролл вверх... / Scrolling up...');

        const messageBubbles = document.querySelectorAll('.bubbles-inner .bubble.channel-post');
        if (messageBubbles.length > 0) {
            const topBubble = messageBubbles[0];
            // Ensure the element is focusable for scrollIntoView if needed
            // Убеждаемся, что элемент может получить фокус для scrollIntoView, если это необходимо
            if (typeof topBubble.tabIndex === 'undefined' || topBubble.tabIndex === -1) {
                topBubble.tabIndex = -1;
            }
            try {
                consoleLog(`Скролл к верхнему ID: ${topBubble.dataset.mid} (scrollIntoView) / Scrolling to top ID: ${topBubble.dataset.mid} (scrollIntoView)`);
                topBubble.scrollIntoView({ behavior: 'auto', block: 'start' }); // 'auto' is faster than 'smooth' / 'auto' быстрее, чем 'smooth'
                await new Promise(r => setTimeout(r, getRandomizedInterval(getConfigValue('BASE_SCROLL_ACTION_PAUSE_MS', 300), 'RANDOMNESS_FACTOR_MINOR')));

                if (getConfigValue('USE_FOCUS_IN_SCROLL_UP', false)) {
                    consoleLog(`Фокус на верхний ID: ${topBubble.dataset.mid} / Focusing top ID: ${topBubble.dataset.mid}`);
                    topBubble.focus({ preventScroll: true }); // Focus without scrolling again / Фокус без повторной прокрутки
                }
                await new Promise(r => setTimeout(r, getRandomizedInterval(getConfigValue('BASE_SCROLL_PAUSE_MS', 5000))));
            } catch (e) {
                consoleLog(`Ошибка scrollIntoView/focus: ${e.message} / Error scrollIntoView/focus: ${e.message}`, true);
                updateStatusForConsole('Ошибка скролла вверх. Стандартный метод... / Scroll up error. Fallback method...', true);
                // Fallback scroll method / Резервный метод прокрутки
                const scrollArea = document.querySelector('div.bubbles-inner')?.parentElement || document.querySelector('.scrollable-y.chat-history-list') || document.querySelector('.bubbles > .scrollable-y');
                if (scrollArea) {
                    scrollArea.scrollTop = 0; // Scroll to the very top / Прокрутка в самый верх
                    scrollArea.dispatchEvent(new WheelEvent('wheel', { deltaY: -1000, bubbles: true, cancelable: true })); // Simulate wheel scroll / Имитация прокрутки колесом
                    await new Promise(r => setTimeout(r, getRandomizedInterval(getConfigValue('BASE_SCROLL_PAUSE_MS', 5000))));
                }
            }
        } else {
            updateStatusForConsole('Нет сообщений для скролла вверх. Стандартный метод. / No messages to scroll up to. Fallback method.');
            const scrollArea = document.querySelector('div.bubbles-inner')?.parentElement || document.querySelector('.scrollable-y.chat-history-list') || document.querySelector('.bubbles > .scrollable-y');
            if (scrollArea) {
                scrollArea.scrollTop = 0;
                scrollArea.dispatchEvent(new WheelEvent('wheel', { deltaY: -1000, bubbles: true, cancelable: true }));
                await new Promise(r => setTimeout(r, getRandomizedInterval(getConfigValue('BASE_SCROLL_PAUSE_MS', 5000))));
            } else {
                updateStatusForConsole('Нет области скролла и нет сообщений. / No scrollable area and no messages found.', true);
            }
        }
    }

    /**
     * Scrolls to the bottom of the chat, handling the "Go to bottom" button and programmatic scrolling.
     * @returns {Promise<boolean>} True if scrolled to bottom successfully, false otherwise.
     *
     * Прокручивает чат до конца, обрабатывая кнопку "Перейти к последним сообщениям" и программную прокрутку.
     * @returns {Promise<boolean>} True, если прокрутка до конца прошла успешно, иначе false.
     */
    async function scrollToBottom() {
        updateStatusForConsole('Прокрутка к последним сообщениям... / Scrolling to latest messages...');
        const scrollableArea = document.querySelector('div.bubbles-inner')?.parentElement || document.querySelector('.scrollable-y.chat-history-list') || document.querySelector('.bubbles > .scrollable-y');
        if (!scrollableArea) {
            updateStatusForConsole('Ошибка: Не найдена область для прокрутки вниз. / Error: Scrollable area for scrolling down not found.', true);
            return false;
        }

        let goToBottomButton;
        let clicksMade = 0;
        const maxClicks = getConfigValue('MAX_GO_TO_BOTTOM_CLICKS', 3);
        await new Promise(r => setTimeout(r, getRandomizedInterval(getConfigValue('BASE_SCROLL_ACTION_PAUSE_MS', 300), 'RANDOMNESS_FACTOR_MINOR')));

        // Click "Go to bottom" button if it has unread messages badge
        // Нажатие кнопки "Перейти к последним сообщениям", если на ней есть значок непрочитанных сообщений
        while (clicksMade < maxClicks) {
            if (!isScrapingSingle && !isMultiChannelScrapingActive && clicksMade > 0) {
                updateStatusForConsole('Прокрутка вниз прервана. / Scroll down interrupted.');
                return false;
            }
            goToBottomButton = document.querySelector('.bubbles-go-down.chat-secondary-button:not(.is-hidden):not([style*="display: none"])');
            const badge = goToBottomButton ? goToBottomButton.querySelector('.badge:not(.is-badge-empty)') : null;

            if (goToBottomButton && badge && typeof goToBottomButton.click === 'function') {
                const unreadCountText = badge.textContent;
                updateStatusForConsole(`Клик по кнопке "вниз" (${unreadCountText || 'несколько'} непрочитанных)... / Clicking "down" button (${unreadCountText || 'some'} unread)...`);
                consoleLog(`[ScrollToBottom] Clicking "go to bottom" button (unread: ${unreadCountText}). Click ${clicksMade + 1}`);
                goToBottomButton.click();
                clicksMade++;
                await new Promise(resolve => setTimeout(resolve, getRandomizedInterval(getConfigValue('BASE_SCROLL_BOTTOM_CLICK_PAUSE_MS', 2500))));
            } else {
                consoleLog('[ScrollToBottom] "Go to bottom" button with counter not found or empty.');
                break;
            }
        }

        // Programmatic scroll to bottom
        // Программная прокрутка вниз
        updateStatusForConsole('Программная прокрутка вниз... / Programmatic scroll down...');
        let prevScrollHeight = 0;
        const scrollIterations = getConfigValue('SCROLL_BOTTOM_PROGRAMMATIC_ITERATIONS', 3);
        for (let i = 0; i < scrollIterations; i++) {
            if (!isScrapingSingle && !isMultiChannelScrapingActive) {
                updateStatusForConsole('Прокрутка вниз прервана. / Scroll down interrupted.');
                return false;
            }
            prevScrollHeight = scrollableArea.scrollHeight;
            scrollableArea.scrollTop = scrollableArea.scrollHeight;
            updateStatusForConsole(`Прокрутка вниз... (итерация ${i + 1}/${scrollIterations}) / Scrolling down... (iteration ${i + 1}/${scrollIterations})`);
            await new Promise(resolve => setTimeout(resolve, getRandomizedInterval(getConfigValue('BASE_SCROLL_BOTTOM_PROG_PAUSE_MS', 700), 'RANDOMNESS_FACTOR_MINOR')));
            // If scroll height didn't change much, we are likely at the bottom
            // Если высота прокрутки почти не изменилась, мы, вероятно, внизу
            if (i > 0 && scrollableArea.scrollHeight - prevScrollHeight < 50) {
                consoleLog('[ScrollToBottom] Scroll height changed minimally, likely at bottom.');
                break;
            }
        }

        // Scroll to the very last message group for precision
        // Прокрутка к самой последней группе сообщений для точности
        const lastMessageGroup = document.querySelector('.bubbles-inner .bubbles-group-last');
        if (lastMessageGroup) {
            consoleLog('[ScrollToBottom] Found .bubbles-group-last, scrolling to it.');
            updateStatusForConsole('Точная прокрутка к последней группе... / Precise scroll to last group...');
            lastMessageGroup.scrollIntoView({ behavior: 'auto', block: 'end' });
            await new Promise(resolve => setTimeout(resolve, getRandomizedInterval(getConfigValue('BASE_SCROLL_BOTTOM_PROG_PAUSE_MS', 700) / 2, 'RANDOMNESS_FACTOR_MINOR')));
        } else {
            consoleLog('[ScrollToBottom] .bubbles-group-last not found.');
        }

        // Final click on "Go to bottom" if it's still visible (without badge)
        // Финальный клик по кнопке "Перейти к последним сообщениям", если она все еще видна (без значка)
        goToBottomButton = document.querySelector('.bubbles-go-down.chat-secondary-button:not(.is-hidden):not([style*="display: none"])');
        if (goToBottomButton && typeof goToBottomButton.click === 'function' && clicksMade < maxClicks) {
            const finalBadge = goToBottomButton.querySelector('.badge:not(.is-badge-empty)');
            if (!finalBadge) { // Click if no badge (meaning it's just the arrow) / Клик, если нет значка (значит, это просто стрелка)
                consoleLog('[ScrollToBottom] "Go to bottom" button (no counter) is active, final click.');
                updateStatusForConsole('Финальный клик по кнопке "вниз"... / Final click on "down" button...');
                goToBottomButton.click();
                await new Promise(resolve => setTimeout(resolve, getRandomizedInterval(getConfigValue('BASE_SCROLL_BOTTOM_CLICK_PAUSE_MS', 2500) / 2)));
            }
        }

        updateStatusForConsole('Прокрутка к последним сообщениям завершена. / Scroll to latest messages completed.');
        return true;
    }

    /**
     * Main scraping loop for a single channel. Scrolls up, processes messages, and repeats.
     *
     * Основной цикл сбора данных для одного канала. Прокручивает вверх, обрабатывает сообщения и повторяет.
     */
    async function scrapingLoopSingleChannel() {
        if (!isScrapingSingle) {
            consoleLog(`[Loop-${currentScrapingChannelInfo.name}] Остановлен (isScrapingSingle=false). / Stopped (isScrapingSingle=false).`);
            return;
        }
        // This check is important if multi-channel scraping was stopped while this loop was paused for the next iteration.
        // Эта проверка важна, если многоканальный сбор был остановлен, пока этот цикл был на паузе перед следующей итерацией.
        if (isMultiChannelScrapingActive && !isScrapingSingle) {
             consoleLog(`[Loop-${currentScrapingChannelInfo.name}] Остановлен (multi active, single false). / Stopped (multi active, single false).`);
             return;
        }

        await new Promise(r => setTimeout(r, getRandomizedInterval(getConfigValue('BASE_SCROLL_ACTION_PAUSE_MS', 300), 'RANDOMNESS_FACTOR_MINOR')));

        const { foundNew, stopScrolling, error } = await processCurrentMessages();

        if (error) {
            updateStatusForConsole(error + `. Прерываю для ${currentScrapingChannelInfo.name}. / Aborting for ${currentScrapingChannelInfo.name}.`, true);
            return; // Stop this channel's loop on error / Остановка цикла этого канала при ошибке
        }
        if (stopScrolling) {
            updateStatusForConsole(`Лимит по дате для ${currentScrapingChannelInfo.name}. Завершаю. / Date limit reached for ${currentScrapingChannelInfo.name}. Finishing.`);
            return; // Stop this channel's loop / Остановка цикла этого канала
        }

        if (foundNew) {
            consecutiveScrollsWithoutNewFound = 0; // Reset counter if new messages were found / Сброс счетчика, если найдены новые сообщения
        } else {
            consecutiveScrollsWithoutNewFound++;
            consoleLog(`[Loop-${currentScrapingChannelInfo.name}] Ничего нового. Счетчик: ${consecutiveScrollsWithoutNewFound} / Nothing new. Counter: ${consecutiveScrollsWithoutNewFound}`);
        }

        if (consecutiveScrollsWithoutNewFound >= getConfigValue('CONSECUTIVE_SCROLLS_LIMIT', 5)) {
            updateStatusForConsole(`Нет новых сообщений для ${currentScrapingChannelInfo.name} после ${getConfigValue('CONSECUTIVE_SCROLLS_LIMIT', 5)} прокруток. Завершаю. / No new messages for ${currentScrapingChannelInfo.name} after ${getConfigValue('CONSECUTIVE_SCROLLS_LIMIT', 5)} scrolls. Finishing.`);
            return; // Stop this channel's loop / Остановка цикла этого канала
        }

        await tryScrollUp(); // Scroll up to load more messages / Прокрутка вверх для загрузки большего количества сообщений

        if (isScrapingSingle) { // Check flag again before scheduling next iteration / Проверка флага снова перед планированием следующей итерации
           const baseNextInterval = !foundNew ? getConfigValue('BASE_SCRAPE_INTERVAL_MS', 30000) : getConfigValue('BASE_SCRAPE_INTERVAL_MS', 30000) / 2;
           await new Promise(r => setTimeout(r, getRandomizedInterval(baseNextInterval)));
           if (isScrapingSingle) await scrapingLoopSingleChannel(); // Recursive call for the loop / Рекурсивный вызов для цикла
        }
    }

    /**
     * Manages the process of scraping a single channel: navigation, activation check, scrolling, and starting the loop.
     * @param {object} channelInfoObject - An object from TARGET_CHANNELS_DATA.
     * @returns {Promise<boolean>} True if scraping process was successful (or ran its course), false on critical failure.
     *
     * Управляет процессом сбора данных с одного канала: навигация, проверка активации, прокрутка и запуск цикла.
     * @param {object} channelInfoObject - Объект из TARGET_CHANNELS_DATA.
     * @returns {Promise<boolean>} True, если процесс сбора прошел успешно (или завершился), false при критической ошибке.
     */
    async function scrapeSingleChannelProcess(channelInfoObject) {
        if (!channelInfoObject || !channelInfoObject.id || !channelInfoObject.name) {
            consoleLog("Ошибка: Некорректные данные канала в scrapeSingleChannelProcess / Error: Invalid channel data in scrapeSingleChannelProcess", true);
            return false;
        }
        // This check ensures that if scraping was stopped globally, this process doesn't start/continue.
        // Эта проверка гарантирует, что если сбор был остановлен глобально, этот процесс не начнется/не продолжится.
        if (!isScrapingSingle && !isMultiChannelScrapingActive) {
             consoleLog(`scrapeSingleChannelProcess для ${channelInfoObject.name} не может быть запущен (флаги). / cannot be started (flags).`);
             return false;
        }

        currentScrapingChannelInfo = channelInfoObject; // Set the global current channel / Установка текущего глобального канала

        consoleLog(`--- Начало скрапинга канала: ${currentScrapingChannelInfo.name} (ID: ${currentScrapingChannelInfo.id}) --- / --- Starting scrape for channel: ${currentScrapingChannelInfo.name} (ID: ${currentScrapingChannelInfo.id}) ---`);
        updateStatusForConsole(`Скрапинг: ${currentScrapingChannelInfo.name} / Scraping: ${currentScrapingChannelInfo.name}`);

        // --- Navigation and Activation ---
        // --- Навигация и Активация ---
        const targetHashForNavigation = `#${currentScrapingChannelInfo.name}`; // Assumes channel name is usable in hash / Предполагается, что имя канала можно использовать в хэше
        let navigationNeeded = true;

        // Check if already on the target channel by peer ID
        // Проверка, находимся ли мы уже на целевом канале по peer ID
        const chatInfoContainerInitial = document.querySelector('#column-center .chat.active .sidebar-header .chat-info');
        let initialDisplayedPeerId = null;
        if (chatInfoContainerInitial) {
            const avatarElementInitial = chatInfoContainerInitial.querySelector('.avatar[data-peer-id]');
            if (avatarElementInitial) { initialDisplayedPeerId = avatarElementInitial.dataset.peerId; }
        }

        if (initialDisplayedPeerId === currentScrapingChannelInfo.id) {
            consoleLog(`[Nav] Уже на канале ${currentScrapingChannelInfo.name} (peerId совпадает). / Already on channel ${currentScrapingChannelInfo.name} (peerId matches).`);
            navigationNeeded = false;
        } else if (window.location.hash.toLowerCase() === targetHashForNavigation.toLowerCase() && initialDisplayedPeerId) {
            // If hash matches but peer ID doesn't (or if peer ID is not yet available but hash is correct),
            // still wait for peer ID activation to be sure.
            // Если хэш совпадает, а peer ID нет (или если peer ID еще недоступен, но хэш правильный),
            // все равно ждем активации по peer ID для уверенности.
            consoleLog(`[Nav] URL hash is ${targetHashForNavigation} or peerId (${initialDisplayedPeerId}) present, but expecting ${currentScrapingChannelInfo.id}. Will wait for peerId activation.`);
            navigationNeeded = false; // No need to change hash, just wait for activation
                                      // Нет необходимости менять хэш, просто ждем активации
        }

        if (navigationNeeded) {
            consoleLog(`Перехожу на канал ${targetHashForNavigation}... / Navigating to channel ${targetHashForNavigation}...`);
            window.location.hash = targetHashForNavigation;
            await new Promise(r => setTimeout(r, getRandomizedInterval(getConfigValue('NAVIGATION_INITIATION_PAUSE_MS', 2500), 'RANDOMNESS_FACTOR_MAJOR')));
        }

        // Wait for the channel to become active by checking its peer ID
        // Ожидание активации канала путем проверки его peer ID
        let activationAttempts = 0;
        const maxActivationAttempts = getConfigValue('MAX_CHANNEL_ACTIVATION_ATTEMPTS', 25);
        consoleLog(`Ожидание активации канала ${currentScrapingChannelInfo.name} (ID: ${currentScrapingChannelInfo.id}) по peer-id... / Waiting for channel ${currentScrapingChannelInfo.name} (ID: ${currentScrapingChannelInfo.id}) to activate by peer-id...`);
        while (activationAttempts < maxActivationAttempts) {
            if (!isScrapingSingle && !isMultiChannelScrapingActive) { // Check if scraping was stopped during wait / Проверка, не был ли сбор остановлен во время ожидания
                consoleLog("Остановка во время ожидания активации канала. / Stopped while waiting for channel activation.");
                return false;
            }
            if (isTargetChannelActive()) {
                break; // Channel is active / Канал активен
            }
            activationAttempts++;
            updateStatusForConsole(`Ожидание ${currentScrapingChannelInfo.name} (${activationAttempts}/${maxActivationAttempts}) / Waiting for ${currentScrapingChannelInfo.name} (${activationAttempts}/${maxActivationAttempts})`);
            await new Promise(r => setTimeout(r, getRandomizedInterval(getConfigValue('CHANNEL_ACTIVATION_ATTEMPT_PAUSE_MS', 700), 'RANDOMNESS_FACTOR_MINOR')));
        }

        if (!isTargetChannelActive()) {
            updateStatusForConsole(`Не удалось активировать ${currentScrapingChannelInfo.name} (ID: ${currentScrapingChannelInfo.id}) по peer-id. Пропускаю. / Failed to activate ${currentScrapingChannelInfo.name} (ID: ${currentScrapingChannelInfo.id}) by peer-id. Skipping.`, true);
            return false; // Critical failure for this channel / Критическая ошибка для этого канала
        }

        // --- Scroll to Bottom and Start Scraping Up ---
        // --- Прокрутка вниз и начало сбора вверх ---
        consoleLog(`Канал ${currentScrapingChannelInfo.name} активен. Прокрутка вниз. / Channel ${currentScrapingChannelInfo.name} is active. Scrolling to bottom.`);
        const scrolledToBottom = await scrollToBottom();
        if (!scrolledToBottom) {
            if (isScrapingSingle || isMultiChannelScrapingActive) { // Only log error if scraping is still meant to be active / Логировать ошибку, только если сбор все еще должен быть активен
                 updateStatusForConsole(`Ошибка прокрутки вниз для ${currentScrapingChannelInfo.name}. / Error scrolling to bottom for ${currentScrapingChannelInfo.name}.`, true);
            }
            return false; // Could not prepare channel / Не удалось подготовить канал
        }
        if (!isScrapingSingle && !isMultiChannelScrapingActive) { // Re-check after potentially long scroll / Повторная проверка после потенциально долгой прокрутки
            consoleLog("Остановка после прокрутки вниз. / Stopped after scrolling to bottom.");
            return false;
        }

        updateStatusForConsole(`Скрапинг вверх для ${currentScrapingChannelInfo.name}... / Scraping upwards for ${currentScrapingChannelInfo.name}...`);
        consecutiveScrollsWithoutNewFound = 0; // Reset for this channel / Сброс для этого канала
        await scrapingLoopSingleChannel(); // Start the actual scraping loop / Запуск основного цикла сбора

        consoleLog(`--- Скрапинг канала ${currentScrapingChannelInfo.name} завершен/остановлен --- / --- Scraping for channel ${currentScrapingChannelInfo.name} finished/stopped ---`);
        return true; // Process for this channel completed its course / Процесс для этого канала завершил свой ход
    }


    // --- MENU COMMAND HANDLERS ---
    // --- ОБРАБОТЧИКИ КОМАНД МЕНЮ ---

    /**
     * Menu command: Scrape the currently open channel.
     * Команда меню: Собрать данные с текущего открытого канала.
     */
    async function startSingleChannelScrapeMenu() {
        consoleLog("Команда 'Scrape Current Channel' вызвана. / 'Scrape Current Channel' command called.");
        if (isScrapingSingle || isMultiChannelScrapingActive) {
            alert("Скрапинг уже запущен. / Scraping is already running.");
            consoleLog("Скрапинг уже запущен. / Scraping is already running.", true);
            return;
        }

        // Determine current channel based on peer ID in header, then by URL hash
        // Определение текущего канала по peer ID в заголовке, затем по URL хэшу
        let displayedPeerId = null;
        const chatInfoContainer = document.querySelector('#column-center .chat.active .sidebar-header .chat-info');
        if (chatInfoContainer) {
            const avatarElement = chatInfoContainer.querySelector('.avatar[data-peer-id]');
            if (avatarElement && avatarElement.dataset && avatarElement.dataset.peerId) {
                displayedPeerId = avatarElement.dataset.peerId;
            }
        }

        let channelInfoToScrape = null;
        if (displayedPeerId) {
            channelInfoToScrape = TARGET_CHANNELS_DATA.find(ch => ch.id === displayedPeerId);
            if (channelInfoToScrape) {
                 consoleLog(`[startSingle] Канал определен по peer-id: ${channelInfoToScrape.name} (${displayedPeerId}) / Channel identified by peer-id: ${channelInfoToScrape.name} (${displayedPeerId})`);
            } else {
                 consoleLog(`[startSingle] Peer-id ${displayedPeerId} найден, но не соответствует ни одному каналу в TARGET_CHANNELS_DATA. / Peer-id ${displayedPeerId} found, but does not match any channel in TARGET_CHANNELS_DATA.`);
            }
        } else {
            consoleLog(`[startSingle] Не удалось получить peer-id из шапки активного чата. / Could not get peer-id from active chat header.`);
        }

        if (!channelInfoToScrape) { // Fallback to URL hash if peer ID method failed / Резервный вариант - URL хэш, если метод с peer ID не сработал
            let hash = window.location.hash.substring(1); // Remove #
            if (hash) {
                const queryParamIndex = hash.indexOf('?'); // Remove query params if any / Удаление query-параметров, если есть
                if (queryParamIndex !== -1) { hash = hash.substring(0, queryParamIndex); }

                // Try matching by ID first (if hash is a peer ID)
                // Сначала пытаемся сопоставить по ID (если хэш - это peer ID)
                channelInfoToScrape = TARGET_CHANNELS_DATA.find(ch => ch.id === hash);
                if (!channelInfoToScrape) {
                    // Then try matching by name (add @ if missing and not a number)
                    // Затем пытаемся сопоставить по имени (добавляем @, если отсутствует и не является числом)
                    let nameToCompare = hash;
                    if (!hash.startsWith('@') && isNaN(parseInt(hash))) { // Avoid adding @ to peer IDs / Избегаем добавления @ к peer ID
                        nameToCompare = '@' + hash;
                    }
                    channelInfoToScrape = TARGET_CHANNELS_DATA.find(ch => ch.name.toLowerCase() === nameToCompare.toLowerCase());
                }

                if (channelInfoToScrape) {
                    consoleLog(`[startSingle] Канал определен по hash "${hash}": ${channelInfoToScrape.name} / Channel identified by hash "${hash}": ${channelInfoToScrape.name}`);
                } else {
                    consoleLog(`[startSingle] Канал не определен по hash "${hash}". / Channel not identified by hash "${hash}".`);
                }
            }
        }

        if (!channelInfoToScrape) {
            alert("Не удалось определить текущий канал из списка TARGET_CHANNELS_DATA. Откройте один из целевых каналов или убедитесь, что URL корректен.\n\nCould not determine the current channel from TARGET_CHANNELS_DATA. Please open one of the target channels or ensure the URL is correct.");
            consoleLog("Не удалось определить текущий канал из списка TARGET_CHANNELS_DATA. / Could not determine current channel from TARGET_CHANNELS_DATA.", true);
            return;
        }

        isScrapingSingle = true; // Set flag for single channel mode / Установка флага для режима одного канала
        consoleLog(`--- Начало ОДИНОЧНОЙ сессии для ${channelInfoToScrape.name} --- / --- Starting SINGLE session for ${channelInfoToScrape.name} ---`);
        alert(`Начинаю скрапинг текущего канала: ${channelInfoToScrape.name}. Следите за консолью (F12).\n\nStarting to scrape current channel: ${channelInfoToScrape.name}. Check console (F12) for progress.`);

        await scrapeSingleChannelProcess(channelInfoToScrape);

        isScrapingSingle = false; // Clear flag when done / Сброс флага по завершении
        if (!isMultiChannelScrapingActive) { // Only show completion alert if not part of a multi-scrape / Показать alert о завершении, только если это не часть многоканального сбора
            updateStatusForConsole("Скрапинг текущего канала завершен. / Scraping of current channel finished.");
            consoleLog("--- ОДИНОЧНАЯ сессия скрапинга завершена --- / --- SINGLE scraping session finished ---");
            alert(`Скрапинг канала ${channelInfoToScrape.name} завершен. / Scraping of channel ${channelInfoToScrape.name} finished.`);
        }
        currentScrapingChannelInfo = null; // Clear current channel info / Очистка информации о текущем канале
    }

    /**
     * Menu command: Scrape all channels listed in TARGET_CHANNELS_DATA.
     * Команда меню: Собрать данные со всех каналов, перечисленных в TARGET_CHANNELS_DATA.
     */
    async function startMultiChannelScrapeMenu() {
        consoleLog("Команда 'Scrape All Listed Channels' вызвана. / 'Scrape All Listed Channels' command called.");
        if (isScrapingSingle || isMultiChannelScrapingActive) {
            alert("Скрапинг уже запущен. / Scraping is already running.");
            consoleLog("Скрапинг уже запущен. / Scraping is already running.", true);
            return;
        }
        if (!confirm(`Начать скрапинг ${TARGET_CHANNELS_DATA.length} каналов? Это может занять много времени.\n\nStart scraping ${TARGET_CHANNELS_DATA.length} channels? This may take a long time.`)) {
            consoleLog("Мульти-скрапинг отменен пользователем. / Multi-channel scraping cancelled by user.");
            return;
        }

        isMultiChannelScrapingActive = true; // Set flag for multi-channel mode / Установка флага для многоканального режима
        currentChannelIndex = 0; // Reset index / Сброс индекса
        consoleLog("--- Начало МУЛЬТИ-СКРАПИНГА --- / --- Starting MULTI-CHANNEL SCRAPING ---");
        alert("Начинаю скрапинг всех каналов из списка. Следите за консолью (F12).\n\nStarting to scrape all listed channels. Check console (F12) for progress.");

        while (currentChannelIndex < TARGET_CHANNELS_DATA.length && isMultiChannelScrapingActive) {
            isScrapingSingle = true; // Temporarily set for scrapeSingleChannelProcess logic / Временно устанавливается для логики scrapeSingleChannelProcess
            const channelInfo = TARGET_CHANNELS_DATA[currentChannelIndex];
            updateStatusForConsole(`[${currentChannelIndex + 1}/${TARGET_CHANNELS_DATA.length}] Запуск для: ${channelInfo.name} / Starting for: ${channelInfo.name}`);

            const success = await scrapeSingleChannelProcess(channelInfo);

            isScrapingSingle = false; // Clear temporary flag / Сброс временного флага
            if (!isMultiChannelScrapingActive) { // Check if stopped during this channel's processing / Проверка, не был ли остановлен во время обработки этого канала
                consoleLog("Мульти-скрапинг остановлен пользователем во время обработки. / Multi-channel scraping stopped by user during processing.");
                break;
            }

            if (!success) {
                consoleLog(`Проблема со скрапингом канала ${channelInfo.name}, пропускаю. / Problem scraping channel ${channelInfo.name}, skipping.`, true);
            }

            currentChannelIndex++;
            if (currentChannelIndex < TARGET_CHANNELS_DATA.length && isMultiChannelScrapingActive) {
                const pauseDuration = getRandomizedInterval(getConfigValue('BASE_SCROLL_PAUSE_MS', 5000) * 1.5, 'RANDOMNESS_FACTOR_MAJOR');
                updateStatusForConsole(`Пауза ${Math.round(pauseDuration/1000)}с перед ${TARGET_CHANNELS_DATA[currentChannelIndex].name} / Pausing ${Math.round(pauseDuration/1000)}s before ${TARGET_CHANNELS_DATA[currentChannelIndex].name}`);
                await new Promise(r => setTimeout(r, pauseDuration));
            }
        }

        if (isMultiChannelScrapingActive) { // If loop completed naturally / Если цикл завершился естественным образом
            updateStatusForConsole("Скрапинг ВСЕХ каналов завершен. / Scraping of ALL channels finished.");
            alert("Скрапинг всех каналов завершен! / Scraping of all channels finished!");
        }
        isMultiChannelScrapingActive = false;
        isScrapingSingle = false; // Ensure this is also false / Убедимся, что это также false
        currentScrapingChannelInfo = null;
    }

    /**
     * Menu command: Stop all ongoing scraping activities.
     * Команда меню: Остановить все текущие процессы сбора данных.
     */
    function stopAllScrapingActivitiesMenu() {
        consoleLog("Команда 'Stop All Scraping' вызвана. / 'Stop All Scraping' command called.", true);
        isScrapingSingle = false;
        isMultiChannelScrapingActive = false;
        updateStatusForConsole('Скрапинг остановлен пользователем через меню. / Scraping stopped by user via menu.');
        alert("Все процессы скрапинга остановлены. / All scraping processes have been stopped.");
    }


    // --- REGISTER MENU COMMANDS ---
    // --- РЕГИСТРАЦИЯ КОМАНД МЕНЮ ---
    if (typeof GM_registerMenuCommand === 'function') {
        if (gmConfigInitialized) { // Check if GM_config was successfully initialized / Проверка, был ли GM_config успешно инициализирован
            GM_registerMenuCommand("Scrape Current Channel / Собрать с текущего канала", startSingleChannelScrapeMenu, "C");
            GM_registerMenuCommand("Scrape All Listed Channels / Собрать со всех каналов", startMultiChannelScrapeMenu, "A");
            GM_registerMenuCommand("Stop All Scraping / Остановить всё", stopAllScrapingActivitiesMenu, "S");
            GM_registerMenuCommand("Настройки скрипта... / Script Settings...", () => GM_config.open(), "O");
            consoleLog("Команды меню Tampermonkey зарегистрированы (включая GM_config). / Tampermonkey menu commands registered (including GM_config).");
        } else {
            // GM_config not initialized, register only basic commands
            // GM_config не инициализирован, регистрируем только основные команды
            consoleLog("GM_config не был успешно инициализирован. Регистрируются только основные команды. / GM_config was not successfully initialized. Registering only basic commands.", true);
            alert("Ошибка: GM_config не инициализирован. Настройки через GUI не будут доступны. Проверьте консоль.\n\nError: GM_config not initialized. Settings GUI will not be available. Check console.");
            GM_registerMenuCommand("Scrape Current Channel / Собрать с текущего канала", startSingleChannelScrapeMenu, "C");
            GM_registerMenuCommand("Scrape All Listed Channels / Собрать со всех каналов", startMultiChannelScrapeMenu, "A");
            GM_registerMenuCommand("Stop All Scraping / Остановить всё", stopAllScrapingActivitiesMenu, "S");
            consoleLog("Основные команды меню Tampermonkey зарегистрированы (без настроек GM_config). / Basic Tampermonkey menu commands registered (without GM_config settings).");
        }
    } else {
        consoleLog("GM_registerMenuCommand не доступна. Управление через меню невозможно. / GM_registerMenuCommand is not available. Menu control is not possible.", true);
        alert("Tampermonkey API GM_registerMenuCommand не доступно. Скрипт будет работать без UI команд.\n\nTampermonkey API GM_registerMenuCommand is not available. The script will run without UI commands.");
    }

})(); // End of IIFE / Конец IIFE
console.log(`[Telegram Scraper v${GM_info.script.version}] Script IIFE execution completed.`);
