# Development and test web server for Hekate (PRD section 9.1).
# It only serves files. It does not build them.
#   /srv/dist  <- dist/            on http://localhost:8081 (asset host)
#   /srv/demo  <- apps/demo/out/   on http://localhost:8080 (demo page)
# Start it with dev/run.sh.
FROM nginx:1.27-alpine

COPY nginx.conf /etc/nginx/nginx.conf

# The container does not need root. Both ports are above 1024.
USER nginx

EXPOSE 8080 8081

CMD ["nginx", "-g", "daemon off;"]
