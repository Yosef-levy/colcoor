# PgBouncer from Alpine packages (1.23.x) plus psql for Compose healthchecks.
# The docker.io/pgbouncer/pgbouncer hub image is unmaintained (max tag 1.15.0).
FROM alpine:3.21

RUN apk add --no-cache pgbouncer postgresql-client \
    && addgroup -S pgbouncer \
    && adduser -S -D -G pgbouncer pgbouncer \
    && mkdir -p /etc/pgbouncer /var/log/pgbouncer /var/run/pgbouncer \
    && chown -R pgbouncer:pgbouncer /etc/pgbouncer /var/log/pgbouncer /var/run/pgbouncer

COPY docker-entrypoint.sh /docker-entrypoint.sh
RUN chmod +x /docker-entrypoint.sh

USER pgbouncer
EXPOSE 6432
ENTRYPOINT ["/bin/sh", "/docker-entrypoint.sh"]
