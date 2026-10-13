# Esportra Air — core reliability audit

13 October 2026. User authorized auditing and improving Air after integrating an economical ADHD/caveman workflow. Work was performed by one agent; no new company proposal or delegation was started. No commit, push or deployment occurred.

## Scope and result

Inspected the runtime data path from main IPC through Fix Data/EventLogger, signed offline storage, HubClient and the existing backend hub/drain contracts. Also checked SignalR URL resolution in the installed SDK, capture renderer/status shape, local runner loading, output stubs, OBS primitives and capture lifecycle boundaries. This is a focused core audit, not a full security certification or complete product implementation.

| Defect | Evidence before change | Repair and verification |
|---|---|---|
| Queue append loss | Drain read a snapshot, awaited delivery, then overwrote the file. New records appended during the await disappeared. | Preserve appended suffix, serialize/coalesce drains, prevent synchronous reentrancy, and replace through an atomic sibling file. Tests cover append during success/failure and overlapping/reentrant delivery. |
| Retry duplicates | HubClient generated a fresh UUID on every delivery attempt. Backend idempotency could not match retries. | Durable queue UUID is reused. Historical signed non-UUID identities map deterministically to a valid UUID. Retry identity verified through actual loopback HTTP. |
| Silent discard | Hub NodeEvent returns without throwing on rejection/no live show; its resolved Promise was treated as delivered. Corrections also used the wrong event type/body. | Send eligible events through existing HTTP drain and remove only when accepted=1/rejected=0. Send corrections through existing show-scoped node-bearer endpoint and require inserted=1. HTTP/network/malformed acknowledgment failures retain records. |
| Wrong correction attribution | Corrections did not preserve the originating show. | New records store showId at creation. Historical records lacking a valid original show/idempotency key remain pending rather than being assigned to a later show. Timestamp is serialized as ISO for the backend DTO. |
| Local-only log traffic | Operator commands/errors were queued despite the backend allowlist. | Keep all events in local log, but queue only supported remote types. Legacy unsupported signed records are retained locally. |
| Startup hub failure | Main supplied WSS to a SignalR builder requiring HTTP(S). Initial failure had no retry and emitted an unhandled EventEmitter error. | Use HTTP(S), normalize legacy WS(S), schedule bounded initial retry delays, clean timers/listeners on disconnect, guard late callbacks and handle absent error listeners. |
| Invalid corrections | NaN, Infinity, fractions, negatives and path-like match codes could reach HUD/queue; null caused an exception. | Reject invalid objects, 32-bit non-negative score values, invalid map indexes/codes and non-string reasons before side effects. HUD request has a timeout. |
| Misleading capture UI | Renderer expected gepFeed/relay fields absent from GET_STATUS; pause/replay buttons only changed local state/flash text. | Read gepActive/lanRelay/hubConnected, show actual listener/consumer/rate data and remove fake controls, latency and buffering claims. No automatic capture start or consent bypass added. |

## Validation

- Initial regression cases reproduced the original queue/URL/correction defects; original capture cases also failed.
- **23 automated tests pass** through `npm test`: queue durability/integrity/concurrency, retry/acknowledgment contract, local HTTP integration, typed correction shape, invalid inputs, local-event filtering, real SignalR URL construction and rendered capture states.
- `npm run build:renderer` passes. This rebuilds the existing ignored renderer bundle; no production package was created.
- JavaScript syntax and whitespace checks passed for changed sources.
- HTTP integration uses a loopback fixture server, synthetic credentials and temporary signed storage. It does not call staging/production or prove real node authorization/database behavior.

No Electron/OBS/Overwolf game session or live backend test was performed. Backend was inspected read-only and remains unchanged. These are locally implemented/tested fixes, not accepted/deployed behavior. Independent review was not newly commissioned under the user's single-agent preference.

## Remaining findings and next work

1. **Rundown publication/application:** web ShowConfig still omits segments/rules and main applies HUD config without loading the local runner. A new preparation/publication/acknowledgment contract is required; do not implement the unapproved full PROJ-061 overhaul implicitly.
2. **Capture activation and output lifecycle:** paired capture-only route lacks a complete activation/consent workflow; output registry/add/key regeneration remain stubs. Capture status is now honest, but these workflows are not made complete by this patch.
3. **Event show attribution:** existing HTTP event drain derives the current live show from the organization. Offline records spanning multiple shows need a backend-approved show-binding contract. Corrections are already tied to their original show.
4. **Queue throughput and multiple processes:** per-record acknowledged HTTP requests can encounter the strict server rate limit; records survive and retry. Batch support and a process-level single-instance/file-lock policy need a separate design. In-process serialization does not protect against arbitrary concurrent external writers.
5. **Development file boundary and packaging:** simulation IPC uses a string-prefix directory guard that needs a real containment check. Electron/dependency security, installer packaging, real-device UI, observer GEP and live OBS/backend behavior remain outside this local certification.

Legacy unscoped corrections and unsupported records are deliberately retained. There is no automatic deletion or fabricated delivery status. The existing backend correction endpoint records audit state; it does not automatically overwrite the official bracket.

## Workflow integration

`i-have-adhd` and `caveman` were copied unchanged from the canonical Claude skills to personal Codex skills. Both canonical company copies, their operating standards, the native company adapter, global Codex instructions and the Air agent entry now default routine audits/fixes to one agent. Required security, scope approvals, independent-review truth and git/deployment consent are preserved. No exact token-saving percentage is claimed.

## Static design continuation

The 66-frame V3 pack is complete at `design/PROJ-061-control-room-v3/` with gallery, PNGs, PDF, editable source and ZIP. Creative review independently approved 22/24. Independent artifact checks passed before the last Medium fixture correction; the reviewer reached the usage limit before final verdict. Coordinator fixed/rechecked that state and all exports. `review/artifact-qa.md` records this limitation without inventing approval.
