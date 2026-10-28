# Backend layers

The backend uses CommonJS modules and SQL Server. Each folder has one job:

- `routes`: maps HTTP methods and paths to middleware and controller functions.
- `routes/*Routes.js`: keeps endpoint declarations grouped by feature; `routes/index.js` mounts those routers under `/api`.
- `controllers`: reads request parameters/body, calls services, and writes HTTP status and JSON responses.
- `services`: coordinates use cases, calls domain models for rules/normalization, and calls DAOs for persistence.
- `models`: represents domain records and read projections, and owns reusable domain rules. Models do not execute SQL or handle HTTP.
- `dao`: executes SQL queries and transactions. The convention is to map returned entity rows or calculated query results into the matching model/read model; raw recordsets may be used internally while a DAO is combining query results.
- `config`: initializes shared infrastructure such as the SQL Server connection.
- `middlewares`: reusable Express middleware, including authentication, role checks, and uploads.

Staff updates follow `userRoutes` → `staffController` → `staffService` → `staffDao`. Health checks use a controller-only response because they do not execute business logic or access persisted data.

For example, a room type update enters through `routes`, is authorized by middleware, is handled by `roomTypeController`, validated by `RoomTypeModel`, coordinated by `roomTypeService`, and persisted by `roomTypeDao`. Room availability is a composed read projection rather than a single room record, so `roomDao` maps each result to `RoomAvailabilityModel` instead of `RoomModel`.

## Detail and status endpoints

- `PUT /api/rooms/:roomId/status` uses the existing room status transition rules. Send `current_status` and `status`; only the existing housekeeping/admin transitions are accepted.
- `GET /api/bookings/:bookingId` returns `{ success, booking }`. Customers can only read their own booking; receptionists can read bookings. A missing or non-owned booking returns `404`.
- `GET /api/payments/:paymentCode` returns payment, booking, invoice, and transaction detail fields. Customers can only read their own payment; receptionists and administrators can read payment details.

The existing `/api/rooms/:roomId/cleaning-complete` and `/api/payments/:paymentCode/status` endpoints remain available.
