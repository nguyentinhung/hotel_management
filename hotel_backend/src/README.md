# Backend layers

The backend uses CommonJS modules and SQL Server. Each folder has one job:

- `routes`: maps HTTP methods and paths to middleware and controller functions.
- `controllers`: reads request parameters/body, calls services, and writes HTTP status and JSON responses.
- `services`: coordinates use cases, calls domain models for rules/normalization, and calls DAOs for persistence.
- `models`: represents domain records and owns reusable domain rules. Models do not execute SQL or handle HTTP.
- `dao`: executes SQL queries and transactions, and maps SQL rows into models.
- `config`: initializes shared infrastructure such as the SQL Server connection.
- `utils/middleware`: reusable Express middleware, including authentication and role checks.

For example, a room type update enters through `routes`, is authorized by middleware, is handled by `roomTypeController`, validated by `RoomTypeModel`, coordinated by `roomTypeService`, and persisted by `roomTypeDao`.
