import React, { useEffect, useRef, useState } from "react";
export default function HudFrame({ src, title }) {
  const ref = useRef(null),
    [width, setWidth] = useState(640);
  useEffect(() => {
    const observer = new ResizeObserver((entries) =>
      setWidth(entries[0].contentRect.width),
    );
    if (ref.current) observer.observe(ref.current);
    return () => observer.disconnect();
  }, []);
  return (
    <div
      ref={ref}
      style={{
        position: "relative",
        width: "100%",
        aspectRatio: "16 / 9",
        overflow: "hidden",
        background: "var(--input)",
        marginTop: 24,
      }}
    >
      <iframe
        title={title}
        sandbox="allow-scripts allow-same-origin"
        src={src}
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          width: 1920,
          height: 1080,
          transform: `scale(${width / 1920})`,
          transformOrigin: "top left",
          border: 0,
        }}
      />
    </div>
  );
}
