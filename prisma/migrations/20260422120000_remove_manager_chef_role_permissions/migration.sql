-- Stop granting modules to MANAGER / CHEF via seed (UI only edits OPERATIONS). Safe no-op on fresh DBs.
DELETE FROM "RolePermission" WHERE "role" IN ('MANAGER', 'CHEF');
