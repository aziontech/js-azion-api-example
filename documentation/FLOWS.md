# Fluxos Detalhados — Service Order API

**Data:** 2026-03-10

---

## Regra Geral

- **Síncrono no request**: interação com Stripe, validação via Product API, persistência no DB
- **Assíncrono via outbox → worker**: provisionamento, desprovisionamento, notificações

---

## 1. Signup — Plano Gratuito (Hobby)

```mermaid
sequenceDiagram
    participant FE as Frontend
    participant FN as Function
    participant PA as Product API
    participant DB as Aurora
    participant WK as Worker

    FE->>+FN: POST /api/v1/service-orders<br/>{account_id, plan_id, audit_data}
    FN->>+PA: GET /plans/{plan_id}
    PA-->>-FN: {price_value: 0, type: free}

    FN->>DB: INSERT service_order (status: ACTIVE)
    FN->>DB: INSERT outbox (event: provision_plan)
    FN-->>-FE: {service_order_id, status: ACTIVE}

    Note over WK,FN: ≤5s depois (polling)
    WK->>+FN: GET /internal/v1/outbox/pending
    FN->>DB: UPDATE outbox SET locked_until (lease)
    FN-->>-WK: item
    WK->>+FN: POST /internal/v1/outbox/{id}/process
    FN->>+PA: POST /provision {account_id, plan_id}
    PA-->>-FN: OK
    FN-->>-WK: 200 OK
    WK->>FN: PATCH /internal/v1/outbox/{id}/complete<br/>{status: completed}
```

**Regras:**
- Campos de auditoria (ip, port, timezone) sempre obrigatórios
- Dados fiscais NÃO obrigatórios para plano gratuito
- Sem integração com Stripe
- `gateway_id`, `order` não são criados

---

## 2. Signup — Plano Pago (via Embedded Checkout)

```mermaid
sequenceDiagram
    participant FE as Frontend
    participant FN as Function
    participant PA as Product API
    participant ST as Stripe
    participant DB as Aurora
    participant WK as Worker

    FE->>+FN: POST /api/v1/service-orders<br/>{account_id, plan_id, audit_data, fiscal_data}
    FN->>+PA: GET /plans/{plan_id}
    PA-->>-FN: {price_value: 99, type: paid}

    FN->>DB: INSERT service_order (status: DRAFT)
    FN->>+ST: POST /checkout/sessions<br/>{mode: subscription, price_data, metadata: {service_order_id}}
    ST-->>-FN: {client_secret}
    FN-->>-FE: {service_order_id, client_secret}

    FE->>FE: Monta EmbeddedCheckout
    FE->>ST: Cliente paga (cartão, 3DS, etc.)
    Note over ST: Stripe cria Customer +<br/>Subscription + cobra

    ST->>+FN: POST /webhooks/stripe<br/>checkout.session.completed
    FN->>DB: Dedup (gateway_event_id UNIQUE)
    FN->>DB: UPDATE service_order: DRAFT → ACTIVE
    FN->>DB: INSERT order (customer_id, subscription_id)
    FN->>DB: INSERT plan_transition (signup, completed)
    FN->>DB: INSERT outbox (event: provision_plan)
    FN-->>-ST: 200 OK

    Note over WK,FN: Worker processa outbox
    WK->>+FN: GET /internal/v1/outbox/pending
    FN-->>-WK: item
    WK->>+FN: POST /internal/v1/outbox/{id}/process
    FN->>+PA: POST /provision {account_id, plan_id}
    PA-->>-FN: OK
    FN-->>-WK: 200 OK
    WK->>FN: PATCH /internal/v1/outbox/{id}/complete
```

**Regras:**
- Dados fiscais obrigatórios (tax_id, legal_name, billing_address)
- Checkout Session criada com `mode: 'subscription'`
- `metadata` da session contém `service_order_id` para correlação no webhook
- Stripe cria Customer + Subscription + cobra automaticamente
- Webhook `checkout.session.completed` é o trigger para ativação
- Idempotência via `gateway_event_id` (UNIQUE)

---

## 3. Upgrade Hobby → Pago (via Embedded Checkout)

```mermaid
sequenceDiagram
    participant FE as Frontend
    participant FN as Function
    participant PA as Product API
    participant ST as Stripe
    participant DB as Aurora
    participant WK as Worker

    FE->>+FN: POST /api/v1/service-orders/{id}/upgrade<br/>{new_plan_id}
    FN->>DB: Buscar SO (status: ACTIVE, plan: hobby)
    FN->>+PA: GET /plans/{new_plan_id}
    PA-->>-FN: {sort_order: 20, type: paid}

    FN->>DB: INSERT plan_transition (upgrade, pending)
    FN->>+ST: POST /checkout/sessions<br/>{mode: subscription, metadata: {service_order_id}}
    ST-->>-FN: {client_secret}
    FN-->>-FE: {client_secret}

    FE->>FE: Monta EmbeddedCheckout
    FE->>ST: Cliente paga

    ST->>+FN: POST /webhooks/stripe<br/>checkout.session.completed
    FN->>DB: UPDATE service_order (novo plan_id, ACTIVE)
    FN->>DB: UPSERT order (nova subscription)
    FN->>DB: UPDATE plan_transition → completed
    FN->>DB: INSERT outbox (provision_plan)
    FN-->>-ST: 200 OK

    WK->>FN: Processa outbox → Product API: provisionar
```

**Regras:**
- Cliente Hobby não tem customer/subscription na Stripe → precisa de Embedded Checkout
- Mesmo fluxo do signup pago, mas SO já existe
- Plan transition registra `from_plan_id` (hobby) e `to_plan_id` (novo)

---

## 4. Upgrade Pago → Pago (API server-side)

```mermaid
sequenceDiagram
    participant FE as Frontend
    participant FN as Function
    participant PA as Product API
    participant ST as Stripe
    participant DB as Aurora
    participant WK as Worker

    FE->>+FN: POST /api/v1/service-orders/{id}/upgrade<br/>{new_plan_id}
    FN->>DB: Buscar SO (status: ACTIVE)
    FN->>+PA: GET /plans/{new_plan_id}
    PA-->>-FN: {sort_order: 30}

    FN->>DB: UPDATE SO: ACTIVE → DRAFT (transitório)
    FN->>DB: INSERT plan_transition (pending)

    FN->>+ST: Update Subscription<br/>{proration_behavior: always_invoice}

    alt Stripe OK (pagamento aprovado)
        ST-->>-FN: {status: active, amount_charged}
        FN->>DB: UPDATE SO: DRAFT → ACTIVE (novo plan_id)
        FN->>DB: UPDATE plan_transition → completed
        FN->>DB: INSERT outbox (provision_plan)
        FN-->>FE: {success, amount_charged}
        WK->>FN: Processa outbox → provisionar
    else Stripe falhou (pagamento recusado)
        ST-->>FN: {error: payment_failed}
        FN->>DB: UPDATE SO: DRAFT → ACTIVE (rollback, plan_id anterior)
        FN->>DB: UPDATE plan_transition → failed
        FN-->>-FE: {error: payment_failed}
    end
```

**Regras:**
- Cliente já tem customer + subscription + payment method na Stripe
- Stripe calcula proration automaticamente
- `billing_cycle_anchor: 'unchanged'` — ciclo de cobrança não muda
- Se pagamento falhar: rollback automático para plano anterior
- Durante DRAFT transitório: usuário mantém acesso ao plano anterior

---

## 5. Downgrade (agendado para fim do ciclo)

```mermaid
sequenceDiagram
    participant FE as Frontend
    participant FN as Function
    participant PA as Product API
    participant ST as Stripe
    participant DB as Aurora
    participant WK as Worker

    FE->>+FN: POST /api/v1/service-orders/{id}/downgrade<br/>{new_plan_id}
    FN->>DB: Buscar SO (status: ACTIVE)
    FN->>+PA: POST /validate-downgrade<br/>{from_plan_id, to_plan_id}
    PA-->>-FN: {can_downgrade: true}

    FN->>DB: INSERT plan_transition (downgrade, pending, scheduled_at)
    FN->>+ST: Create Subscription Schedule<br/>{phases: [current→period_end, new→after]}
    ST-->>-FN: {schedule_id}

    FN->>DB: UPDATE SO metadata (downgrade_pending, effective_date)
    FN-->>-FE: {downgrade_scheduled, effective_date}

    Note over ST: ⏳ Fim do ciclo...
    ST->>ST: Processa scheduled change

    ST->>+FN: POST /webhooks/stripe<br/>customer.subscription.updated
    FN->>DB: UPDATE SO (novo plan_id)
    FN->>DB: UPDATE plan_transition → completed
    FN->>DB: INSERT outbox (deprovision_plan)
    FN-->>-ST: 200 OK

    WK->>+FN: Processa outbox
    FN->>+PA: POST /provision/downgrade<br/>{from_plan_id, to_plan_id}
    PA-->>-FN: {deactivated_features: [...]}
    FN-->>-WK: OK
```

**Regras:**
- `new_plan.sort_order < current_plan.sort_order`
- Sem reembolso — acesso ao plano atual até fim do período
- Subscription Schedule com 2 fases: plano atual até `period_end`, plano novo depois
- Cancelamento do downgrade permitido antes da efetivação
- Product API valida se cliente pode fazer downgrade (features em uso)

---

## 6. Cancelamento de Downgrade

```mermaid
sequenceDiagram
    participant FE as Frontend
    participant FN as Function
    participant ST as Stripe
    participant DB as Aurora

    FE->>+FN: DELETE /api/v1/service-orders/{id}/cancel-downgrade
    FN->>DB: Validar downgrade_pending + effective_date > NOW()
    FN->>+ST: Cancel Subscription Schedule
    ST-->>-FN: {status: canceled}

    FN->>DB: Limpar SO metadata (downgrade_pending, effective_date)
    FN->>DB: UPDATE plan_transition → canceled
    FN-->>-FE: {downgrade_canceled, current_plan_maintained}
```

---

## 7. Cancelamento Voluntário

```mermaid
sequenceDiagram
    participant FE as Frontend
    participant FN as Function
    participant ST as Stripe
    participant DB as Aurora
    participant WK as Worker

    FE->>+FN: POST /api/v1/service-orders/{id}/cancel
    FN->>DB: Validar SO (status = ACTIVE)
    FN->>+ST: Cancel Subscription<br/>{cancel_at_period_end: true}
    ST-->>-FN: OK

    FN->>DB: UPDATE SO: ACTIVE → CANCELED
    FN->>DB: INSERT plan_transition (cancelamento)
    FN->>DB: INSERT outbox (notify_user)
    FN-->>-FE: {canceled, access_until: period_end}

    WK->>FN: Processa outbox → notificar usuário

    Note over ST: ⏳ Fim do período pago...

    ST->>+FN: POST /webhooks/stripe<br/>customer.subscription.deleted
    FN->>DB: UPDATE SO metadata (cancelamento efetivado)
    FN->>DB: INSERT outbox (deprovision_plan)
    FN-->>-ST: 200 OK

    WK->>FN: Processa outbox → desprovisionamento
```

**Regras:**
- Acesso mantido até fim do período pago
- Sem reembolso
- `cancel_at_period_end: true` — Stripe cancela no fim do ciclo
- Webhook `customer.subscription.deleted` confirma efetivação

---

## 8. Inadimplência e Grace Period

```mermaid
sequenceDiagram
    participant ST as Stripe
    participant FN as Function
    participant DB as Aurora
    participant WK as Worker
    participant PA as Product API

    ST->>+FN: POST /webhooks/stripe<br/>invoice.payment_failed
    FN->>DB: UPDATE SO: ACTIVE → PAST_DUE
    FN->>DB: INSERT outbox (notify_user: payment_failed)
    FN-->>-ST: 200 OK

    WK->>FN: Processa outbox → notificar usuário

    Note over ST: Stripe Smart Retries<br/>(durante grace period)

    alt Pagamento recuperado
        ST->>+FN: POST /webhooks/stripe<br/>invoice.payment_succeeded
        FN->>DB: UPDATE SO: PAST_DUE → ACTIVE
        FN->>DB: INSERT outbox (notify_user: payment_recovered)
        FN-->>-ST: 200 OK
    else 5 dias sem pagamento
        Note over WK: Job check-grace-period (a cada 60s)
        WK->>+FN: POST /internal/v1/jobs/check-grace-period
        FN->>DB: SELECT WHERE status=PAST_DUE<br/>AND updated_at < NOW()-5days
        FN->>DB: UPDATE SO: PAST_DUE → BLOCKED
        FN->>+ST: Pause Subscription
        ST-->>-FN: OK
        FN->>DB: INSERT outbox (deprovision_plan)
        FN->>DB: INSERT outbox (notify_user: account_blocked)
        FN-->>-WK: OK

        WK->>+FN: Processa outbox
        FN->>+PA: POST /provision {action: block}
        PA-->>-FN: OK
        FN-->>-WK: OK
    end
```

**Regras:**
- Grace period: 5 dias corridos a partir da mudança para PAST_DUE
- Stripe tenta cobrança automaticamente durante o período (Smart Retries)
- Se pagamento recuperado: volta pra ACTIVE automaticamente (via webhook)
- Se expirar: worker bloqueia conta
- Subscription pausada (não cancelada) — preserva histórico para reativação
- Reativação disponível após resolver payment issue

---

## 9. Webhooks Processados

| Webhook | Ação |
|---|---|
| `checkout.session.completed` | SO: DRAFT → ACTIVE, criar order, outbox → provisionar |
| `invoice.payment_succeeded` | Confirmar pagamento, SO → ACTIVE se PAST_DUE |
| `invoice.payment_failed` | SO: ACTIVE → PAST_DUE, outbox → notificar |
| `customer.subscription.updated` | Atualizar order, efetivar downgrade agendado |
| `customer.subscription.deleted` | Efetivar cancelamento, outbox → desprovisionamento |
| `subscription_schedule.created` | Auditoria — confirmar agendamento |
| `subscription_schedule.released` | Confirmar execução de downgrade agendado |

---

## 10. Aplicação de Cupom

```mermaid
sequenceDiagram
    participant FE as Frontend
    participant FN as Function
    participant PA as Product API
    participant ST as Stripe

    FE->>+FN: POST /api/v1/service-orders<br/>{plan_id, coupon_code, ...}
    FN->>+PA: GET /coupons/:code/validate<br/>?plan_id=X&account_id=Y
    alt Cupom válido
        PA-->>-FN: {valid: true, discount_type, discount_value}
        FN->>+ST: POST /checkout/sessions<br/>{discounts: [{coupon: ...}]}
        ST-->>-FN: {client_secret}
        FN-->>FE: {client_secret}
    else Cupom inválido
        PA-->>FN: {valid: false, reason: "expired"}
        FN-->>-FE: {error: invalid_coupon}
    end
```

**Regras:**
- Validação de cupom é responsabilidade da Product API
- Cupom aplicado na Checkout Session (Stripe renderiza desconto)
- Dados do cupom armazenados na order (coupon_code, discount_type, discount_value)
- Cupons mantidos durante upgrades Pago→Pago (Stripe preserva automaticamente)
