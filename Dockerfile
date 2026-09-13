FROM node:24.19.0-bookworm-slim
ENV NODE_ENV=production HOST=0.0.0.0 DATA_DIR=/app/data PORT=3000
WORKDIR /app
COPY --chown=node:node package.json package-lock.json server.mjs ./
COPY --chown=node:node src ./src
COPY --chown=node:node public ./public
COPY --chown=node:node scripts ./scripts
RUN mkdir -p /app/data && chown node:node /app/data
USER node
EXPOSE 3000
CMD ["node", "server.mjs"]
