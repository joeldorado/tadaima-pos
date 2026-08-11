# TadaimaUS — contenedor propio de la tienda (servicio Cloud Run `tadaimaus`).
# Solo estáticos: build de Vite servido por nginx. El POS NO usa este Dockerfile
# (el del root sigue montando la tienda en /tadaimaus/ de su propio contenedor).

FROM node:22-alpine AS build

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund

COPY . .

# URL del backend horneada en el bundle. Default = run.app del POS nuevo
# (permanente, inmune a cambios de DNS/cert del dominio custom). Va como default
# del ARG porque `gcloud run deploy --source` no permite pasar build-args.
ARG VITE_API_URL=https://tadaima-747134907044.us-central1.run.app
RUN VITE_API_URL=${VITE_API_URL} npx vite build

FROM nginx:alpine

COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html

EXPOSE 8080
