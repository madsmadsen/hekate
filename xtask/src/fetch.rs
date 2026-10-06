//! Stream a source file: download, hash, decompress and unpack in one pass.
//!
//! The command never stores the full source file (PRD 7.3, step 5). It hashes the
//! bytes as they arrive. A zip file is the one exception: the zip format needs random
//! access, so the build keeps that one file in memory.

use std::cell::RefCell;
use std::io::{BufRead, BufReader, Cursor, Read};
use std::path::Path;
use std::rc::Rc;
use std::time::Duration;

use sha2::{Digest, Sha256};

use crate::bail;
use crate::config::{Archive, FileRef};
use crate::util::{Context, Result, hex};

struct Shared {
    inner: Box<dyn Read>,
    hasher: Sha256,
}

/// A reader that hashes every byte that passes through it.
#[derive(Clone)]
struct HashRead(Rc<RefCell<Shared>>);

impl HashRead {
    fn new(inner: Box<dyn Read>) -> Self {
        HashRead(Rc::new(RefCell::new(Shared {
            inner,
            hasher: Sha256::new(),
        })))
    }

    /// Read what is left, so the hash covers the whole file. Return the hash.
    fn finish(self) -> Result<String> {
        let mut buf = vec![0u8; 64 * 1024];
        let mut me = self.clone();
        while me.read(&mut buf)? > 0 {}
        let digest = self.0.borrow_mut().hasher.finalize_reset();
        Ok(hex(&digest))
    }
}

impl Read for HashRead {
    fn read(&mut self, buf: &mut [u8]) -> std::io::Result<usize> {
        let mut s = self.0.borrow_mut();
        let n = s.inner.read(buf)?;
        s.hasher.update(&buf[..n]);
        Ok(n)
    }
}

/// Where a file lives.
fn open_raw(file: &FileRef, base: &Path) -> Result<Box<dyn Read>> {
    if let Some(url) = &file.url {
        if let Some(path) = url.strip_prefix("file://") {
            let f = std::fs::File::open(path).context(|| format!("cannot open {path}"))?;
            return Ok(Box::new(f));
        }
        let agent: ureq::Agent = ureq::Agent::config_builder()
            .timeout_connect(Some(Duration::from_secs(30)))
            .timeout_recv_response(Some(Duration::from_secs(120)))
            .user_agent("hekate-xtask (https://github.com/madsmadsen/hekate)")
            .build()
            .into();
        let resp = agent
            .get(url)
            .call()
            .map_err(|e| crate::util::Error(format!("download of {url} failed: {e}")))?;
        return Ok(Box::new(resp.into_body().into_reader()));
    }
    if let Some(rel) = &file.path {
        let path = base.join(rel);
        let f = std::fs::File::open(&path).context(|| format!("cannot open {}", path.display()))?;
        return Ok(Box::new(f));
    }
    bail!("file has neither url nor path")
}

/// Add a decompressor if the first bytes show gzip or bzip2.
fn decompress(raw: HashRead) -> Result<Box<dyn Read>> {
    let mut buffered = BufReader::with_capacity(256 * 1024, raw);
    let head = buffered.fill_buf()?;
    if head.starts_with(&[0x1f, 0x8b]) {
        Ok(Box::new(flate2::read::MultiGzDecoder::new(buffered)))
    } else if head.starts_with(b"BZh") {
        Ok(Box::new(bzip2::read::MultiBzDecoder::new(buffered)))
    } else {
        Ok(Box::new(buffered))
    }
}

fn member_matches(name: &str, member: Option<&str>) -> bool {
    member.is_none_or(|m| name.ends_with(m))
}

/// Process one file. Call `f(member_name, reader)` for each stream in it.
/// A plain file gives one stream. An archive gives one stream for each matching member.
/// Return the SHA-256 of the file as downloaded.
pub fn process_file(
    file: &FileRef,
    archive: Archive,
    base: &Path,
    f: &mut dyn FnMut(&str, &mut dyn Read) -> Result<()>,
) -> Result<String> {
    let raw = HashRead::new(open_raw(file, base)?);
    let member = file.member.as_deref();
    match archive {
        Archive::None => {
            let mut stream = decompress(raw.clone())?;
            f("", &mut *stream)?;
        }
        Archive::Zip => {
            let mut bytes = Vec::new();
            raw.clone().read_to_end(&mut bytes)?;
            let mut zip = zip::ZipArchive::new(Cursor::new(bytes))
                .context(|| format!("{} is not a zip file", file.describe()))?;
            let mut matched = 0;
            for i in 0..zip.len() {
                let mut entry = zip.by_index(i).context(|| "bad zip member".to_string())?;
                if entry.is_dir() || !member_matches(entry.name(), member) {
                    continue;
                }
                matched += 1;
                let name = entry.name().to_string();
                f(&name, &mut entry)?;
            }
            if matched == 0 {
                bail!("no zip member matches {:?} in {}", member, file.describe());
            }
        }
        Archive::Tar => {
            let stream = decompress(raw.clone())?;
            let mut tar = tar::Archive::new(stream);
            let mut matched = 0;
            for entry in tar.entries()? {
                let mut entry = entry?;
                if !entry.header().entry_type().is_file() {
                    continue;
                }
                let name = entry.path()?.to_string_lossy().into_owned();
                if !member_matches(&name, member) {
                    continue;
                }
                matched += 1;
                f(&name, &mut entry)?;
            }
            if matched == 0 {
                bail!("no tar member matches {:?} in {}", member, file.describe());
            }
        }
    }
    raw.finish()
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::Write;

    fn file_at(path: &Path) -> FileRef {
        FileRef {
            url: None,
            path: Some(path.to_string_lossy().into_owned()),
            sha256: None,
            member: None,
            part: None,
        }
    }

    fn tmp(name: &str) -> std::path::PathBuf {
        let dir = std::env::temp_dir().join(format!("hekate-xtask-fetch-{}", std::process::id()));
        std::fs::create_dir_all(&dir).unwrap();
        dir.join(name)
    }

    #[test]
    fn plain_file_is_hashed_and_read() {
        let p = tmp("plain.txt");
        std::fs::write(&p, "hello\nworld\n").unwrap();
        let mut seen = String::new();
        let sha = process_file(&file_at(&p), Archive::None, Path::new("/"), &mut |_, r| {
            r.read_to_string(&mut seen)?;
            Ok(())
        })
        .unwrap();
        assert_eq!(seen, "hello\nworld\n");
        assert_eq!(sha, crate::util::sha256_hex(b"hello\nworld\n"));
    }

    #[test]
    fn gzip_is_decompressed_but_hash_is_of_download() {
        let p = tmp("data.gz");
        let mut enc = flate2::write::GzEncoder::new(Vec::new(), flate2::Compression::fast());
        enc.write_all(b"one\ntwo\n").unwrap();
        let gz = enc.finish().unwrap();
        std::fs::write(&p, &gz).unwrap();
        let mut seen = String::new();
        let sha = process_file(&file_at(&p), Archive::None, Path::new("/"), &mut |_, r| {
            r.read_to_string(&mut seen)?;
            Ok(())
        })
        .unwrap();
        assert_eq!(seen, "one\ntwo\n");
        assert_eq!(sha, crate::util::sha256_hex(&gz));
    }

    #[test]
    fn tar_member_is_selected_by_suffix() {
        let p = tmp("data.tar");
        let mut builder = tar::Builder::new(Vec::new());
        for (name, body) in [("a/one.txt", "1\n"), ("a/two.dat", "2\n")] {
            let mut h = tar::Header::new_gnu();
            h.set_size(body.len() as u64);
            h.set_mode(0o644);
            h.set_cksum();
            builder.append_data(&mut h, name, body.as_bytes()).unwrap();
        }
        std::fs::write(&p, builder.into_inner().unwrap()).unwrap();
        let mut file = file_at(&p);
        file.member = Some(".dat".into());
        let mut names = Vec::new();
        process_file(&file, Archive::Tar, Path::new("/"), &mut |n, _| {
            names.push(n.to_string());
            Ok(())
        })
        .unwrap();
        assert_eq!(names, ["a/two.dat"]);
    }

    #[test]
    fn missing_tar_member_is_an_error() {
        let p = tmp("empty.tar");
        let builder = tar::Builder::new(Vec::new());
        std::fs::write(&p, builder.into_inner().unwrap()).unwrap();
        let mut file = file_at(&p);
        file.member = Some("x".into());
        let err = process_file(&file, Archive::Tar, Path::new("/"), &mut |_, _| Ok(()));
        assert!(err.is_err());
    }
}
