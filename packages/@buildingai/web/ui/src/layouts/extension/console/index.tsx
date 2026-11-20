import { useAuthStore } from "@buildingai/stores";
import { ScrollArea } from "@buildingai/ui/components/ui/scroll-area";
import { SidebarInset, SidebarProvider } from "@buildingai/ui/components/ui/sidebar";
import { ReactNode } from "react";
import { Outlet } from "react-router-dom";

import AppNavbar from "./_components/app-navbar";
import { AppSidebar } from "./_components/app-sidebar";
import type { ExtensionMenuItem } from "./types";

function visibleMenus(menus: ExtensionMenuItem[], isRoot: boolean): ExtensionMenuItem[] {
  return menus
    .filter((menu) => !menu.superAdminOnly || isRoot)
    .map((menu) => menu.children
      ? { ...menu, children: visibleMenus(menu.children, isRoot) }
      : menu);
}

const ExtensionConsoleLayout = ({
  menus = [],
  identifier,
  children,
}: {
  menus?: ExtensionMenuItem[];
  identifier?: string;
  children?: ReactNode;
}) => {
  const isRoot = useAuthStore((state) => !!state.auth.token && state.auth.userInfo?.isRoot === 1);
  const allowedMenus = visibleMenus(menus, isRoot);
  return (
    <SidebarProvider
      storageKey="layout-ext-console-sidebar"
      className="bd-ext-console-layout h-dvh"
    >
      <AppSidebar menus={allowedMenus} identifier={identifier} />
      <SidebarInset className="flex h-full flex-col overflow-x-hidden md:h-[calc(100%-1rem)] md:peer-data-[variant=inset]:peer-data-[state=collapsed]:ml-0">
        <AppNavbar menus={allowedMenus} />
        <div className="flex-1 overflow-hidden">
          <ScrollArea className="h-full" viewportClassName="[&>div]:block!">
            <div className="min-h-inset m-4 mt-1 flex flex-col">
              {children ? children : <Outlet />}
            </div>
          </ScrollArea>
        </div>
      </SidebarInset>
    </SidebarProvider>
  );
};

export default ExtensionConsoleLayout;
