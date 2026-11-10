//! Esportra Air graphics engine.
//!
//! A standalone process that owns match state, parses game data and serves every overlay to OBS.
//! It runs separately from the Air window, so a UI crash or restart never takes graphics off air.
//! It speaks the same HTTP/WebSocket protocol as `esportra-valorant-hud/server/server.js`, so the
//! existing overlays run unchanged.

pub mod engine;
pub mod features;
pub mod fixes;
pub mod http;
pub mod ws;

use std::net::SocketAddr;
use std::path::PathBuf;
use std::sync::Arc;
use std::time::Duration;

use axum::routing::get;
use axum::Router;
use tokio::net::TcpListener;
use tokio::sync::watch;

pub use engine::Engine;

#[derive(Clone)]
pub struct AppState {
    pub engine: Arc<Engine>,
    pub shutdown: Arc<watch::Sender<bool>>,
}

pub struct Config {
    pub root: PathBuf,
    pub data: PathBuf,
    pub key: String,
    pub host: String,
    pub port: u16,
    /// Override for the feed-paused threshold (tests); `None` uses 10 s.
    pub feed_stale_ms: Option<f64>,
}

/// A running engine: its bound address, and a future that completes when it stops.
pub struct Running {
    pub addr: SocketAddr,
    pub app: AppState,
    pub task: tokio::task::JoinHandle<()>,
}

pub async fn start(config: Config) -> std::io::Result<Running> {
    let mut engine = Engine::new(config.root, config.data, config.key)?;
    if let Some(ms) = config.feed_stale_ms {
        engine.feed_stale_ms = ms;
    }
    let engine = Arc::new(engine);
    let (shutdown, mut stop) = watch::channel(false);
    let app = AppState {
        engine: engine.clone(),
        shutdown: Arc::new(shutdown),
    };
    let router = Router::new()
        .route("/ws", get(ws::upgrade))
        .fallback(http::handle)
        .with_state(app.clone());
    let listener = TcpListener::bind((config.host.as_str(), config.port)).await?;
    let addr = listener.local_addr()?;

    // Debounced persistence (the JS server saved 300 ms after the last change).
    let saver = engine.clone();
    tokio::spawn(async move {
        let mut tick = tokio::time::interval(Duration::from_millis(300));
        loop {
            tick.tick().await;
            saver.save_all();
        }
    });
    // Feed freshness: the HUD's "feed paused" tag, owned by the engine.
    let watcher = engine.clone();
    tokio::spawn(async move {
        let mut tick = tokio::time::interval(Duration::from_millis(500));
        loop {
            tick.tick().await;
            let now = engine::now_ms();
            for room in watcher.rooms() {
                room.check_feed(now, watcher.feed_stale_ms);
            }
        }
    });

    let finished = engine.clone();
    let task = tokio::spawn(async move {
        let serve = axum::serve(listener, router).with_graceful_shutdown(async move {
            let _ = stop.wait_for(|stopped| *stopped).await;
        });
        if let Err(e) = serve.await {
            eprintln!("[engine] server error: {e}");
        }
        finished.save_all();
    });
    Ok(Running { addr, app, task })
}
