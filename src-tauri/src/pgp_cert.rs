//! Sanitizing OpenPGP public certificates before they enter the keystore.
//!
//! rpgp parses certificates without verifying binding signatures: a subkey or
//! User ID followed by *any* signature packet is kept. wecanencrypt then takes
//! subkey capabilities from those unverified packets, so a tampered copy of a
//! correspondent's certificate (same primary fingerprint, plus a subkey bound
//! by the attacker's own key) would be used to encrypt to and to verify
//! signatures "by" that correspondent. Every public certificate is therefore
//! reduced to the components its primary key actually certified before it is
//! imported.

use std::io::Cursor;

use pgp::composed::{
    Deserializable, SignedKeyDetails, SignedPublicKey, SignedPublicSubKey, SignedSecretKey,
};
use pgp::packet::{Signature, SignatureType};
use pgp::ser::Serialize;
use pgp::types::SignedUser;

use crate::error::{Error, Result};

/// What the caller hands to the keystore.
pub enum CertificateImport {
    /// Secret key material (the user's own key): imported unchanged.
    Secret(Vec<u8>),
    /// Public certificate reduced to verified components (binary).
    Public(Vec<u8>),
}

/// Parse `data` (armored or binary). Secret keys pass through unchanged.
/// Public certificates keep only User IDs with a verified self-certification,
/// subkeys with a verified binding signature, and the primary's own verified
/// direct-key and revocation signatures. When `only_address` is set (WKD), only
/// User IDs whose address equals it are kept, and at least one must exist.
pub fn sanitize_for_import(data: &[u8], only_address: Option<&str>) -> Result<CertificateImport> {
    if is_secret_key(data) {
        return Ok(CertificateImport::Secret(data.to_vec()));
    }
    let key = parse_public(data)?;
    sanitize_public(&key, only_address).map(CertificateImport::Public)
}

fn is_secret_key(data: &[u8]) -> bool {
    SignedSecretKey::from_armor_single(Cursor::new(data)).is_ok()
        || SignedSecretKey::from_bytes(Cursor::new(data)).is_ok()
}

fn parse_public(data: &[u8]) -> Result<SignedPublicKey> {
    if let Ok((key, _)) = SignedPublicKey::from_armor_single(Cursor::new(data)) {
        return Ok(key);
    }
    SignedPublicKey::from_bytes(Cursor::new(data))
        .map_err(|e| Error::Other(format!("pgp: not an OpenPGP certificate: {e}")))
}

/// Address part of a User ID (`Name <addr>` or a bare address).
fn uid_address(uid: &str) -> Option<String> {
    let candidate = match (uid.rfind('<'), uid.rfind('>')) {
        (Some(start), Some(end)) if start < end => &uid[start + 1..end],
        _ => uid,
    };
    let candidate = candidate.trim();
    (candidate.contains('@') && !candidate.contains(char::is_whitespace))
        .then(|| candidate.to_ascii_lowercase())
}

fn sanitize_public(key: &SignedPublicKey, only_address: Option<&str>) -> Result<Vec<u8>> {
    let primary = &key.primary_key;
    let wanted = only_address.map(|a| a.trim().to_ascii_lowercase());

    let users: Vec<SignedUser> = key
        .details
        .users
        .iter()
        .filter(|user| match &wanted {
            Some(addr) => {
                uid_address(&String::from_utf8_lossy(user.id.id())).is_some_and(|a| &a == addr)
            }
            None => true,
        })
        .filter_map(|user| {
            let verified: Vec<Signature> = user
                .signatures
                .iter()
                .filter(|sig| is_verified_uid_self_signature(sig, primary, user))
                .cloned()
                .collect();
            (!verified.is_empty()).then(|| SignedUser::new(user.id.clone(), verified))
        })
        .collect();
    if users.is_empty() {
        return Err(Error::Other(match &wanted {
            Some(addr) => format!(
                "pgp: the certificate has no verified user ID for {addr}; refusing to import it"
            ),
            None => "pgp: the certificate has no verified user ID; refusing to import it".into(),
        }));
    }

    let subkeys: Vec<SignedPublicSubKey> = key
        .public_subkeys
        .iter()
        .filter_map(|subkey| {
            let verified: Vec<Signature> = subkey
                .signatures
                .iter()
                .filter(|sig| is_verified_subkey_signature(sig, primary, &subkey.key))
                .cloned()
                .collect();
            verified
                .iter()
                .any(|sig| sig.typ() == Some(SignatureType::SubkeyBinding))
                .then(|| SignedPublicSubKey {
                    key: subkey.key.clone(),
                    signatures: verified,
                })
        })
        .collect();

    let own_primary_sigs = |sigs: &[Signature]| -> Vec<Signature> {
        sigs.iter()
            .filter(|sig| {
                matches!(
                    sig.typ(),
                    Some(SignatureType::Key) | Some(SignatureType::KeyRevocation)
                ) && sig.verify_key(primary).is_ok()
            })
            .cloned()
            .collect()
    };

    let sanitized = SignedPublicKey {
        primary_key: primary.clone(),
        details: SignedKeyDetails::new(
            own_primary_sigs(&key.details.revocation_signatures),
            own_primary_sigs(&key.details.direct_signatures),
            users,
            Vec::new(),
        ),
        public_subkeys: subkeys,
    };
    sanitized
        .to_bytes()
        .map_err(|e| Error::Other(format!("pgp: cannot serialize certificate: {e}")))
}

fn is_verified_uid_self_signature(
    sig: &Signature,
    primary: &pgp::packet::PublicKey,
    user: &SignedUser,
) -> bool {
    matches!(
        sig.typ(),
        Some(SignatureType::CertGeneric)
            | Some(SignatureType::CertPersona)
            | Some(SignatureType::CertCasual)
            | Some(SignatureType::CertPositive)
            | Some(SignatureType::CertRevocation)
    ) && sig
        .verify_certification(primary, pgp::types::Tag::UserId, &user.id)
        .is_ok()
}

fn is_verified_subkey_signature<K>(
    sig: &Signature,
    primary: &pgp::packet::PublicKey,
    subkey: &K,
) -> bool
where
    K: pgp::types::KeyDetails + Serialize,
{
    matches!(
        sig.typ(),
        Some(SignatureType::SubkeyBinding) | Some(SignatureType::SubkeyRevocation)
    ) && sig.verify_subkey_binding(primary, subkey).is_ok()
}

#[cfg(test)]
mod tests {
    use super::*;
    use pgp::types::KeyDetails;

    fn generate(uid: &str) -> Vec<u8> {
        let key = wecanencrypt::create_key_simple("pw", &[uid]).unwrap();
        key.public_key.into_bytes()
    }

    fn parsed(bytes: &[u8]) -> SignedPublicKey {
        parse_public(bytes).unwrap()
    }

    fn sanitized(data: &[u8], addr: Option<&str>) -> Result<SignedPublicKey> {
        match sanitize_for_import(data, addr)? {
            CertificateImport::Public(bytes) => Ok(parsed(&bytes)),
            CertificateImport::Secret(_) => panic!("expected public"),
        }
    }

    #[test]
    fn genuine_certificate_is_kept_intact() {
        let alice = generate("Alice <alice@example.org>");
        let original = parsed(&alice);
        let clean = sanitized(&alice, None).unwrap();
        assert_eq!(
            clean.primary_key.fingerprint(),
            original.primary_key.fingerprint()
        );
        assert_eq!(clean.details.users.len(), 1);
        assert_eq!(clean.public_subkeys.len(), original.public_subkeys.len());
    }

    #[test]
    fn subkey_bound_by_another_key_is_dropped() {
        let alice = parsed(&generate("Alice <alice@example.org>"));
        let mallory = parsed(&generate("Mallory <mallory@evil.example>"));
        // Graft Mallory's subkeys (bound by Mallory's primary) onto Alice.
        let mut tampered = alice.clone();
        tampered
            .public_subkeys
            .extend(mallory.public_subkeys.iter().cloned());
        let bytes = tampered.to_bytes().unwrap();

        let clean = sanitized(&bytes, None).unwrap();
        assert_eq!(clean.public_subkeys.len(), alice.public_subkeys.len());
        for subkey in &clean.public_subkeys {
            assert!(alice
                .public_subkeys
                .iter()
                .any(|own| own.key.fingerprint() == subkey.key.fingerprint()));
        }
    }

    #[test]
    fn user_id_certified_by_another_key_is_dropped() {
        let alice = parsed(&generate("Alice <alice@example.org>"));
        let mallory = parsed(&generate("CEO <ceo@corp.example>"));
        let mut tampered = alice.clone();
        let mut users = alice.details.users.clone();
        users.extend(mallory.details.users.iter().cloned());
        tampered.details = SignedKeyDetails::new(
            vec![],
            alice.details.direct_signatures.clone(),
            users,
            vec![],
        );
        let bytes = tampered.to_bytes().unwrap();

        let clean = sanitized(&bytes, None).unwrap();
        assert_eq!(clean.details.users.len(), 1);
        assert_eq!(clean.details.users[0].id.id(), b"Alice <alice@example.org>");
    }

    #[test]
    fn wkd_keeps_only_the_queried_address() {
        let key = wecanencrypt::create_key_simple(
            "pw",
            &[
                "Mallory <mallory@evil.example>",
                "Alice <alice@bank.example>",
            ],
        )
        .unwrap();
        let bytes = key.public_key.into_bytes();

        let clean = sanitized(&bytes, Some("Mallory@Evil.example")).unwrap();
        assert_eq!(clean.details.users.len(), 1);
        assert_eq!(
            clean.details.users[0].id.id(),
            b"Mallory <mallory@evil.example>"
        );

        assert!(sanitized(&bytes, Some("nobody@evil.example")).is_err());
    }
}
