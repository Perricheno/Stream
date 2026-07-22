import { useState } from "react";
import { useServiceStatus } from "./useServiceStatus";
import { ServiceStatusPanel } from "./ServiceStatusPanel";
import styles from "./ServiceStatusIndicator.module.css";

export function ServiceStatusIndicator() {
  const status = useServiceStatus();
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        className={styles.dot}
        data-state={status.state}
        onClick={() => setOpen(true)}
        aria-label="Статус сервиса"
      />
      <ServiceStatusPanel open={open} onOpenChange={setOpen} status={status} />
    </>
  );
}
