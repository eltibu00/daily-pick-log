-- ============================================================================
-- QC DASHBOARD - POSTGRESQL SCHEMA
-- Multi-tenant ready for SaaS deployment
-- ============================================================================

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================================================
-- TENANTS (Your Customers - Warehouses/3PLs)
-- ============================================================================
CREATE TABLE tenants (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    company_name VARCHAR(200) NOT NULL,
    subdomain VARCHAR(50) UNIQUE,
    contact_email VARCHAR(255),
    contact_phone VARCHAR(50),
    plan VARCHAR(50) DEFAULT 'basic',  -- basic, pro, enterprise
    wms_type VARCHAR(50),              -- 3pl_central, shiphero, etc.
    wms_api_key TEXT,                  -- encrypted in production
    settings JSONB DEFAULT '{}',
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW(),
    active BOOLEAN DEFAULT TRUE
);

-- ============================================================================
-- USERS
-- ============================================================================
CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
    email VARCHAR(255) NOT NULL,
    password_hash VARCHAR(255),        -- bcrypt hashed
    name VARCHAR(200) NOT NULL,
    role VARCHAR(50) DEFAULT 'inspector',  -- admin, manager, inspector, viewer
    phone VARCHAR(50),
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW(),
    last_login TIMESTAMP,
    active BOOLEAN DEFAULT TRUE,
    UNIQUE(tenant_id, email)
);

-- ============================================================================
-- CLIENTS (Customers of the warehouse)
-- ============================================================================
CREATE TABLE clients (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
    name VARCHAR(200) NOT NULL,
    code VARCHAR(50),
    contact_email VARCHAR(255),
    contact_phone VARCHAR(50),
    sla_target_hours INTEGER DEFAULT 4,
    defect_rate_target DECIMAL(5,2) DEFAULT 2.00,
    created_at TIMESTAMP DEFAULT NOW(),
    active BOOLEAN DEFAULT TRUE,
    UNIQUE(tenant_id, name)
);

-- ============================================================================
-- DEFECT TYPES
-- ============================================================================
CREATE TABLE defect_types (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
    name VARCHAR(100) NOT NULL,
    category VARCHAR(50),  -- damage, wrong_item, quality, packaging, other
    severity VARCHAR(20) DEFAULT 'medium',  -- low, medium, high, critical
    requires_photo BOOLEAN DEFAULT FALSE,
    active BOOLEAN DEFAULT TRUE,
    UNIQUE(tenant_id, name)
);

-- ============================================================================
-- DISPOSITIONS
-- ============================================================================
CREATE TABLE dispositions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
    name VARCHAR(100) NOT NULL,
    code VARCHAR(20),
    description TEXT,
    active BOOLEAN DEFAULT TRUE,
    UNIQUE(tenant_id, name)
);

-- ============================================================================
-- QC INSPECTIONS (Main table)
-- ============================================================================
CREATE TABLE qc_inspections (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
    inspection_id VARCHAR(20) NOT NULL,

    -- Inspection Info
    inspection_type VARCHAR(50) NOT NULL,  -- inbound, outbound, returns, audit
    priority VARCHAR(20) DEFAULT 'normal', -- normal, urgent

    -- Source Reference
    client_id UUID REFERENCES clients(id),
    reference_number VARCHAR(100),         -- PO#, Order#, RMA#

    -- Item Details
    sku VARCHAR(100),
    item_description TEXT,
    lot_number VARCHAR(100),
    expiration_date DATE,

    -- Quantities
    quantity_expected INTEGER,
    quantity_inspected INTEGER,
    quantity_passed INTEGER DEFAULT 0,
    quantity_failed INTEGER DEFAULT 0,

    -- Results
    defect_type_id UUID REFERENCES defect_types(id),
    defect_notes TEXT,
    disposition_id UUID REFERENCES dispositions(id),

    -- Status & Workflow
    status VARCHAR(50) DEFAULT 'pending',  -- pending, in_progress, passed, failed, resolved

    -- Assignment
    assigned_to UUID REFERENCES users(id),

    -- Timestamps
    created_at TIMESTAMP DEFAULT NOW(),
    started_at TIMESTAMP,
    completed_at TIMESTAMP,
    resolved_at TIMESTAMP,

    -- Metrics
    resolution_time_minutes INTEGER,

    -- Additional
    location VARCHAR(100),
    notes TEXT,
    photos JSONB DEFAULT '[]',

    -- Audit
    created_by UUID REFERENCES users(id),
    completed_by UUID REFERENCES users(id),
    resolved_by UUID REFERENCES users(id),

    UNIQUE(tenant_id, inspection_id)
);

-- ============================================================================
-- INSPECTION HISTORY (Audit trail)
-- ============================================================================
CREATE TABLE inspection_history (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    inspection_id UUID REFERENCES qc_inspections(id) ON DELETE CASCADE,
    action VARCHAR(50) NOT NULL,
    old_status VARCHAR(50),
    new_status VARCHAR(50),
    changed_by UUID REFERENCES users(id),
    changed_at TIMESTAMP DEFAULT NOW(),
    notes TEXT
);

-- ============================================================================
-- INDEXES
-- ============================================================================
CREATE INDEX idx_inspections_tenant ON qc_inspections(tenant_id);
CREATE INDEX idx_inspections_status ON qc_inspections(tenant_id, status);
CREATE INDEX idx_inspections_client ON qc_inspections(client_id);
CREATE INDEX idx_inspections_assigned ON qc_inspections(assigned_to);
CREATE INDEX idx_inspections_created ON qc_inspections(created_at DESC);
CREATE INDEX idx_users_tenant ON users(tenant_id);
CREATE INDEX idx_clients_tenant ON clients(tenant_id);

-- ============================================================================
-- ROW LEVEL SECURITY (Multi-tenant isolation)
-- ============================================================================
ALTER TABLE qc_inspections ENABLE ROW LEVEL SECURITY;
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE clients ENABLE ROW LEVEL SECURITY;
ALTER TABLE defect_types ENABLE ROW LEVEL SECURITY;
ALTER TABLE dispositions ENABLE ROW LEVEL SECURITY;

-- ============================================================================
-- FUNCTIONS
-- ============================================================================

-- Generate next inspection ID
CREATE OR REPLACE FUNCTION generate_inspection_id(p_tenant_id UUID)
RETURNS VARCHAR(20) AS $$
DECLARE
    next_num INTEGER;
    result VARCHAR(20);
BEGIN
    SELECT COALESCE(MAX(CAST(SUBSTRING(inspection_id FROM 4) AS INTEGER)), 0) + 1
    INTO next_num
    FROM qc_inspections
    WHERE tenant_id = p_tenant_id;

    result := 'QC-' || LPAD(next_num::TEXT, 5, '0');
    RETURN result;
END;
$$ LANGUAGE plpgsql;

-- Calculate resolution time
CREATE OR REPLACE FUNCTION calculate_resolution_time()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.resolved_at IS NOT NULL AND NEW.created_at IS NOT NULL THEN
        NEW.resolution_time_minutes := EXTRACT(EPOCH FROM (NEW.resolved_at - NEW.created_at)) / 60;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_calc_resolution_time
    BEFORE UPDATE ON qc_inspections
    FOR EACH ROW
    EXECUTE FUNCTION calculate_resolution_time();

-- ============================================================================
-- SEED DATA (Default tenant for testing)
-- ============================================================================

-- Insert default tenant
INSERT INTO tenants (id, company_name, subdomain, plan) VALUES
    ('00000000-0000-0000-0000-000000000001', 'Stacia Americas', 'stacia', 'pro');

-- Insert default defect types
INSERT INTO defect_types (tenant_id, name, category, severity) VALUES
    ('00000000-0000-0000-0000-000000000001', 'Damaged - Crushed', 'damage', 'high'),
    ('00000000-0000-0000-0000-000000000001', 'Damaged - Wet/Water', 'damage', 'high'),
    ('00000000-0000-0000-0000-000000000001', 'Damaged - Torn/Ripped', 'damage', 'medium'),
    ('00000000-0000-0000-0000-000000000001', 'Wrong Item', 'wrong_item', 'high'),
    ('00000000-0000-0000-0000-000000000001', 'Wrong Quantity', 'wrong_item', 'medium'),
    ('00000000-0000-0000-0000-000000000001', 'Expired Product', 'quality', 'critical'),
    ('00000000-0000-0000-0000-000000000001', 'Near Expiration', 'quality', 'medium'),
    ('00000000-0000-0000-0000-000000000001', 'Missing Label', 'packaging', 'low'),
    ('00000000-0000-0000-0000-000000000001', 'Incorrect Label', 'packaging', 'medium'),
    ('00000000-0000-0000-0000-000000000001', 'Other', 'other', 'medium');

-- Insert default dispositions
INSERT INTO dispositions (tenant_id, name, code, description) VALUES
    ('00000000-0000-0000-0000-000000000001', 'Restock', 'RST', 'Return to inventory'),
    ('00000000-0000-0000-0000-000000000001', 'Return to Vendor', 'RTV', 'Send back to supplier'),
    ('00000000-0000-0000-0000-000000000001', 'Destroy', 'DES', 'Dispose of item'),
    ('00000000-0000-0000-0000-000000000001', 'Hold', 'HLD', 'Place on hold for review'),
    ('00000000-0000-0000-0000-000000000001', 'Discount/Salvage', 'SAL', 'Sell at reduced price'),
    ('00000000-0000-0000-0000-000000000001', 'Donate', 'DON', 'Donate to charity');

-- Insert default clients
INSERT INTO clients (tenant_id, name, code) VALUES
    ('00000000-0000-0000-0000-000000000001', 'Pierre Fabre', 'PF'),
    ('00000000-0000-0000-0000-000000000001', 'Yves Rocher', 'YR'),
    ('00000000-0000-0000-0000-000000000001', 'Blue Mercury', 'BM'),
    ('00000000-0000-0000-0000-000000000001', 'Natura', 'NAT'),
    ('00000000-0000-0000-0000-000000000001', 'Granado', 'GRN'),
    ('00000000-0000-0000-0000-000000000001', 'Bears with Benefits', 'BWB');

-- Insert default admin user (password: admin123 - change in production!)
INSERT INTO users (tenant_id, email, password_hash, name, role) VALUES
    ('00000000-0000-0000-0000-000000000001', 'admin@staciamericas.com',
     '$2b$10$rQZ8K3.1234567890abcdef', 'Admin User', 'admin');
