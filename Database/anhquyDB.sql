USE master;
GO

IF DB_ID('anhquyDB') IS NOT NULL
BEGIN
    ALTER DATABASE anhquyDB SET SINGLE_USER WITH ROLLBACK IMMEDIATE;
    DROP DATABASE anhquyDB;
END
GO

CREATE DATABASE anhquyDB;
GO

USE anhquyDB;
GO

-- =================================================================
-- PHẦN 1: TẠO BẢNG CHUẨN HÓA 3NF (THEO GÓP Ý CỦA GIẢNG VIÊN)
-- =================================================================

-- 1. BẢNG VAI TRÒ (ROLES) - [Tách ra theo ý thầy]
CREATE TABLE Roles (
    id INT IDENTITY(1,1) PRIMARY KEY,
    role_name VARCHAR(50) NOT NULL UNIQUE, -- VD: 'Admin', 'Manager', 'User'
    description NVARCHAR(255) NULL
);

-- 2. BẢNG QUYỀN HẠN (PERMISSIONS) - [Tách ra theo ý thầy]
CREATE TABLE Permissions (
    id INT IDENTITY(1,1) PRIMARY KEY,
    permission_code VARCHAR(50) NOT NULL UNIQUE, -- VD: 'READ_DOC', 'EDIT_SUPPLIER'
    permission_name NVARCHAR(100) NOT NULL
);

-- 3. BẢNG TRUNG GIAN QUYỀN CỦA VAI TRÒ (ROLE_PERMISSIONS) 
-- Dùng Khóa chính phức hợp (Composite Key), KHÔNG dùng ID tự tăng theo đúng dặn dò của thầy
CREATE TABLE Role_Permissions (
    role_id INT NOT NULL,
    permission_id INT NOT NULL,
    PRIMARY KEY (role_id, permission_id), -- Khóa chính phức hợp
    CONSTRAINT FK_RP_Roles FOREIGN KEY (role_id) REFERENCES Roles(id) ON DELETE CASCADE,
    CONSTRAINT FK_RP_Permissions FOREIGN KEY (permission_id) REFERENCES Permissions(id) ON DELETE CASCADE
);

-- 4. BẢNG NGƯỜI DÙNG (USERS)
CREATE TABLE Users (
    id INT IDENTITY(1,1) PRIMARY KEY,
    email VARCHAR(255) NOT NULL UNIQUE,
    password_hash VARCHAR(255) NOT NULL,
    full_name NVARCHAR(100) NOT NULL,
    role_id INT NOT NULL, -- Liên kết khóa ngoại tới bảng Roles
    is_active BIT DEFAULT 1,
    failed_login_attempts INT DEFAULT 0,
    locked_until DATETIME NULL,
    gemini_api_key VARCHAR(255) NULL,
    refresh_token VARCHAR(512) NULL,
    refresh_token_expiry DATETIME NULL,
    created_at DATETIME DEFAULT GETDATE(),
    updated_at DATETIME DEFAULT GETDATE(),
    CONSTRAINT FK_Users_Roles FOREIGN KEY (role_id) REFERENCES Roles(id)
);

-- 5. BẢNG DANH MỤC / LOẠI HỢP ĐỒNG (CATEGORIES)
CREATE TABLE Categories (
    id INT IDENTITY(1,1) PRIMARY KEY,
    category_type VARCHAR(50) NOT NULL, -- Phân loại: 'Industry' (Dành cho Supplier), 'Contract_Type' (Loại hợp đồng)...
    name NVARCHAR(255) NOT NULL,        -- Tên hiển thị (VD: 'Hợp đồng Bảo hiểm', 'Hợp đồng Lao động')
    description NVARCHAR(MAX) NULL,
    is_active BIT DEFAULT 1,
    created_at DATETIME DEFAULT GETDATE(),
    updated_at DATETIME DEFAULT GETDATE()
);

-- 6. BẢNG NHÀ CUNG CẤP (SUPPLIERS) - (Vẫn giữ theo form B2B gốc)
CREATE TABLE Suppliers (
    id INT IDENTITY(1,1) PRIMARY KEY,
    company_name NVARCHAR(255) NOT NULL,
    tax_code VARCHAR(50) NOT NULL UNIQUE,
    industry_id INT NULL,               
    contact_email VARCHAR(255) NULL, 
    contact_phone VARCHAR(20) NULL,  
    address NVARCHAR(MAX) NULL,      
    risk_score INT DEFAULT 100,
    is_deleted BIT DEFAULT 0, 
    created_at DATETIME DEFAULT GETDATE(),
    updated_at DATETIME DEFAULT GETDATE(),
    CONSTRAINT FK_Suppliers_Categories FOREIGN KEY (industry_id) REFERENCES Categories(id)
);
-- 7. BẢNG NHÓM TIÊU CHUẨN
CREATE TABLE Standard_Groups (
    id INT IDENTITY(1,1) PRIMARY KEY,
    group_code VARCHAR(50) NOT NULL UNIQUE,  -- VD: 'GRP-LABOR', 'GRP-ENV'
    group_name NVARCHAR(100) NOT NULL,       -- VD: 'Lao động', 'Môi trường'
    description NVARCHAR(MAX) NULL
);
-- 8. BẢNG TIÊU CHUẨN (STANDARDS) - Hỗ trợ Tiêu chuẩn Mặc định & Tiêu chuẩn Cá nhân
CREATE TABLE Standards (
    id INT IDENTITY(1,1) PRIMARY KEY,
    group_id INT NOT NULL,
    standard_code VARCHAR(50) NOT NULL UNIQUE, 
    name NVARCHAR(255) NOT NULL,
    jurisdiction VARCHAR(50) DEFAULT 'Global', 
    priority_level INT DEFAULT 1,              
    content_i18n NVARCHAR(MAX) NULL,           
    description NVARCHAR(MAX) NULL,
    legal_document_name NVARCHAR(255) NULL, -- Ví dụ: "Bộ luật Lao động 2019 (Luật số 45/2019/QH14)" hoặc "RBA Code of Conduct v8.0"
    article_reference NVARCHAR(100) NULL,    -- Ví dụ: "Điều 105, 107" hoặc "Mục A3"
    official_url NVARCHAR(500) NULL,         -- Ví dụ đường dẫn chính thống: "https://vanban.chinhphu.vn/?pageid=27160&docid=198889"
    created_by INT NULL, -- NẾU NULL LÀ BỘ TIÊU CHUẨN GỐC, NẾU CÓ ID USER THÌ LÀ BỘ CÁ NHÂN DO USER TẠO
    is_active BIT DEFAULT 1,
    created_at DATETIME DEFAULT GETDATE(),
    updated_at DATETIME DEFAULT GETDATE(),
    CONSTRAINT FK_Standards_Groups FOREIGN KEY (group_id) REFERENCES Standard_Groups(id) ON DELETE CASCADE,
    CONSTRAINT FK_Standards_Users FOREIGN KEY (created_by) REFERENCES Users(id)
);

-- 9. BẢNG TRUNG GIAN N-N: TIÊU CHUẨN THEO LOẠI HỢP ĐỒNG (CATEGORY_STANDARDS)
CREATE TABLE Category_Standards (
    category_id INT NOT NULL,  -- Loại hợp đồng (VD: Hợp đồng bảo hiểm)
    standard_id INT NOT NULL,  -- Chứa tiêu chí gì
    PRIMARY KEY (category_id, standard_id),
    CONSTRAINT FK_CS_Categories FOREIGN KEY (category_id) REFERENCES Categories(id) ON DELETE CASCADE,
    CONSTRAINT FK_CS_Standards FOREIGN KEY (standard_id) REFERENCES Standards(id) ON DELETE CASCADE
);

-- 10. BẢNG TRUNG GIAN N-N: USER BỎ BỚT TIÊU CHUẨN GỐC (USER_EXCLUDED_STANDARDS)
-- (Giải quyết bài toán: User muốn bỏ 5 tiêu chí ra khỏi 15 tiêu chí mặc định)
CREATE TABLE User_Excluded_Standards (
    user_id INT NOT NULL,
    standard_id INT NOT NULL,
    PRIMARY KEY (user_id, standard_id),
    CONSTRAINT FK_UES_Users FOREIGN KEY (user_id) REFERENCES Users(id) ON DELETE CASCADE,
    CONSTRAINT FK_UES_Standards FOREIGN KEY (standard_id) REFERENCES Standards(id) ON DELETE NO ACTION
);

-- 11. BẢNG TÀI LIỆU / HỢP ĐỒNG (DOCUMENTS)
CREATE TABLE Documents (
    id INT IDENTITY(1,1) PRIMARY KEY,
    supplier_id INT NOT NULL,
    category_id INT NOT NULL, -- [QUAN TRỌNG] File này là loại hợp đồng gì? Để AI biết đường lôi Tiêu chuẩn ra quét
    file_name NVARCHAR(255) NOT NULL,
    file_size INT NOT NULL, 
    file_type VARCHAR(10) NOT NULL, 
    file_hash VARCHAR(255) NULL, 
    storage_url VARCHAR(MAX) NOT NULL,
    status VARCHAR(20) NOT NULL CHECK (status IN ('Uploaded', 'Analyzing', 'Analyzed', 'Error')),
    uploaded_at DATETIME DEFAULT GETDATE(),
    last_analyzed_at DATETIME NULL,
    analysis_started_at DATETIME NULL,
    analysis_completed_at DATETIME NULL,
    last_error_code VARCHAR(50) NULL,
    last_error_message NVARCHAR(MAX) NULL,
    updated_at DATETIME DEFAULT GETDATE(),
    CONSTRAINT FK_Documents_Suppliers FOREIGN KEY (supplier_id) REFERENCES Suppliers(id) ON DELETE CASCADE,
    CONSTRAINT FK_Documents_Categories FOREIGN KEY (category_id) REFERENCES Categories(id)
);

-- 12. BẢNG CẢNH BÁO VI PHẠM (VIOLATIONS) 
CREATE TABLE Violations (
    id INT IDENTITY(1,1) PRIMARY KEY,
    document_id INT NOT NULL,
    standard_id INT NULL,
    risk_level VARCHAR(20) NOT NULL CHECK (risk_level IN ('High', 'Medium', 'Low')),
    violation_desc NVARCHAR(MAX) NOT NULL,
    evidence_quote NVARCHAR(MAX) NOT NULL, 
    page_number INT NULL,              
    recommendation NVARCHAR(MAX) NULL, 
    status VARCHAR(20) NOT NULL DEFAULT 'Pending' CHECK (status IN ('Pending', 'Approved', 'Rejected')),
    reviewed_by INT NULL, 
    reviewed_at DATETIME NULL,
    created_at DATETIME DEFAULT GETDATE(),
    updated_at DATETIME DEFAULT GETDATE(),
    CONSTRAINT FK_Violations_Documents FOREIGN KEY (document_id) REFERENCES Documents(id) ON DELETE CASCADE,
    CONSTRAINT FK_Violations_Standards FOREIGN KEY (standard_id) REFERENCES Standards(id),
    CONSTRAINT FK_Violations_Users FOREIGN KEY (reviewed_by) REFERENCES Users(id)
);

-- 13. BẢNG NHẬT KÝ KIỂM TOÁN (AUDIT LOGS) 
CREATE TABLE Audit_Logs (
    id INT IDENTITY(1,1) PRIMARY KEY,
    user_id INT NOT NULL,               
    action_type VARCHAR(50) NOT NULL,   
    target_table VARCHAR(50) NOT NULL,  
    target_id INT NULL,                 
    old_value NVARCHAR(MAX) NULL,       
    new_value NVARCHAR(MAX) NULL,       
    created_at DATETIME DEFAULT GETDATE(),
    CONSTRAINT FK_AuditLogs_Users FOREIGN KEY (user_id) REFERENCES Users(id)
);

-- 14. BẢNG CẤU HÌNH HỆ THỐNG & NGƯỠNG RỦI RO (Giữ nguyên)
CREATE TABLE System_Configs (
    id INT IDENTITY(1,1) PRIMARY KEY,
    config_key VARCHAR(100) NOT NULL UNIQUE,
    config_value NVARCHAR(255) NOT NULL,
    description NVARCHAR(MAX) NULL,
    created_at DATETIME DEFAULT GETDATE(),
    updated_at DATETIME DEFAULT GETDATE()
);

CREATE TABLE Risk_Thresholds (
    id INT IDENTITY(1,1) PRIMARY KEY,
    level_name VARCHAR(50) NOT NULL CHECK (level_name IN ('Safe', 'Warning', 'Danger')),
    min_score INT NOT NULL,
    max_score INT NOT NULL,
    color_code VARCHAR(20) NOT NULL,
    created_at DATETIME DEFAULT GETDATE(),
    updated_at DATETIME DEFAULT GETDATE()
);

-- 15. BẢNG NHẬT KÝ PHÂN TÍCH AI (AI_ANALYSIS_LOGS)
CREATE TABLE AI_Analysis_Logs (
    id INT IDENTITY(1,1) PRIMARY KEY,
    document_id INT NOT NULL,
    model_name VARCHAR(100) NOT NULL,
    prompt_version VARCHAR(50) NULL,
    status VARCHAR(20) NOT NULL,
    started_at DATETIME DEFAULT GETDATE(),
    completed_at DATETIME NULL,
    duration_ms INT NULL,
    input_tokens INT NULL,
    output_tokens INT NULL,
    total_tokens INT NULL,
    error_code VARCHAR(50) NULL,
    error_message NVARCHAR(MAX) NULL,
    created_at DATETIME DEFAULT GETDATE(),
    CONSTRAINT FK_AI_Analysis_Logs_Documents FOREIGN KEY (document_id) REFERENCES Documents(id) ON DELETE CASCADE
);

-- 16. BẢNG NGƯỠNG GIÁM SÁT SQA (SQA_THRESHOLDS)
CREATE TABLE SQA_Thresholds (
    id INT IDENTITY(1,1) PRIMARY KEY,
    metric_code VARCHAR(100) NOT NULL UNIQUE,
    warning_value FLOAT NOT NULL,
    critical_value FLOAT NOT NULL,
    comparison_operator VARCHAR(10) NOT NULL,
    minimum_sample_size INT DEFAULT 20,
    is_active BIT DEFAULT 1,
    description NVARCHAR(255) NULL,
    updated_by INT NULL,
    created_at DATETIME DEFAULT GETDATE(),
    updated_at DATETIME DEFAULT GETDATE()
);

-- =================================================================
-- PHẦN 2: TẠO CHỈ MỤC (INDEXES) TỐI ƯU HIỆU NĂNG 
-- =================================================================

-- Tối ưu tìm kiếm Người dùng theo Vai trò
CREATE NONCLUSTERED INDEX IX_Users_Role ON Users(role_id);

-- Tối ưu tìm kiếm Nhà cung cấp & Danh mục
CREATE NONCLUSTERED INDEX IX_Suppliers_Company ON Suppliers(company_name);
CREATE NONCLUSTERED INDEX IX_Suppliers_Industry ON Suppliers(industry_id);
CREATE NONCLUSTERED INDEX IX_Categories_Type ON Categories(category_type);

-- Tối ưu truy vấn Tài liệu / Hợp đồng
CREATE NONCLUSTERED INDEX IX_Documents_Supplier ON Documents(supplier_id);
CREATE NONCLUSTERED INDEX IX_Documents_Category ON Documents(category_id);
CREATE NONCLUSTERED INDEX IX_Documents_Status ON Documents(status);

-- Tối ưu truy vấn Vi phạm (Phục vụ Load Dashboard và Lọc dữ liệu nhanh)
CREATE NONCLUSTERED INDEX IX_Violations_Document ON Violations(document_id);
CREATE NONCLUSTERED INDEX IX_Violations_Standard ON Violations(standard_id);
CREATE NONCLUSTERED INDEX IX_Violations_Status ON Violations(status);

-- Tối ưu truy xuất Audit Log (Lọc lịch sử thao tác của Manager/Admin)
CREATE NONCLUSTERED INDEX IX_AuditLogs_User ON Audit_Logs(user_id);
CREATE NONCLUSTERED INDEX IX_AuditLogs_Action ON Audit_Logs(action_type);

-- Tạo Index để tối ưu truy vấn khi Filter theo nhóm
CREATE NONCLUSTERED INDEX IX_Standards_Group ON Standards(group_id);

-- Tối ưu truy vấn Nhật ký phân tích AI (AI_Analysis_Logs)
CREATE NONCLUSTERED INDEX IX_AI_Analysis_Logs_Document ON AI_Analysis_Logs(document_id);
CREATE NONCLUSTERED INDEX IX_AI_Analysis_Logs_Status ON AI_Analysis_Logs(status);
CREATE NONCLUSTERED INDEX IX_AI_Analysis_Logs_Started ON AI_Analysis_Logs(started_at);
CREATE NONCLUSTERED INDEX IX_AI_Analysis_Logs_Completed ON AI_Analysis_Logs(completed_at);