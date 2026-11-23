FROM nginx:alpine
RUN rm -rf /usr/share/nginx/html/*
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY . /usr/share/nginx/html/
RUN rm -f /usr/share/nginx/html/nginx.conf && \
    printf '%s\n' \
      '#!/bin/sh' \
      'set -e' \
      'if [ -n "${API_BASE_URL+x}" ]; then' \
      '  SAFE_URL=$(printf "%s" "$API_BASE_URL" | sed "s/\\\\/\\\\\\\\/g; s/\"/\\\\\"/g")' \
      '  printf "window.ENTELSO_API_BASE = \"%s\";\n" "$SAFE_URL" > /usr/share/nginx/html/config.js' \
      'fi' \
      > /docker-entrypoint.d/40-entelso-config.sh && \
    chmod +x /docker-entrypoint.d/40-entelso-config.sh
EXPOSE 80
HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://127.0.0.1/ || exit 1
