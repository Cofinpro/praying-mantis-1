"""Wait until the database accepts connections (run by start.sh before migrating).

A fresh container can start before DNS or the database is ready, e.g. a remote
host that briefly doesn't resolve. Without this, the first failed connect stops
`alembic upgrade head` and the whole deploy fails.
"""

import sys
import time

from sqlalchemy import text
from sqlalchemy.exc import OperationalError

from app.database import engine

ATTEMPTS = 20
DELAY_SECONDS = 3


def main() -> int:
    for attempt in range(1, ATTEMPTS + 1):
        try:
            with engine.connect() as connection:
                connection.execute(text("SELECT 1"))
            print("Database is ready.")
            return 0
        except OperationalError as error:
            # .orig is the driver's error, e.g. (2003, "Can't connect ...")
            print(f"Database not ready (attempt {attempt}/{ATTEMPTS}): {error.orig}")
            time.sleep(DELAY_SECONDS)
    print("Giving up: the database is still unreachable.")
    return 1


if __name__ == "__main__":
    sys.exit(main())
