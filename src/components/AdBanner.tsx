import { useEffect } from "react";

const AD_KEY = "0b7814dca1ed78231bc3fdb19b121245";
const SCRIPT_SRC = `https://pl30309571.effectivecpmnetwork.com/${AD_KEY}/invoke.js`;
const CONTAINER_ID = `container-${AD_KEY}`;

export default function AdBanner() {
  useEffect(() => {
    // Prevent loading the script multiple times
    const existingScript = document.querySelector(
      `script[src="${SCRIPT_SRC}"]`
    );

    if (existingScript) return;

    const script = document.createElement("script");
    script.src = SCRIPT_SRC;
    script.async = true;
    script.setAttribute("data-cfasync", "false");

    document.body.appendChild(script);
  }, []);

  return (
    <div className="w-full h-[50px] bg-white border-t border-gray-200 shadow-[0_-2px_8px_rgba(0,0,0,0.05)] overflow-hidden">
      <div
        id={CONTAINER_ID}
        className="w-full h-full flex items-center justify-center"
      />
    </div>
  );
}
