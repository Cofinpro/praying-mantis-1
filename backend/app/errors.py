"""Errors that services raise, and how the API turns them into responses.

Services don't know about HTTP. They raise these, and the handlers registered in
main.py turn them into the agreed formats:
- NotFound         -> 404 {"detail": "..."}
- Forbidden        -> 403 {"detail": "..."}
- Conflict         -> 409 {"detail": {"code": "...", "message": "..."}}
- ValidationFailed -> 422 in Pydantic's own format, for checks that need the DB
"""

from fastapi import FastAPI, Request
from fastapi.exception_handlers import request_validation_exception_handler
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse


class NotFound(Exception):
    """The thing doesn't exist (or the caller mustn't know it does)."""


class Forbidden(Exception):
    """The caller is known, and isn't allowed to do this."""


class Conflict(Exception):
    """A business rule says no. `code` is stable for FE; `message` is for people."""

    def __init__(self, code: str, message: str):
        super().__init__(message)
        self.code = code
        self.message = message


class ValidationFailed(Exception):
    """Invalid input that Pydantic alone couldn't catch (e.g. an id that doesn't exist)."""

    def __init__(
        self, field: str, message: str, error_type: str, value: object = None, location: str = "body"
    ):
        super().__init__(message)
        # location: "body" or "query", like Pydantic's own errors
        self.error = {"type": error_type, "loc": (location, field), "msg": message, "input": value}


def register_error_handlers(app: FastAPI) -> None:
    @app.exception_handler(NotFound)
    async def not_found_handler(request: Request, error: NotFound) -> JSONResponse:
        return JSONResponse(status_code=404, content={"detail": str(error)})

    @app.exception_handler(Forbidden)
    async def forbidden_handler(request: Request, error: Forbidden) -> JSONResponse:
        return JSONResponse(status_code=403, content={"detail": str(error)})

    @app.exception_handler(Conflict)
    async def conflict_handler(request: Request, error: Conflict) -> JSONResponse:
        return JSONResponse(
            status_code=409, content={"detail": {"code": error.code, "message": error.message}}
        )

    @app.exception_handler(ValidationFailed)
    async def validation_failed_handler(request: Request, error: ValidationFailed) -> JSONResponse:
        # Reuse FastAPI's own 422 handler, so the shape is identical
        return await request_validation_exception_handler(
            request, RequestValidationError([error.error])
        )
