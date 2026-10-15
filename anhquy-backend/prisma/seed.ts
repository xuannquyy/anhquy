import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcrypt';

const prisma = new PrismaClient();

async function main() {
  console.log('🚀 Bắt đầu nạp toàn bộ dữ liệu mẫu (Master Data) vào SQL Server...');

  // =================================================================
  // 1. NẠP VAI TRÒ (ROLES)
  // =================================================================
  const adminRole = await prisma.roles.upsert({
    where: { role_name: 'Admin' },
    update: { description: 'Quản trị viên' },
    create: { role_name: 'Admin', description: 'Quản trị viên' },
  });

  const managerRole = await prisma.roles.upsert({
    where: { role_name: 'Manager' },
    update: { description: 'Quản lý' },
    create: { role_name: 'Manager', description: 'Quản lý' },
  });

  const userRole = await prisma.roles.upsert({
    where: { role_name: 'User' },
    update: { description: 'Nhân viên' },
    create: { role_name: 'User', description: 'Nhân viên' },
  });
  console.log('✅ 1. Đã nạp 3 Vai trò: Quản trị viên, Quản lý, Nhân viên.');

  // =================================================================
  // 2. NẠP ĐẦY ĐỦ QUYỀN HẠN (PERMISSIONS) & PHÂN QUYỀN (ROLE_PERMISSIONS)
  // =================================================================
  const permissionsData = [
    // Nhóm Tài liệu & Kiểm toán AI
    { permission_code: 'VIEW_DOC', permission_name: 'Xem danh sách và chi tiết hợp đồng' },
    { permission_code: 'UPLOAD_DOC', permission_name: 'Tải lên hợp đồng mới' },
    { permission_code: 'DELETE_DOC', permission_name: 'Xóa hợp đồng khỏi hệ thống' },
    { permission_code: 'RUN_AI_AUDIT', permission_name: 'Kích hoạt AI rà soát hợp đồng' },

    // Nhóm Vi phạm & Báo cáo
    { permission_code: 'VIEW_VIOLATION', permission_name: 'Xem danh sách cảnh báo vi phạm' },
    { permission_code: 'APPROVE_VIOLATION', permission_name: 'Phê duyệt hoặc từ chối lỗi vi phạm (Tính điểm rủi ro)' },
    { permission_code: 'EXPORT_REPORT', permission_name: 'Xuất báo cáo kiểm toán (PDF/Excel)' },

    // Nhóm Quản lý Nhà cung ứng (Suppliers)
    { permission_code: 'VIEW_SUPPLIER', permission_name: 'Xem danh sách và hồ sơ nhà cung ứng' },
    { permission_code: 'CREATE_SUPPLIER', permission_name: 'Thêm mới nhà cung ứng' },
    { permission_code: 'EDIT_SUPPLIER', permission_name: 'Chỉnh sửa thông tin nhà cung ứng' },
    { permission_code: 'DELETE_SUPPLIER', permission_name: 'Xóa nhà cung ứng' },

    // Nhóm Quản lý Tiêu chuẩn & Danh mục
    { permission_code: 'VIEW_STANDARD', permission_name: 'Xem bộ tiêu chuẩn RBA và Pháp luật' },
    { permission_code: 'CREATE_CUSTOM_STANDARD', permission_name: 'Tạo tiêu chuẩn riêng và tùy chỉnh bật/tắt tiêu chuẩn' },
    { permission_code: 'MANAGE_SYSTEM_STANDARDS', permission_name: 'Quản lý (Thêm/Sửa/Ẩn) bộ tiêu chuẩn gốc hệ thống' },
    { permission_code: 'MANAGE_CATEGORIES', permission_name: 'Quản lý danh mục ngành nghề và loại hợp đồng' },

    // Nhóm Quản trị Hệ thống & Bảo mật
    { permission_code: 'MANAGE_USERS', permission_name: 'Quản lý tài khoản người dùng (Thêm/Khóa/Mở khóa)' },
    { permission_code: 'MANAGE_ROLES', permission_name: 'Quản lý vai trò và phân quyền hệ thống' },
    { permission_code: 'MANAGE_SYSTEM_CONFIGS', permission_name: 'Cấu hình tham số hệ thống và ngưỡng rủi ro' },
    { permission_code: 'VIEW_AUDIT_LOGS', permission_name: 'Xem nhật ký kiểm toán hệ thống (Audit Logs)' },
  ];

  // Quyền của Quản lý (Manager)
  const managerPermCodes = [
    'VIEW_DOC', 'UPLOAD_DOC', 'DELETE_DOC', 'RUN_AI_AUDIT',
    'VIEW_VIOLATION', 'APPROVE_VIOLATION', 'EXPORT_REPORT',
    'VIEW_SUPPLIER', 'CREATE_SUPPLIER', 'EDIT_SUPPLIER', 'DELETE_SUPPLIER',
    'VIEW_STANDARD', 'CREATE_CUSTOM_STANDARD', 'MANAGE_CATEGORIES',
    'VIEW_AUDIT_LOGS',
  ];

  // Quyền của Nhân viên (User)
  const userPermCodes = [
    'VIEW_DOC', 'UPLOAD_DOC', 'RUN_AI_AUDIT',
    'VIEW_VIOLATION', 'EXPORT_REPORT',
    'VIEW_SUPPLIER', 'CREATE_SUPPLIER',
    'VIEW_STANDARD', 'CREATE_CUSTOM_STANDARD',
  ];

  for (const perm of permissionsData) {
    const savedPerm = await prisma.permissions.upsert({
      where: { permission_code: perm.permission_code },
      update: { permission_name: perm.permission_name },
      create: perm,
    });

    // 1. Admin: Toàn quyền (19/19 quyền)
    await prisma.role_Permissions.upsert({
      where: { role_id_permission_id: { role_id: adminRole.id, permission_id: savedPerm.id } },
      update: {},
      create: { role_id: adminRole.id, permission_id: savedPerm.id },
    });

    // 2. Manager: Quyền quản lý, duyệt lỗi, xuất báo cáo, quản lý nhà cung ứng
    if (managerPermCodes.includes(perm.permission_code)) {
      await prisma.role_Permissions.upsert({
        where: { role_id_permission_id: { role_id: managerRole.id, permission_id: savedPerm.id } },
        update: {},
        create: { role_id: managerRole.id, permission_id: savedPerm.id },
      });
    }

    // 3. User: Quyền nhân viên rà soát, tải tài liệu, xuất báo cáo, tạo tiêu chuẩn riêng
    if (userPermCodes.includes(perm.permission_code)) {
      await prisma.role_Permissions.upsert({
        where: { role_id_permission_id: { role_id: userRole.id, permission_id: savedPerm.id } },
        update: {},
        create: { role_id: userRole.id, permission_id: savedPerm.id },
      });
    }
  }
  console.log('✅ 2. Đã nạp 19 Quyền hạn (Permissions) & gán quyền chi tiết cho 3 Vai trò.');

  // =================================================================
  // 3. NẠP TÀI KHOẢN MẪU (USERS) - Mật khẩu chung: Password@123
  // =================================================================
  const passwordHash = await bcrypt.hash('Password@123', 10);

  await prisma.users.upsert({
    where: { email: 'admin@anhquy.com' },
    update: { full_name: 'Quản trị viên', role_id: adminRole.id },
    create: {
      email: 'admin@anhquy.com',
      password_hash: passwordHash,
      full_name: 'Quản trị viên',
      role_id: adminRole.id,
      is_active: true,
    },
  });

  await prisma.users.upsert({
    where: { email: 'manager@anhquy.com' },
    update: { full_name: 'Quản lý', role_id: managerRole.id },
    create: {
      email: 'manager@anhquy.com',
      password_hash: passwordHash,
      full_name: 'Quản lý',
      role_id: managerRole.id,
      is_active: true,
    },
  });

  await prisma.users.upsert({
    where: { email: 'user@anhquy.com' },
    update: { full_name: 'Nhân viên', role_id: userRole.id },
    create: {
      email: 'user@anhquy.com',
      password_hash: passwordHash,
      full_name: 'Nhân viên',
      role_id: userRole.id,
      is_active: true,
    },
  });
  console.log('✅ 3. Đã nạp 3 Tài khoản mẫu (admin / manager / user @anhquy.com - Pass: Password@123).');

  // =================================================================
  // 4. NẠP 4 NHÓM TIÊU CHUẨN (STANDARD_GROUPS)
  // =================================================================
  const groupsData = [
    {
      group_code: 'GRP-LABOR',
      group_name: 'Lao động',
      description: 'Tiêu chuẩn về độ tuổi, giờ làm việc, tiền lương, phúc lợi và chống cưỡng bức lao động',
    },
    {
      group_code: 'GRP-OHS',
      group_name: 'An toàn & Sức khỏe',
      description: 'Tiêu chuẩn về PCCC, lối thoát hiểm, trang thiết bị bảo hộ (PPE) và vệ sinh y tế',
    },
    {
      group_code: 'GRP-ENV',
      group_name: 'Môi trường',
      description: 'Tiêu chuẩn về giấy phép môi trường, kiểm soát xả thải và quản lý hóa chất/rác thải nguy hại',
    },
    {
      group_code: 'GRP-ETHICS',
      group_name: 'Đạo đức',
      description: 'Tiêu chuẩn về chống hối lộ, tham nhũng, minh bạch nội bộ và khoáng sản xung đột',
    },
  ];

  const groupMap: Record<string, number> = {};
  for (const grp of groupsData) {
    const savedGroup = await prisma.standard_Groups.upsert({
      where: { group_code: grp.group_code },
      update: { group_name: grp.group_name, description: grp.description },
      create: grp,
    });
    groupMap[grp.group_code] = savedGroup.id;
  }
  console.log('✅ 4. Đã nạp 4 nhóm Standard_Groups.');

  // =================================================================
  // 5. NẠP 24 TIÊU CHUẨN GỐC HỆ THỐNG SONG NGỮ VI-EN (STANDARDS)
  // =================================================================
  const standardsData = [
    // --- NHÓM 1: LAO ĐỘNG (GRP-LABOR) ---
    {
      group_code: 'GRP-LABOR',
      standard_code: 'RBA-A1.1',
      name: 'Tuổi lao động tối thiểu',
      jurisdiction: 'Global',
      priority_level: 1,
      content_i18n: JSON.stringify({
        vi: 'Cấm sử dụng lao động dưới 15 tuổi. Lao động từ đủ 15 đến dưới 18 tuổi không được làm việc ban đêm (22h-06h), không làm thêm giờ và không làm công việc nặng nhọc, nguy hiểm.',
        en: 'Child labor under 15 years of age is strictly prohibited. Workers aged 15 to under 18 shall not perform night work (22:00-06:00), overtime, or hazardous/heavy work.',
      }),
      description: 'RBA Code of Conduct v8.0 - Mục A1',
    },
    {
      group_code: 'GRP-LABOR',
      standard_code: 'VN-BLLD-D145',
      name: 'Tuổi lao động tối thiểu',
      jurisdiction: 'VN',
      priority_level: 1,
      content_i18n: JSON.stringify({
        vi: 'Cấm sử dụng người dưới 15 tuổi làm việc, ngoại trừ người từ đủ 13 đến chưa đủ 15 tuổi chỉ được làm công việc nhẹ theo danh mục do Bộ LĐ-TB&XH ban hành và phải có sự đồng ý của cha mẹ.',
        en: 'Employment of persons under 15 is prohibited, except for persons aged 13 to under 15 performing light work on the list issued by MOLISA with parental consent.',
      }),
      description: 'Bộ luật Lao động 2019 - Điều 145',
    },
    {
      group_code: 'GRP-LABOR',
      standard_code: 'RBA-A2.1',
      name: 'Cấm lao động cưỡng bức',
      jurisdiction: 'Global',
      priority_level: 1,
      content_i18n: JSON.stringify({
        vi: 'Cấm ép buộc lao động, cấm giữ bản gốc giấy tờ tùy thân (CCCD, Hộ chiếu) và cấm thu tiền đặt cọc hoặc tiền thế chân của người lao động dưới mọi hình thức.',
        en: 'Forced labor is prohibited. Retaining original identity documents (ID card, Passport) or requiring deposits or financial guarantees from workers in any form is strictly forbidden.',
      }),
      description: 'RBA Code of Conduct v8.0 - Mục A2',
    },
    {
      group_code: 'GRP-LABOR',
      standard_code: 'VN-BLLD-D17',
      name: 'Cấm giữ giấy tờ và tiền cọc',
      jurisdiction: 'VN',
      priority_level: 1,
      content_i18n: JSON.stringify({
        vi: 'Nghiêm cấm người sử dụng lao động giữ bản chính giấy tờ tùy thân, văn bằng, chứng chỉ của người lao động; nghiêm cấm yêu cầu người lao động thực hiện biện pháp bảo đảm bằng tiền hoặc tài sản khác.',
        en: 'Employers are strictly prohibited from keeping original identity documents, diplomas, or certificates of employees, or requiring employees to provide cash or asset guarantees.',
      }),
      description: 'Bộ luật Lao động 2019 - Điều 17',
    },
    {
      group_code: 'GRP-LABOR',
      standard_code: 'RBA-A3.1',
      name: 'Khung giờ làm việc tối đa',
      jurisdiction: 'Global',
      priority_level: 1,
      content_i18n: JSON.stringify({
        vi: 'Tổng thời gian làm việc bao gồm cả làm thêm giờ không được vượt quá 60 giờ/tuần. Bắt buộc người lao động phải có ít nhất 1 ngày nghỉ (24 giờ liên tục) sau mỗi 7 ngày làm việc.',
        en: 'Total working hours including overtime shall not exceed 60 hours per week. Workers must be allowed at least one day off (24 consecutive hours) every 7 days.',
      }),
      description: 'RBA Code of Conduct v8.0 - Mục A3',
    },
    {
      group_code: 'GRP-LABOR',
      standard_code: 'VN-BLLD-D105',
      name: 'Giờ làm việc bình thường',
      jurisdiction: 'VN',
      priority_level: 1,
      content_i18n: JSON.stringify({
        vi: 'Thời giờ làm việc bình thường không quá 08 giờ/ngày và không quá 48 giờ/tuần. Nhà nước khuyến khích người sử dụng lao động áp dụng tuần làm việc 40 giờ.',
        en: 'Normal working hours shall not exceed 08 hours per day and 48 hours per week. The State encourages employers to implement a 40-hour workweek.',
      }),
      description: 'Bộ luật Lao động 2019 - Điều 105',
    },
    {
      group_code: 'GRP-LABOR',
      standard_code: 'VN-BLLD-D107',
      name: 'Giới hạn giờ làm thêm',
      jurisdiction: 'VN',
      priority_level: 1,
      content_i18n: JSON.stringify({
        vi: 'Làm thêm giờ phải dựa trên sự đồng ý tự nguyện của người lao động. Tổng số giờ làm thêm không quá 50% số giờ làm việc bình thường/ngày, không quá 40 giờ/tháng và không quá 200 giờ/năm (ngành đặc thù không quá 300 giờ/năm).',
        en: 'Overtime work requires voluntary employee consent. Overtime shall not exceed 50% of normal daily hours, 40 hours per month, and 200 hours per year (300 hours per year for specific regulated industries).',
      }),
      description: 'Bộ luật Lao động 2019 - Điều 107',
    },
    {
      group_code: 'GRP-LABOR',
      standard_code: 'RBA-A4.1',
      name: 'Tiền lương và phúc lợi',
      jurisdiction: 'Global',
      priority_level: 1,
      content_i18n: JSON.stringify({
        vi: 'Chi trả tiền lương đúng hạn, đảm bảo không thấp hơn mức lương tối thiểu luật định và thanh toán đầy đủ phụ cấp làm thêm giờ. Tuyệt đối cấm phạt tiền bằng hình thức trừ lương nhân viên.',
        en: 'Wages must be paid on time, meeting at least the legal minimum wage, including full overtime premiums. Disciplinary wage deductions are strictly prohibited.',
      }),
      description: 'RBA Code of Conduct v8.0 - Mục A4',
    },
    {
      group_code: 'GRP-LABOR',
      standard_code: 'VN-BLLD-D90',
      name: 'Tiền lương và bảo hiểm',
      jurisdiction: 'VN',
      priority_level: 1,
      content_i18n: JSON.stringify({
        vi: 'Tiền lương thỏa thuận không được thấp hơn mức lương tối thiểu vùng do Chính phủ công bố. Doanh nghiệp bắt buộc phải trích nộp BHXH, BHYT, BHTN đầy đủ cho người lao động theo luật định.',
        en: 'Agreed wages must not be lower than the regional minimum wage announced by the Government. Enterprises must fully contribute to Social, Health, and Unemployment Insurance as prescribed by law.',
      }),
      description: 'BLLĐ 2019 - Điều 90 & Điều 168',
    },
    {
      group_code: 'GRP-LABOR',
      standard_code: 'RBA-A5.1',
      name: 'Chống phân biệt đối xử & Quấy rối',
      jurisdiction: 'Global',
      priority_level: 1,
      content_i18n: JSON.stringify({
        vi: 'Không phân biệt đối xử về giới tính, độ tuổi, tôn giáo, chủng tộc hoặc khuyết tật. Áp dụng chính sách không khoan nhượng đối với quấy rối tình dục, bạo lực thể xác hoặc đe dọa tinh thần tại nơi làm việc.',
        en: 'No discrimination based on gender, age, religion, race, or disability. Zero tolerance for sexual harassment, physical violence, or mental coercion in the workplace.',
      }),
      description: 'RBA Code of Conduct v8.0 - Mục A5',
    },

    // --- NHÓM 2: AN TOÀN & SỨC KHỎE (GRP-OHS) ---
    {
      group_code: 'GRP-OHS',
      standard_code: 'RBA-B1.1',
      name: 'Lối thoát hiểm an toàn',
      jurisdiction: 'Global',
      priority_level: 1,
      content_i18n: JSON.stringify({
        vi: 'Cửa thoát hiểm và lối thoát nạn phải luôn thông thoáng, không bao giờ được khóa hoặc bị cản trở bởi chướng ngại vật từ bên trong. Phải có sơ đồ và đèn chỉ dẫn thoát nạn sự cố.',
        en: 'Emergency exits and escape routes must remain clear and unlocked from the inside at all times. Evacuation maps and emergency exit lighting must be installed.',
      }),
      description: 'RBA Code of Conduct v8.0 - Mục B1',
    },
    {
      group_code: 'GRP-OHS',
      standard_code: 'VN-ND136-D13',
      name: 'Thẩm duyệt và nghiệm thu PCCC',
      jurisdiction: 'VN',
      priority_level: 1,
      content_i18n: JSON.stringify({
        vi: 'Nhà xưởng, công trình bắt buộc phải có văn bản thẩm duyệt thiết kế và biên bản nghiệm thu về PCCC trước khi đưa vào hoạt động. Phải trang bị đủ bình chữa cháy và diễn tập PCCC định kỳ ít nhất 1 lần/năm.',
        en: 'Factories and facilities must obtain fire safety design approval and acceptance certificates before operation. Sufficient fire extinguishers and at least one annual fire drill are mandatory.',
      }),
      description: 'Nghị định 136/2020/NĐ-CP - Điều 13, 15',
    },
    {
      group_code: 'GRP-OHS',
      standard_code: 'RBA-B2.1',
      name: 'Trang thiết bị bảo hộ cá nhân (PPE)',
      jurisdiction: 'Global',
      priority_level: 1,
      content_i18n: JSON.stringify({
        vi: 'Cung cấp đầy đủ, miễn phí trang thiết bị bảo hộ lao động cá nhân đạt chuẩn kỹ thuật phù hợp cho người lao động làm việc trong môi trường rủi ro, độc hại, bụi bẩn hoặc tiếng ồn cao.',
        en: 'Provide adequate, free Personal Protective Equipment (PPE) meeting technical standards to workers in hazardous, toxic, dusty, or high-noise environments.',
      }),
      description: 'RBA Code of Conduct v8.0 - Mục B2',
    },
    {
      group_code: 'GRP-OHS',
      standard_code: 'RBA-B3.1',
      name: 'Vệ sinh sinh hoạt & Nước uống',
      jurisdiction: 'Global',
      priority_level: 2,
      content_i18n: JSON.stringify({
        vi: 'Cung cấp đủ nước uống sạch miễn phí và khu vực nhà vệ sinh sạch sẽ, hợp chuẩn; không được giới hạn bất hợp lý về thời gian hoặc số lần sử dụng nhà vệ sinh của người lao động.',
        en: 'Provide free potable water and clean, compliant restroom facilities; unreasonable restrictions on time or frequency of restroom use are prohibited.',
      }),
      description: 'RBA Code of Conduct v8.0 - Mục B3',
    },
    {
      group_code: 'GRP-OHS',
      standard_code: 'RBA-B4.1',
      name: 'Khám sức khỏe định kỳ',
      jurisdiction: 'Global',
      priority_level: 2,
      content_i18n: JSON.stringify({
        vi: 'Tổ chức khám sức khỏe định kỳ tối thiểu 1 lần/năm cho người lao động; tối thiểu 6 tháng/lần đối với người làm công việc nặng nhọc, độc hại, nguy hiểm hoặc lao động chưa thành niên.',
        en: 'Conduct periodic health check-ups at least once a year for general workers, and at least every 6 months for workers in heavy, toxic, hazardous jobs or juvenile workers.',
      }),
      description: 'RBA Mục B4 & Luật ATVSLĐ Điều 21',
    },

    // --- NHÓM 3: MÔI TRƯỜNG (GRP-ENV) ---
    {
      group_code: 'GRP-ENV',
      standard_code: 'RBA-C1.1',
      name: 'Quản lý chất thải nguy hại',
      jurisdiction: 'Global',
      priority_level: 1,
      content_i18n: JSON.stringify({
        vi: 'Phải phân loại, dán nhãn, lưu trữ riêng biệt tại khu vực an toàn và ký hợp đồng chuyển giao xử lý chất thải nguy hại với đơn vị có chức năng và giấy phép hợp pháp.',
        en: 'Hazardous waste must be segregated, labeled, stored separately in secure areas, and transferred only to licensed hazardous waste treatment contractors.',
      }),
      description: 'RBA Code of Conduct v8.0 - Mục C1',
    },
    {
      group_code: 'GRP-ENV',
      standard_code: 'VN-BVMT-D83',
      name: 'Phân loại & Lưu giữ rác thải nguy hại',
      jurisdiction: 'VN',
      priority_level: 1,
      content_i18n: JSON.stringify({
        vi: 'Chất thải nguy hại phải được phân loại ngay tại nguồn phát sinh, dán nhãn mã nhận diện, lưu giữ trong bao bì/thiết bị chuyên dụng tại khu vực có mái che và khay chống tràn; nghiêm cấm để lẫn với chất thải thông thường.',
        en: 'Hazardous waste must be classified at source, labeled with identification codes, stored in specialized containers in covered areas with secondary containment, and strictly separated from regular waste.',
      }),
      description: 'Luật Bảo vệ môi trường 2020 - Điều 83',
    },
    {
      group_code: 'GRP-ENV',
      standard_code: 'VN-BVMT-D39',
      name: 'Giấy phép xả thải & Giấy phép môi trường',
      jurisdiction: 'VN',
      priority_level: 1,
      content_i18n: JSON.stringify({
        vi: 'Cơ sở sản xuất thuộc diện quy định bắt buộc phải có Giấy phép môi trường hợp lệ trước khi vận hành chính thức. Nghiêm cấm xả nước thải hoặc khí thải chưa qua xử lý đạt quy chuẩn kỹ thuật quốc gia ra môi trường tiếp nhận.',
        en: 'Regulated manufacturing facilities must obtain a valid Environmental Permit prior to official operation. Discharging untreated wastewater or emissions failing National Technical Regulations is strictly prohibited.',
      }),
      description: 'Luật Bảo vệ môi trường 2020 - Điều 6, 39, 40',
    },
    {
      group_code: 'GRP-ENV',
      standard_code: 'RBA-C3.1',
      name: 'Kiểm soát nước thải và khí thải',
      jurisdiction: 'Global',
      priority_level: 1,
      content_i18n: JSON.stringify({
        vi: 'Nước thải và khí thải phát sinh từ quá trình vận hành phải được theo dõi, kiểm soát và xử lý qua hệ thống đạt quy chuẩn kỹ thuật trước khi xả thải ra môi trường xung quanh.',
        en: 'Wastewater and air emissions generated from operations must be monitored, controlled, and treated to meet technical standards prior to discharge into the environment.',
      }),
      description: 'RBA Code of Conduct v8.0 - Mục C3 & C4',
    },
    {
      group_code: 'GRP-ENV',
      standard_code: 'RBA-C2.1',
      name: 'Quản lý hóa chất nguy hại',
      jurisdiction: 'Global',
      priority_level: 1,
      content_i18n: JSON.stringify({
        vi: 'Toàn bộ hóa chất nguy hại phải được dán nhãn nhận diện cảnh báo theo chuẩn GHS, có Phiếu an toàn hóa chất (MSDS) và lưu trữ trên khay kệ có biện pháp chống tràn đổ rò rỉ.',
        en: 'All hazardous chemicals must carry GHS warning labels, maintain Material Safety Data Sheets (MSDS), and be stored with spill and leak secondary containment.',
      }),
      description: 'RBA Code of Conduct v8.0 - Mục C2',
    },

    // --- NHÓM 4: ĐẠO ĐỨC (GRP-ETHICS) ---
    {
      group_code: 'GRP-ETHICS',
      standard_code: 'RBA-D1.1',
      name: 'Chống hối lộ và tham nhũng',
      jurisdiction: 'Global',
      priority_level: 1,
      content_i18n: JSON.stringify({
        vi: 'Áp dụng chính sách không khoan nhượng (Zero Tolerance) đối với mọi hành vi đưa hoặc nhận hối lộ, tống tiền, biển thủ hoặc nhận tiền hoa hồng, lại quả (kickback) bất hợp pháp dưới mọi hình thức.',
        en: 'Enforce a Zero Tolerance policy against all forms of bribery, extortion, embezzlement, or illegal commissions and kickbacks.',
      }),
      description: 'RBA Code of Conduct v8.0 - Mục D1',
    },
    {
      group_code: 'GRP-ETHICS',
      standard_code: 'VN-PCTN-D80',
      name: 'Cấm đưa, nhận và môi giới hối lộ',
      jurisdiction: 'VN',
      priority_level: 1,
      content_i18n: JSON.stringify({
        vi: 'Nghiêm cấm người trong doanh nghiệp đưa hối lộ, nhận hối lộ hoặc môi giới hối lộ dưới mọi hình thức (tiền, quà biếu, chiết khấu, lại quả) để giải quyết công việc vì vụ lợi hoặc tạo lợi thế thương mại bất hợp pháp.',
        en: 'Personnel in enterprises are strictly prohibited from giving, receiving, or brokering bribes in any form (cash, gifts, kickbacks) for personal gain or unlawful commercial advantage.',
      }),
      description: 'Luật Phòng, chống tham nhũng 2018 - Điều 2, 80',
    },
    {
      group_code: 'GRP-ETHICS',
      standard_code: 'VN-PCTN-D79',
      name: 'Kiểm soát nội bộ & Phòng ngừa tham nhũng',
      jurisdiction: 'VN',
      priority_level: 1,
      content_i18n: JSON.stringify({
        vi: 'Doanh nghiệp phải ban hành và thực hiện quy tắc ứng xử, kiểm soát xung đột lợi ích và cơ chế tự kiểm tra nội bộ; thiết lập kênh tiếp nhận tố cáo hành vi tham nhũng và cam kết bảo vệ bí mật người phản ánh sai phạm.',
        en: 'Enterprises must issue and enforce codes of conduct, conflict-of-interest controls, and internal self-inspection mechanisms, alongside confidential whistleblowing channels with non-retaliation protection.',
      }),
      description: 'Luật Phòng, chống tham nhũng 2018 - Điều 79, 81',
    },
    {
      group_code: 'GRP-ETHICS',
      standard_code: 'RBA-D2.1',
      name: 'Truy xuất khoáng sản xung đột',
      jurisdiction: 'Global',
      priority_level: 2,
      content_i18n: JSON.stringify({
        vi: 'Minh bạch chuỗi cung ứng vật liệu; thực hiện thẩm định nguồn gốc và không thu mua, sử dụng khoáng sản xung đột (Thiếc, Tantali, Vonfram, Vàng - 3TG) có nguồn gốc phi pháp.',
        en: 'Ensure supply chain material transparency; conduct due diligence and refrain from sourcing or using illegal conflict minerals (Tin, Tantalum, Tungsten, Gold - 3TG).',
      }),
      description: 'RBA Code of Conduct v8.0 - Mục D2',
    },
  ];

  const allStandardIds: number[] = [];
  for (const std of standardsData) {
    const groupId = groupMap[std.group_code];
    const savedStd = await prisma.standards.upsert({
      where: { standard_code: std.standard_code },
      update: {
        group_id: groupId,
        name: std.name,
        jurisdiction: std.jurisdiction,
        priority_level: std.priority_level,
        content_i18n: std.content_i18n,
        description: std.description,
        is_active: true,
      },
      create: {
        group_id: groupId,
        standard_code: std.standard_code,
        name: std.name,
        jurisdiction: std.jurisdiction,
        priority_level: std.priority_level,
        content_i18n: std.content_i18n,
        description: std.description,
        created_by: null, // NULL = 24 Tiêu chuẩn gốc cố định của hệ thống
        is_active: true,
      },
    });
    allStandardIds.push(savedStd.id);
  }
  console.log('✅ 5. Đã nạp 24 Tiêu chuẩn gốc cố định (Song ngữ VI-EN).');

  // =================================================================
  // 6. NẠP DANH MỤC NGÀNH NGHỀ & LOẠI HỢP ĐỒNG (CATEGORIES)
  // =================================================================
  const categoriesData = [
    // --- Nhóm Ngành nghề (Industry) cho Bảng Suppliers ---
    {
      category_type: 'Industry',
      name: 'Dệt may & Da giày',
      description: 'Các nhà máy gia công may mặc, dệt nhuộm, sản xuất giày dép xuất khẩu',
    },
    {
      category_type: 'Industry',
      name: 'Điện tử & Bán dẫn',
      description: 'Các nhà cung cấp linh kiện điện tử, bo mạch, lắp ráp thiết bị công nghệ',
    },
    {
      category_type: 'Industry',
      name: 'Hóa chất, Nhựa & Bao bì',
      description: 'Các cơ sở sản xuất hạt nhựa, hóa chất công nghiệp, in ấn và đóng gói bao bì',
    },
    {
      category_type: 'Industry',
      name: 'Vận tải, Kho bãi & Dịch vụ',
      description: 'Các đơn vị logistics, vận chuyển, bảo hiểm và dịch vụ phụ trợ chuỗi cung ứng',
    },

    // --- Nhóm Loại Hợp đồng (Contract_Type) cho Bảng Documents ---
    {
      category_type: 'Contract_Type',
      name: 'Hợp đồng Gia công & Sản xuất',
      description: 'Hợp đồng thuê gia công, sản xuất hàng hóa công nghiệp theo đơn đặt hàng',
    },
    {
      category_type: 'Contract_Type',
      name: 'Hợp đồng Mua bán Hàng hóa & Nguyên vật liệu',
      description: 'Hợp đồng cung ứng nguyên vật liệu thô, linh kiện, hóa chất, máy móc',
    },
    {
      category_type: 'Contract_Type',
      name: 'Hợp đồng Dịch vụ, Vận tải & Bảo hiểm',
      description: 'Hợp đồng dịch vụ logistics, kho bãi, bảo hiểm thương mại, xử lý chất thải',
    },
    {
      category_type: 'Contract_Type',
      name: 'Hợp đồng Cung ứng Lao động & Nhân sự',
      description: 'Hợp đồng cho thuê lại lao động, dịch vụ bảo vệ, vệ sinh công nghiệp',
    },
    {
      category_type: 'Contract_Type',
      name: 'Hợp đồng Thương mại Đa dụng (Mặc định)',
      description: 'Áp dụng mặc định toàn bộ 24 tiêu chuẩn gốc cho mọi loại hợp đồng khác',
    },
  ];

  const industryMap: Record<string, number> = {};
  const contractTypeIds: number[] = [];

  for (const cat of categoriesData) {
    let existingCat = await prisma.categories.findFirst({
      where: { category_type: cat.category_type, name: cat.name },
    });

    if (!existingCat) {
      existingCat = await prisma.categories.create({
        data: {
          category_type: cat.category_type,
          name: cat.name,
          description: cat.description,
          is_active: true,
        },
      });
    } else {
      existingCat = await prisma.categories.update({
        where: { id: existingCat.id },
        data: { description: cat.description, is_active: true },
      });
    }

    if (cat.category_type === 'Industry') {
      industryMap[cat.name] = existingCat.id;
    } else if (cat.category_type === 'Contract_Type') {
      contractTypeIds.push(existingCat.id);
    }
  }

  // Gán mặc định toàn bộ 24 tiêu chuẩn gốc cho TẤT CẢ các loại hợp đồng
  // (Đảm bảo chọn hợp đồng nào cũng có sẵn 24 chuẩn gốc, User muốn bỏ chuẩn nào thì tick vào User_Excluded_Standards)
  for (const contractCatId of contractTypeIds) {
    for (const stdId of allStandardIds) {
      await prisma.category_Standards.upsert({
        where: {
          category_id_standard_id: {
            category_id: contractCatId,
            standard_id: stdId,
          },
        },
        update: {},
        create: {
          category_id: contractCatId,
          standard_id: stdId,
        },
      });
    }
  }
  console.log('✅ 6. Đã nạp 9 Danh mục (Ngành nghề & Loại hợp đồng) và ánh xạ mặc định 24 tiêu chuẩn cho mọi loại hợp đồng.');

  // =================================================================
  // 7. NẠP NHÀ CUNG CẤP MẪU (SUPPLIERS) ĐỂ SẴN SÀNG TEST UPLOAD PDF
  // =================================================================
  const suppliersData = [
    {
      company_name: 'Công ty TNHH Dệt May Á Châu',
      tax_code: '3600123456',
      industry_id: industryMap['Dệt may & Da giày'],
      contact_email: 'compliance@achautextile.vn',
      contact_phone: '02513888999',
      address: 'KCN Amata, Phường Long Bình, TP. Biên Hòa, Đồng Nai',
      risk_score: 100,
    },
    {
      company_name: 'Công ty Cổ phần Linh Kiện Điện Tử Thái Bình Dương',
      tax_code: '0309876543',
      industry_id: industryMap['Điện tử & Bán dẫn'],
      contact_email: 'legal@pacificelectronics.vn',
      contact_phone: '02839997777',
      address: 'Khu Công Nghệ Cao, TP. Thủ Đức, TP. Hồ Chí Minh',
      risk_score: 100,
    },
    {
      company_name: 'Công ty TNHH Hóa Chất & Bao Bì Đại Nam',
      tax_code: '3702468135',
      industry_id: industryMap['Hóa chất, Nhựa & Bao bì'],
      contact_email: 'info@dainampackaging.com',
      contact_phone: '02743666555',
      address: 'KCN VSIP 1, TP. Thuận An, Bình Dương',
      risk_score: 100,
    },
  ];

  for (const sup of suppliersData) {
    await prisma.suppliers.upsert({
      where: { tax_code: sup.tax_code },
      update: {
        company_name: sup.company_name,
        industry_id: sup.industry_id,
        contact_email: sup.contact_email,
        contact_phone: sup.contact_phone,
        address: sup.address,
      },
      create: sup,
    });
  }
  console.log('✅ 7. Đã nạp 3 Nhà cung cấp mẫu (Suppliers).');

  // =================================================================
  // 8. NẠP CẤU HÌNH HỆ THỐNG (SYSTEM_CONFIGS)
  // =================================================================
  const systemConfigsData = [
    {
      config_key: 'AI_MODEL_NAME',
      config_value: 'gemini-1.5-flash',
      description: 'Mô hình AI mặc định dùng để phân tích và rà soát hợp đồng PDF',
    },
    {
      config_key: 'AI_STRICT_RULE_MODE',
      config_value: 'true',
      description: 'Nguyên tắc pháp lý: Áp dụng tiêu chuẩn khắt khe hơn khi có mâu thuẫn giữa RBA và Luật địa phương',
    },
    {
      config_key: 'DATA_MASKING_ENABLED',
      config_value: 'true',
      description: 'Tự động ẩn danh CCCD, Mã số thuế thành [REDACTED] trước khi gửi dữ liệu cho AI',
    },
    {
      config_key: 'MAX_UPLOAD_SIZE_MB',
      config_value: '20',
      description: 'Dung lượng file hợp đồng PDF tải lên tối đa (MB)',
    },
    {
      config_key: 'DEFAULT_RISK_SCORE',
      config_value: '100',
      description: 'Điểm an toàn khởi tạo mặc định cho mỗi nhà cung ứng mới',
    },
    {
      config_key: 'PENALTY_HIGH_RISK',
      config_value: '10',
      description: 'Số điểm bị trừ khi Quản lý phê duyệt 1 lỗi vi phạm mức độ Nghiêm trọng (High)',
    },
    {
      config_key: 'PENALTY_MEDIUM_RISK',
      config_value: '5',
      description: 'Số điểm bị trừ khi Quản lý phê duyệt 1 lỗi vi phạm mức độ Trung bình (Medium)',
    },
    {
      config_key: 'PENALTY_LOW_RISK',
      config_value: '2',
      description: 'Số điểm bị trừ khi Quản lý phê duyệt 1 lỗi vi phạm mức độ Thấp (Low)',
    },
    {
      config_key: 'MAX_LOGIN_ATTEMPTS',
      config_value: '5',
      description: 'Số lần nhập sai mật khẩu tối đa trước khi tạm khóa tài khoản (Chống Brute-force)',
    },
    {
      config_key: 'ACCOUNT_LOCK_MINUTES',
      config_value: '15',
      description: 'Thời gian tạm khóa tài khoản khi đăng nhập sai quá số lần quy định (Phút)',
    },
  ];

  for (const cfg of systemConfigsData) {
    await prisma.system_Configs.upsert({
      where: { config_key: cfg.config_key },
      update: { config_value: cfg.config_value, description: cfg.description },
      create: cfg,
    });
  }
  console.log('✅ 8. Đã nạp 10 Tham số cấu hình hệ thống (System_Configs).');

  // =================================================================
  // 9. NẠP NGƯỠNG RỦI RO (RISK_THRESHOLDS)
  // =================================================================
  const thresholdsData = [
    { level_name: 'Safe', min_score: 80, max_score: 100, color_code: '#10B981' },
    { level_name: 'Warning', min_score: 50, max_score: 79, color_code: '#F59E0B' },
    { level_name: 'Danger', min_score: 0, max_score: 49, color_code: '#EF4444' },
  ];

  for (const th of thresholdsData) {
    const existingTh = await prisma.risk_Thresholds.findFirst({
      where: { level_name: th.level_name },
    });

    if (!existingTh) {
      await prisma.risk_Thresholds.create({ data: th });
    } else {
      await prisma.risk_Thresholds.update({
        where: { id: existingTh.id },
        data: { min_score: th.min_score, max_score: th.max_score, color_code: th.color_code },
      });
    }
  }
  console.log('✅ 9. Đã nạp 3 Ngưỡng rủi ro (Safe, Warning, Danger).');
  console.log('🎉 HOÀN TẤT SEED DATABASE! Toàn bộ dữ liệu gốc đã sẵn sàng 100%.');
}

main()
  .catch((e) => {
    console.error('❌ Lỗi khi chạy Seed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });