# SGFleet frontend

React SPA for the SGFleet admin dashboard and user portal.

**Stack:** React 19, Vite, Tailwind CSS 4, TypeScript, react-query, Chart.js. nginx serves the built SPA and proxies `/api/*`, `/v1/*`, and `/health` to the backend (see `nginx.conf`).

## Development

```bash
npm install
npm run dev # Vite dev server
```

## Checks

```bash
npm run lint # eslint
npm run test # vitest
npm run build # tsc + vite build
npm run format # prettier (TS, TSX, JSON)
npm run format:check
```

Deploy with `./deploy.sh` (rebuilds the image and restarts the frontend container).

See the [root README](../README.md) for the whole system.
