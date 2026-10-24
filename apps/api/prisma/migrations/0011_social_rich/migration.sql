-- AlterTable
ALTER TABLE "social_posts" ADD COLUMN "mediaUrls" JSONB NOT NULL DEFAULT '[]',
ADD COLUMN "visibility" TEXT NOT NULL DEFAULT 'public',
ADD COLUMN "preview" JSONB;

-- CreateTable
CREATE TABLE "social_mentions" (
    "id" TEXT NOT NULL,
    "postId" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "social_mentions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "social_hashtags" (
    "id" TEXT NOT NULL,
    "postId" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "tag" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "social_hashtags_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "social_polls" (
    "id" TEXT NOT NULL,
    "postId" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "question" TEXT NOT NULL,
    "options" JSONB NOT NULL,
    "endsAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "social_polls_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "social_poll_votes" (
    "id" TEXT NOT NULL,
    "pollId" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "optionId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "social_poll_votes_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "social_mentions_postId_userId_key" ON "social_mentions"("postId", "userId");

-- CreateIndex
CREATE INDEX "social_mentions_userId_idx" ON "social_mentions"("userId");

-- CreateIndex
CREATE INDEX "social_mentions_organizationId_idx" ON "social_mentions"("organizationId");

-- CreateIndex
CREATE UNIQUE INDEX "social_hashtags_postId_tag_key" ON "social_hashtags"("postId", "tag");

-- CreateIndex
CREATE INDEX "social_hashtags_tag_idx" ON "social_hashtags"("tag");

-- CreateIndex
CREATE INDEX "social_hashtags_organizationId_idx" ON "social_hashtags"("organizationId");

-- CreateIndex
CREATE UNIQUE INDEX "social_polls_postId_key" ON "social_polls"("postId");

-- CreateIndex
CREATE INDEX "social_polls_organizationId_idx" ON "social_polls"("organizationId");

-- CreateIndex
CREATE UNIQUE INDEX "social_poll_votes_pollId_userId_key" ON "social_poll_votes"("pollId", "userId");

-- CreateIndex
CREATE INDEX "social_poll_votes_organizationId_idx" ON "social_poll_votes"("organizationId");

-- AddForeignKey
ALTER TABLE "social_mentions" ADD CONSTRAINT "social_mentions_postId_fkey" FOREIGN KEY ("postId") REFERENCES "social_posts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "social_hashtags" ADD CONSTRAINT "social_hashtags_postId_fkey" FOREIGN KEY ("postId") REFERENCES "social_posts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "social_polls" ADD CONSTRAINT "social_polls_postId_fkey" FOREIGN KEY ("postId") REFERENCES "social_posts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "social_poll_votes" ADD CONSTRAINT "social_poll_votes_pollId_fkey" FOREIGN KEY ("pollId") REFERENCES "social_polls"("id") ON DELETE CASCADE ON UPDATE CASCADE;
