# TadaimaUS — contenedor propio de la tienda (servicio Cloud Run `tadaimaus`).
# Solo estáticos: build de Vite servido por nginx. El POS NO usa este Dockerfile
# (el del root sigue montando la tienda en /tadaimaus/ de su propio contenedor).

FROM node:22-alpine AS build

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund

COPY . .

# URL del backend horneada en el bundle. Va como default del ARG porque
# `gcloud run deploy --source` no permite pasar build-args. Usar el DOMINIO, nunca
# un *.run.app: la URL run.app cambia si el servicio se recrea o cambia de región
# (la de us-central1 murió al mudar el POS a us-east1 el 2026-08-31).
ARG VITE_API_URL=https://tadaimamexico.com
RUN VITE_API_URL=${VITE_API_URL} npx vite build

FROM nginx:alpine

COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html

EXPOSE 8080
