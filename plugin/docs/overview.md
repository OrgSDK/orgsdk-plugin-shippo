# OrgSDK Shippo evidence plugin

Read-only existing Shippo transactions, shipment references and tracking evidence.
Uses `https://api.goshippo.com` with the currently documented **2018-02-08**
API version header. No label purchases, rate shopping, refunds, shipment creation,
tracking registration or webhook changes are exposed.

## Setup

1. In your own Shippo account's API portal, open API Configuration > Developer keys
   and generate an appropriate test or live key. Use test credentials initially.
2. Attach provider `shippo` in OrgSDK with secret key `secret_apiKey`. The plugin
   sends `Authorization: ShippoToken <key>` and `SHIPPO-API-VERSION: 2018-02-08`.
3. Configuration is `{}` or `{ "timeoutMs": 15000 }`. Account IDs, hosts and
   credential overrides are intentionally rejected. Managed-account impersonation
   via `SHIPPO-ACCOUNT-ID` is not supported; use a key for the intended account.
4. Call `testConnection({})`. This makes GET `/transactions/?results=1` and proves
   transaction read access only. Shippo's documented API does not offer a suitable
   general current-user identity read here; `identityVerified` is false.

Shippo documents account API keys, not a granular read-only key scope for these
endpoints. Use whatever account/key restrictions Shippo actually provides; this
adapter's read-only surface is not a claim that the underlying key cannot buy
labels elsewhere. The injected key determines account and test/live boundary;
callers cannot override either. Test and live datasets are separate. The plugin
does not rotate credentials, refresh tokens or validate billing entitlements.

## Named functions

| Function           | Arguments                   | Result                                                                |
| ------------------ | --------------------------- | --------------------------------------------------------------------- |
| `testConnection`   | `{}`                        | connection/read access, version, no identity claim                    |
| `listTransactions` | `{page?, pageSize?}`        | projected transactions, count and `nextPage`                          |
| `getTransaction`   | `{id}`                      | exact existing transaction references                                 |
| `listShipments`    | `{page?, pageSize?}`        | existing shipment correlation references                              |
| `getShipment`      | `{id}`                      | existing shipment correlation references                              |
| `getTracking`      | `{carrier, trackingNumber}` | matching carrier/number, transaction, ETA, status and bounded history |

Resource IDs are exactly 32 lowercase hexadecimal characters; `page` is 1–10,000 and
`pageSize` is 1–100 (default 25). Continue by the returned numeric `nextPage`.
The server's `next` URL is never fetched or returned. `hasMore` reports source
continuation; `truncated` is true at the 10,000-page safety ceiling, where
`nextPage` is null. No automatic page traversal.

Transactions retain object IDs/timestamps, status, metadata, order, parcel,
rate/shipment/carrier references and tracking references. Signed label URLs are
excluded. Shipments return identity, timestamps, status, metadata and order
references, without recipient addresses, parcels or rate collections. Correlate
stored order references/metadata against Shopify explicitly: these are optional,
merchant-provided fields, not guaranteed cross-service foreign keys.

`carrier` is a documented Shippo carrier token (e.g. `usps`), lowercase letters,
digits or underscore, at most 64 characters. Tracking numbers accept only letters,
digits, hyphen and underscore, at most 128 characters. Unsupported formats fail
validation; do not rewrite a carrier's number to force acceptance. GET tracking
must return the exact requested carrier and number. It retains the latest 100
history entries as returned by Shippo and sets `historyTruncated`; location data
is excluded. History is evidence of carrier reports, not guaranteed current
physical location. GET tracking does not register a webhook. Existing shipment
retention and carrier availability limit historical evidence (Shippo documents
390-day retrieval limits for shipment objects). API use may be metered by Shippo.

## Official references

- [API overview and version](https://docs.goshippo.com/api-reference/overview)
- [Authentication and key limits](https://docs.goshippo.com/guides/authentication)
- [List existing transactions](https://docs.goshippo.com/api-reference/transactions/list-all-shipping-labels)
- [Retrieve existing transactions](https://docs.goshippo.com/api-reference/transactions/retrieve-a-shipping-label)
- [List shipments](https://docs.goshippo.com/api-reference/shipments/list-all-shipments)
- [Retrieve a shipment and retention](https://docs.goshippo.com/api-reference/shipments/retrieve-a-shipment)
- [GET tracking status](https://docs.goshippo.com/api-reference/tracking-status/get-a-tracking-status)

Private read-only integration. See the repository README for verification and artifact instructions.
