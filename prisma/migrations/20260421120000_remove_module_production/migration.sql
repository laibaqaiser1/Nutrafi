-- Remove legacy "Production" module if it still exists.
DELETE FROM "RolePermission" WHERE "permissionId" IN (SELECT "id" FROM "Permission" WHERE "key" = 'module.production');
DELETE FROM "Permission" WHERE "key" = 'module.production';
