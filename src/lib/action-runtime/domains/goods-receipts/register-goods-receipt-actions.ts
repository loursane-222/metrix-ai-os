import { handleGoodsReceiptCreate } from "./goods-receipt-create-handler";
import { handleGoodsReceiptCancel } from "./goods-receipt-cancel-handler";
import type { ActionHandlerRegistry } from "../../execution";

export function registerGoodsReceiptActions(handlerRegistry: ActionHandlerRegistry): void {
  if (!handlerRegistry.hasHandler("goodsReceipt.createFromPurchaseOrder")) handlerRegistry.registerHandler("goodsReceipt.createFromPurchaseOrder", handleGoodsReceiptCreate);
  if (!handlerRegistry.hasHandler("goodsReceipt.cancel")) handlerRegistry.registerHandler("goodsReceipt.cancel", handleGoodsReceiptCancel);
}
