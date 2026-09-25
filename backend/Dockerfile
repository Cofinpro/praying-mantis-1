# Production image for the FastAPI backend. Build from backend/:
#   docker build -t praying-mantis-backend .
FROM python:3.12-slim

# No .pyc files, and logs go straight to stdout (so the host shows them live)
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1

WORKDIR /app

# Dependencies first: this layer is cached until requirements.txt changes
COPY requirements.txt .
RUN pip install -r requirements.txt

COPY alembic.ini .
COPY alembic ./alembic
COPY app ./app
COPY start.sh .

# Don't run as root inside the container
RUN useradd --create-home --uid 1000 app
USER app

# Hosts like Render set PORT; 8000 locally
ENV PORT=8000
EXPOSE 8000

CMD ["./start.sh"]
