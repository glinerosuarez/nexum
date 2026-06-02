
FROM ghcr.io/astral-sh/uv:python3.11-alpine AS builder

ENV UV_COMPILE_BYTECODE=1
WORKDIR /app

# Install project dependencies early to optimize layer caching
COPY pyproject.toml uv.lock /app/
RUN uv sync --no-install-project --no-dev --frozen

# --- Stage 2: Minimal Runtime ---
FROM python:3.11-alpine

WORKDIR /app

# Create a non-root system user for security compliance
RUN addgroup -S appgroup && adduser -S appuser -G appgroup

# Copy virtual environment binaries and site-packages from builder stage
COPY --from=builder /app/.venv /app/.venv
COPY server.py /app/
COPY infra/ /app/infra/
COPY domain/ /app/domain/
COPY mcp_tools/ /app/mcp_tools/
COPY demo/ /app/demo/
COPY scripts/ /app/scripts/
COPY supabase/migrations/ /app/supabase/migrations/

# Environment configurations to map production routing
ENV PATH="/app/.venv/bin:$PATH"
ENV PYTHONPATH="/app"
ENV PYTHONUNBUFFERED=1
ENV MCP_HOST="0.0.0.0"
ENV MCP_PORT="8000"

EXPOSE 8000

USER appuser

# Launch the SSE server via production entrypoint
ENTRYPOINT ["python", "server.py"]
