import type { IconName } from "lucide-react/dynamic";

export type ExtensionMenuItem = {
  title: string;
  path: string;
  icon?: IconName;
  superAdminOnly?: boolean;
  children?: ExtensionMenuItem[];
};
