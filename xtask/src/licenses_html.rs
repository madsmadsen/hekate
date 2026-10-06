//! Make `THIRD-PARTY-LICENSES.html`: the licenses of everything that ships with Hekate.

use std::collections::{BTreeMap, BTreeSet};
use std::fmt::Write;
use std::path::Path;
use std::process::Command;

use serde_json::Value;

use crate::bail;
use crate::manifest::{self, Manifest};
use crate::util::{Context, Result};

#[derive(Debug, PartialEq, Eq, PartialOrd, Ord)]
pub struct CrateInfo {
    pub name: String,
    pub version: String,
    pub license: String,
    pub repository: String,
}

#[derive(Debug, PartialEq, Eq, PartialOrd, Ord)]
pub struct NpmInfo {
    pub name: String,
    pub versions: Vec<String>,
    pub license: String,
    pub homepage: String,
}

/// Escape text for HTML.
pub fn esc(s: &str) -> String {
    let mut out = String::with_capacity(s.len());
    for c in s.chars() {
        match c {
            '&' => out.push_str("&amp;"),
            '<' => out.push_str("&lt;"),
            '>' => out.push_str("&gt;"),
            '"' => out.push_str("&quot;"),
            '\'' => out.push_str("&#39;"),
            c => out.push(c),
        }
    }
    out
}

/// Only web links become `<a>` elements. Other text stays plain.
fn link(url: &str, label: &str) -> String {
    if url.starts_with("https://") || url.starts_with("http://") {
        format!("<a href=\"{}\">{}</a>", esc(url), esc(label))
    } else {
        esc(label)
    }
}

fn str_field<'a>(v: &'a Value, key: &str) -> &'a str {
    v.get(key).and_then(Value::as_str).unwrap_or("")
}

/// The crates that go into the WASM module, from `cargo metadata` JSON.
/// The walk starts at `root_name`. It follows normal dependencies only.
/// Workspace members are left out.
pub fn crates_from_metadata(meta: &Value, root_name: &str) -> Result<Vec<CrateInfo>> {
    let packages = meta["packages"]
        .as_array()
        .ok_or_else(|| crate::util::Error("metadata has no packages".into()))?;
    let by_id: BTreeMap<&str, &Value> = packages.iter().map(|p| (str_field(p, "id"), p)).collect();
    let members: BTreeSet<&str> = meta["workspace_members"]
        .as_array()
        .map(|a| a.iter().filter_map(Value::as_str).collect())
        .unwrap_or_default();
    let Some(root_id) = packages
        .iter()
        .find(|p| str_field(p, "name") == root_name && members.contains(str_field(p, "id")))
        .map(|p| str_field(p, "id"))
    else {
        bail!("package {root_name} not found in cargo metadata");
    };
    let nodes = meta["resolve"]["nodes"]
        .as_array()
        .ok_or_else(|| crate::util::Error("metadata has no resolve graph".into()))?;
    let node_by_id: BTreeMap<&str, &Value> =
        nodes.iter().map(|n| (str_field(n, "id"), n)).collect();

    let mut seen: BTreeSet<&str> = BTreeSet::new();
    let mut stack = vec![root_id];
    while let Some(id) = stack.pop() {
        if !seen.insert(id) {
            continue;
        }
        let Some(node) = node_by_id.get(id) else {
            continue;
        };
        for dep in node["deps"].as_array().into_iter().flatten() {
            let normal = dep["dep_kinds"]
                .as_array()
                .is_some_and(|k| k.iter().any(|d| d["kind"].is_null()));
            if normal {
                stack.push(str_field(dep, "pkg"));
            }
        }
    }

    let mut out = Vec::new();
    for id in seen {
        if members.contains(id) {
            continue;
        }
        let Some(p) = by_id.get(id) else { continue };
        let license = match p.get("license").and_then(Value::as_str) {
            Some(l) if !l.is_empty() => l.to_string(),
            _ if p.get("license_file").is_some_and(|f| !f.is_null()) => {
                "See the license file of the package (no SPDX name given)".to_string()
            }
            _ => "Unknown".to_string(),
        };
        out.push(CrateInfo {
            name: str_field(p, "name").to_string(),
            version: str_field(p, "version").to_string(),
            license,
            repository: str_field(p, "repository").to_string(),
        });
    }
    out.sort();
    Ok(out)
}

/// Packages from `pnpm licenses list --json`.
pub fn npm_from_json(v: &Value) -> Result<Vec<NpmInfo>> {
    let Some(obj) = v.as_object() else {
        bail!("pnpm licenses output is not a JSON object");
    };
    let mut out = Vec::new();
    for (license, pkgs) in obj {
        for p in pkgs.as_array().into_iter().flatten() {
            let mut versions: Vec<String> = p["versions"]
                .as_array()
                .into_iter()
                .flatten()
                .filter_map(|s| s.as_str().map(str::to_string))
                .collect();
            versions.sort();
            out.push(NpmInfo {
                name: str_field(p, "name").to_string(),
                versions,
                license: license.clone(),
                homepage: str_field(p, "homepage").to_string(),
            });
        }
    }
    out.sort();
    Ok(out)
}

fn cargo_crates(root: &Path) -> Result<Vec<CrateInfo>> {
    let cargo = std::env::var("CARGO").unwrap_or_else(|_| "cargo".to_string());
    let output = Command::new(&cargo)
        .current_dir(root)
        .args(["metadata", "--format-version", "1"])
        .args(["--filter-platform", "wasm32-unknown-unknown"])
        .output()
        .context(|| "cannot start cargo metadata".to_string())?;
    if !output.status.success() {
        bail!(
            "cargo metadata failed: {}",
            String::from_utf8_lossy(&output.stderr)
        );
    }
    let meta: Value = serde_json::from_slice(&output.stdout)?;
    crates_from_metadata(&meta, "hekate-wasm")
}

fn npm_packages(root: &Path) -> Result<Vec<NpmInfo>> {
    let output = Command::new("pnpm")
        .current_dir(root.join("packages/component"))
        .args(["licenses", "list", "--json", "--prod"])
        .output()
        .context(|| "cannot start pnpm. Is it installed and on PATH?".to_string())?;
    if !output.status.success() {
        bail!(
            "pnpm licenses list failed. Did you run pnpm install? {}",
            String::from_utf8_lossy(&output.stderr)
        );
    }
    let v: Value = serde_json::from_slice(&output.stdout)
        .context(|| "pnpm licenses list gave bad JSON".to_string())?;
    npm_from_json(&v)
}

/// Build the page from its parts. Pure, so tests can call it.
pub fn render_page(
    own_license: &str,
    crates: &[CrateInfo],
    npm: &[NpmInfo],
    manifests: &[Manifest],
) -> String {
    let mut h = String::new();
    h.push_str("<!doctype html>\n<html lang=\"en\">\n<head>\n<meta charset=\"utf-8\">\n");
    h.push_str("<meta name=\"viewport\" content=\"width=device-width, initial-scale=1\">\n");
    h.push_str("<title>Hekate: third-party licenses</title>\n<style>\n");
    h.push_str(
        "body{font-family:sans-serif;max-width:60rem;margin:2rem auto;padding:0 1rem;line-height:1.5}\n\
         table{border-collapse:collapse;width:100%}\n\
         th,td{border:1px solid #888;padding:.25rem .5rem;text-align:left;vertical-align:top}\n\
         pre{white-space:pre-wrap}\n",
    );
    h.push_str("</style>\n</head>\n<body>\n<h1>Hekate: third-party licenses</h1>\n");

    h.push_str("<h2>Hekate</h2>\n<p>Hekate is free software under the MIT license.</p>\n");
    let _ = writeln!(h, "<pre>{}</pre>", esc(own_license.trim_end()));

    h.push_str("<h2>Rust crates in the WASM module</h2>\n");
    h.push_str("<table>\n<thead><tr><th>Name</th><th>Version</th><th>License</th><th>Repository</th></tr></thead>\n<tbody>\n");
    for c in crates {
        let _ = writeln!(
            h,
            "<tr><td>{}</td><td>{}</td><td>{}</td><td>{}</td></tr>",
            esc(&c.name),
            esc(&c.version),
            esc(&c.license),
            link(&c.repository, &c.repository)
        );
    }
    h.push_str("</tbody>\n</table>\n");

    h.push_str("<h2>npm packages in the component</h2>\n");
    if npm.is_empty() {
        h.push_str("<p>The component ships no npm packages.</p>\n");
    } else {
        h.push_str("<table>\n<thead><tr><th>Name</th><th>Versions</th><th>License</th><th>Homepage</th></tr></thead>\n<tbody>\n");
        for p in npm {
            let _ = writeln!(
                h,
                "<tr><td>{}</td><td>{}</td><td>{}</td><td>{}</td></tr>",
                esc(&p.name),
                esc(&p.versions.join(", ")),
                esc(&p.license),
                link(&p.homepage, &p.homepage)
            );
        }
        h.push_str("</tbody>\n</table>\n");
    }

    h.push_str("<h2>Word list sources</h2>\n");
    let mut sorted: Vec<&Manifest> = manifests.iter().collect();
    sorted.sort_by(|a, b| a.code.cmp(&b.code));
    for m in sorted {
        let _ = writeln!(h, "<h3>{} ({})</h3>", esc(&m.name), esc(&m.code));
        if !m.changed_note.is_empty() {
            let _ = writeln!(h, "<p>{}</p>", esc(&m.changed_note));
        }
        h.push_str("<table>\n<thead><tr><th>Source</th><th>Version</th><th>License</th><th>Credit</th></tr></thead>\n<tbody>\n");
        let mut sources: Vec<_> = m.sources.iter().collect();
        sources.sort_by(|a, b| (&a.name, &a.version).cmp(&(&b.name, &b.version)));
        for s in sources {
            let _ = writeln!(
                h,
                "<tr><td>{}</td><td>{}</td><td>{}</td><td>{}</td></tr>",
                link(&s.url, &s.name),
                esc(&s.version),
                link(&s.license_url, &s.license),
                esc(&s.credit)
            );
        }
        h.push_str("</tbody>\n</table>\n");
    }
    h.push_str("</body>\n</html>\n");
    h
}

/// Make the whole page for the repository at `root`.
pub fn render(root: &Path) -> Result<String> {
    let own = std::fs::read_to_string(root.join("LICENSE"))
        .context(|| "cannot read LICENSE".to_string())?;
    let crates = cargo_crates(root)?;
    let npm = npm_packages(root)?;
    let manifests = manifest::read_all(&root.join("wordlists"))?;
    Ok(render_page(&own, &crates, &npm, &manifests))
}

#[cfg(test)]
mod tests {
    use super::*;

    const META: &str = r#"{
      "packages": [
        {"id":"w","name":"hekate-wasm","version":"0.1.0","license":"MIT","repository":null},
        {"id":"c","name":"hekate-core","version":"0.1.0","license":"MIT","repository":null},
        {"id":"a","name":"alpha","version":"1.0.0","license":"MIT OR Apache-2.0","repository":"https://example.org/a"},
        {"id":"b","name":"beta","version":"2.0.0","license":null,"license_file":"/x/LICENSE","repository":null},
        {"id":"d","name":"devonly","version":"1.0.0","license":"MIT","repository":null},
        {"id":"g","name":"buildonly","version":"1.0.0","license":"MIT","repository":null},
        {"id":"t","name":"transitive","version":"0.3.0","license":"Zlib","repository":null}
      ],
      "workspace_members": ["w","c"],
      "resolve": {"nodes": [
        {"id":"w","deps":[
          {"pkg":"c","dep_kinds":[{"kind":null,"target":null}]},
          {"pkg":"a","dep_kinds":[{"kind":null,"target":null}]},
          {"pkg":"d","dep_kinds":[{"kind":"dev","target":null}]},
          {"pkg":"g","dep_kinds":[{"kind":"build","target":null}]}]},
        {"id":"c","deps":[{"pkg":"b","dep_kinds":[{"kind":null,"target":null}]}]},
        {"id":"a","deps":[{"pkg":"t","dep_kinds":[{"kind":null,"target":null},{"kind":"build","target":null}]}]},
        {"id":"b","deps":[]},{"id":"d","deps":[]},{"id":"g","deps":[]},{"id":"t","deps":[]}
      ]}
    }"#;

    #[test]
    fn crate_walk_skips_dev_build_and_workspace() {
        let meta: Value = serde_json::from_str(META).unwrap();
        let list = crates_from_metadata(&meta, "hekate-wasm").unwrap();
        let names: Vec<&str> = list.iter().map(|c| c.name.as_str()).collect();
        assert_eq!(names, ["alpha", "beta", "transitive"]);
        assert!(list[1].license.contains("license file"));
        assert_eq!(list[0].repository, "https://example.org/a");
    }

    #[test]
    fn crate_walk_fails_for_unknown_root() {
        let meta: Value = serde_json::from_str(META).unwrap();
        assert!(crates_from_metadata(&meta, "nope").is_err());
    }

    #[test]
    fn html_escaping() {
        assert_eq!(
            esc("<a href=\"x\">&'"),
            "&lt;a href=&quot;x&quot;&gt;&amp;&#39;"
        );
    }

    #[test]
    fn links_only_for_web_urls() {
        assert_eq!(link("javascript:alert(1)", "x"), "x");
        assert_eq!(
            link("https://e.org/?a=1&b=2", "L<"),
            "<a href=\"https://e.org/?a=1&amp;b=2\">L&lt;</a>"
        );
    }

    #[test]
    fn npm_list_is_sorted_by_name() {
        let v: Value = serde_json::from_str(
            r#"{"MIT":[{"name":"zed","versions":["1.0.0"]},{"name":"abc","versions":["2.0.0","1.0.0"],"homepage":"https://h"}],
                "ISC":[{"name":"mid","versions":["3.0.0"]}]}"#,
        )
        .unwrap();
        let list = npm_from_json(&v).unwrap();
        let names: Vec<&str> = list.iter().map(|p| p.name.as_str()).collect();
        assert_eq!(names, ["abc", "mid", "zed"]);
        assert_eq!(list[0].versions, ["1.0.0", "2.0.0"]);
    }

    #[test]
    fn page_is_escaped_and_deterministic() {
        let crates = vec![CrateInfo {
            name: "<b>".into(),
            version: "1".into(),
            license: "MIT".into(),
            repository: String::new(),
        }];
        let a = render_page("MIT <license>", &crates, &[], &[]);
        let b = render_page("MIT <license>", &crates, &[], &[]);
        assert_eq!(a, b);
        assert!(a.starts_with("<!doctype html>"));
        assert!(a.contains("&lt;b&gt;"));
        assert!(a.contains("MIT &lt;license&gt;"));
        assert!(!a.contains("<script"));
    }
}
