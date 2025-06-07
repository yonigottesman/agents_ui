FROM python:3.11.3
COPY --from=ghcr.io/astral-sh/uv:latest /uv /uvx /bin/

# install cmake and libclang
RUN apt-get update && apt-get install -y cmake libclang-dev

ENV APP_HOME=/root

COPY uv.lock $APP_HOME/
COPY pyproject.toml $APP_HOME/
COPY app $APP_HOME/app


WORKDIR $APP_HOME
RUN uv sync

EXPOSE 8080
CMD ["uv", "run", "fastapi", "run", "app/main.py", "--host", "0.0.0.0", "--port", "8080"]
