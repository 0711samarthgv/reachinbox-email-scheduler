FROM node:22-alpine AS build
WORKDIR /app
COPY package*.json ./
COPY apps/backend/package.json apps/backend/package.json
COPY apps/backend/tsconfig.json apps/backend/tsconfig.json
COPY apps/backend/prisma apps/backend/prisma
COPY apps/backend/src apps/backend/src
RUN npm install && npm --workspace apps/backend run prisma:generate && npm --workspace apps/backend run build
FROM node:22-alpine
WORKDIR /app
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/apps/backend/dist ./apps/backend/dist
COPY --from=build /app/apps/backend/prisma ./apps/backend/prisma
COPY package.json ./package.json
COPY apps/backend/package.json ./apps/backend/package.json
CMD ["node","apps/backend/dist/server.js"]
