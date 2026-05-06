FROM oven/bun:1.1.40-debian AS deps
WORKDIR /app
COPY package.json ./
RUN bun install --production

FROM oven/bun:1.1.40-debian
WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules
COPY package.json tsconfig.json ./
COPY src ./src
COPY assets ./assets

ENV NODE_ENV=production
ENV PORT=7878
ENV STORAGE_ROOT=/data

EXPOSE 7878
VOLUME ["/data"]

CMD ["bun", "run", "src/index.ts"]
