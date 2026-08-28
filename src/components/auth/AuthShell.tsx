import type { ReactNode } from "react";
import styles from "./EntryPresentation.module.css";

export function Atmosphere() {
  return <div aria-hidden="true" className={styles.atmosphere}><i /><i /><i /></div>;
}

export function Presence({ loading = false }: { loading?: boolean }) {
  if (loading) return <div aria-hidden="true" className={styles.loadingPresence}><span className={styles.loadingCore} /><span className={styles.loadingOrbitA} /><span className={styles.loadingOrbitB} /></div>;
  return <div aria-hidden="true" className={styles.presence}><span className={styles.presenceCore} /><span className={`${styles.orbit} ${styles.orbitA}`} /><span className={`${styles.orbit} ${styles.orbitB}`} /></div>;
}

export function AuthShell({ children }: { children: ReactNode }) {
  return (
    <main className={styles.stage}>
      <Atmosphere />
      <header className={styles.identity}>METRIX</header>
      <div className={styles.authFrame}>
        <Presence />
        <section className={styles.shell}>
          <div className={styles.authContent}>{children}</div>
        </section>
      </div>
    </main>
  );
}
export { styles as entryStyles };
