import Link from "next/link";
import { TabBar } from "@/components/TabBar";

/** Shell for every signed-in user page: top bar, content, bottom tabs. */
export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <header className="topbar">
        <Link href="/app" className="brand">
          BeFit<span>Tracker</span>
        </Link>
        <Link href="/account" className="btn btn-ghost btn-small">
          Account
        </Link>
      </header>
      <main id="main" className="container">
        {children}
        <p className="footer-note">
          Nutrition data: Indian Nutrient Databank (Vincent et al., 2024, based on ICMR-NIN IFCT), USDA FoodData
          Central and Open Food Facts (ODbL). Values are approximate and not medical advice.
        </p>
      </main>
      <TabBar />
    </>
  );
}
