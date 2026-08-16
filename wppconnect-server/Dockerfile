FROM node:22-alpine AS base
WORKDIR /usr/src/wpp-server
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true

# Install build dependencies and runtime libraries for sharp
RUN apk update && \
    apk add --no-cache \
    vips \
    vips-dev \
    fftw-dev \
    gcc \
    g++ \
    make \
    libc6-compat \
    pkgconfig \
    python3 \
    && rm -rf /var/cache/apk/*

COPY .yarnrc.yml ./
COPY package.json yarn.lock ./

RUN corepack enable && \
    corepack prepare yarn@4.14.1 --activate

# Install dependencies without strict immutable lock check
RUN yarn install

FROM base AS build
WORKDIR /usr/src/wpp-server
COPY . .
RUN yarn build

FROM node:22-alpine AS runtime
WORKDIR /usr/src/wpp-server/
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true
ENV CHROME_BIN=/usr/bin/chromium-browser
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium-browser

# Install runtime dependencies (chromium and graphics libraries)
RUN apk add --no-cache \
    chromium \
    nss \
    freetype \
    harfbuzz \
    ca-certificates \
    ttf-freefont \
    vips \
    fftw

COPY --from=build /usr/src/wpp-server/package.json ./
COPY --from=build /usr/src/wpp-server/node_modules ./node_modules
COPY --from=build /usr/src/wpp-server/dist ./dist

EXPOSE 21465
ENTRYPOINT ["node", "dist/server.js"]
