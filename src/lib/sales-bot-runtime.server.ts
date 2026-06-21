import { AsyncLocalStorage } from "node:async_hooks";

export type SalesBotRuntime = {
  id: string;
  key: string;
  token: string;
  databasePath: string;
  username: string;
  isPrimary: boolean;
  publicBaseUrl?: string;
};

const runtimeStorage = new AsyncLocalStorage<SalesBotRuntime | null>();

export function getSalesBotRuntime() {
  return runtimeStorage.getStore() ?? null;
}

export function enterSalesBotRuntime(runtime: SalesBotRuntime | null) {
  runtimeStorage.enterWith(runtime);
}

export function runWithSalesBotRuntime<T>(
  runtime: SalesBotRuntime,
  callback: () => T | Promise<T>,
) {
  return runtimeStorage.run(runtime, callback);
}

export function getActiveSalesBotToken() {
  return getSalesBotRuntime()?.token ?? process.env.TELEGRAM_BOT_TOKEN?.trim() ?? null;
}

export function getActiveSalesBotPublicBaseUrl() {
  return getSalesBotRuntime()?.publicBaseUrl ?? process.env.PUBLIC_BASE_URL?.trim() ?? null;
}

export function getSalesPaymentReference(orderId: string) {
  const runtime = getSalesBotRuntime();
  return runtime && !runtime.isPrimary ? `sales:${runtime.id}:${orderId}` : orderId;
}
