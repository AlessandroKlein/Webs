-- Tienda: datos de usuario (teléfono/dirección), moneda de órdenes, blog usable (slug/autor/publicación/comentarios) y emisión de licencias (idempotente por pago + activaciones).

-- AlterTable users
ALTER TABLE "users" ADD COLUMN "phone" TEXT;
ALTER TABLE "users" ADD COLUMN "address" JSONB;

-- AlterTable orders
ALTER TABLE "orders" ADD COLUMN "currency" TEXT NOT NULL DEFAULT 'ARS';

-- AlterTable blog_posts
ALTER TABLE "blog_posts" ADD COLUMN "slug" TEXT;
ALTER TABLE "blog_posts" ADD COLUMN "excerpt" TEXT;
ALTER TABLE "blog_posts" ADD COLUMN "featuredImage" TEXT;
ALTER TABLE "blog_posts" ADD COLUMN "authorId" TEXT;
ALTER TABLE "blog_posts" ADD COLUMN "publishedAt" TIMESTAMP(3);

-- CreateIndex
CREATE UNIQUE INDEX "blog_posts_organizationId_slug_key" ON "blog_posts"("organizationId", "slug");

-- AlterTable comments
ALTER TABLE "comments" ADD COLUMN "postId" TEXT;

-- CreateIndex
CREATE INDEX "comments_postId_idx" ON "comments"("postId");

-- AlterTable license_sales
ALTER TABLE "license_sales" ADD COLUMN "paymentId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "license_sales_paymentId_key" ON "license_sales"("paymentId");

-- AlterTable license_keys
ALTER TABLE "license_keys" ADD COLUMN "activations" JSONB NOT NULL DEFAULT '[]';

-- AddForeignKey
ALTER TABLE "blog_posts" ADD CONSTRAINT "blog_posts_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "comments" ADD CONSTRAINT "comments_postId_fkey" FOREIGN KEY ("postId") REFERENCES "blog_posts"("id") ON DELETE CASCADE ON UPDATE CASCADE;
