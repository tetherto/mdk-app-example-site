import { useLocation, useNavigate } from "react-router";

import {
  ContainerWidgetsNavIcon,
  DashboardNavIcon,
  MinersOverviewNavIcon,
  OperationsNavIcon,
  PoolsIcon,
  PowerIcon,
  ReportingNavIcon,
  Sidebar,
  type SidebarMenuItem,
} from "@tetherto/mdk-react-devkit/primitives";

import { APP_PAGES_BASE, appSidebarItems } from "./installedApps";

const NAV_ITEMS: SidebarMenuItem[] = [
  { id: "/dashboard", label: "Dashboard", icon: <DashboardNavIcon /> },
  { id: "/containers", label: "Containers", icon: <ContainerWidgetsNavIcon /> },
  { id: "/miners", label: "Miners", icon: <MinersOverviewNavIcon /> },
  { id: "/pools", label: "Pools", icon: <PoolsIcon /> },
  { id: "/control", label: "Control", icon: <PowerIcon /> },
  // The installed apps' pages (Operation Center, Reporting Tool), under /app/<name>/.
  ...appSidebarItems({ "op-center": <OperationsNavIcon />, reporting: <ReportingNavIcon /> }),
];

export function AppSidebar() {
  const location = useLocation();
  const navigate = useNavigate();
  // App pages are matched on their full path; the site's own on the first segment.
  const activeId = location.pathname.startsWith(`${APP_PAGES_BASE}/`)
    ? location.pathname
    : "/" + location.pathname.split("/")[1];

  return (
    <Sidebar
      items={NAV_ITEMS}
      activeId={activeId}
      // A group id is `<first page>#<group>`: clicking the group opens that page.
      onItemClick={({ id }) => navigate(id.split("#")[0])}
      defaultExpanded={true}
    />
  );
}
