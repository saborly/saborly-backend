/**
 * Canonical roles: super_admin, branch_admin, staff, user
 * Legacy aliases still stored in DB: admin -> branch_admin, manager -> staff
 */

const LEGACY_TO_CANONICAL = {
  admin: 'branch_admin',
  manager: 'staff',
};

function normalizeRole(role) {
  if (!role) return 'user';
  return LEGACY_TO_CANONICAL[role] || role;
}

function roleSatisfies(userRole, ...allowed) {
  const u = normalizeRole(userRole);
  for (const r of allowed) {
    if (normalizeRole(r) === u) return true;
    if (r === userRole) return true;
  }
  return false;
}

function isSuperAdmin(role) {
  return normalizeRole(role) === 'super_admin' || role === 'superadmin';
}

module.exports = {
  LEGACY_TO_CANONICAL,
  normalizeRole,
  roleSatisfies,
  isSuperAdmin,
};
