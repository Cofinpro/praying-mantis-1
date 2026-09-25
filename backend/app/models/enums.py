import enum

from sqlalchemy import Enum


class Client(enum.StrEnum):
    """The client a user works for. Also used for seat zones."""

    DKB = "DKB"
    DEKA = "Deka"
    VV = "VV"
    DBIS = "DBIS"
    UNION = "UNION"


class Level(enum.StrEnum):
    """Seniority, in order from junior to senior architect."""

    JUNIOR = "junior"
    EXPERT = "expert"
    SENIOR = "senior"
    ARCHITECT = "architect"
    SENIOR_ARCHITECT = "senior_architect"


class EnrollmentStatus(enum.StrEnum):
    """pending -> approved | rejected; pending | approved -> withdrawn."""

    PENDING = "pending"
    APPROVED = "approved"
    REJECTED = "rejected"
    WITHDRAWN = "withdrawn"


def enum_column(enum_class: type[enum.Enum]) -> Enum:
    """A VARCHAR column that stores the enum's *values* ("junior"), not its names ("JUNIOR").

    native_enum=False: a VARCHAR instead of a MySQL ENUM, so adding a value later
    doesn't mean rewriting the column. length=32 leaves room for longer values.
    """
    return Enum(
        enum_class,
        native_enum=False,
        length=32,
        values_callable=lambda members: [member.value for member in members],
    )
