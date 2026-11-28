//! Graphics on the local network (read only).
//!
//! The engine may listen on `0.0.0.0` so OBS or vMix on another PC can load the graphics. Every
//! request is then judged by who sent it: this PC is unchanged; a private or link-local address
//! may only READ graphics (pages, scripts, pictures, overlay WebSocket); anything else, and every
//! other route (control, ingest, observe, api, dev, writes), is refused with 403.

use std::net::{IpAddr, Ipv4Addr, Ipv6Addr, SocketAddr};

use axum::extract::{ConnectInfo, Request};
use axum::http::{header, HeaderValue, Method, StatusCode};
use axum::middleware::Next;
use axum::response::Response;

use crate::http::{percent_decode, query_get};

fn v4_private(a: Ipv4Addr) -> bool {
    let o = a.octets();
    o[0] == 10 || (o[0] == 172 && (16..=31).contains(&o[1])) || (o[0] == 192 && o[1] == 168) || (o[0] == 169 && o[1] == 254)
}

fn v6_private(a: Ipv6Addr) -> bool {
    if let Some(v4) = a.to_ipv4_mapped() {
        return v4_private(v4);
    }
    let first = a.segments()[0];
    (first & 0xfe00) == 0xfc00 || (first & 0xffc0) == 0xfe80
}

/// Private (10/8, 172.16/12, 192.168/16), link-local, or IPv6 ULA / link-local.
pub fn is_lan(ip: IpAddr) -> bool {
    match ip {
        IpAddr::V4(a) => v4_private(a),
        IpAddr::V6(a) => v6_private(a),
    }
}

pub fn is_loopback(ip: IpAddr) -> bool {
    match ip {
        IpAddr::V4(a) => a.is_loopback(),
        IpAddr::V6(a) => a.is_loopback() || a.to_ipv4_mapped().is_some_and(|v| v.is_loopback()),
    }
}

/// The graphics a LAN peer may read.
fn read_path(path: &str) -> bool {
    let segments: Vec<&str> = path.split('/').filter(|s| !s.is_empty()).collect();
    if segments.iter().any(|s| *s == ".." || s.contains('\\')) {
        return false;
    }
    match segments.first().copied() {
        Some("overlays" | "core" | "art" | "packs" | "air-assets") => segments.len() > 1,
        Some("o") => segments.len() == 2,
        _ => false,
    }
}

/// `None` when allowed, else the reason for the 403.
pub fn verdict(peer: IpAddr, method: &Method, path: &str, query: Option<&str>) -> Option<&'static str> {
    if is_loopback(peer) {
        return None;
    }
    if !is_lan(peer) {
        return Some("Only this PC and private network addresses may use the graphics engine.");
    }
    if path == "/ws" {
        let q: Vec<(String, String)> = query
            .unwrap_or_default()
            .split('&')
            .filter(|p| !p.is_empty())
            .map(|p| {
                let (k, v) = p.split_once('=').unwrap_or((p, ""));
                (percent_decode(&k.replace('+', " ")), percent_decode(&v.replace('+', " ")))
            })
            .collect();
        let role = query_get(&q, "role").filter(|r| !r.is_empty()).unwrap_or_else(|| "overlay".into());
        return (*method == Method::GET && role == "overlay").then_some(()).map_or(Some("Other PCs on the network may only watch graphics."), |_| None);
    }
    if (*method == Method::GET || *method == Method::HEAD) && read_path(path) {
        return None;
    }
    Some("Other PCs on the network may only load graphics.")
}

pub async fn guard(ConnectInfo(peer): ConnectInfo<SocketAddr>, req: Request, next: Next) -> Response {
    if let Some(reason) = verdict(peer.ip(), req.method(), req.uri().path(), req.uri().query()) {
        let body = serde_json::json!({ "error": reason }).to_string();
        let mut res = Response::new(axum::body::Body::from(body));
        *res.status_mut() = StatusCode::FORBIDDEN;
        res.headers_mut().insert(header::CONTENT_TYPE, HeaderValue::from_static("application/json"));
        return res;
    }
    next.run(req).await
}

#[cfg(test)]
mod tests {
    use super::*;

    fn ip(s: &str) -> IpAddr {
        s.parse().unwrap()
    }
    fn v(peer: &str, method: Method, path: &str, q: Option<&str>) -> Option<&'static str> {
        verdict(ip(peer), &method, path, q)
    }

    #[test]
    fn loopback_is_unchanged() {
        for p in ["127.0.0.1", "::1", "::ffff:127.0.0.1"] {
            assert!(v(p, Method::POST, "/control/shutdown", None).is_none());
            assert!(v(p, Method::PUT, "/api/x/state", None).is_none());
            assert!(v(p, Method::GET, "/ws", Some("role=ingest")).is_none());
        }
    }

    #[test]
    fn lan_peers_read_graphics() {
        for p in ["10.1.2.3", "172.16.0.9", "172.31.255.1", "192.168.1.20", "169.254.3.4", "fd12::1", "fe80::1", "::ffff:192.168.1.5"] {
            for path in ["/overlays/scorebug.html", "/core/hud.js", "/art/a/b.png", "/packs/pubgm/ab.png", "/air-assets/x", "/o/5b3f1d2e-0000-4000-8000-000000000000"] {
                assert!(v(p, Method::GET, path, Some("match=ABC")).is_none(), "{p} {path}");
            }
            assert!(v(p, Method::GET, "/ws", Some("match=ABC&role=overlay")).is_none());
            assert!(v(p, Method::GET, "/ws", Some("match=ABC")).is_none());
        }
    }

    #[test]
    fn lan_peers_cannot_write_or_control() {
        let p = "192.168.1.20";
        for path in ["/control/status", "/api/ABC/state", "/dev/x", "/health", "/", "/server/server.js", "/overlays", "/o/a/b"] {
            assert!(v(p, Method::GET, path, None).is_some(), "{path}");
        }
        for m in [Method::POST, Method::PUT, Method::PATCH, Method::DELETE] {
            assert!(v(p, m, "/overlays/x.html", None).is_some());
            assert!(v(p, Method::POST, "/air-assets/x", None).is_some());
        }
        for role in ["control", "ingest", "observe", "player"] {
            assert!(v(p, Method::GET, "/ws", Some(&format!("match=A&role={role}&key=k"))).is_some(), "{role}");
        }
        assert!(v(p, Method::GET, "/overlays/../control/status", None).is_some());
    }

    #[test]
    fn public_addresses_are_refused() {
        for p in ["8.8.8.8", "172.32.0.1", "172.15.0.1", "192.169.0.1", "100.64.0.1", "2001:db8::1", "::ffff:8.8.8.8"] {
            assert!(v(p, Method::GET, "/overlays/x.html", None).is_some(), "{p}");
            assert!(v(p, Method::GET, "/ws", Some("role=overlay")).is_some(), "{p}");
        }
    }
}
