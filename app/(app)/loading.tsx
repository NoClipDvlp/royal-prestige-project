import { DashboardSkeleton } from "@/components/skeletons";

// Placeholder instantáneo al navegar a `/` (home del distribuidor). También es el fallback por defecto
// del grupo (app) para rutas sin su propio loading.tsx (p. ej. /ajustes).
export default function HomeLoading() {
  return <DashboardSkeleton />;
}
