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
    """pending -> approved | rejected; pending | approved -> withdrawn.
    waitlisted -> pending (a place opened up) | withdrawn."""

    WAITLISTED = "waitlisted"  # the training was full: waits for a free place, takes no seat
    PENDING = "pending"
    APPROVED = "approved"
    REJECTED = "rejected"
    WITHDRAWN = "withdrawn"


class NotificationType(enum.StrEnum):
    """What happened. FE can pick an icon per type; the message is ready to show."""

    ENROLLMENT_REQUESTED = "enrollment_requested"  # -> the decider (team lead or admins)
    ENROLLMENT_APPROVED = "enrollment_approved"  # -> the requester
    ENROLLMENT_REJECTED = "enrollment_rejected"  # -> the requester
    ENROLLMENT_WITHDRAWN = "enrollment_withdrawn"  # -> the decider (approved ones only)
    TRAINING_CANCELLED = "training_cancelled"  # -> everyone waitlisted, pending or approved
    TRAINING_CHANGED = "training_changed"  # -> everyone waitlisted, pending or approved
    WAITLIST_PROMOTED = "waitlist_promoted"  # -> the person who moved up from the waitlist


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
