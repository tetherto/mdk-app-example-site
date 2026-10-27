import { useLocation, useNavigate } from "react-router";

import {
  ContainerWidgetsNavIcon,
  DashboardNavIcon,
  MinersOverviewNavIcon,
  PoolsIcon,
  PowerIcon,
  Sidebar,
  type SidebarMenuItem,
} from "@tetherto/mdk-react-devkit/primitives";

const NAV_ITEMS: SidebarMenuItem[] = [
  { id: "/dashboard", label: "Dashboard", icon: <DashboardNavIcon /> },
  { id: "/containers", label: "Containers", icon: <ContainerWidgetsNavIcon /> },
  { id: "/miners", label: "Miners", icon: <MinersOverviewNavIcon /> },
  { id: "/pools", label: "Pools", icon: <PoolsIcon /> },
  { id: "/control", label: "Control", icon: <PowerIcon /> },
];

export function AppSidebar() {
  const location = useLocation();
  const navigate = useNavigate();
  const activeId = "/" + location.pathname.split("/")[1];

  return (
    <Sidebar
      items={NAV_ITEMS}
      activeId={activeId}
      onItemClick={({ id }) => navigate(id)}
      defaultExpanded={true}
    />
  );
}
