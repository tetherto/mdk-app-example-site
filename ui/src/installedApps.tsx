// The gateway apps that ship a UI module (`ui/index.js`, made with defineMdkApp),
// bundled into this site UI at build time and mounted the way the MDK dashboard
// mounts installed apps: pages under `/app/<name>/…`, each app inside its own
// MdkAppProvider so `useMdkApp().apiUrl()` reaches its Gateway routes at
// `/apps/<name>/…`. `name` must match the app's entry in
// config/site.deploy.json gateway.pluginDirs.
import type { JSX } from "react";
import { useParams, useRoutes } from "react-router";

import {
  checkAppUiModule,
  type LoadedAppUi,
  MdkAppProvider,
  type MdkAppRoute,
} from "@tetherto/mdk-react-adapter";
import { ErrorBoundary, ErrorCard, type SidebarMenuItem } from "@tetherto/mdk-react-devkit";
import type { InstalledApp } from "@tetherto/mdk-ui-foundation";

import operationCenterUi from "@tetherto/mdk-app-operation-center/ui/index.js";
import operationCenterPkg from "@tetherto/mdk-app-operation-center/package.json";
import "@tetherto/mdk-app-operation-center/ui/style.css";
import reportingToolUi from "@tetherto/mdk-app-reporting-tool/ui/index.js";
import reportingToolPkg from "@tetherto/mdk-app-reporting-tool/package.json";
import "@tetherto/mdk-app-reporting-tool/ui/style.css";
// After the apps' own styles, so the host's overrides win.
import "./installedApps.css";

export const APP_PAGES_BASE = "/app";

// `label` is the name this site shows for the app (sidebar group, error
// boundary), in place of the displayName its UI module ships with.
const installed = (name: string, label: string, ui: { id: string }, version: string): InstalledApp => ({
  name,
  id: ui.id,
  version,
  displayName: label,
  apiBase: `/apps/${name}`,
  // Bundled statically, so there is no runtime entry for the shell to import.
  ui: null,
});

// checkAppUiModule enforces the same contract the dashboard does (routes,
// panels, sections, and an id matching the installed app).
const load = (app: InstalledApp, mod: unknown): LoadedAppUi => ({ app, ui: checkAppUiModule(app, { default: mod }) });

export const INSTALLED_APPS: LoadedAppUi[] = [
  load(installed("op-center", "Operation Center", operationCenterUi, operationCenterPkg.version), operationCenterUi),
  load(installed("reporting", "Reporting Tool", reportingToolUi, reportingToolPkg.version), reportingToolUi),
];

const isIndex = (path: string): boolean => path === "" || path === "/";

/** `/app/<name>` for the app's index page, else `/app/<name>/<path>`. */
export const appPagePath = (name: string, path = ""): string =>
  isIndex(path) ? `${APP_PAGES_BASE}/${name}` : `${APP_PAGES_BASE}/${name}/${path.replace(/^\//, "")}`;

// Deep links (`:param`, `*`) need a value only another page can give them.
const isNavigable = (route: MdkAppRoute): boolean => !route.hidden && !/[:*]/.test(route.path);

/**
 * One sidebar group per app, with a nested group per route `section`. A
 * section's id is `<first page>#<section>`: clicking it opens its first page.
 */
export const appSidebarItems = (icons: Record<string, JSX.Element>): SidebarMenuItem[] =>
  INSTALLED_APPS.map(({ app, ui }) => {
    const pages = ui.routes.filter(isNavigable);
    const sections = new Map<string, SidebarMenuItem[]>();
    const items = pages.flatMap<SidebarMenuItem>((route) => {
      const item = { id: appPagePath(app.name, route.path), label: route.label ?? (route.path || app.displayName) };
      if (route.section === undefined) return [item];
      const group = sections.get(route.section);
      if (group) {
        group.push(item);
        return [];
      }
      const created = [item];
      sections.set(route.section, created);
      const Icon = ui.sections?.find((s) => s.label === route.section)?.icon;
      return [{ id: `${item.id}#${route.section}`, label: route.section, icon: Icon ? <Icon /> : undefined, items: created }];
    });
    return { id: `${appPagePath(app.name)}#app`, label: app.displayName, icon: icons[app.name], items };
  });

const AppRoutes = ({ routes }: { routes: MdkAppRoute[] }) =>
  useRoutes(
    routes.map(({ path, component: Page }) =>
      isIndex(path) ? { index: true, element: <Page /> } : { path: path.replace(/^\//, ""), element: <Page /> },
    ),
  );

/** Renders whichever app owns `/app/:appName/*`, with its own routes nested below. */
export function InstalledAppPage(): JSX.Element {
  const { appName } = useParams();
  const loaded = INSTALLED_APPS.find(({ app }) => app.name === appName);
  if (!loaded) return <ErrorCard title="App not found" error={`No installed app named "${appName}"`} />;

  return (
    <MdkAppProvider app={loaded.app}>
      {/* Keyed by app: moving to another app starts it with a fresh boundary. */}
      <ErrorBoundary key={loaded.app.name} componentName={loaded.app.displayName}>
        <AppRoutes routes={loaded.ui.routes} />
      </ErrorBoundary>
    </MdkAppProvider>
  );
}
