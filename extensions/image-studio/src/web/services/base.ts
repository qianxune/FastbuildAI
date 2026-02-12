import { createPluginHttpClients } from "@buildingai/services";

const { apiHttpClient } = createPluginHttpClients();

export { apiHttpClient };