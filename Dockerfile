# syntax=docker/dockerfile:1

# ==========================================================================
# FHIR RSUD Boltim — Satu Sehat Integration
# Next.js 16 (output: standalone) + Prisma 7 (adapter mariadb, JS murni).
# Runtime butuh Python (tools DICOM: jpg->dcm, verify, patch-acsn) &
# DCMTK / storescu (DICOM router).
# Build: docker build -t fhirrsudboltim-app .
# ==========================================================================

# ---- Stage 1: dependencies -------------------------------------------------
FROM node:20-bookworm-slim AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

# ---- Stage 2: builder ------------------------------------------------------
FROM node:20-bookworm-slim AS builder
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1
COPY --from=deps /app/node_modules ./node_modules
COPY . .

# NEXT_PUBLIC_* di-inline ke bundle browser SAAT BUILD → wajib tersedia di sini.
# Nilainya dilempar oleh docker-compose (dari .env) sebagai build args.
ARG NEXT_PUBLIC_SATU_SEHAT_BASE_URL
ARG NEXT_PUBLIC_SATU_SEHAT_ORG_ID
ENV NEXT_PUBLIC_SATU_SEHAT_BASE_URL=$NEXT_PUBLIC_SATU_SEHAT_BASE_URL \
    NEXT_PUBLIC_SATU_SEHAT_ORG_ID=$NEXT_PUBLIC_SATU_SEHAT_ORG_ID

# Prisma client (driver-adapter mariadb → tanpa engine native).
RUN npx prisma generate
# Next build → .next/standalone (server minimal + node_modules ter-trace).
# Aman tanpa DB hidup: halaman ber-DB (dashboard/analytics) dinamis via cookies().
RUN npm run build

# ---- Stage 3: runner -------------------------------------------------------
FROM node:20-bookworm-slim AS runner
WORKDIR /app

ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000 \
    HOSTNAME=0.0.0.0

# Tools runtime:
#  - python3 + pydicom/pillow/numpy  → /api/tools/jpg-to-dcm, verify-dcm, patch-acsn
#  - python-is-python3               → route spawn "python" (fallback "python3")
#  - dcmtk (storescu)                → /api/tools/send-to-router (DICOM C-STORE)
#  - tini                            → PID 1, reap proses anak yang di-spawn
# Versi paket Python DIPIN di requirements.txt (pydicom 2.4.x wajib — 3.x
# menghapus write_like_original yang dipakai script).
COPY requirements.txt /tmp/requirements.txt
RUN apt-get update \
 && apt-get install -y --no-install-recommends \
      python3 python3-pip python-is-python3 dcmtk ca-certificates tini \
 && pip3 install --break-system-packages --no-cache-dir -r /tmp/requirements.txt \
 && rm -rf /var/lib/apt/lists/* /tmp/requirements.txt

# User non-root (uid/gid 1001 agar tak bentrok dengan user "node" bawaan image).
RUN groupadd --system --gid 1001 nodejs \
 && useradd  --system --uid 1001 --gid nodejs nextjs

# Output standalone + aset statik + berkas runtime.
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static     ./.next/static
COPY --from=builder --chown=nextjs:nodejs /app/public           ./public
# Script Python di-resolve via process.cwd()/scripts → harus di root app.
COPY --from=builder --chown=nextjs:nodejs /app/scripts          ./scripts
# Schema Prisma (referensi runtime) + jaring pengaman client hasil generate.
COPY --from=builder --chown=nextjs:nodejs /app/prisma           ./prisma
COPY --from=builder --chown=nextjs:nodejs /app/node_modules/.prisma ./node_modules/.prisma

USER nextjs
EXPOSE 3000

# Sehat bila halaman login (publik) merespons < 500. Node 20 punya fetch global.
HEALTHCHECK --interval=30s --timeout=5s --start-period=45s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3000)+'/').then(r=>process.exit(r.status<500?0:1)).catch(()=>process.exit(1))"

ENTRYPOINT ["/usr/bin/tini", "--"]
CMD ["node", "server.js"]
