import type { CapacitorConfig } from "@capacitor/cli";
const config: CapacitorConfig = {
  appId: "app.mlibrary.reader",
  appName: "MLibrary",
  webDir: "dist",
  android: { allowMixedContent: false },
  server: { androidScheme: "https" },
};
export default config;
