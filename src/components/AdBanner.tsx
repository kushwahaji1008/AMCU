import { useEffect, useState } from "react";

const AD_KEY = "0b7814dca1ed78231bc3fdb19b121245";
const SCRIPT_SRC = `https://pl30309571.effectivecpmnetwork.com/${AD_KEY}/invoke.js`;
const CONTAINER_ID = `container-${AD_KEY}`;

export default function AdBanner() {
  const [adUnavailable, setAdUnavailable] = useState(
    () => typeof navigator !== "undefined" && !navigator.onLine
  );

  useEffect(() => {
    if (typeof navigator !== "undefined" && !navigator.onLine) {
      setAdUnavailable(true);
      return;
    }

    const existingScript = document.querySelector(`script[src="${SCRIPT_SRC}"]`);
    if (existingScript) return;

    const script = document.createElement("script");
    script.src = SCRIPT_SRC;
    script.async = true;
    script.setAttribute("data-cfasync", "false");
    const handleError = () => setAdUnavailable(true);
    script.addEventListener("error", handleError);

    document.body.appendChild(script);
    return () => {
      script.removeEventListener("error", handleError);
    };
  }, []);

  if (adUnavailable) {
    return null;
  }

  return (
    <div className="w-full h-[50px] bg-white dark:bg-stone-900 border-t border-gray-200 dark:border-stone-800 shadow-[0_-2px_8px_rgba(0,0,0,0.05)] overflow-hidden print:hidden">
      <div className="text-center text-[12px] text-gray-500 dark:text-stone-400 font-medium py-1 bg-gray-50 dark:bg-stone-800 border-b border-gray-200 dark:border-stone-700">
        --- Advertisement ---
      </div>
      <div
        id={CONTAINER_ID}
        className="w-full h-full flex items-center justify-center"
      />
    </div>
  );
}
