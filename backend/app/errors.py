"""Errors that services raise, and how the API turns them into responses.

Services don't know about HTTP. They raise these, and the handlers registered in
main.py turn them into the agreed formats:
- Conflict        -> 409 {"detail": {"code": "...", "message": "..."}}
- ValidationFailed -> 422 in Pydantic's own format, for checks that need the DB
"""

from fastapi import FastAPI, Request
from fastapi.exception_handlers import request_validation_exception_handler
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse


class Conflict(Exception):
    """A business rule says no. `code` is stable for FE; `message` is for people."""

    def __init__(self, code: str, message: str):
        super().__init__(message)
        self.code = code
        self.message = message


class ValidationFailed(Exception):
    """Invalid input that Pydantic alone couldn't catch (e.g. an id that doesn't exist)."""

    def __init__(self, field: str, message: str, error_type: str, value: object = None):
        super().__init__(message)
        self.error = {"type": error_type, "loc": ("body", field), "msg": message, "input": value}


def register_error_handlers(app: FastAPI) -> None:
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
