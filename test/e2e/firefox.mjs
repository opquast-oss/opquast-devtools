// Firefox driver: Selenium + geckodriver (Marionette), the extension installed as a temporary add-on.
//
// Two Firefox settings make extension pages reachable at all:
// - system access for the remote agent: without it it refuses moz-extension:// pages (navigation,
//   script, screenshots) — WebDriver BiDi and Marionette alike. Firefox up to 157 takes the
//   `-remote-allow-system-access` argument; 159 only reads MOZ_REMOTE_ALLOW_SYSTEM_ACCESS=1 from
//   the environment, which geckodriver passes on to Firefox. Both are set.
// - `extensions.webextensions.uuids`: pins the add-on's moz-extension:// host, random otherwise.
// `extensions.originControls.grantByDefault` grants the <all_urls> host permission at install, as
// the install prompt does for a user who accepts it.

import { writeFileSync } from 'node:fs';
import { Builder } from 'selenium-webdriver';
import firefox from 'selenium-webdriver/firefox.js';

const UUID = '0f1e2d3c-4b5a-4968-8776-655443322110';

export async function launchFirefox(extDir, manifest, bins) {
  const addonId = manifest.browser_specific_settings.gecko.id;
  const options = new firefox.Options()
    .setBinary(bins.firefox)
    .addArguments('-headless', '-remote-allow-system-access')
    .setPreference('extensions.webextensions.uuids', JSON.stringify({ [addonId]: UUID }))
    .setPreference('extensions.originControls.grantByDefault', true);
  const driver = await new Builder()
    .forBrowser('firefox')
    .setFirefoxOptions(options)
    .setFirefoxService(
      new firefox.ServiceBuilder(bins.geckodriver).setEnvironment({
        ...process.env,
        MOZ_REMOTE_ALLOW_SYSTEM_ACCESS: '1',
      }),
    )
    .build();
  await driver.manage().window().setRect({ width: 1280, height: 800 });
  await driver.installAddon(extDir, true);
  const home = await driver.getWindowHandle();

  return {
    name: 'firefox',
    errors: null, // page errors are not collected through Marionette
    extUrl: (path) => `moz-extension://${UUID}/${path}`,
    async open(url) {
      await driver.switchTo().newWindow('tab');
      const handle = await driver.getWindowHandle();
      await driver.get(url);
      const focus = () => driver.switchTo().window(handle);
      return {
        eval: async (fn, arg) => (await focus(), driver.executeScript(fn, arg)),
        screenshot: async (path) => {
          await focus();
          writeFileSync(path, await driver.takeScreenshot(), 'base64');
        },
        close: async () => {
          await focus();
          await driver.close();
          await driver.switchTo().window(home);
        },
      };
    },
    close: () => driver.quit(),
  };
}
