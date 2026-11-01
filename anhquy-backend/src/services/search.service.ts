// src/services/search.service.ts
import prisma from '../config/prisma';

/**
 * Lấy TẤT CẢ permission_code mà roleId đang có trong 1 query duy nhất.
 */
async function getPermissionCodesForRole(roleId: number): Promise<Set<string>> {
  const rolePermissions = await prisma.role_Permissions.findMany({
    where: { role_id: roleId },
    include: {
      Permissions: { select: { permission_code: true } },
    },
  });

  const codes = new Set<string>();
  for (const rp of rolePermissions) {
    if (rp.Permissions?.permission_code) {
      codes.add(rp.Permissions.permission_code);
    }
  }
  return codes;
}

/**
 * Tìm kiếm toàn cục dựa trên roleId.
 * Chỉ tìm trong bảng mà role đó thực sự có quyền.
 */
export const searchService = async (keyword: string, roleId: number) => {
  const searchTerm = keyword?.trim();
  
  if (!searchTerm) {
    return {
      suppliers: [],
      documents: [],
      standards: [],
      violations: [],
      users: [],
      systemConfigs: [],
      auditLogs: [],
    };
  }

  // Lấy tập permission_code trong 1 lần query duy nhất
  const permCodes = await getPermissionCodesForRole(roleId);

  const canViewSuppliers   = permCodes.has('VIEW_SUPPLIER');
  const canViewDocs        = permCodes.has('VIEW_DOC');
  const canViewStandards   = permCodes.has('VIEW_STANDARD');
  const canViewViolations  = permCodes.has('VIEW_VIOLATION');
  const canManageUsers     = permCodes.has('MANAGE_USERS');
  const canManageConfigs   = permCodes.has('MANAGE_SYSTEM_CONFIGS');
  const canViewAuditLogs   = permCodes.has('VIEW_AUDIT_LOGS');

  // 1. Tìm kiếm Suppliers
  const suppliersPromise = canViewSuppliers
    ? prisma.suppliers.findMany({
        where: {
          is_deleted: false,
          OR: [
            { company_name: { contains: searchTerm } },
            { tax_code: { contains: searchTerm } },
            { contact_email: { contains: searchTerm } },
          ],
        },
        take: 5,
        select: { id: true, company_name: true, tax_code: true, risk_score: true },
      })
    : Promise.resolve([]);

  // 2. Tìm kiếm Documents (Mở rộng tìm theo cả tên Nhà cung cấp)
  const documentsPromise = canViewDocs
    ? prisma.documents.findMany({
        where: {
          OR: [
            { file_name: { contains: searchTerm } },
            { Suppliers: { company_name: { contains: searchTerm } } },
          ],
        },
        take: 5,
        select: {
          id: true,
          file_name: true,
          status: true,
          Suppliers: { select: { company_name: true } },
        },
      })
    : Promise.resolve([]);

  // 3. Tìm kiếm Standards
  const standardsPromise = canViewStandards
    ? prisma.standards.findMany({
        where: {
          is_active: true,
          OR: [
            { standard_code: { contains: searchTerm } },
            { name: { contains: searchTerm } },
          ],
        },
        take: 5,
        select: { id: true, standard_code: true, name: true, jurisdiction: true },
      })
    : Promise.resolve([]);

  // 4. Tìm kiếm Violations
  const violationsPromise = canViewViolations
    ? prisma.violations.findMany({
        where: {
          OR: [
            { violation_desc: { contains: searchTerm } },
            { evidence_quote: { contains: searchTerm } },
          ],
        },
        take: 5,
        select: {
          id: true,
          risk_level: true,
          violation_desc: true,
          document_id: true,
          status: true,
          Documents: { select: { file_name: true } },
        },
      })
    : Promise.resolve([]);

  // 5. Tìm kiếm Users
  const usersPromise = canManageUsers
    ? prisma.users.findMany({
        where: {
          OR: [
            { full_name: { contains: searchTerm } },
            { email: { contains: searchTerm } },
          ],
        },
        take: 5,
        select: { id: true, full_name: true, email: true, is_active: true },
      })
    : Promise.resolve([]);

  // 6. Tìm kiếm System Configs (ĐÃ LỌC BỎ tìm theo description để tránh nhiễu từ khóa chung chung)
  const systemConfigsPromise = canManageConfigs
    ? prisma.system_Configs.findMany({
        where: {
          OR: [
            { config_key: { contains: searchTerm } },
            { config_value: { contains: searchTerm } },
          ],
        },
        take: 5,
        select: { id: true, config_key: true, config_value: true, description: true },
      })
    : Promise.resolve([]);

  // 7. Tìm kiếm Audit Logs
  const auditLogsPromise = canViewAuditLogs
    ? prisma.audit_Logs.findMany({
        where: {
          OR: [
            { action_type: { contains: searchTerm } },
            { target_table: { contains: searchTerm } },
          ],
        },
        take: 5,
        orderBy: { created_at: 'desc' },
        select: {
          id: true,
          action_type: true,
          target_table: true,
          created_at: true,
          Users: { select: { full_name: true } },
        },
      })
    : Promise.resolve([]);

  const [suppliers, documents, standards, violations, users, systemConfigs, auditLogs] =
    await Promise.all([
      suppliersPromise,
      documentsPromise,
      standardsPromise,
      violationsPromise,
      usersPromise,
      systemConfigsPromise,
      auditLogsPromise,
    ]);

  return {
    suppliers,
    documents,
    standards,
    violations,
    users,
    systemConfigs,
    auditLogs,
  };
};