import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir:"./tests/browser",
  timeout:120000,
  expect:{timeout:20000},
  workers:1,
  retries:0,
  use:{baseURL:"http://127.0.0.1:8080",headless:true,trace:"retain-on-failure",launchOptions:{args:["--disable-features=WebRtcHideLocalIpsWithMdns"]}},
  webServer:{command:"npm run preview -- --host 127.0.0.1 --port 8080",url:"http://127.0.0.1:8080",timeout:60000,reuseExistingServer:false}
});
