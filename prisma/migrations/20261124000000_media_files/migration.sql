-- CreateTable
CREATE TABLE "media_files" (
    "id" TEXT NOT NULL,
    "owner_id" UUID NOT NULL,
    "content_type" TEXT NOT NULL,
    "size" INTEGER NOT NULL,
    "data" BYTEA NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "media_files_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "media_files_owner_id_idx" ON "media_files"("owner_id");

