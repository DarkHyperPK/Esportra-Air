//! `air-engine --root <hud dir> --data <state dir> [--host 127.0.0.1] [--port 5300]`
//!
//! The write key comes from the `AIR_ENGINE_KEY` environment variable, never the command line
//! (other processes can read command lines). While running, `<data>/engine.lock` records the pid
//! and port so a restarted Air window can find and re-attach to this engine.

use std::path::PathBuf;
use std::process::ExitCode;

use air_engine::{start, Config};
use serde_json::json;

fn arg(args: &[String], name: &str) -> Option<String> {
    args.iter()
        .position(|a| a == name)
        .and_then(|i| args.get(i + 1))
        .cloned()
}

#[tokio::main]
async fn main() -> ExitCode {
    let args: Vec<String> = std::env::args().collect();
    let (Some(root), Some(data)) = (arg(&args, "--root"), arg(&args, "--data")) else {
        eprintln!("usage: air-engine --root <hud dir> --data <state dir> [--host 127.0.0.1] [--port 5300]");
        return ExitCode::from(2);
    };
    let key = std::env::var("AIR_ENGINE_KEY").unwrap_or_default();
    if key.len() < 16 {
        eprintln!("[engine] AIR_ENGINE_KEY must be set (at least 16 characters).");
        return ExitCode::from(2);
    }
    let port = match arg(&args, "--port").map(|p| p.parse::<u16>()) {
        None => 5300,
        Some(Ok(p)) => p,
        Some(Err(_)) => {
            eprintln!("[engine] --port must be a number from 0 to 65535.");
            return ExitCode::from(2);
        }
    };
    let host = arg(&args, "--host").unwrap_or_else(|| "127.0.0.1".into());
    let data = PathBuf::from(data);
    let config = Config {
        root: PathBuf::from(root),
        data: data.clone(),
        key,
        host: host.clone(),
        port,
        feed_stale_ms: None,
    };
    let running = match start(config).await {
        Ok(r) => r,
        Err(e) => {
            eprintln!("[engine] could not start on {host}:{port}: {e}");
            return ExitCode::from(1);
        }
    };
    let lock = data.join("engine.lock");
    let record = json!({ "pid": std::process::id(), "host": host, "port": running.addr.port(), "startedAt": running.app.engine.started_at, "version": env!("CARGO_PKG_VERSION") });
    if let Err(e) = std::fs::write(&lock, record.to_string()) {
        eprintln!("[engine] lock file could not be written: {e}");
    }
    println!("{}", json!({ "ready": true, "port": running.addr.port() }));
    let shutdown = running.app.shutdown.clone();
    tokio::spawn(async move {
        if tokio::signal::ctrl_c().await.is_ok() {
            let _ = shutdown.send(true);
        }
    });
    let _ = running.task.await;
    let _ = std::fs::remove_file(&lock);
    ExitCode::SUCCESS
}
