-- 'Azion Technologies LLC' only for now
CREATE TABLE billing_entity (
    billing_entity_id    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name                 VARCHAR(100) NOT NULL,
    country_code         VARCHAR(2) NOT NULL,
    tax_id               VARCHAR(50),
    active               BOOLEAN DEFAULT true,
    created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
INSERT INTO billing_entity (name, country_code, active, created_at)
VALUES ('Azion Technologies LLC', 'US', true, NOW());

-- For now used only for Stripe
CREATE TABLE gateway (
    gateway_id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    billing_entity_id    UUID NOT NULL REFERENCES billing_entity(billing_entity_id),
    name                 VARCHAR(50) NOT NULL,
    provider             VARCHAR(50) NOT NULL,
    active               BOOLEAN DEFAULT true,
    created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
INSERT INTO gateway (name, provider, active, created_at, billing_entity_id)
select 'Stripe', 'stripe', true, NOW(), billing_entity_id from billing_entity;

CREATE TABLE service_order (
    service_order_id     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    account_id           BIGINT NOT NULL,
    type                 VARCHAR(50) NOT NULL,
    status               VARCHAR(20) NOT NULL,
    plan_id              UUID NOT NULL,
    gateway_id           UUID REFERENCES gateway(gateway_id),
    start_date           TIMESTAMPTZ,
    end_date             TIMESTAMPTZ,
    current_period_start TIMESTAMPTZ,
    current_period_end   TIMESTAMPTZ,
    auto_renew           BOOLEAN DEFAULT true,
    ip                   INET NOT NULL,
    port                 INTEGER NOT NULL,
    ip_fwd               INET,
    port_fwd             INTEGER,
    timezone             VARCHAR(50) NOT NULL,
    metadata             JSONB DEFAULT '{}',
    created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_editor          VARCHAR(100)
);

CREATE TABLE plan_transition (
    plan_transition_id   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    service_order_id     UUID NOT NULL REFERENCES service_order(service_order_id),
    from_plan_id         UUID,                    -- null on signup
    to_plan_id           UUID NOT NULL,
    transition_type      VARCHAR(20) NOT NULL,    -- signup, upgrade, downgrade
    status               VARCHAR(20) NOT NULL,    -- pending, completed, failed, canceled
    effective_immediately BOOLEAN NOT NULL,
    prorated             BOOLEAN DEFAULT false,
    scheduled_at         TIMESTAMPTZ,             -- for scheduled downgrades
    started_at           TIMESTAMPTZ,
    completed_at         TIMESTAMPTZ,
    error_message        TEXT,
    created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_editor          VARCHAR(100)
);

CREATE TABLE "order" (
    order_id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    service_order_id     UUID NOT NULL REFERENCES service_order(service_order_id),
    gateway_id           UUID NOT NULL REFERENCES gateway(gateway_id),
    gateway_customer_id  VARCHAR(100),    -- stripe customer_id
    gateway_order_id     VARCHAR(100),    -- stripe subscription_id
    status               VARCHAR(20),
    currency_code        VARCHAR(3),
    next_payment_date    TIMESTAMPTZ,
    last_payment_date    TIMESTAMPTZ,
    last_payment_amount  DECIMAL(12,2),
    coupon_code          VARCHAR(100),
    stripe_coupon_id     VARCHAR(100),
    discount_type        VARCHAR(20),
    discount_value       DECIMAL(12,2),
    discount_applied     DECIMAL(12,2),
    created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE webhook_event (
    webhook_event_id     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    gateway_event_id     VARCHAR(100) UNIQUE NOT NULL,  -- stripe event_id (dedup key)
    event_type           VARCHAR(100) NOT NULL,
    status               VARCHAR(20) NOT NULL,          -- pending, processing, processed, failed
    payload              JSONB NOT NULL,
    gateway_id           UUID REFERENCES gateway(gateway_id),
    error_message        TEXT,
    retry_count          INTEGER DEFAULT 0,
    received_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    processed_at         TIMESTAMPTZ
);

CREATE TABLE outbox (
    outbox_id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    event_type           VARCHAR(100) NOT NULL,    -- 'provision_plan', 'deprovision_plan', 'notify_user'
    aggregate_type       VARCHAR(100) NOT NULL,    -- 'service_order'
    aggregate_id         UUID NOT NULL,            -- service_order_id
    payload              JSONB NOT NULL,
    status               VARCHAR(20) NOT NULL DEFAULT 'pending',  -- pending, processing, completed, failed
    locked_until         TIMESTAMPTZ,              -- lease (null = available)
    retry_count          INTEGER DEFAULT 0,
    max_retries          INTEGER DEFAULT 5,
    error_message        TEXT,
    created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    processed_at         TIMESTAMPTZ
);

-- Outbox: items available for worker
CREATE INDEX idx_outbox_pending ON outbox (created_at)
    WHERE status IN ('pending', 'processing')
    AND (locked_until IS NULL OR locked_until < NOW());

-- Active Service Order ativa per account (only one at a time per type)
CREATE UNIQUE INDEX idx_so_active_plan ON service_order (account_id, type)
    WHERE status IN ('DRAFT', 'ACTIVE', 'PAST_DUE');

-- Order per gateway_order_id (lookup for subscription_id)
CREATE INDEX idx_order_gateway_order ON "order" (gateway_order_id);

-- Webhook event using type and status (processing)
CREATE INDEX idx_webhook_event_status ON webhook_event (status, received_at)
    WHERE status IN ('pending', 'processing');

-- Plan transition per service_order (history)
CREATE INDEX idx_plan_transition_so ON plan_transition (service_order_id, created_at);