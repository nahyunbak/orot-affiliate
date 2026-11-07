# Google Play Billing Webhook Examples

## Notification Types

| Type | Description                            |
| ---- | -------------------------------------- |
| 1    | SUBSCRIPTION_RECOVERED                 |
| 2    | SUBSCRIPTION_RENEWED                   |
| 3    | SUBSCRIPTION_CANCELED                  |
| 4    | SUBSCRIPTION_PURCHASED                 |
| 5    | SUBSCRIPTION_ON_HOLD                   |
| 6    | SUBSCRIPTION_IN_GRACE_PERIOD           |
| 7    | SUBSCRIPTION_RESTARTED                 |
| 12   | SUBSCRIPTION_REVOKED                   |
| 13   | SUBSCRIPTION_EXPIRED                   |
| 20   | SUBSCRIPTION_PENDING_PURCHASE_CANCELED |
| 22   | SUBSCRIPTION_PRICE_CHANGE_CONFIRMED    |

---

## Example: New Subscription (Trial Period)

### Webhook Payload

```json
{
  "version": "1.0",
  "notificationType": 22,
  "purchaseToken": "pbbmaeipijbnffigdmac...",
  "subscriptionId": "com.orot.affiliate"
}
```

### Subscription Details (V2 API Response)

```json
{
  "kind": "androidpublisher#subscriptionPurchaseV2",
  "startTime": "2025-12-29T07:53:37.344Z",
  "regionCode": "KR",
  "subscriptionState": "SUBSCRIPTION_STATE_ACTIVE",
  "latestOrderId": "GPA.3391-6045-0511-11062",
  "testPurchase": {},
  "acknowledgementState": "ACKNOWLEDGEMENT_STATE_ACKNOWLEDGED",
  "lineItems": [
    {
      "productId": "com.orot.affiliate",
      "expiryTime": "2025-12-29T07:56:36.886Z",
      "autoRenewingPlan": {},
      "offerDetails": {},
      "latestSuccessfulOrderId": "GPA.3391-6045-0511-11062"
    }
  ]
}
```

### Parsed Details

```json
{
  "orderId": "GPA.3391-6045-0511-11062",
  "originalOrderId": "GPA.3391-6045-0511-11062",
  "basePlanId": "annual",
  "offerId": "offer-annual",
  "isTrialPeriod": true,
  "expiryDate": "2025-12-29T07:56:36.886Z",
  "autoRenewing": true,
  "subscriptionState": "SUBSCRIPTION_STATE_ACTIVE",
  "cancelReason": null
}
```

---

## Example: User Canceled Subscription

### Webhook Payload

```json
{
  "version": "1.0",
  "notificationType": 3,
  "purchaseToken": "pbbmaeipijbnffigdmac...",
  "subscriptionId": "com.orot.affiliate"
}
```

### Subscription Details (V2 API Response)

```json
{
  "kind": "androidpublisher#subscriptionPurchaseV2",
  "startTime": "2025-12-29T07:53:37.344Z",
  "regionCode": "KR",
  "subscriptionState": "SUBSCRIPTION_STATE_CANCELED",
  "latestOrderId": "GPA.3391-6045-0511-11062",
  "canceledStateContext": {
    "userInitiatedCancellation": {
      "cancelTime": "2025-12-29T07:55:08.435Z"
    }
  },
  "testPurchase": {},
  "acknowledgementState": "ACKNOWLEDGEMENT_STATE_ACKNOWLEDGED",
  "lineItems": [
    {
      "productId": "com.orot.affiliate",
      "expiryTime": "2025-12-29T07:56:36.886Z",
      "autoRenewingPlan": {},
      "offerDetails": {},
      "latestSuccessfulOrderId": "GPA.3391-6045-0511-11062"
    }
  ]
}
```

### Parsed Details

```json
{
  "orderId": "GPA.3391-6045-0511-11062",
  "originalOrderId": "GPA.3391-6045-0511-11062",
  "basePlanId": "annual",
  "offerId": "offer-annual",
  "isTrialPeriod": true,
  "expiryDate": "2025-12-29T07:56:36.886Z",
  "autoRenewing": false,
  "subscriptionState": "SUBSCRIPTION_STATE_CANCELED",
  "cancelReason": "USER_CANCELED"
}
```

---

## Example: Subscription Expired (notificationType: 13)

### Parsed Details

```json
{
  "orderId": "GPA.3391-6045-0511-11062",
  "originalOrderId": "GPA.3391-6045-0511-11062",
  "basePlanId": "annual",
  "offerId": "offer-annual",
  "isTrialPeriod": true,
  "expiryDate": "2025-12-29T07:56:36.886Z",
  "autoRenewing": false,
  "subscriptionState": "SUBSCRIPTION_STATE_EXPIRED",
  "cancelReason": "USER_CANCELED"
}
```

> **Note:** 취소 후 만료일이 지나면 `SUBSCRIPTION_STATE_CANCELED` → `SUBSCRIPTION_STATE_EXPIRED`로 변경됨

---

## Subscription States

| State                              | Description                   |
| ---------------------------------- | ----------------------------- |
| SUBSCRIPTION_STATE_PENDING         | 결제 대기 중                  |
| SUBSCRIPTION_STATE_ACTIVE          | 활성 구독                     |
| SUBSCRIPTION_STATE_PAUSED          | 일시 중지됨                   |
| SUBSCRIPTION_STATE_IN_GRACE_PERIOD | 유예 기간                     |
| SUBSCRIPTION_STATE_ON_HOLD         | 보류 중                       |
| SUBSCRIPTION_STATE_CANCELED        | 취소됨 (만료일까지 사용 가능) |
| SUBSCRIPTION_STATE_EXPIRED         | 만료됨                        |

## Cancel Reasons

| Reason             | Description          |
| ------------------ | -------------------- |
| USER_CANCELED      | 사용자가 직접 취소   |
| SYSTEM_CANCELED    | 시스템에 의해 취소   |
| REPLACED           | 다른 구독으로 대체됨 |
| DEVELOPER_CANCELED | 개발자가 취소        |
