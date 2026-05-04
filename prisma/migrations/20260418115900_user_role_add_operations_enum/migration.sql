-- PostgreSQL requires enum values to be committed before use in a later statement.
-- `OPERATIONS` is used in `20260418120000_permissions_role_bindings` in the next migration.
ALTER TYPE "UserRole" ADD VALUE 'OPERATIONS';
