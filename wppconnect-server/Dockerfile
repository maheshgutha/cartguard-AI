FROM node:20-alpine

WORKDIR /usr/src/wpp-server
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true

# Install build tools, Chromium, and graphics libraries for Puppeteer & Sharp
RUN apk update && \
    apk add --no-cache \
    chromium \
    nss \
    freetype \
    harfbuzz \
    ca-certificates \
    ttf-freefont \
    vips \
    vips-dev \
    fftw-dev \
    gcc \
    g++ \
    make \
    libc6-compat \
    pkgconfig \
    python3 \
    && rm -rf /var/cache/apk/* \
    # Verify chromium binary location
    && which chromium-browser || which chromium || ls /usr/bin/chrom*

# Set the actual chromium path after install
ENV CHROME_BIN=/usr/bin/chromium-browser
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium-browser

COPY package.json ./

# Install dependencies using npm with legacy peer deps for container reliability
RUN npm install --legacy-peer-deps

COPY . .

# Build the TypeScript/Babel server
RUN npm run build

EXPOSE 21465
ENTRYPOINT ["node", "dist/server.js"]
