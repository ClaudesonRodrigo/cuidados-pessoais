import "server-only";

import { resolveCheckoutServerConfig } from "./checkoutConfigCore";

export const getCheckoutServerConfig = () => resolveCheckoutServerConfig(process.env);
