import React from "react";
/** Official bundled Esportra artwork. Kept local for offline production. */
export default function BrandLogo() {
  return (
    <div className="workspace-brand" aria-label="Esportra Air">
      <img
        className="brand-symbol"
        src="../../assets/brand/esportra-mark.png"
        alt="Esportra logo"
      />
      <div>
        <img
          className="brand-wordmark"
          src="../../assets/brand/esportra-wordmark.png"
          alt="Esportra"
        />
        <span className="brand-product">AIR / PRODUCTION</span>
      </div>
    </div>
  );
}
