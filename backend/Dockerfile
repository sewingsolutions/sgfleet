FROM python:3.12-slim
WORKDIR /app
RUN apt-get update && apt-get install -y curl docker.io logrotate \
  && mkdir -p /usr/lib/docker/cli-plugins \
  && curl -fsSL https://github.com/docker/compose/releases/latest/download/docker-compose-linux-x86_64 \
    -o /usr/lib/docker/cli-plugins/docker-compose \
  && chmod +x /usr/lib/docker/cli-plugins/docker-compose \
  && rm -rf /var/lib/apt/lists/*
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY app/ ./app/
COPY scripts/entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh
EXPOSE 8000
VOLUME ["/opt/switch"]
ENTRYPOINT ["/entrypoint.sh"]
