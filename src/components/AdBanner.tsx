import { useEffect } from 'react'

export default function AdBanner() {
  useEffect(() => {
    // Adsterra script load karo - sirf 1 baar
    const containerId = 'adsterra-container-0b7814dca1ed78231bc3fdb19b121245'
    const container = document.getElementById(containerId)
    
    if (container && !container.hasChildNodes()) {
      const script = document.createElement('script')
      script.async = true
      script.setAttribute('data-cfasync', 'false')
      script.src = "https://pl30309571.effectivecpmnetwork.com/0b7814dca1ed78231bc3fdb19b121245/invoke.js"
      container.appendChild(script)
    }
  }, [])

  return (
    <div className="fixed bottom-0 left-0 w-full h- bg-white border-t border-gray-200 shadow-[0_-2px_8px_rgba(0,0,0,0.1)] z-50">
      {/* Content ke upar chadhe nahi isliye */}
      <div 
        id="adsterra-container-0b7814dca1ed78231bc3fdb19b121245" 
        className="w-full h-full flex items-center justify-center"
      ></div>
    </div>
  )
}
