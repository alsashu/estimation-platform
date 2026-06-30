'use strict';
const { Browser } = require('selenium-webdriver');
const chrome = require('selenium-webdriver/chrome');
const firefox = require('selenium-webdriver/firefox');
const edge = require('selenium-webdriver/edge');

/**
 * Returns configured browser options for the given browser and headless flag.
 *
 * Headed mode  (headless=false): browser window is fully visible, started
 *   maximised via --start-maximized (Chrome/Edge) or window.maximize() call
 *   in DriverFactory.  --disable-gpu is omitted so GPU-accelerated rendering
 *   works normally on screen.
 *
 * Headless mode (headless=true): no window; fixed viewport set via
 *   --window-size so layout is consistent across CI runs.
 *
 * @param {string}  browser  - 'chrome' | 'firefox' | 'edge'
 * @param {boolean} headless - true = headless, false = visible window
 * @returns {{ browserName: string, options: object }}
 */
function getBrowserOptions(browser, headless) {
  switch (browser.toLowerCase()) {
    case 'chrome': {
      const opts = new chrome.Options();
      // Always-on stability flags
      opts.addArguments('--no-sandbox');
      opts.addArguments('--disable-dev-shm-usage');
      opts.addArguments('--disable-extensions');
      opts.addArguments('--disable-infobars');
      opts.addArguments('--disable-notifications');
      opts.addArguments('--remote-allow-origins=*');
      opts.addArguments('--disable-blink-features=AutomationControlled');

      if (headless) {
        // Headless: use new headless mode with a fixed viewport
        opts.addArguments('--headless=new');
        opts.addArguments('--disable-gpu');
        opts.addArguments('--window-size=1920,1080');
      } else {
        // Headed: start maximised — no --headless flag at all
        opts.addArguments('--start-maximized');
      }
      return { browserName: Browser.CHROME, options: opts };
    }

    case 'firefox': {
      const opts = new firefox.Options();
      if (headless) {
        opts.addArguments('--headless');
        opts.addArguments('--width=1920');
        opts.addArguments('--height=1080');
      }
      // Headed Firefox is maximised via driver.manage().window().maximize()
      // in DriverFactory — Firefox has no --start-maximized equivalent.
      return { browserName: Browser.FIREFOX, options: opts };
    }

    case 'edge': {
      const opts = new edge.Options();
      opts.addArguments('--no-sandbox');
      opts.addArguments('--disable-dev-shm-usage');
      opts.addArguments('--disable-extensions');
      opts.addArguments('--remote-allow-origins=*');

      if (headless) {
        opts.addArguments('--headless=new');
        opts.addArguments('--disable-gpu');
        opts.addArguments('--window-size=1920,1080');
      } else {
        opts.addArguments('--start-maximized');
      }
      return { browserName: Browser.EDGE, options: opts };
    }

    default:
      throw new Error(
        `Unsupported browser: "${browser}". Supported values: chrome, firefox, edge`
      );
  }
}

module.exports = { getBrowserOptions };
