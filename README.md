# WMS - Warehouse Management System Optimization

Optimerad plock- och pack-funktionalitet för ERPNext.

## Funktioner

- Optimerad plockvy med barcode scanning
- Intelligent plockruttsoptimering
- Snabb pack-interface
- Real-time uppdateringar
- Integration med standard ERPNext Pick List och Delivery Note

## Installation

### Docker Development

1. Lägg till i `frappe_docker/development/apps-example.json`:
```json
{
  "url": "file:///workspace/development/frappe-bench/apps/wms",
  "branch": "main"
}
```

2. Bygg om Docker image:
```bash
docker compose -f compose.custom.yaml build
```

3. Installera appen på din site:
```bash
bench --site [sitename] install-app wms
```

### Lokal Development

```bash
cd frappe-bench
bench get-app /path/to/wms
bench --site [sitename] install-app wms
```

## Användning

1. Öppna en Pick List
2. Klicka på "Optimerad Plockvy" knappen
3. Följ den optimerade plockrutten
4. Scanna items med barcode scanner
5. Slutför och gå vidare till packning

## Konfiguration

Inställningar finns under: **WMS Settings**

## Licens

MIT
