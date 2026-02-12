import { defineRouteOption } from "@buildingai/web-core";

import packageJson from "./../../package.json";
import ImageStudioPage from "./pages";

export const routeOption = defineRouteOption({
    base: `extension/${packageJson.name}`,
    identifier: packageJson.name,
    routes: [{ index: true, element: <ImageStudioPage /> }],
    consoleMenus: [{ title: "图片工作台", path: "/", icon: "image" }],
    consoleRoutes: [{ index: true, element: <ImageStudioPage /> }],
});