FROM node:20-alpine AS base
WORKDIR /app

FROM base AS build
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run prisma:generate && npm run build
RUN npm prune --omit=dev

FROM base AS runner
WORKDIR /app
COPY --from=build /app/dist ./dist
COPY --from=build /app/prisma ./prisma
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/package.json ./
EXPOSE 3000
CMD ["node", "dist/src/main"]
