// The installed apps' built UI modules ship as plain JS (no .d.ts): each
// default-exports a defineMdkApp object, checked at load by checkAppUiModule.
declare module "@tetherto/mdk-app-operation-center/ui/index.js" {
  import type { MdkAppUiModule } from "@tetherto/mdk-react-adapter";
  const ui: MdkAppUiModule;
  export default ui;
}

declare module "@tetherto/mdk-app-reporting-tool/ui/index.js" {
  import type { MdkAppUiModule } from "@tetherto/mdk-react-adapter";
  const ui: MdkAppUiModule;
  export default ui;
}
