# For Railway, Fly.io, or any container host. No dependencies to install.
FROM node:20-alpine
WORKDIR /app
COPY package.json ./
COPY server ./server
COPY dist ./dist
COPY corpus ./corpus
ENV NODE_ENV=production PORT=4173 TRUST_PROXY=1
USER node
EXPOSE 4173
HEALTHCHECK CMD wget -qO- http://127.0.0.1:${PORT}/api/health || exit 1
CMD ["node", "server/index.mjs"]
