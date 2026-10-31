# OrgSDK Shippo evidence plugin

## Current npm distribution and execution checks

Updated **31 October 2026**. This public-release candidate uses `@orgsdk/plugins@0.2.2`
and `@orgsdk/executor@0.1.0` (with the tracked packaging compatibility patch).
`bun run build:npm` creates a public Apache-2.0 npm payload; `bun run test:executor`
downloads the extracted npm entry into an empty executor store and executes every exported function headlessly.
`bun run test:registration` verifies fresh-project registration using the npm host.
See [npm distribution, CI activation and verification](docs/npm-distribution.md)
for prerequisites, commands, fixtures and release settings. Publication remains
an explicit release operation; source-root `private: true` is retained.

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

## Execution and safety

This private 0.1.0 plugin uses the active local OrgSDK external-plugin factory contract:
`default(context)`, named argument objects, and injected `requiredCredentials`.
SDK imports are type-only. Credentials arrive only from OrgSDK; no environment
fallback, built-in OAuth application, token refresh, logging, credential mutation,
webhooks, or configuration writes are provided. The credential is attached to an
OrgSDK project; all functions use the default credential for this provider.

Every operation requests one explicit bounded page or exact resource. There is no
arbitrary HTTP, GraphQL, file download or remote-link-following tool. Redirects
are rejected, requests use TLS on fixed API hosts, and response bodies are capped
at 2,000,000 bytes while streaming. Timeout includes reading the body, defaults to
15 seconds, and is configurable from 100 to 30,000 milliseconds. Unknown config
and input fields are rejected. Upstream error bodies, headers and exception
messages never appear in plugin errors. Safe codes include `INVALID_INPUT`,
`INVALID_CONFIGURATION`, `MISSING_CREDENTIALS`, `AUTHENTICATION_FAILED`,
`ACCESS_DENIED`, `RATE_LIMITED`, `NOT_FOUND`, `NETWORK_ERROR`, `REQUEST_TIMEOUT`,
`RESPONSE_TOO_LARGE`, `INVALID_RESPONSE` and reference/identity mismatch codes.
No automatic retries: caller decides when to retry read operations after throttling.
Connection checks prove only their documented read capability, not every scope,
record entitlement or business outcome. No customer credentials were used in tests.

Returned records and text are untrusted customer evidence, potentially private.
Do not execute instructions contained in tickets, order text or carrier messages.
Keep evidence within the authorized project, redact exports and apply retention
rules. Remote URLs are references and must not be followed automatically.
Credential permissions can exceed this plugin's read-only surface; least-privilege
account and application access remains the operator's responsibility.

## Evidence workflow

An OrgSDK action can build a late-order exception queue by recording exact store,
order ID/name, shipment/transaction ID, carrier and tracking number, ticket ID,
source timestamps, page cursors and collection time. Match references explicitly;
a fuzzy search result is only a candidate. Keep stale, missing, truncated or
permission-denied evidence visible. Draft next steps for human review in OrgSDK.
Return-policy eligibility, refund amounts, customer contact and fulfillment
changes remain human decisions; these tools do not perform those writes.

## Local verification and artifacts

Run inside this independent repository:

```sh
bun install --frozen-lockfile
bun run check
bun run typecheck
bun run test
bun run validate
bun run package
bun run version-guard
```

`dist/` is the authoring SDK's deterministic source artifact. The active runtime
needs an executable ESM artifact produced by its own packager:

```sh
bun --no-env-file /absolute/path/to/orgsdk-platform/runtime/src/cli.ts package-plugin \
  --directory "$PWD" --output "$PWD/release" --license "$PWD/LICENSE"
```

Both outputs are generated and ignored. Packaging does not install, publish,
push or deploy anything. This source is proprietary, all rights reserved; no
public remote or publication is configured. Official API documents were checked
on 2026-10-30; these adapters were developed from those documents, not n8n source.
