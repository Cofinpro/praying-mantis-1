# Learnings

We are trying to learn python, fastAPI with my sql, and react. Anything useful to learn about this techs write here separated by topics, such as react or python.

We're both experienced developers (one from **Vue**, one from **Java**), so skip general frontend/backend basics like HTTP, REST, components or SQL fundamentals. Write down what's **specific to this stack** or **different from what we know**:
- React vs Vue
- Python / FastAPI / SQLAlchemy vs Java / Spring / JPA
- gotchas and idioms of these tools

## Python

- **`python-dotenv`**: `load_dotenv()` copies the key/value pairs from `.env` into `os.environ`, and `os.getenv("X", default)` reads them. It does **not** override variables that are already set in the shell. It runs once at import time, so after editing `.env` you must restart the server (`fastapi dev` only reloads on `.py` changes). There's no `application.properties` / profile system like Spring; the `.env` file plays that role. (BE-0.2 replaces this with `pydantic-settings`, which adds typing and validation.)

## SQLAlchemy

- **Connection URL**: `dialect+driver://user:password@host:port/database`, e.g. `mysql+pymysql://app:app@127.0.0.1:3306/praying_mantis`. The `+pymysql` part picks the Python driver, a bit like choosing the JDBC driver in a JDBC URL.
- **`create_engine`** doesn't connect yet. It builds a connection **pool** (like HikariCP in Spring) and opens connections lazily on first use. One engine per app; sessions borrow connections from it.
- **`pool_pre_ping=True`**: before handing out a pooled connection, SQLAlchemy runs a cheap ping and silently replaces the connection if it's dead. Without it, the first request after MySQL restarts (or after MySQL's `wait_timeout` closes idle connections) fails with "MySQL server has gone away". Similar to Hikari's connection test / `keepaliveTime`.

## MySQL / Docker

- **Named volume** (`mysql-data:` in `docker-compose.yml`) keeps the data outside the container, so `docker compose down` + `up` keeps it. Only `docker compose down -v` deletes it.
- The `MYSQL_DATABASE` / `MYSQL_USER` / `MYSQL_PASSWORD` variables only take effect on the **first** start, when the volume is empty. Changing them later does nothing until you reset with `down -v`.
- Use `127.0.0.1` rather than `localhost` in `DB_HOST`: some MySQL clients treat `localhost` as "use the Unix socket" instead of TCP, which doesn't reach a container.
