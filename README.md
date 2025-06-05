# Telegram Web Scraper UserScript

**[Русская версия README (Russian README)](README.ru.md)** 
*(For English, please continue reading below.)*

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

## Simulating Human-like Behavior (Adjusting Speed)

The script includes various timing parameters that can be adjusted to make its operation slower and appear more like human interaction. This can be useful to avoid potential rate-limiting or detection by Telegram, although the primary goal is data collection.

You can adjust these settings via the script's configuration GUI ("Настройки скрипта... / Script Settings..."):

### Key Parameters to Adjust for Slower, More Human-like Scraping:

1.  **Main Operation Pauses:**
    *   **`Base scrape interval (ms)`**: (Default: `30000`) This is the main pause between processing chunks of messages when scrolling up a channel. Increasing this (e.g., to `60000` - `120000` ms) significantly slows down how quickly the script moves to older messages.
    *   **`Pause after scroll (ms)`**: (Default: `5000`) Pause after each scroll action (up or down). Increasing this (e.g., to `7000` - `15000` ms) simulates a user "reading" messages after scrolling.

2.  **Navigation and Activation Pauses (for Multi-Channel Mode):**
    *   **`Pause after navigation (ms)`**: (Default: `2500`) Pause after changing the URL hash to switch channels. Increase to `3000` - `5000` ms if channels load slowly.
    *   **`Pause between channel activation attempts (ms)`**: (Default: `700`) Pause between checks if the target channel has become active. Can be slightly increased if needed (e.g., `1000` - `1500` ms).

3.  **"Scroll to Bottom" Pauses:**
    *   **`Pause after "scroll to bottom" button click (ms)`**: (Default: `2500`) Pause after clicking the "down" arrow button (with unread count). Increase to `3000` - `5000` ms.
    *   **`Pause during programmatic scroll down (ms)`**: (Default: `700`) Pause between iterations of programmatic scrolling to the very bottom. Increase to `1000` - `2000` ms.

4.  **Action and Sending Delays:**
    *   **`Short pause before/after scroll action (ms)`**: (Default: `300`) A brief pause before processing messages or scrolling up. Increase to `500` - `1000` ms for a slight "hesitation."
    *   **`Delay before sending each message to n8n (ms)`**: (Default: `1000`) Pause between sending individual messages to your n8n webhook. Increasing this (e.g., `1500` - `3000` ms) reduces the request frequency to your n8n instance.

5.  **Randomness Factors:**
    *   **`Randomness factor for major pauses (0.0-1.0)`**: (Default: `0.3`) Adds variability to longer pauses. A value of `0.3` means +/- 15% of the base pause. Increasing slightly (e.g., to `0.4` - `0.5`) can make pauses less predictable.
    *   **`Randomness factor for minor pauses (0.0-1.0)`**: (Default: `0.15`) Adds variability to shorter pauses. Can be slightly increased (e.g., to `0.2` - `0.25`).

6.  **Randomize Channel Order:**
    *   **`Randomize channel order for multi-scrape`**: (Default: `true`) When enabled, the script will shuffle the list of target channels before starting a "Scrape All Listed Channels" task. This makes the scraping pattern less predictable if you run it frequently.

**Example "Slower" Configuration:**
*   `Base scrape interval (ms)`: `90000` (1.5 minutes)
*   `Pause after scroll (ms)`: `10000` (10 seconds)
*   `Delay before sending each message to n8n (ms)`: `2500` (2.5 seconds)
*   `Randomness factor for major pauses`: `0.4`

Experiment with these values to find a balance that suits your needs and makes the script's activity appear more natural. Remember that significantly increasing all pauses will make the overall scraping process much longer.
