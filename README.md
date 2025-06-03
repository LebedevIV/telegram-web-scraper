# telegram-web-scraper
UserScript to scrape Telegram channel messages and send to n8n or other system
# Telegram Web Scraper UserScript

A UserScript to scrape messages from specified Telegram channels (when viewed in web.telegram.org) and send them to a configured n8n webhook.

## Features

*   Scrapes messages from the currently active channel or a predefined list of channels.
*   Graphical User Interface (GUI) for easy configuration of settings, powered by GM_config.
*   Filters messages by maximum age to avoid processing very old data.
*   Automatically navigates between channels in multi-channel scraping mode.
*   Incorporates randomized delays to better simulate human browsing patterns.
*   Control via Tampermonkey/Violentmonkey menu commands.
*   Bilingual comments (English/Russian) in the script code.

## Installation

1.  **Install a UserScript Manager**:
    *   [Tampermonkey](https://www.tampermonkey.net/) (Recommended for Chrome, Edge, Safari, Opera, Firefox)
    *   [Violentmonkey](https://violentmonkey.github.io/) (Recommended for Firefox, Chrome, Edge, Opera)
    *   Or any other UserScript manager that supports `@require` and `@grant` directives.

2.  **Install the Script**:
    *   **Click here to install**: [https://github.com/LebedevIV/telegram-web-scraper/raw/refs/heads/main/telegram-scraper.user.js](https://github.com/LebedevIV/telegram-web-scraper/raw/refs/heads/main/telegram-scraper.user.js)
    *   (Replace `ВАШ_НИКНЕЙМ_GITHUB` and `ИМЯ_ВАШЕГО_РЕПОЗИТОРИЯ` with your actual GitHub username and repository name. Also, ensure `main` is your default branch name; it might be `master` for older repositories.)
    *   Alternatively, navigate to the `telegram-scraper.user.js` file in this repository, click the "Raw" button, and your UserScript manager should prompt you to install it.

## Configuration

After installation, open Telegram Web (e.g., web.telegram.org/k/). The script's settings can be accessed via the UserScript manager's icon in your browser:

*   Click the Tampermonkey/Violentmonkey icon.
*   Find "Telegram Scraper (Menu Commands vX.X.X)" in the list of active scripts.
*   Select "Настройки скрипта... / Script Settings..." from its dropdown menu.

Key settings include:
*   **N8N Webhook URL**: The URL of your n8n webhook that will receive the scraped data.
*   **Max message age (hours)**: Messages older than this will be ignored.
*   Various timing and attempt parameters for scraping and navigation.

Default values and reload requirements are indicated next to each setting in the GUI.

## Usage

The script adds commands to your UserScript manager's menu for the Telegram Web tab:

*   **Scrape Current Channel / Собрать с текущего канала**: Starts scraping messages from the channel currently open in Telegram Web.
*   **Scrape All Listed Channels / Собрать со всех каналов**: Iterates through the `TARGET_CHANNELS_DATA` list defined in the script, scraping each one.
*   **Stop All Scraping / Остановить всё**: Immediately stops any active scraping processes.
*   **Настройки скрипта... / Script Settings...**: Opens the configuration GUI.

Scraping progress and logs are output to the browser's developer console (F12).

## Dependencies

*   **GM_config.js**: This library is loaded via the `@require` directive from `openuserjs.org` to provide the settings GUI.
*   **n8n Webhook**: You need an active n8n instance with a webhook workflow ready to receive JSON data via POST requests.

## Troubleshooting

*   **Script not running**: Ensure Tampermonkey/Violentmonkey is enabled and the script is active for `web.telegram.org`. Check the browser console for errors.
*   **Settings GUI not appearing**: Check the console for errors related to `GM_config.js`. The `@require` URL might be temporarily unavailable, or there could be a conflict.
*   **Data not reaching n8n**:
    *   Verify the "N8N Webhook URL" in the script settings is correct and accessible from your browser.
    *   Check your n8n workflow for errors and ensure it's active.
    *   Look for `GM_xmlhttpRequest` errors in the browser console.

## License

This project is licensed under the [MIT License](LICENSE).
