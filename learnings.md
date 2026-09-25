# Learnings

We are trying to learn python, fastAPI with my sql, and react. Anything useful to learn about this techs write here separated by topics, such as react or python.

We're both experienced developers (one from **Vue**, one from **Java**), so skip general frontend/backend basics like HTTP, REST, components or SQL fundamentals. Write down what's **specific to this stack** or **different from what we know**:
- React vs Vue
- Python / FastAPI / SQLAlchemy vs Java / Spring / JPA
- gotchas and idioms of these tools

## React Router (vs vue-router)

- **Route table**: `createBrowserRouter([...])` takes an array of route objects, much like vue-router's `routes`. The main difference is `element: <TrainingsPage />`: you pass a rendered element (JSX), not the component itself (`component: TrainingsPage` in Vue).
- **`<Outlet />` = `<router-view>`**: a parent route's element renders `<Outlet />` where its matched child goes. A route with only `element` and `children` (no `path`) is a **layout route**: it wraps its children without adding a URL segment. That's how every page except `/login` gets the TopBar.
- **`index: true`** marks the child that renders at the parent's own path (like a child with `path: ''` in vue-router). We use it with `<Navigate to="/trainings" replace />` as the redirect for `/`, since routes have no `redirect:` key.
- **`NavLink`** passes `{ isActive }` to a `className` **function** instead of adding a `router-link-active` class for you. It matches child routes too (`/trainings/42` keeps "Trainings" active) unless you pass `end`. It also sets `aria-current="page"`.
- **`useParams()`** is `useRoute().params`. Values are always `string | undefined`, so convert `id` to a number yourself.
- **v8 imports**: there's no `react-router-dom` package anymore. Everything comes from `react-router`, except `RouterProvider`, which comes from `react-router/dom`. Many tutorials still show v6/v7 imports.
- **`basename`**: the router strips it from every URL and adds it to every `<Link>`. We set it to Vite's `import.meta.env.BASE_URL`, so links work under `/` locally and under `/praying-mantis-1/` on GitHub Pages without changing any `to=`.

## React

- **CSS Modules vs Vue `scoped`**: Vite supports `*.module.css` out of the box. `import styles from './TopBar.module.css'` gives an object of **renamed** class names (`styles.bar` → `_bar_x1y2z`), and you apply them with `className={styles.bar}`. Vue's `scoped` keeps your class names and adds a `data-v-*` attribute instead. There's no `:deep()`: to style a child component, give it a `className` prop, or target it structurally (`.nav > *`).
- **Combining classes** is plain string work (`` `${styles.item} ${isActive ? styles.active : ''}` ``). There's no built-in `:class="{ active: isActive }"` object syntax; the `clsx` package adds one if it gets painful.
- **`children` = the default slot**: whatever goes between `<PageHeader>…</PageHeader>` arrives as the `children` prop (type `ReactNode`). Named slots are just more props that take JSX.
- **State that resets itself on navigation**: instead of a `useEffect` that closes the phone menu when the URL changes (a watcher in Vue terms), `TopBar` stores *the path the menu was opened on* and derives `menuOpen = openedAt === pathname`. When the path changes, the menu is closed on the same render, with no extra render and no effect. The React docs call this "you might not need an effect": derive values instead of syncing state.
- **Whitespace in JSX flex items**: `<span> ↗</span>` next to text inside a `display: flex` element loses its leading space, because every child becomes a flex item and the whitespace at the edges of each item is dropped. Use `gap` instead of spaces.

## Python

- **`python-dotenv`**: `load_dotenv()` copies the key/value pairs from `.env` into `os.environ`, and `os.getenv("X", default)` reads them. It does **not** override variables that are already set in the shell. It runs once at import time, so after editing `.env` you must restart the server (`fastapi dev` only reloads on `.py` changes). There's no `application.properties` / profile system like Spring; the `.env` file plays that role. Since BE-0.2 we use **`pydantic-settings`** instead (`app/config.py`): a `BaseSettings` class whose fields are read from env vars / `.env`, **type-converted and validated at startup** (a missing `DB_NAME` crashes immediately with a clear error, not at the first query). Field `db_user` matches env var `DB_USER` (case-insensitive). Closest Java equivalent: a Spring `@ConfigurationProperties` class with `@Validated`.

## FastAPI

- **`APIRouter` + `include_router`**: an `APIRouter` is a group of routes, like a Spring `@RestController` class. `app.include_router(health.router, prefix="/api")` mounts it, and the prefix works like a class-level `@RequestMapping("/api")`, except that it's decided where the router is **included**, not where it's declared. That's how every route gets `/api` from one line in `main.py`.
- `tags=["health"]` on the router only groups the endpoints in the `/docs` page.
- A route declared as `"/"` under the prefix `/api` becomes `/api/`. Calling `/api` (no slash) answers with a **307 redirect** to `/api/`; browsers follow it, but it's an extra round trip, so call the exact path.

## Pydantic vs SQLAlchemy models

- Two kinds of "model" with the same-looking classes, kept in separate folders:
  - **SQLAlchemy models** (`app/models/`) = the **database shape**, like JPA `@Entity` classes.
  - **Pydantic models** (`app/schemas/`) = the **API shape** (request/response bodies), like DTOs. FastAPI validates incoming JSON against them (422 on errors) and generates `/openapi.json` from them.
- Why keep them apart: a `User` row has `password_hash`, but no response schema should ever have that field. If it's not in the schema, it can't leak, even if a router returns the ORM object (use `response_model=`). Same reason you don't return JPA entities from a Spring controller.
- Pydantic can read straight from an ORM object with `model_config = ConfigDict(from_attributes=True)` (like a MapStruct mapping, but automatic by field name).


- **Connection URL**: `dialect+driver://user:password@host:port/database`, e.g. `mysql+pymysql://app:app@127.0.0.1:3306/praying_mantis`. The `+pymysql` part picks the Python driver, a bit like choosing the JDBC driver in a JDBC URL.
- **`create_engine`** doesn't connect yet. It builds a connection **pool** (like HikariCP in Spring) and opens connections lazily on first use. One engine per app; sessions borrow connections from it.
- **`pool_pre_ping=True`**: before handing out a pooled connection, SQLAlchemy runs a cheap ping and silently replaces the connection if it's dead. Without it, the first request after MySQL restarts (or after MySQL's `wait_timeout` closes idle connections) fails with "MySQL server has gone away". Similar to Hikari's connection test / `keepaliveTime`.

## Alembic (migrations)

- Alembic is to SQLAlchemy what **Flyway / Liquibase** are to JPA, but migrations are **Python files** (`op.create_table(...)`) instead of SQL, each with an `upgrade()` and a `downgrade()`.
- The chain is a linked list: each file has a `revision` id and a `down_revision` pointing to its parent. The DB stores the current head in the `alembic_version` table (like `flyway_schema_history`, but only one row).
- **`alembic revision --autogenerate -m "..."`** compares `Base.metadata` (your models) to the live DB and writes the difference. **Always read the generated file**, because autogenerate:
  - can't detect a **rename** (it emits drop column + add column, losing data)
  - misses some changes (e.g. server defaults, some constraint/enum changes, CHECK constraints)
  - only sees models that are **imported**: that's why `app/models/__init__.py` must import every model, and `env.py` imports `app.models`
- `alembic check` exits with an error if the models have changes with no migration. Useful in CI (BE-0.3).
- MySQL DDL is **not transactional** (Alembic logs "Will assume non-transactional DDL"): if a migration fails halfway, the earlier statements stay applied. Keep migrations small.

## MySQL / Docker

- **Named volume** (`mysql-data:` in `docker-compose.yml`) keeps the data outside the container, so `docker compose down` + `up` keeps it. Only `docker compose down -v` deletes it.
- The `MYSQL_DATABASE` / `MYSQL_USER` / `MYSQL_PASSWORD` variables only take effect on the **first** start, when the volume is empty. Changing them later does nothing until you reset with `down -v`.
- Use `127.0.0.1` rather than `localhost` in `DB_HOST`: some MySQL clients treat `localhost` as "use the Unix socket" instead of TCP, which doesn't reach a container.
