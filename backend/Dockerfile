FROM python:3.12-slim

# Prevent bytecode compilation and ensure real-time log flushing
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PORT=8080

WORKDIR /app

# Install dependencies first for optimal layer caching
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy backend application code
COPY . .

# Run as non-root user for container security hardening
RUN adduser --disabled-password --gecos "" integrisuser \
    && chown -R integrisuser:integrisuser /app
USER integrisuser

# Cloud Run listens on $PORT (defaults to 8080)
EXPOSE 8080

# Production ASGI server with native HTTP/2 (h2c) support for Cloud Run >32 MiB uploads
CMD ["sh", "-c", "exec hypercorn app.main:app --bind 0.0.0.0:${PORT} --workers 1"]
