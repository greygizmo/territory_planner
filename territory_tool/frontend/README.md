# ICP Territory Builder — Frontend

React TypeScript frontend for the ICP Territory Builder. Built with Vite for fast development and modern tooling.

---

## 🚀 Quick Start

```bash
# Install dependencies
npm install

# Start development server
npm run dev

# Build for production
npm run build

# Preview production build
npm run preview
```

The development server runs at **http://localhost:5174**.

---

## 🛠️ Tech Stack

| Technology | Purpose |
|------------|---------|
| **React 18** | UI framework |
| **TypeScript** | Type safety |
| **Vite 5** | Build tool & dev server |
| **Leaflet** | Interactive maps |
| **react-leaflet** | React Leaflet bindings |
| **TopoJSON** | Efficient map geometry |
| **TailwindCSS** | Utility-first styling |

---

## 📁 Structure

```
src/
├── App.tsx              # Main application component
├── App.css              # App-specific styles
├── index.css            # Global styles (Tailwind)
├── main.tsx             # Entry point
├── api/
│   └── client.ts        # API client wrapper
├── components/
│   ├── ControlPanel.tsx   # Settings sidebar
│   ├── MapView.tsx        # Interactive map
│   ├── TerritoryList.tsx  # Territory cards
│   ├── ScenarioTabs.tsx   # Scenario tabs
│   └── InsightsDrawer.tsx # Metrics drawer
└── types/
    └── index.ts         # TypeScript type definitions
```

---

## 🔌 API Integration

The frontend communicates with the backend at `http://localhost:8000`. The API client is in `src/api/client.ts`.

### Key API Calls

| Function | Endpoint | Description |
|----------|----------|-------------|
| `getConfig()` | GET `/config` | Load application configuration |
| `optimize(request)` | POST `/optimize` | Generate optimized scenarios |
| `evaluate(request)` | POST `/evaluate` | Evaluate manual assignments |
| `exportCsv(request)` | POST `/export/csv` | Download CSV export |

---

## 🎨 Components

### `MapView.tsx`
Interactive Leaflet map displaying:
- US states and Canadian provinces from TopoJSON
- Color-coded territory assignments
- Click-to-assign functionality
- Tooltips with unit info
- Locked/seed indicators

### `ControlPanel.tsx`
Settings sidebar with:
- Territory count slider (2-50)
- Granularity toggle (State/ZIP)
- Metric dropdowns
- Country filter
- Industry exclusion
- Optimize button
- Export button

### `TerritoryList.tsx`
Scrollable list of territory cards:
- Territory color indicator
- Primary/secondary values vs ideal
- Account count
- Lock toggle
- Grade distribution summary

### `ScenarioTabs.tsx`
Tab navigation:
- Manual (user-defined)
- Primary (primary-optimized)
- Secondary (secondary-optimized)
- Geographic (region-growing)

### `InsightsDrawer.tsx`
Expandable bottom drawer:
- Global totals
- Fairness comparison table
- Territory detail table
- Contiguity warnings

---

## 🔧 Configuration

### Vite Config (`vite.config.ts`)

```ts
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5174,
  },
})
```

### TailwindCSS (`tailwind.config.js`)

Configured with:
- Custom color palette for territories
- Extended spacing utilities
- Custom component classes

---

## 📝 TypeScript Types

Key types in `src/types/index.ts`:

```typescript
interface ConfigResponse { ... }
interface OptimizeRequest { ... }
interface Scenario { ... }
interface TerritoryStats { ... }
interface FairnessMetrics { ... }
```

---

## 🧪 Development

### Linting

```bash
npm run lint
```

### Type Checking

```bash
npm run build  # Includes tsc type check
```

---

## 📜 License

Internal use only — GoEngineer Inc.
