use crate::model::Candidate;

/// Lexically normalize an Android path for protection checks.
/// This deliberately does not touch the filesystem.
pub fn normalize(path: &str) -> String {
    let replaced = path.replace('\\', "/");
    let absolute = replaced.starts_with('/');
    let mut parts: Vec<&str> = Vec::new();
    for part in replaced.split('/') {
        match part {
            "" | "." => {}
            ".." => {
                parts.pop();
            }
            other => parts.push(other),
        }
    }
    let mut out = if absolute { "/".to_string() } else { String::new() };
    out.push_str(&parts.join("/"));
    out
}

pub fn is_protected(path: &str, protected: &[String]) -> bool {
    let normalized = normalize(path);
    if normalized.rsplit('/').next() == Some(".nomedia") {
        return true;
    }
    protected.iter().any(|prefix| {
        let prefix = normalize(prefix);
        if prefix.is_empty() {
            return false;
        }
        normalized == prefix || normalized.starts_with(&format!("{prefix}/"))
    })
}

pub fn validate_candidates(candidates: &[Candidate], protected: &[String]) -> Vec<String> {
    candidates
        .iter()
        .filter(|c| is_protected(&c.path, protected))
        .map(|c| c.path.clone())
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    fn protected() -> Vec<String> {
        vec![
            "/storage/emulated/0/Fely".into(),
            "/storage/emulated/0/Download".into(),
            "/storage/emulated/0/Android/obb".into(),
        ]
    }

    #[test]
    fn protects_exact_and_children() {
        assert!(is_protected("/storage/emulated/0/Fely", &protected()));
        assert!(is_protected("/storage/emulated/0/Fely/Media/a.jpg", &protected()));
        assert!(is_protected("/storage/emulated/0/Download/a.zip", &protected()));
    }

    #[test]
    fn does_not_protect_lookalike_prefix() {
        assert!(!is_protected("/storage/emulated/0/Fely2/a.jpg", &protected()));
        assert!(!is_protected("/storage/emulated/0/Downloads/a.zip", &protected()));
    }

    #[test]
    fn resolves_traversal_before_checking() {
        assert!(is_protected("/storage/emulated/0/Fely/../Fely/a.jpg", &protected()));
        assert!(!is_protected("/storage/emulated/0/Fely/../Secret/a.jpg", &protected()));
    }

    #[test]
    fn nomedia_is_always_protected() {
        assert!(is_protected(
            "/storage/emulated/0/Android/media/com.whatsapp/WhatsApp/Media/.nomedia",
            &[]
        ));
    }

    #[test]
    fn normalization_is_lexical() {
        assert_eq!(
            normalize("/storage//emulated/0/Fely/./Media/../a.jpg"),
            "/storage/emulated/0/Fely/a.jpg"
        );
    }
}
