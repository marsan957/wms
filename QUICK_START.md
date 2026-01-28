# WMS Quick Start Guide

## Installation i Docker

### Steg 1: Lägg till WMS i apps.json

Redigera `/frappe_docker/apps.json` och lägg till:

```json
{
  "url": "file:///workspace/wms",
  "branch": "main"
}
```

Eller om du pushar till Git:
```json
{
  "url": "https://github.com/ditt-repo/wms",
  "branch": "main"
}
```

### Steg 2: Bygg Docker Image

```bash
cd frappe_docker

# Generera base64 av apps.json
export APPS_JSON_BASE64=$(base64 -i apps.json)

# Bygg ny image
docker build \
  --build-arg=FRAPPE_PATH=https://github.com/frappe/frappe \
  --build-arg=FRAPPE_BRANCH=version-16 \
  --build-arg=APPS_JSON_BASE64=$APPS_JSON_BASE64 \
  --tag=custom-wms:16 \
  --file=images/layered/Containerfile .
```

### Steg 3: Uppdatera custom.env

```bash
# I custom.env
CUSTOM_IMAGE=custom-wms
CUSTOM_TAG=16
```

### Steg 4: Starta och Installera

```bash
# Starta containers
docker compose -f compose.custom.yaml up -d

# Installera WMS på din site
docker compose -f compose.custom.yaml exec backend \
  bench --site [ditt-site-namn] install-app wms
```

## Lokal Development Setup

### Med VS Code Dev Container

1. Öppna `frappe_docker/development` i VS Code
2. Klicka "Reopen in Container"
3. I containern:

```bash
# Hämta WMS app
cd /workspace/frappe-bench
bench get-app file:///workspace/wms

# Skapa site (om inte redan finns)
bench new-site dev.localhost --admin-password admin

# Installera ERPNext och WMS
bench --site dev.localhost install-app erpnext
bench --site dev.localhost install-app wms

# Starta utvecklingsserver
bench start
```

### Utan Container (Lokal Bench)

```bash
cd ~/frappe-bench

# Hämta appen
bench get-app /path/to/wms

# Installera på din site
bench --site [sitename] install-app wms

# Starta server
bench start
```

## Första Konfiguration

1. Logga in i ERPNext
2. Gå till **WMS**-modulen (syns i desk efter reload)
3. Öppna **WMS Settings**
4. Aktivera funktioner:
   - Enable Barcode Scanning
   - Enable Route Optimization
   - Auto Create Pick Sessions
   - Auto Create Packing Slips

## Användning

### Optimerad Plockning

1. Skapa en Pick List som vanligt i ERPNext
2. Klicka på **WMS > Optimerad Plockvy**
3. Följ den optimerade rutten
4. Scanna artiklar med streckkodsläsare

### Snabbpackning

1. Öppna en Delivery Note
2. Klicka på **WMS > Snabbpackning**
3. Scanna items när de packas
4. Systemet föreslår optimalt antal paket

### Batch Scanning

1. Öppna en Stock Entry
2. Klicka på **WMS > Batch Scanning**
3. Scanna flera artiklar i följd
4. Slutför när alla är scannade

## Custom Fields (Tilläggsalternativ)

För full funktionalitet kan du lägga till dessa custom fields:

### Pick List
- `wms_total_items` (Int)
- `wms_total_qty` (Float)
- `wms_estimated_minutes` (Float)
- `wms_delivered` (Check)

### Pick List Item (locations)
- `wms_picked_qty` (Float)
- `wms_picked` (Check)

### Delivery Note
- `wms_total_weight` (Float)
- `wms_total_volume` (Float)
- `wms_fragile_items` (Int)
- `wms_require_packing` (Check)

### Delivery Note Item
- `wms_packed_qty` (Float)

### Stock Entry
- `wms_verify_locations` (Check)

### Stock Entry Detail
- `wms_source_location` (Data)

## Felsökning

### Appen syns inte efter installation
```bash
bench --site [sitename] clear-cache
bench --site [sitename] migrate
bench restart
```

### JavaScript laddas inte
```bash
bench build --app wms
bench restart
```

### Permission errors
```bash
bench --site [sitename] set-admin-password admin
bench --site [sitename] add-system-manager [user]
```

## Nästa Steg

1. **Skapa WMS Settings doctype** - För att konfigurera systemet
2. **Skapa WMS Pick Session doctype** - För att tracka picking sessions
3. **Lägg till Warehouse Location master** - För platshantering
4. **Bygg Pick Optimization Page** - Dedikerad plockvy
5. **Bygg Quick Pack Page** - Dedikerad packvy

Se `DEVELOPMENT.md` för guide om hur du skapar dessa komponenter.
