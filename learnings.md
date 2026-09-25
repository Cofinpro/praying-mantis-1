# Learnings

We are trying to learn python, fastAPI with my sql, and react. Anything useful to learn about this techs write here separated by topics, such as react or python.

We're both experienced developers (one from **Vue**, one from **Java**), so skip general frontend/backend basics like HTTP, REST, components or SQL fundamentals. Write down what's **specific to this stack** or **different from what we know**:
- React vs Vue
- Python / FastAPI / SQLAlchemy vs Java / Spring / JPA
- gotchas and idioms of these tools

## Python

- **`python-dotenv`**: `load_dotenv()` copies the key/value pairs from `.env` into `os.environ`, and `os.getenv("X", default)` reads them. It does **not** override variables that are already set in the shell. It runs once at import time, so after editing `.env` you must restart the server (`fastapi dev` only reloads on `.py` changes). There's no `application.properties` / profile system like Spring; the `.env` file plays that role. Since BE-0.2 we use **`pydantic-settings`** instead (`app/config.py`): a `BaseSettings` class whose fields are read from env vars / `.env`, **type-converted and validated at startup** (a missing `DB_NAME` crashes immediately with a clear error, not at the first query). Field `db_user` matches env var `DB_USER` (case-insensitive). Closest Java equivalent: a Spring `@ConfigurationProperties` class with `@Validated`.

- **`enum.StrEnum`** (Python 3.11+): enum members that *are* strings, so `Level.JUNIOR == "junior"` is `True` and they serialize to JSON as plain strings. Closer to a Java enum with a `value` field than to a plain Java enum. Iterating the class (`set(Level)`) gives all members.

## FastAPI

- **`APIRouter` + `include_router`**: an `APIRouter` is a group of routes, like a Spring `@RestController` class. `app.include_router(health.router, prefix="/api")` mounts it, and the prefix works like a class-level `@RequestMapping("/api")`, except that it's decided where the router is **included**, not where it's declared. That's how every route gets `/api` from one line in `main.py`.
- `tags=["health"]` on the router only groups the endpoints in the `/docs` page.
- A route declared as `"/"` under the prefix `/api` becomes `/api/`. Calling `/api` (no slash) answers with a **307 redirect** to `/api/`; browsers follow it, but it's an extra round trip, so call the exact path.
- **`app.dependency_overrides[get_db] = lambda: db`**: swaps a dependency for the whole app, without touching the routes. It's FastAPI's version of `@MockBean` / `@TestConfiguration` in Spring, but it's just a dict: set it in a fixture and **clear it afterwards**, or it leaks into the next test.

## pytest

- **Fixtures** replace JUnit's `@BeforeEach` / `@AfterEach` and Spring's test context. A fixture is a function that a test *asks for by parameter name* (`def test_x(client):`). Code before `yield` is setup, code after it is teardown.
- **`scope`** controls how often a fixture runs: `"function"` (default, per test) or `"session"` (once per run, like `@BeforeAll` across all classes). Our `engine` fixture is session-scoped (create the DB once), `db` and `client` are per test.
- Fixtures can depend on other fixtures (`client` → `db` → `engine`). pytest resolves the graph, like DI for tests.
- `conftest.py` is picked up automatically; its fixtures are available to every test in that folder, with no import.
- Plain `assert x == y` is enough: pytest rewrites asserts to show both values on failure, so there's no `assertEquals`/AssertJ.

## Pydantic vs SQLAlchemy models

- Two kinds of "model" with the same-looking classes, kept in separate folders:
  - **SQLAlchemy models** (`app/models/`) = the **database shape**, like JPA `@Entity` classes.
  - **Pydantic models** (`app/schemas/`) = the **API shape** (request/response bodies), like DTOs. FastAPI validates incoming JSON against them (422 on errors) and generates `/openapi.json` from them.
- Why keep them apart: a `User` row has `password_hash`, but no response schema should ever have that field. If it's not in the schema, it can't leak, even if a router returns the ORM object (use `response_model=`). Same reason you don't return JPA entities from a Spring controller.
- Pydantic can read straight from an ORM object with `model_config = ConfigDict(from_attributes=True)` (like a MapStruct mapping, but automatic by field name).


- **Connection URL**: `dialect+driver://user:password@host:port/database`, e.g. `mysql+pymysql://app:app@127.0.0.1:3306/praying_mantis`. The `+pymysql` part picks the Python driver, a bit like choosing the JDBC driver in a JDBC URL.
- **`create_engine`** doesn't connect yet. It builds a connection **pool** (like HikariCP in Spring) and opens connections lazily on first use. One engine per app; sessions borrow connections from it.
- **`pool_pre_ping=True`**: before handing out a pooled connection, SQLAlchemy runs a cheap ping and silently replaces the connection if it's dead. Without it, the first request after MySQL restarts (or after MySQL's `wait_timeout` closes idle connections) fails with "MySQL server has gone away". Similar to Hikari's connection test / `keepaliveTime`.
- **Rollback-per-test** (`tests/conftest.py`): open a connection, `BEGIN`, bind a `Session` to it with `join_transaction_mode="create_savepoint"`, and roll back after the test. Like Spring's `@Transactional` on a test class, except here you wire it up yourself. The savepoint mode matters: without it, a `db.commit()` in the code under test would really commit.
- **Gotcha: `URL.set(database=None)` does not remove the database.** `None` means "leave unchanged" in `URL.set()`. To connect to the server without a database, build the URL with `database=None` from scratch (`settings.url_for(None)`). We only noticed because CI's `app` user has no rights on `praying_mantis`, while the local one does.
- **SQLAlchemy 2.0 typed models**: `name: Mapped[str] = mapped_column(String(100))`. The `Mapped[...]` annotation drives the column: `Mapped[str]` is NOT NULL, `Mapped[int | None]` is nullable. JPA needs `@Column(nullable = false)` for that; here it comes from the type. Type checkers also understand it.
- **Self-referencing relationship** (`User.team_lead` ↔ `User.reports`): on the many-to-one side, `remote_side=[id]` tells SQLAlchemy which side is "the other row", because both ends are the same table. JPA would be `@ManyToOne` + `@OneToMany(mappedBy = "teamLead")` on one entity.
- **`passive_deletes=True`** on `reports`: let the database's `ON DELETE SET NULL` do the work. Without it, deleting a lead makes SQLAlchemy load every report and issue its own `UPDATE ... SET team_lead_id = NULL`.
- **Gotcha: `Enum(MyEnum)` stores the member *names* by default** (`JUNIOR`), not the values (`junior`). Pass `values_callable=lambda e: [m.value for m in e]` (see `app/models/enums.py`). With `native_enum=False` it's a VARCHAR, so changing the list later needs no column rewrite. JPA's `@Enumerated(EnumType.STRING)` has the same names-vs-values trap.
- **Constraint naming convention** on `Base.metadata`: without it, MySQL invents names like `users_ibfk_1`, and a later migration that wants to drop that FK has to guess. With it, the name is predictable (`fk_users_team_lead_id_users`).
- **Idempotent seed**: look rows up by a natural key (email), create the missing ones, update the rest, and link foreign keys in a second pass, so the order of the list doesn't matter. Running it twice gives the same result. It's like a Flyway repeatable migration, but in Python.

## Alembic (migrations)

- Alembic is to SQLAlchemy what **Flyway / Liquibase** are to JPA, but migrations are **Python files** (`op.create_table(...)`) instead of SQL, each with an `upgrade()` and a `downgrade()`.
- The chain is a linked list: each file has a `revision` id and a `down_revision` pointing to its parent. The DB stores the current head in the `alembic_version` table (like `flyway_schema_history`, but only one row).
- **`alembic revision --autogenerate -m "..."`** compares `Base.metadata` (your models) to the live DB and writes the difference. **Always read the generated file**, because autogenerate:
  - can't detect a **rename** (it emits drop column + add column, losing data)
  - misses some changes (e.g. server defaults, some constraint/enum changes, CHECK constraints)
  - only sees models that are **imported**: that's why `app/models/__init__.py` must import every model, and `env.py` imports `app.models`
- `alembic check` exits with an error if the models have changes with no migration. CI runs it after pytest.
- **Real example (BE-1.1):** the autogenerated `downgrade()` for `users` dropped `ix_users_team_lead_id` before the table. MySQL refuses with error 1553 ("needed in a foreign key constraint"), because an FK column must stay indexed. Fix: just `drop_table`. Always run `alembic downgrade -1` once after writing a migration.
- To run migrations on a connection you already have (like the test DB in `conftest.py`), pass it via `alembic_cfg.attributes["connection"]` and let `env.py` use it. That's the pattern from the Alembic cookbook.
- MySQL DDL is **not transactional** (Alembic logs "Will assume non-transactional DDL"): if a migration fails halfway, the earlier statements stay applied. Keep migrations small.

## MySQL / Docker

- **Named volume** (`mysql-data:` in `docker-compose.yml`) keeps the data outside the container, so `docker compose down` + `up` keeps it. Only `docker compose down -v` deletes it.
- The `MYSQL_DATABASE` / `MYSQL_USER` / `MYSQL_PASSWORD` variables only take effect on the **first** start, when the volume is empty. Changing them later does nothing until you reset with `down -v`.
- **Reserved words**: MySQL 8 added window functions, so `lead`, `rank`, `rows`, `groups` are reserved. `SELECT ... AS lead` is a syntax error, and a column named like that needs backticks.
- Use `127.0.0.1` rather than `localhost` in `DB_HOST`: some MySQL clients treat `localhost` as "use the Unix socket" instead of TCP, which doesn't reach a container.
- `/docker-entrypoint-initdb.d/*.sql` scripts run once, on the first start with an empty volume. We inject ours as an **inline Compose `config`** (`configs: … content: |`) instead of bind-mounting a file: on macOS, Docker Desktop may not be allowed to read `~/Desktop` or `~/Documents`, and a bind mount from there fails with "operation not permitted".

## GitHub Actions

- **Service containers** (`services:` in a job) start next to the job before the steps run, like Testcontainers but declared in YAML. With `ports: 3306:3306` the job reaches MySQL at `127.0.0.1:3306`. The `--health-cmd` options make Actions wait until MySQL is ready.
- The `MYSQL_DATABASE` of the service is the DB the `app` user gets rights on. That's why CI's service uses `praying_mantis_test`: pytest needs to drop and recreate it.
- `paths:` filters mean the backend workflow only runs when `backend/**` or the workflow file changes, so FE-only PRs don't wait for it.
