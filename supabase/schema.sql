-- ==============================================================================
-- UNIFIED ERP & FIELD MANAGEMENT SYSTEM - SUPABASE SCHEMA MIGRATION
-- Generated for Supabase PostgreSQL
-- ==============================================================================

-- 1. EXTENSIONS
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ==============================================================================
-- 2. CUSTOM ENUM TYPES
-- ==============================================================================

DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'user_role') THEN
        CREATE TYPE public.user_role AS ENUM (
            'admin',
            'management',
            'project_manager',
            'finance',
            'warehouse_pic',
            'field_technician',
            'user'
        );
    END IF;
END $$;

-- Pastikan value 'user' ada di user_role jika tipe sudah pernah dibuat sebelumnya
ALTER TYPE public.user_role ADD VALUE IF NOT EXISTS 'user';

DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'attendance_status') THEN
        CREATE TYPE public.attendance_status AS ENUM (
            'present',
            'sick',
            'leave',
            'alpha',
            'permission'
        );
    END IF;
END $$;

DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'verification_status') THEN
        CREATE TYPE public.verification_status AS ENUM (
            'pending',
            'approved',
            'rejected'
        );
    END IF;
END $$;

DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'project_type') THEN
        CREATE TYPE public.project_type AS ENUM (
            'fo_rollout',
            'ftth',
            'maintenance',
            'civil_work',
            'installation',
            'other'
        );
    END IF;
END $$;

DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'project_status') THEN
        CREATE TYPE public.project_status AS ENUM (
            'planning',
            'in_progress',
            'on_hold',
            'completed',
            'cancelled'
        );
    END IF;
END $$;

DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'target_unit') THEN
        CREATE TYPE public.target_unit AS ENUM (
            'meters',
            'poles',
            'sites',
            'units',
            'lot'
        );
    END IF;
END $$;

DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'expense_category') THEN
        CREATE TYPE public.expense_category AS ENUM (
            'transport',
            'fuel',
            'accommodation',
            'meals',
            'tools_materials',
            'emergency',
            'medical',
            'communication',
            'other'
        );
    END IF;
END $$;

DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'approval_status') THEN
        CREATE TYPE public.approval_status AS ENUM (
            'pending_pm',
            'approved_pm',
            'rejected_pm',
            'pending_finance',
            'approved_finance',
            'rejected_finance',
            'paid'
        );
    END IF;
END $$;

DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'invoice_status') THEN
        CREATE TYPE public.invoice_status AS ENUM (
            'draft',
            'sent',
            'partially_paid',
            'paid',
            'overdue',
            'cancelled'
        );
    END IF;
END $$;

DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'cashflow_type') THEN
        CREATE TYPE public.cashflow_type AS ENUM (
            'inflow',
            'outflow'
        );
    END IF;
END $$;

DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'item_category') THEN
        CREATE TYPE public.item_category AS ENUM (
            'cable',
            'pole',
            'hardware',
            'connector',
            'joint_closure',
            'tool',
            'safety',
            'consumable',
            'active_device',
            'passive_device',
            'other'
        );
    END IF;
END $$;

DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'unit_of_measure') THEN
        CREATE TYPE public.unit_of_measure AS ENUM (
            'pcs',
            'meter',
            'roll',
            'box',
            'set',
            'kg',
            'lot'
        );
    END IF;
END $$;

DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'stock_movement_type') THEN
        CREATE TYPE public.stock_movement_type AS ENUM (
            'inbound',
            'outbound',
            'transfer',
            'adjustment',
            'return'
        );
    END IF;
END $$;

DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'material_request_status') THEN
        CREATE TYPE public.material_request_status AS ENUM (
            'draft',
            'submitted',
            'approved',
            'rejected',
            'in_delivery',
            'fulfilled',
            'cancelled'
        );
    END IF;
END $$;

DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'delivery_status') THEN
        CREATE TYPE public.delivery_status AS ENUM (
            'draft',
            'dispatched',
            'in_transit',
            'delivered',
            'cancelled'
        );
    END IF;
END $$;

-- ==============================================================================
-- 3. TABLES CREATION (ORDERED BY DEPENDENCIES)
-- ==============================================================================

-- 3.1 PROFILES (Integrated with Supabase auth.users)
CREATE TABLE IF NOT EXISTS public.profiles (
    id uuid NOT NULL PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    email text NOT NULL UNIQUE,
    full_name text NOT NULL,
    phone text,
    role public.user_role NOT NULL DEFAULT 'field_technician'::public.user_role,
    division text,
    employee_id text UNIQUE,
    avatar_url text,
    is_active boolean NOT NULL DEFAULT true,
    created_at timestamp with time zone NOT NULL DEFAULT now(),
    updated_at timestamp with time zone NOT NULL DEFAULT now()
);

-- 3.2 OFFICE LOCATIONS
CREATE TABLE IF NOT EXISTS public.office_locations (
    id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    name text NOT NULL,
    address text,
    latitude double precision NOT NULL,
    longitude double precision NOT NULL,
    radius_meters integer NOT NULL DEFAULT 100,
    is_active boolean NOT NULL DEFAULT true,
    created_at timestamp with time zone NOT NULL DEFAULT now(),
    updated_at timestamp with time zone NOT NULL DEFAULT now()
);

-- 3.3 CLIENTS
CREATE TABLE IF NOT EXISTS public.clients (
    id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    code text NOT NULL UNIQUE,
    name text NOT NULL,
    contact_person text,
    contact_phone text,
    contact_email text,
    address text,
    is_active boolean NOT NULL DEFAULT true,
    created_at timestamp with time zone NOT NULL DEFAULT now()
);

-- 3.4 WAREHOUSES
CREATE TABLE IF NOT EXISTS public.warehouses (
    id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    code text NOT NULL UNIQUE,
    name text NOT NULL,
    address text NOT NULL,
    pic_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
    is_active boolean NOT NULL DEFAULT true,
    created_at timestamp with time zone NOT NULL DEFAULT now()
);

-- 3.5 ITEMS
CREATE TABLE IF NOT EXISTS public.items (
    id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    sku text NOT NULL UNIQUE,
    name text NOT NULL,
    category public.item_category NOT NULL,
    uom public.unit_of_measure NOT NULL DEFAULT 'pcs'::public.unit_of_measure,
    min_stock_alert numeric NOT NULL DEFAULT 10,
    specifications jsonb NOT NULL DEFAULT '{}'::jsonb,
    is_active boolean NOT NULL DEFAULT true,
    created_at timestamp with time zone NOT NULL DEFAULT now()
);

-- 3.6 WAREHOUSE STOCKS
CREATE TABLE IF NOT EXISTS public.warehouse_stocks (
    id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    warehouse_id uuid NOT NULL REFERENCES public.warehouses(id) ON DELETE CASCADE,
    item_id uuid NOT NULL REFERENCES public.items(id) ON DELETE CASCADE,
    quantity numeric NOT NULL DEFAULT 0 CHECK (quantity >= 0::numeric),
    reserved_quantity numeric NOT NULL DEFAULT 0 CHECK (reserved_quantity >= 0::numeric),
    updated_at timestamp with time zone NOT NULL DEFAULT now(),
    CONSTRAINT warehouse_stocks_unique UNIQUE (warehouse_id, item_id)
);

-- 3.7 STOCK MOVEMENTS
CREATE TABLE IF NOT EXISTS public.stock_movements (
    id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    reference_number text NOT NULL,
    movement_type public.stock_movement_type NOT NULL,
    warehouse_id uuid NOT NULL REFERENCES public.warehouses(id) ON DELETE CASCADE,
    item_id uuid NOT NULL REFERENCES public.items(id) ON DELETE RESTRICT,
    quantity numeric NOT NULL,
    balance_after numeric NOT NULL DEFAULT 0,
    notes text,
    created_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
    created_at timestamp with time zone NOT NULL DEFAULT now()
);

-- 3.8 ATTENDANCES
CREATE TABLE IF NOT EXISTS public.attendances (
    id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    date date NOT NULL DEFAULT CURRENT_DATE,
    status public.attendance_status NOT NULL DEFAULT 'present'::public.attendance_status,
    clock_in_time timestamp with time zone,
    clock_in_latitude double precision,
    clock_in_longitude double precision,
    clock_in_address text,
    clock_in_photo_url text,
    clock_in_office_id uuid REFERENCES public.office_locations(id) ON DELETE SET NULL,
    clock_in_distance_meters double precision,
    clock_out_time timestamp with time zone,
    clock_out_latitude double precision,
    clock_out_longitude double precision,
    clock_out_address text,
    clock_out_photo_url text,
    notes text,
    verification_status public.verification_status NOT NULL DEFAULT 'approved'::public.verification_status,
    verified_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
    verified_at timestamp with time zone,
    created_at timestamp with time zone NOT NULL DEFAULT now(),
    updated_at timestamp with time zone NOT NULL DEFAULT now()
);

-- 3.9 PROJECTS
CREATE TABLE IF NOT EXISTS public.projects (
    id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    project_code text NOT NULL UNIQUE,
    name text NOT NULL,
    client_id uuid NOT NULL REFERENCES public.clients(id) ON DELETE RESTRICT,
    project_type public.project_type NOT NULL DEFAULT 'fo_rollout'::public.project_type,
    status public.project_status NOT NULL DEFAULT 'planning'::public.project_status,
    project_manager_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
    start_date date,
    end_date date,
    target_unit public.target_unit NOT NULL DEFAULT 'meters'::public.target_unit,
    target_volume numeric NOT NULL DEFAULT 0,
    actual_volume numeric NOT NULL DEFAULT 0,
    progress_percentage numeric NOT NULL DEFAULT 0 CHECK (progress_percentage >= 0::numeric AND progress_percentage <= 100::numeric),
    total_budget numeric NOT NULL DEFAULT 0,
    description text,
    created_at timestamp with time zone NOT NULL DEFAULT now(),
    updated_at timestamp with time zone NOT NULL DEFAULT now()
);

-- 3.10 SITES
CREATE TABLE IF NOT EXISTS public.sites (
    id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
    site_id_ext text NOT NULL,
    name text NOT NULL,
    latitude double precision,
    longitude double precision,
    address text,
    city text,
    province text,
    target_volume numeric NOT NULL DEFAULT 0,
    actual_volume numeric NOT NULL DEFAULT 0,
    progress_percentage numeric NOT NULL DEFAULT 0,
    status text NOT NULL DEFAULT 'pending'::text,
    created_at timestamp with time zone NOT NULL DEFAULT now()
);

-- 3.11 PROJECT MEMBERS
CREATE TABLE IF NOT EXISTS public.project_members (
    id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
    user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    role_in_project text NOT NULL DEFAULT 'field_technician'::text,
    assigned_at timestamp with time zone NOT NULL DEFAULT now(),
    CONSTRAINT project_members_unique UNIQUE (project_id, user_id)
);

-- 3.12 PROJECT MILESTONES
CREATE TABLE IF NOT EXISTS public.project_milestones (
    id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
    name text NOT NULL,
    description text,
    target_date date,
    weight_percentage numeric NOT NULL DEFAULT 0,
    is_completed boolean NOT NULL DEFAULT false,
    completed_at timestamp with time zone,
    created_at timestamp with time zone NOT NULL DEFAULT now()
);

-- 3.13 PROJECT PROGRESS LOGS
CREATE TABLE IF NOT EXISTS public.project_progress_logs (
    id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
    site_id uuid REFERENCES public.sites(id) ON DELETE SET NULL,
    technician_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    log_date date NOT NULL DEFAULT CURRENT_DATE,
    volume_realized numeric NOT NULL DEFAULT 0,
    description text NOT NULL,
    photo_before_url text,
    photo_progress_url text,
    photo_after_url text,
    has_issues boolean NOT NULL DEFAULT false,
    issue_description text,
    created_at timestamp with time zone NOT NULL DEFAULT now()
);

-- 3.14 PROJECT BUDGETS
CREATE TABLE IF NOT EXISTS public.project_budgets (
    id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
    category text NOT NULL,
    budget_amount numeric NOT NULL DEFAULT 0,
    spent_amount numeric NOT NULL DEFAULT 0,
    notes text,
    created_at timestamp with time zone NOT NULL DEFAULT now(),
    updated_at timestamp with time zone NOT NULL DEFAULT now()
);

-- 3.15 EXPENSE CLAIMS
CREATE TABLE IF NOT EXISTS public.expense_claims (
    id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    claim_number text NOT NULL UNIQUE,
    user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    project_id uuid REFERENCES public.projects(id) ON DELETE SET NULL,
    category public.expense_category NOT NULL,
    amount numeric NOT NULL CHECK (amount > 0::numeric),
    expense_date date NOT NULL DEFAULT CURRENT_DATE,
    description text NOT NULL,
    receipt_url text NOT NULL,
    status public.approval_status NOT NULL DEFAULT 'pending_pm'::public.approval_status,
    pm_approved_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
    pm_approved_at timestamp with time zone,
    pm_notes text,
    finance_approved_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
    finance_approved_at timestamp with time zone,
    finance_notes text,
    paid_at timestamp with time zone,
    payment_reference text,
    created_at timestamp with time zone NOT NULL DEFAULT now(),
    updated_at timestamp with time zone NOT NULL DEFAULT now()
);

-- 3.16 INVOICES
CREATE TABLE IF NOT EXISTS public.invoices (
    id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    invoice_number text NOT NULL UNIQUE,
    project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE RESTRICT,
    client_id uuid NOT NULL REFERENCES public.clients(id) ON DELETE RESTRICT,
    milestone_name text NOT NULL,
    amount numeric NOT NULL CHECK (amount >= 0::numeric),
    tax_amount numeric NOT NULL DEFAULT 0,
    total_amount numeric NOT NULL CHECK (total_amount >= 0::numeric),
    issue_date date NOT NULL DEFAULT CURRENT_DATE,
    due_date date NOT NULL,
    status public.invoice_status NOT NULL DEFAULT 'draft'::public.invoice_status,
    paid_amount numeric NOT NULL DEFAULT 0,
    notes text,
    created_at timestamp with time zone NOT NULL DEFAULT now(),
    updated_at timestamp with time zone NOT NULL DEFAULT now()
);

-- 3.17 CASHFLOWS
CREATE TABLE IF NOT EXISTS public.cashflows (
    id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    transaction_number text NOT NULL UNIQUE,
    type public.cashflow_type NOT NULL,
    amount numeric NOT NULL CHECK (amount > 0::numeric),
    date date NOT NULL DEFAULT CURRENT_DATE,
    project_id uuid REFERENCES public.projects(id) ON DELETE SET NULL,
    invoice_id uuid REFERENCES public.invoices(id) ON DELETE SET NULL,
    expense_id uuid REFERENCES public.expense_claims(id) ON DELETE SET NULL,
    account_category text NOT NULL,
    description text NOT NULL,
    created_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
    created_at timestamp with time zone NOT NULL DEFAULT now()
);

-- 3.18 MATERIAL REQUESTS
CREATE TABLE IF NOT EXISTS public.material_requests (
    id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    request_number text NOT NULL UNIQUE,
    project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
    site_id uuid REFERENCES public.sites(id) ON DELETE SET NULL,
    requested_by uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    needed_date date NOT NULL,
    status public.material_request_status NOT NULL DEFAULT 'submitted'::public.material_request_status,
    pm_approved_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
    pm_approved_at timestamp with time zone,
    notes text,
    created_at timestamp with time zone NOT NULL DEFAULT now(),
    updated_at timestamp with time zone NOT NULL DEFAULT now()
);

-- 3.19 MATERIAL REQUEST ITEMS
CREATE TABLE IF NOT EXISTS public.material_request_items (
    id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    material_request_id uuid NOT NULL REFERENCES public.material_requests(id) ON DELETE CASCADE,
    item_id uuid NOT NULL REFERENCES public.items(id) ON DELETE RESTRICT,
    quantity_requested numeric NOT NULL CHECK (quantity_requested > 0::numeric),
    quantity_fulfilled numeric NOT NULL DEFAULT 0 CHECK (quantity_fulfilled >= 0::numeric),
    created_at timestamp with time zone NOT NULL DEFAULT now()
);

-- 3.20 DELIVERY ORDERS
CREATE TABLE IF NOT EXISTS public.delivery_orders (
    id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    delivery_number text NOT NULL UNIQUE,
    material_request_id uuid REFERENCES public.material_requests(id) ON DELETE SET NULL,
    source_warehouse_id uuid NOT NULL REFERENCES public.warehouses(id) ON DELETE RESTRICT,
    destination_project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE RESTRICT,
    destination_site_id uuid REFERENCES public.sites(id) ON DELETE SET NULL,
    driver_name text NOT NULL,
    driver_phone text,
    vehicle_number text NOT NULL,
    status public.delivery_status NOT NULL DEFAULT 'draft'::public.delivery_status,
    dispatched_at timestamp with time zone,
    delivered_at timestamp with time zone,
    recipient_name text,
    recipient_phone text,
    recipient_signature_url text,
    pod_photo_url text,
    pod_notes text,
    created_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
    created_at timestamp with time zone NOT NULL DEFAULT now(),
    updated_at timestamp with time zone NOT NULL DEFAULT now()
);

-- 3.21 DELIVERY ORDER ITEMS
CREATE TABLE IF NOT EXISTS public.delivery_order_items (
    id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    delivery_order_id uuid NOT NULL REFERENCES public.delivery_orders(id) ON DELETE CASCADE,
    item_id uuid NOT NULL REFERENCES public.items(id) ON DELETE RESTRICT,
    quantity numeric NOT NULL CHECK (quantity > 0::numeric)
);

-- ==============================================================================
-- 4. PERFORMANCE INDEXES
-- ==============================================================================

CREATE INDEX IF NOT EXISTS idx_profiles_role ON public.profiles(role);
CREATE INDEX IF NOT EXISTS idx_profiles_email ON public.profiles(email);

CREATE INDEX IF NOT EXISTS idx_attendances_user_id ON public.attendances(user_id);
CREATE INDEX IF NOT EXISTS idx_attendances_date ON public.attendances(date);
CREATE INDEX IF NOT EXISTS idx_attendances_status ON public.attendances(status);

CREATE INDEX IF NOT EXISTS idx_projects_client_id ON public.projects(client_id);
CREATE INDEX IF NOT EXISTS idx_projects_status ON public.projects(status);
CREATE INDEX IF NOT EXISTS idx_projects_pm_id ON public.projects(project_manager_id);

CREATE INDEX IF NOT EXISTS idx_sites_project_id ON public.sites(project_id);

CREATE INDEX IF NOT EXISTS idx_project_members_project ON public.project_members(project_id);
CREATE INDEX IF NOT EXISTS idx_project_members_user ON public.project_members(user_id);

CREATE INDEX IF NOT EXISTS idx_project_milestones_project ON public.project_milestones(project_id);
CREATE INDEX IF NOT EXISTS idx_project_progress_logs_project ON public.project_progress_logs(project_id);
CREATE INDEX IF NOT EXISTS idx_project_progress_logs_tech ON public.project_progress_logs(technician_id);

CREATE INDEX IF NOT EXISTS idx_expense_claims_user_id ON public.expense_claims(user_id);
CREATE INDEX IF NOT EXISTS idx_expense_claims_project_id ON public.expense_claims(project_id);
CREATE INDEX IF NOT EXISTS idx_expense_claims_status ON public.expense_claims(status);

CREATE INDEX IF NOT EXISTS idx_invoices_project_id ON public.invoices(project_id);
CREATE INDEX IF NOT EXISTS idx_invoices_client_id ON public.invoices(client_id);
CREATE INDEX IF NOT EXISTS idx_invoices_status ON public.invoices(status);

CREATE INDEX IF NOT EXISTS idx_cashflows_project_id ON public.cashflows(project_id);
CREATE INDEX IF NOT EXISTS idx_cashflows_date ON public.cashflows(date);

CREATE INDEX IF NOT EXISTS idx_items_sku ON public.items(sku);
CREATE INDEX IF NOT EXISTS idx_items_category ON public.items(category);

CREATE INDEX IF NOT EXISTS idx_warehouse_stocks_wh ON public.warehouse_stocks(warehouse_id);
CREATE INDEX IF NOT EXISTS idx_warehouse_stocks_item ON public.warehouse_stocks(item_id);

CREATE INDEX IF NOT EXISTS idx_stock_movements_wh ON public.stock_movements(warehouse_id);
CREATE INDEX IF NOT EXISTS idx_stock_movements_item ON public.stock_movements(item_id);

CREATE INDEX IF NOT EXISTS idx_material_requests_project ON public.material_requests(project_id);
CREATE INDEX IF NOT EXISTS idx_material_requests_status ON public.material_requests(status);

CREATE INDEX IF NOT EXISTS idx_delivery_orders_mr ON public.delivery_orders(material_request_id);
CREATE INDEX IF NOT EXISTS idx_delivery_orders_status ON public.delivery_orders(status);

-- ==============================================================================
-- 5. AUTOMATED TRIGGERS & FUNCTIONS
-- ==============================================================================

-- 5.1 Updated_at Auto-Updater Function
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger applications for updated_at
DROP TRIGGER IF EXISTS trigger_set_updated_at_profiles ON public.profiles;
CREATE TRIGGER trigger_set_updated_at_profiles
    BEFORE UPDATE ON public.profiles
    FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS trigger_set_updated_at_office_locations ON public.office_locations;
CREATE TRIGGER trigger_set_updated_at_office_locations
    BEFORE UPDATE ON public.office_locations
    FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS trigger_set_updated_at_attendances ON public.attendances;
CREATE TRIGGER trigger_set_updated_at_attendances
    BEFORE UPDATE ON public.attendances
    FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS trigger_set_updated_at_projects ON public.projects;
CREATE TRIGGER trigger_set_updated_at_projects
    BEFORE UPDATE ON public.projects
    FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS trigger_set_updated_at_warehouse_stocks ON public.warehouse_stocks;
CREATE TRIGGER trigger_set_updated_at_warehouse_stocks
    BEFORE UPDATE ON public.warehouse_stocks
    FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS trigger_set_updated_at_project_budgets ON public.project_budgets;
CREATE TRIGGER trigger_set_updated_at_project_budgets
    BEFORE UPDATE ON public.project_budgets
    FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS trigger_set_updated_at_expense_claims ON public.expense_claims;
CREATE TRIGGER trigger_set_updated_at_expense_claims
    BEFORE UPDATE ON public.expense_claims
    FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS trigger_set_updated_at_invoices ON public.invoices;
CREATE TRIGGER trigger_set_updated_at_invoices
    BEFORE UPDATE ON public.invoices
    FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS trigger_set_updated_at_material_requests ON public.material_requests;
CREATE TRIGGER trigger_set_updated_at_material_requests
    BEFORE UPDATE ON public.material_requests
    FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS trigger_set_updated_at_delivery_orders ON public.delivery_orders;
CREATE TRIGGER trigger_set_updated_at_delivery_orders
    BEFORE UPDATE ON public.delivery_orders
    FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 5.2 Auto Create Profile on Auth Signup Trigger
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
DECLARE
    assigned_role public.user_role;
    raw_role text;
BEGIN
    raw_role := LOWER(COALESCE(NEW.raw_user_meta_data->>'role', NEW.raw_app_meta_data->>'role', 'user'));
    
    BEGIN
        assigned_role := raw_role::public.user_role;
    EXCEPTION WHEN OTHERS THEN
        assigned_role := 'field_technician'::public.user_role;
    END;

    INSERT INTO public.profiles (
        id,
        email,
        full_name,
        role
    )
    VALUES (
        NEW.id,
        NEW.email,
        COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.raw_user_meta_data->>'name', split_part(NEW.email, '@', 1)),
        assigned_role
    )
    ON CONFLICT (id) DO UPDATE SET
        full_name = EXCLUDED.full_name,
        role = EXCLUDED.role;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ==============================================================================
-- 6. ROW LEVEL SECURITY (RLS) & BASE POLICIES
-- ==============================================================================

-- Enable RLS on all tables
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.office_locations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.clients ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.warehouses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.warehouse_stocks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.stock_movements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.attendances ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sites ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.project_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.project_milestones ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.project_progress_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.project_budgets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.expense_claims ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cashflows ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.material_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.material_request_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.delivery_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.delivery_order_items ENABLE ROW LEVEL SECURITY;

-- Helper function: Check if current user is admin
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean AS $$
BEGIN
    RETURN EXISTS (
        SELECT 1 FROM public.profiles
        WHERE id = auth.uid() AND role IN ('admin', 'management')
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

-- Default Permissive Policies for Authenticated Users (Read & Write according to app logic)
-- Note: You can customize granular per-role policies as your business logic evolves.

DO $$
DECLARE
    tbl text;
    tables text[] := ARRAY[
        'profiles', 'office_locations', 'clients', 'warehouses', 'items',
        'warehouse_stocks', 'stock_movements', 'attendances', 'projects', 'sites',
        'project_members', 'project_milestones', 'project_progress_logs', 'project_budgets',
        'expense_claims', 'invoices', 'cashflows', 'material_requests',
        'material_request_items', 'delivery_orders', 'delivery_order_items'
    ];
BEGIN
    FOREACH tbl IN ARRAY tables LOOP
        EXECUTE format('DROP POLICY IF EXISTS "Allow authenticated users full access" ON public.%I', tbl);
        EXECUTE format('CREATE POLICY "Allow authenticated users full access" ON public.%I FOR ALL TO authenticated USING (true) WITH CHECK (true)', tbl);
    END LOOP;
END $$;
