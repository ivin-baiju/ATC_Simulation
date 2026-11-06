FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1

WORKDIR /app

COPY --from=ghcr.io/astral-sh/uv:0.5.20 /uv /uvx /bin/

COPY pyproject.toml uv.lock .python-version ./
COPY atc_sim ./atc_sim
COPY scripts ./scripts

RUN uv sync --frozen --no-dev

EXPOSE 8000

CMD ["uv", "run", "uvicorn", "atc_sim.api.app:app", "--host", "0.0.0.0", "--port", "8000"]
