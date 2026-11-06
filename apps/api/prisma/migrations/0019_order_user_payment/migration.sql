-- Vincula órdenes a usuarios y pagos a órdenes (aditiva; sin backfill).
-- No se duplica `Order.paymentId`: el vínculo vive en `Payment.orderId`.

-- AlterTable (orders)
ALTER TABLE "orders" ADD COLUMN "userId" TEXT;

-- AlterTable (payments)
ALTER TABLE "payments" ADD COLUMN "orderId" TEXT;

-- CreateIndex
CREATE INDEX "orders_userId_idx" ON "orders"("userId");

-- CreateIndex
CREATE INDEX "payments_orderId_idx" ON "payments"("orderId");

-- AddForeignKey
ALTER TABLE "orders" ADD CONSTRAINT "orders_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "orders"("id") ON DELETE SET NULL ON UPDATE CASCADE;
