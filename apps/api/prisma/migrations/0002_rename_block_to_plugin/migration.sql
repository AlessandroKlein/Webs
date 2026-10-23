-- Rename Prisma models BlockInstallation -> PluginInstallation and
-- BlockPlacement -> PluginPlacement (t33: naming interno block->plugin).
-- The API response key `blockId` is preserved in the app layer for M1
-- backward-compat; only the DB/Prisma names change here.

-- RenameTable
ALTER TABLE "block_installations" RENAME TO "plugin_installations";
ALTER TABLE "block_placements" RENAME TO "plugin_placements";

-- RenameColumn
ALTER TABLE "plugin_installations" RENAME COLUMN "blockId" TO "pluginId";
ALTER TABLE "plugin_placements" RENAME COLUMN "blockId" TO "pluginId";

-- RenameIndex (non-PK indexes are not auto-renamed by PostgreSQL on table rename)
ALTER INDEX "block_installations_blockId_key" RENAME TO "plugin_installations_pluginId_key";
ALTER INDEX "block_placements_slotId_idx" RENAME TO "plugin_placements_slotId_idx";

-- RenameConstraint (PK constraints keep the old table name on PostgreSQL).
ALTER TABLE "plugin_installations" RENAME CONSTRAINT "block_installations_pkey" TO "plugin_installations_pkey";
ALTER TABLE "plugin_placements" RENAME CONSTRAINT "block_placements_pkey" TO "plugin_placements_pkey";

-- Migrate permission keys block.read/block.manage -> plugin.read/plugin.manage
-- (RolePermission references permissionId, so only the key column changes).
UPDATE "permissions" SET "key" = 'plugin.read' WHERE "key" = 'block.read';
UPDATE "permissions" SET "key" = 'plugin.manage' WHERE "key" = 'block.manage';
