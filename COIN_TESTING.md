# Coin Testing Guide (Server)

This doc explains how to test the coin flows end-to-end on the **core backend** (google-auth service).

## Base URL
- Use the core backend base URL (not pdf-read).
- Example: `https://google-auth-e4er.onrender.com`
- Mobile app uses `EXPO_PUBLIC_GOOGLE_AUTH_URL` for coin endpoints.

All endpoints below are under `API_BASE_URL/api/v1` unless noted.

## Required Collections
- `coin_users`
- `coin_transactions`
- `generating_jobs_coin`
- `coin_premium` (RevenueCat webhook coin events)

## Auth
All coin endpoints require `Authorization: Bearer <ACCESS_TOKEN>`

## 1) Check Balance
```
GET /api/v1/coins/balance
```
Expected:
- Creates `coin_users/{uid}` if missing.
- Response contains `balance`, `lifetimePurchased`, `lifetimeSpent`.
- Logs: `CoinService get_balance_*` + `RouteLogger` JSON.

## 2) Purchase Verify (manual)
```
POST /api/v1/coins/purchase/verify
{
  "provider": "revenuecat",
  "productId": "coin_100",
  "transactionId": "txn_test_123",
  "platform": "android",
  "coins": 100
}
```
Expected:
- `coin_transactions/{transactionId}` created.
- `coin_users/{uid}.balance += coins`.
- Logs: `verify_purchase_start` and `verify_purchase_result`.

## 3) Spend + Create Job
```
POST /api/v1/coins/spend-and-create-job
{
  "kind": "image",
  "costCoins": 5,
  "input": { "styleId": "v1" },
  "requestId": "req_123"
}
```
Expected:
- If balance < costCoins -> 402 (INSUFFICIENT_COINS).
- Else: `generating_jobs_coin/{jobId}` created, balance reduced on success.
- Logs: `spend_and_create_job_start` and `spend_and_create_job_result`.

## 4) Get Job
```
GET /api/v1/jobs/{jobId}
```
Expected:
- Returns job status/output.
- Logs: `get_job_*`.

## 5) Update Job
```
PATCH /api/v1/jobs/{jobId}
{
  "status": "success",
  "output": { "url": "https://..." }
}
```
Expected:
- Updates `generating_jobs_coin/{jobId}`.
- Logs: `update_job_*`.

## 6) RevenueCat Webhook (coin only)
```
POST /api/v1/webhooks/revenuecat
Authorization: <REVENUECAT_WEBHOOK_SECRET>
{ ... RevenueCat event ... }
```
Expected for coin products (productId starts with `coin_`):
- Writes to `coin_premium` collection.
- Does NOT touch `premiumusers`.
- Logs: `RevenueCat coin event stored to coin_premium`.

Premium (monthly/annual) still writes to `premiumusers` and `premiumusers_logs`.

## Notes
- All metadata is sanitized (undefined values removed) before Firestore writes.
- If you see 404 on coin endpoints, you are hitting pdf-read by mistake.
- Use `LOG_LEVEL=debug` for maximum logs.
