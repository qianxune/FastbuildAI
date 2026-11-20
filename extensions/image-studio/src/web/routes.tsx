import { defineRouteOption } from "@buildingai/web-core";

import packageJson from "./../../package.json";
import ImageStudioPage from "./pages";
import LandingPage from "./pages/landing";
import AnalyticsPage from "./pages/console/analytics";

export const routeOption = defineRouteOption({
    base: `extension/${packageJson.name}`,
    identifier: packageJson.name,
    routes: [
        { index: true, element: <LandingPage /> },
        { path: "studio", element: <ImageStudioPage /> },
    ],
    consoleMenus: [
        { title: "出图AI", path: "/studio", icon: "image" },
        { title: "使用统计", path: "/analytics", icon: "chart-no-axes-combined", superAdminOnly: true },
    ],
    consoleRoutes: [
        { index: true, element: <ImageStudioPage /> },
        { path: "studio", element: <ImageStudioPage /> },
        { path: "analytics", element: <AnalyticsPage /> },
    ],
});
