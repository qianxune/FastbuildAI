import { defineRouteOption } from "@buildingai/web-core";

import packageJson from "./../../package.json";
import ImageStudioPage from "./pages";
import LandingPage from "./pages/landing";

export const routeOption = defineRouteOption({
    base: `extension/${packageJson.name}`,
    identifier: packageJson.name,
    routes: [
        { index: true, element: <LandingPage /> },
        { path: "studio", element: <ImageStudioPage /> },
    ],
    consoleMenus: [{ title: "出图AI", path: "/studio", icon: "image" }],
    consoleRoutes: [
        { index: true, element: <ImageStudioPage /> },
        { path: "studio", element: <ImageStudioPage /> },
    ],
});
