-- Role-based module permissions (see `lib/permission-keys.ts`, admin UI `/settings/permissions`).
-- `OPERATIONS` enum value is added in migration `20260418115900_user_role_add_operations_enum`.
-- Drops legacy `navModuleKeys` on User if present.

CREATE TABLE "Permission" (
    "id" SERIAL NOT NULL,
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    CONSTRAINT "Permission_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Permission_key_key" ON "Permission"("key");

CREATE TABLE "RolePermission" (
    "id" SERIAL NOT NULL,
    "role" "UserRole" NOT NULL,
    "permissionId" INTEGER NOT NULL,
    CONSTRAINT "RolePermission_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "RolePermission_role_permissionId_key" ON "RolePermission"("role", "permissionId");
CREATE INDEX "RolePermission_role_idx" ON "RolePermission"("role");

ALTER TABLE "RolePermission" ADD CONSTRAINT "RolePermission_permissionId_fkey" FOREIGN KEY ("permissionId") REFERENCES "Permission"("id") ON DELETE CASCADE ON UPDATE CASCADE;

INSERT INTO "Permission" ("key", "name") VALUES
  ('*', 'Full access (admin)'),
  ('module.dashboard', 'Dashboard'),
  ('module.menu', 'Menu'),
  ('module.customers', 'Customers'),
  ('module.meal-plans', 'Meal plans'),
  ('module.kitchen-planning', 'Kitchen planning'),
  ('module.plans', 'Plan templates'),
  ('module.reports', 'Reports'),
  ('module.payments', 'Payments'),
  ('module.settings', 'Role & permissions');

INSERT INTO "RolePermission" ("role", "permissionId")
SELECT 'ADMIN', "id" FROM "Permission" WHERE "key" = '*';

INSERT INTO "RolePermission" ("role", "permissionId")
SELECT 'OPERATIONS', "id" FROM "Permission" WHERE "key" IN (
  'module.dashboard',
  'module.meal-plans',
  'module.kitchen-planning'
);

ALTER TABLE "User" DROP COLUMN IF EXISTS "navModuleKeys";
