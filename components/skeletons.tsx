import { cn } from "@/lib/cn";

// Skeletons de carga compartidos (Pulido Tanda 2). Una sola fuente para los loading.tsx (placeholder
// instantáneo al navegar) y los <Suspense> in-page (streaming de datos). Misma firma visual que el
// contenido real — NO spinners genéricos: glass + rounded-3xl para tarjetas, bg-fg/10 para barras.
// Todo hereda de las CSS vars del tema → consistente en claro y oscuro.

/** Barra/bloque base de carga: shimmer suave con la forma del contenido. */
export function Skeleton({ className }: { className?: string }) {
  return <div aria-hidden className={cn("animate-pulse rounded-2xl bg-fg/10", className)} />;
}

/** Tarjeta en carga: misma firma glass (borde blanco + sombra + radio) que el contenido real. */
export function SkeletonCard({ className }: { className?: string }) {
  return <div aria-hidden className={cn("glass animate-pulse rounded-3xl", className)} />;
}

/** Encabezado de página en carga (matchea PageTitle: título + subtítulo). */
export function SkeletonHeader() {
  return (
    <div aria-hidden className="space-y-2">
      <Skeleton className="h-7 w-44" />
      <Skeleton className="h-4 w-72 max-w-[80%]" />
    </div>
  );
}

/** Envoltura accesible: anuncia "Cargando" a lectores de pantalla; el contenido visual es aria-hidden. */
function Loading({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div role="status" aria-label="Cargando…" className={className}>
      {children}
      <span className="sr-only">Cargando…</span>
    </div>
  );
}

/* ───────────────────────── Skeletons de CONTENIDO (fallback in-page de cada <Suspense>) ──────────────── */

/** Home `/`: greeting + KPI + tareas de hoy (3 tarjetas). */
export function DashboardSkeleton() {
  return (
    <Loading className="flex flex-col gap-5">
      <SkeletonCard className="h-36" />
      <SkeletonCard className="h-44" />
      <SkeletonCard className="h-48" />
    </Loading>
  );
}

/** `/tareas`: barra de leyenda + timeline por franjas. */
export function BoardSkeleton() {
  return (
    <Loading className="flex flex-col gap-4">
      <SkeletonCard className="h-12" />
      <SkeletonCard className="h-[28rem]" />
    </Loading>
  );
}

/** `/metricas`: selector de rango + tarjeta (ranking más alta que cumplimiento propio). */
export function MetricsSkeleton({ ranking }: { ranking: boolean }) {
  return (
    <Loading className="flex flex-col gap-4">
      <Skeleton className="h-10 w-full" />
      <SkeletonCard className={ranking ? "h-80" : "h-52"} />
    </Loading>
  );
}

/** `/metricas/[userId]`: cabecera de perfil + gráfico de tendencia + breakdown. */
export function ProfileSkeleton() {
  return (
    <Loading className="flex flex-col gap-4">
      <SkeletonCard className="h-24" />
      <SkeletonCard className="h-64" />
      <SkeletonCard className="h-56" />
    </Loading>
  );
}

/** `/admin`: tabs (segmented) + managers. */
export function AdminContentSkeleton() {
  return (
    <Loading className="flex flex-col gap-5">
      <Skeleton className="h-10 w-full" />
      <SkeletonCard className="h-40" />
      <SkeletonCard className="h-64" />
    </Loading>
  );
}

/* ───────────────────────── Skeletons de PÁGINA COMPLETA (loading.tsx: shell + contenido) ─────────────── */

/** loading de `/tareas`: título + day-nav + board. */
export function TareasPageSkeleton() {
  return (
    <div className="flex flex-col gap-4">
      <SkeletonHeader />
      <SkeletonCard className="h-[52px]" />
      <BoardSkeleton />
    </div>
  );
}

/** loading de `/metricas`: neutral (no se conoce el rol aún) — título + selector + tarjeta media. */
export function MetricsPageSkeleton() {
  return (
    <div className="flex flex-col gap-4">
      <SkeletonHeader />
      <Skeleton className="h-10 w-full" />
      <SkeletonCard className="h-72" />
    </div>
  );
}

/** loading de `/metricas/[userId]`: back-link + perfil. */
export function ProfilePageSkeleton() {
  return (
    <div className="flex flex-col gap-4">
      <Skeleton className="h-5 w-24" />
      <SkeletonCard className="h-24" />
      <SkeletonCard className="h-64" />
      <SkeletonCard className="h-56" />
    </div>
  );
}

/** loading de `/admin`: título + tabs + managers. */
export function AdminPageSkeleton() {
  return (
    <div className="flex flex-col gap-5">
      <SkeletonHeader />
      <Skeleton className="h-10 w-full" />
      <SkeletonCard className="h-40" />
      <SkeletonCard className="h-64" />
    </div>
  );
}
