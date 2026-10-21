import "./styles/index.css";

import { I18nProvider } from "@buildingai/i18n";
import { RootLayout } from "@buildingai/ui/layouts/extension/root/index";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { RouterProvider } from "react-router-dom";

import { defaultLocale, messages } from "./locales";
import { routeOption } from "./routes";

const normalizedPath = window.location.pathname.replace(/\/+$/, "");
const isPublicLanding = normalizedPath === "/extension/image-studio";
const router = <RouterProvider router={routeOption} />;

createRoot(document.getElementById("root")!).render(
    <StrictMode>
        <I18nProvider messages={messages} defaultLocale={defaultLocale}>
            {isPublicLanding ? router : <RootLayout>{router}</RootLayout>}
        </I18nProvider>
    </StrictMode>,
);