import { useState } from 'react'

interface BrandProps {
  compact?: boolean
}

export function Brand({ compact = false }: BrandProps) {
  const [logoLoaded, setLogoLoaded] = useState(false)
  const logoUrl = `${import.meta.env.BASE_URL}branding/logo.png`

  return <div className={compact ? 'brand brand-compact' : 'brand logo'}>
    {!logoLoaded && <span className="brand-fallback" aria-hidden="true">SD</span>}
    <img
      className={logoLoaded ? 'brand-image loaded' : 'brand-image'}
      src={logoUrl}
      alt=""
      onLoad={() => setLogoLoaded(true)}
      onError={() => setLogoLoaded(false)}
    />
    <span className="brand-name">SISPDEMANDAS</span>
  </div>
}
