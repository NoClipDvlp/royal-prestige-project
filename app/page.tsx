import { AppHeader } from "@/components/app-header";
import { Dashboard } from "@/components/dashboard";
import { DensityProvider } from "@/components/ui/density";

export default function Home() {
  return (
    <DensityProvider>
      <AppHeader />
      <Dashboard />
    </DensityProvider>
  );
}
