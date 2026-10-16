import React, { useEffect, useRef, useState } from "react";
export default function TemplatePreview({
  item,
  matchCode,
  onMove,
  disabled,
  teams = [],
  initialDemo = false,
  forceReceived = false,
  hudSettings = null,
  previewBase = "http://localhost:5300",
}) {
  const [loadedUrl, setLoadedUrl] = useState(null),
    [failedUrl, setFailedUrl] = useState(null),
    [attempt, setAttempt] = useState(0);
  const frame = useRef(null);
  const settingsRef = useRef(hudSettings);
  settingsRef.current = hudSettings;
  const stage = useRef(null),
    drag = useRef(null);
  const [width, setWidth] = useState(640),
    [mode, setMode] = useState(initialDemo ? "sample" : "empty");
  const previewMode = forceReceived ? "received" : mode;
  const demo = previewMode === "sample";
  useEffect(() => {
    const observer = new ResizeObserver((entries) =>
      setWidth(entries[0].contentRect.width),
    );
    if (stage.current) observer.observe(stage.current);
    return () => observer.disconnect();
  }, []);
  const zoom = width / 1920;
  const parameters = new URLSearchParams({
    match: matchCode,
    canvas: "1",
    screen: "1",
    editorOrigin: window.location.origin,
  });
  if (previewMode !== "received") {
    parameters.set("preview", "1");
    parameters.set(demo ? "sampleMotion" : "empty", "1");
    parameters.set(
      "previewTeams",
      JSON.stringify(
        teams.map((team) => ({
          name: team.name,
          tag: team.tag,
          logo: team.logoUrl || team.logo,
          players: (team.roster || team.players || [])
            .slice(0, 5)
            .map(
              (player) =>
                player.hudNickname ||
                player.name ||
                player.displayName ||
                player.inGameName ||
                "",
            ),
        })),
      ),
    );
  }
  parameters.set("previewAttempt", String(attempt));

  const previewUrl = `${previewBase}/overlays/${item.overlay}.html?${parameters}`;
  const loaded = loadedUrl === previewUrl;
  const previewOrigin = new URL(previewUrl, window.location.href).origin;
  useEffect(() => {
    const receive = (event) => {
      if (
        event.source === frame.current?.contentWindow &&
        event.origin === previewOrigin &&
        event.data?.type === "AIR_HUD_PREVIEW_READY"
      ) {
        frame.current?.contentWindow.postMessage(
          { type: "AIR_HUD_PREVIEW_SETTINGS", settings: settingsRef.current },
          previewOrigin,
        );
        setLoadedUrl(previewUrl);
      }
    };
    window.addEventListener("message", receive);
    const timer = setTimeout(() => setFailedUrl(previewUrl), 7000);
    return () => {
      clearTimeout(timer);
      window.removeEventListener("message", receive);
    };
  }, [previewUrl]);

  useEffect(() => {
    if (loaded)
      frame.current?.contentWindow.postMessage(
        { type: "AIR_HUD_PREVIEW_SETTINGS", settings: hudSettings },
        previewOrigin,
      );
  }, [hudSettings, loaded, previewOrigin]);
  return (
    <section className="template-preview" aria-label="Selected screen preview">
      <div className="template-preview-caption">
        <strong>Screen preview</strong>
        <label className="preview-source-control">
          Data source
          <select
            aria-label="Preview data source"
            value={previewMode}
            onChange={(event) => setMode(event.target.value)}
            disabled={forceReceived}
          >
            <option value="empty">No game data</option>
            <option value="sample">Sample data</option>
            <option value="received">Received match data</option>
          </select>
        </label>
      </div>
      <p className={`preview-data-state preview-data-${previewMode}`}>
        {previewMode === "sample"
          ? "SAMPLE · Simulated scores, players and timers. This preview never changes OBS."
          : previewMode === "empty"
            ? "NO GAME DATA · Static screen designs and teams remain visible. Choose Sample data for populated game graphics."
            : "RECEIVED DATA · Read-only match feed, including last received values. Saved data may remain after capture stops."}
      </p>
      <div className="template-preview-stage" ref={stage}>
        {!loaded && (
          <div className="preview-loading" role="status">
            {failedUrl === previewUrl ? (
              <div>
                <p>Preview could not load. Check the local HUD connection.</p>
                <button
                  className="air-ghost-btn"
                  onClick={() => setAttempt((value) => value + 1)}
                >
                  Retry preview
                </button>
              </div>
            ) : (
              "Loading screen preview…"
            )}
          </div>
        )}
        <div
          className="template-preview-layer"
          style={{
            left: `${(item.x / 1920) * 100}%`,
            top: `${(item.y / 1080) * 100}%`,
            width: `${(item.width / 1920) * 100}%`,
            height: `${(item.height / 1080) * 100}%`,
          }}
          onPointerDown={(event) => {
            if (disabled) return;
            event.currentTarget.setPointerCapture(event.pointerId);
            drag.current = {
              x: event.clientX,
              y: event.clientY,
              left: item.x,
              top: item.y,
            };
          }}
          onPointerMove={(event) => {
            if (!drag.current || disabled) return;
            onMove(
              Math.max(
                0,
                Math.min(
                  1920 - item.width,
                  Math.round(
                    drag.current.left + (event.clientX - drag.current.x) / zoom,
                  ),
                ),
              ),
              Math.max(
                0,
                Math.min(
                  1080 - item.height,
                  Math.round(
                    drag.current.top + (event.clientY - drag.current.y) / zoom,
                  ),
                ),
              ),
            );
          }}
          onPointerUp={() => {
            drag.current = null;
          }}
          onPointerCancel={() => {
            drag.current = null;
          }}
        >
          <iframe
            title="Match HUD preview"
            tabIndex={-1}
            ref={frame}
            onLoad={() =>
              frame.current?.contentWindow.postMessage(
                { type: "AIR_HUD_PREVIEW_PROBE" },
                previewOrigin,
              )
            }
            sandbox="allow-scripts allow-same-origin"
            key={previewUrl}
            src={previewUrl}
            style={{
              opacity: loaded ? 1 : 0,
              background: "transparent",
              width: 1920,
              height: 1080,
              transform: `scale(${(zoom * item.width) / 1920}, ${(zoom * item.height) / 1080})`,
              transformOrigin: "top left",
            }}
          />
        </div>
      </div>
      <p>
        {disabled
          ? "Preview only. Position the HUD in Broadcast screens."
          : "Drag the HUD to position it. Use Screen settings for exact placement and video input."}
      </p>
    </section>
  );
}
