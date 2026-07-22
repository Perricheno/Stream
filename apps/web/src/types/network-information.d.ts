/** Network Information API — Chrome/Android only; absent on Safari/WebKit (incl. Telegram iOS). */
interface NetworkInformation {
  effectiveType?: "slow-2g" | "2g" | "3g" | "4g";
  downlink?: number;
}

interface Navigator {
  connection?: NetworkInformation;
}
