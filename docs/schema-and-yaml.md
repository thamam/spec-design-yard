# System Schema & YAML Syntax Reference

The Spec-Yard maps system architectures directly from a single structured YAML specification. This file serves as the definitive schema and syntax reference for authoring correct architecture designs.

---

## 1. Top-Level Structure

Every architectural specification must start with a top-level `system` object.

```yaml
system:
  name: "My System Name"
  metadata:
    owner: "Architecture Team"
    description: "System specification for core processing services."
    status: "active"
    version: "1.0.0"
  components:
    # list of architectural components goes here...
```

### System Metadata Fields

The top-level `metadata` block provides architectural context and compliance data. It supports the following keys:

| Field | Required | Allowed Values / Formats | Description |
| :--- | :--- | :--- | :--- |
| `owner` | Yes (info) | Non-placeholder string | The architectural owner/team responsible. |
| `description` | Yes (info) | Non-placeholder string | A brief high-level description of what the system does. |
| `status` | No | `draft`, `active`, `deprecated` | The implementation/lifecycle status of the system. |
| `version` | No | Semantic Versioning (e.g., `1.0.0`, `v2.4.1`) | The version tag of this architecture blueprint. |

---

## 2. Component Structure

The `system.components` field is an array of objects. Each object represents an individual service, database, or entry point in your system.

```yaml
system:
  components:
    - id: user_auth
      type: Stage
      name: "Authentication Engine"
      x: 150
      y: 200
      metadata:
        owner: "Security Team"
        description: "Validates OAuth tokens and manages session states."
        status: "active"
        color: "indigo"
      connections:
        - target: session_cache
          label: "writes session"
```

### Component Fields

| Field | Required? | Type | Description |
| :--- | :--- | :--- | :--- |
| `id` | **Yes** | String | A unique identifier for the component. Must consist only of alphanumeric characters, hyphens (`-`), or underscores (`_`). |
| `type` | **Yes** | String | The component classification. Must be one of: `Gateway`, `Stage`, `Store`, or `Brick` (case-insensitive in validation). |
| `name` | No | String | The human-friendly display label used on the visual canvas. |
| `x` | No | Number | The horizontal coordinate on the layout canvas. |
| `y` | No | Number | The vertical coordinate on the layout canvas. |
| `metadata` | No | Object | Contains operational metadata for the component (see details below). |
| `latency` | No | Number/String | Per-component latency (ms) used by the simulator. Equivalent to `metadata.latency`. |
| `throughput` | No | Number/String | Per-component throughput/capacity used by the simulator. Equivalent to `metadata.throughput`. |
| `connections` | No | Array | A list of downstream components to which this component sends data (see details below). |

---

## 3. Component Types Explained

Each component type has specific roles and semantic relationships in your architecture:

1. **`Gateway`**: Ingestion or entry points where external traffic enters the system (e.g., API Gateway, Webhook Listener, Pub/Sub Subscriber).
2. **`Stage`**: Active processing units, microservices, or job runners that transform or compute data (e.g., Digest stage, Auth worker).
3. **`Store`**: Storage engines, databases, queues, or file systems that persist data (e.g., PostgreSQL database, Redis Cache, S3 Bucket).
4. **`Brick`**: Auxiliary utility blocks, shared libraries, or decorators that attach to core components to add middleware, validation, or compliance functions (e.g., Rate Limiter, Schema Validator).

---

## 4. Connections & Data Flows

Downstream connections represent unidirectional data flows. They are defined inside a component’s `connections` list:

```yaml
connections:
  - target: database_primary
    label: "writes user profile"
```

* **`target` (Required):** The `id` of the destination component. It is case-sensitive and must exist in the component list.
* **`label` (Optional):** A string describing what data flows over this connection. Required (or recommended with info status) for `Stage` and `Brick` outputs.

---

## 5. Component Metadata

The `metadata` block on components allows for operational limits and compliance configurations:

```yaml
metadata:
  owner: "Payments Team"
  description: "Processes Visa and Mastercard authorizations."
  status: "active"
  color: "emerald"
  rate_limit: "100 rps"
  buffer: "10MB"
```

* **`color`:** Standardizes visual groups on the canvas. Valid colors are: `indigo`, `purple`, `emerald`, `amber`, `rose`, `sky`, `zinc`, or any valid Hex code (e.g., `#f00` or `#ff00ff`).
* **Rate Limiting Fields:** `rate_limit` (or `rateLimit` / `rate-limit`) can be defined to spec maximum traffic capacity.
* **`buffer` / `throttled`:** Configures buffer sizes or throttle parameters to specify backpressure handling.
* **`latency`:** Declared per-component latency (in milliseconds). Read by the packet-flow simulator when computing cumulative path latency; overrides the simulator's per-type default. May also be set as a top-level component field.
* **`throughput`:** Declared per-component throughput/capacity (requests per second). Read by the simulator to find the bottleneck capacity of a path; overrides the per-type default. May also be set as a top-level component field.
