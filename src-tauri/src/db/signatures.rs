//! Named signatures per account. An account can hold several; one is the
//! default inserted when composing, and the composer can switch to another.
//!
//! The legacy `accounts.signature` column mirrors the default signature's
//! body so older readers keep working. Accounts that predate this table
//! expose that column as a single "Signature" entry until first saved.

use rusqlite::{params, Connection};
use serde::{Deserialize, Serialize};

use crate::error::{Error, Result};

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct AccountSignature {
    pub id: String,
    pub name: String,
    /// Plain text, or HTML when it opens with a tag.
    pub body: String,
    #[serde(default)]
    pub is_default: bool,
}

/// Identifier of the entry synthesized from the legacy column.
pub const LEGACY_SIGNATURE_ID: &str = "legacy";

pub const MAX_SIGNATURES: usize = 50;
pub const MAX_SIGNATURE_BYTES: usize = 512 * 1024;

pub fn create_table(conn: &Connection) -> Result<()> {
    conn.execute_batch(
        "CREATE TABLE IF NOT EXISTS account_signatures (
            id TEXT NOT NULL,
            account_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
            name TEXT NOT NULL,
            body TEXT NOT NULL,
            is_default INTEGER NOT NULL DEFAULT 0,
            position INTEGER NOT NULL DEFAULT 0,
            PRIMARY KEY (account_id, id)
        );",
    )?;
    Ok(())
}

pub fn list_signatures(conn: &Connection, account_id: &str) -> Result<Vec<AccountSignature>> {
    let mut stmt = conn.prepare(
        "SELECT id, name, body, is_default FROM account_signatures
         WHERE account_id = ?1 ORDER BY position, rowid",
    )?;
    let rows = stmt
        .query_map(params![account_id], |row| {
            Ok(AccountSignature {
                id: row.get(0)?,
                name: row.get(1)?,
                body: row.get(2)?,
                is_default: row.get(3)?,
            })
        })?
        .collect::<std::result::Result<Vec<_>, _>>()?;
    if !rows.is_empty() {
        return Ok(rows);
    }

    // Not migrated yet: surface the single legacy signature, if any.
    let legacy: Option<String> = conn
        .query_row(
            "SELECT signature FROM accounts WHERE id = ?1",
            params![account_id],
            |row| row.get(0),
        )
        .map(Some)
        .or_else(|e| match e {
            rusqlite::Error::QueryReturnedNoRows => Ok(None),
            other => Err(other),
        })?;
    Ok(match legacy {
        Some(body) if !body.trim().is_empty() => vec![AccountSignature {
            id: LEGACY_SIGNATURE_ID.to_string(),
            name: "Signature".to_string(),
            body,
            is_default: true,
        }],
        _ => Vec::new(),
    })
}

fn validate(signatures: &[AccountSignature]) -> Result<()> {
    if signatures.len() > MAX_SIGNATURES {
        return Err(Error::Other(format!(
            "An account can hold at most {MAX_SIGNATURES} signatures"
        )));
    }
    let mut seen = std::collections::HashSet::new();
    for signature in signatures {
        if signature.id.trim().is_empty() {
            return Err(Error::Other("Signature id must not be empty".into()));
        }
        if !seen.insert(signature.id.as_str()) {
            return Err(Error::Other(format!(
                "Duplicate signature id {}",
                signature.id
            )));
        }
        if signature.body.len() > MAX_SIGNATURE_BYTES {
            return Err(Error::Other(format!(
                "Signature \"{}\" is larger than {} KB",
                signature.name,
                MAX_SIGNATURE_BYTES / 1024
            )));
        }
    }
    Ok(())
}

/// Replace the account's signatures. Exactly one ends up default (the first
/// flagged one, else the first), and its body is mirrored into the legacy
/// column. An empty list clears both.
pub fn save_signatures(
    conn: &Connection,
    account_id: &str,
    signatures: &[AccountSignature],
) -> Result<Vec<AccountSignature>> {
    validate(signatures)?;
    let default_index = signatures.iter().position(|s| s.is_default).unwrap_or(0);

    let tx = conn.unchecked_transaction()?;
    let exists: bool = tx.query_row(
        "SELECT EXISTS(SELECT 1 FROM accounts WHERE id = ?1)",
        params![account_id],
        |row| row.get(0),
    )?;
    if !exists {
        return Err(Error::AccountNotFound(account_id.to_string()));
    }
    tx.execute(
        "DELETE FROM account_signatures WHERE account_id = ?1",
        params![account_id],
    )?;
    let mut saved = Vec::with_capacity(signatures.len());
    for (position, signature) in signatures.iter().enumerate() {
        let name = match signature.name.trim() {
            "" => format!("Signature {}", position + 1),
            trimmed => trimmed.to_string(),
        };
        let entry = AccountSignature {
            id: signature.id.clone(),
            name,
            body: signature.body.clone(),
            is_default: position == default_index,
        };
        tx.execute(
            "INSERT INTO account_signatures (id, account_id, name, body, is_default, position)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
            params![
                entry.id,
                account_id,
                entry.name,
                entry.body,
                entry.is_default,
                position as i64
            ],
        )?;
        saved.push(entry);
    }
    let default_body = saved
        .iter()
        .find(|s| s.is_default)
        .map(|s| s.body.as_str())
        .unwrap_or("");
    tx.execute(
        "UPDATE accounts SET signature = ?1 WHERE id = ?2",
        params![default_body, account_id],
    )?;
    tx.commit()?;
    Ok(saved)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn setup() -> Connection {
        let conn = Connection::open_in_memory().unwrap();
        conn.execute_batch(
            "PRAGMA foreign_keys=ON;
             CREATE TABLE accounts (id TEXT PRIMARY KEY, signature TEXT NOT NULL DEFAULT '');
             INSERT INTO accounts (id, signature) VALUES ('a1', '-- \nOld sig');
             INSERT INTO accounts (id, signature) VALUES ('a2', '');",
        )
        .unwrap();
        create_table(&conn).unwrap();
        conn
    }

    fn sig(id: &str, name: &str, body: &str, is_default: bool) -> AccountSignature {
        AccountSignature {
            id: id.into(),
            name: name.into(),
            body: body.into(),
            is_default,
        }
    }

    #[test]
    fn legacy_signature_is_listed_until_saved() {
        let conn = setup();
        let list = list_signatures(&conn, "a1").unwrap();
        assert_eq!(
            list,
            vec![sig(LEGACY_SIGNATURE_ID, "Signature", "-- \nOld sig", true)]
        );
        assert!(list_signatures(&conn, "a2").unwrap().is_empty());
        assert!(list_signatures(&conn, "missing").unwrap().is_empty());
    }

    #[test]
    fn save_keeps_order_single_default_and_mirrors_legacy_column() {
        let conn = setup();
        let saved = save_signatures(
            &conn,
            "a1",
            &[
                sig("s1", "Work", "Work body", false),
                sig("s2", "  ", "<p>Short</p>", true),
                sig("s3", "Other", "x", true),
            ],
        )
        .unwrap();
        assert_eq!(saved[1].name, "Signature 2");
        assert_eq!(
            saved.iter().map(|s| s.is_default).collect::<Vec<_>>(),
            vec![false, true, false]
        );
        assert_eq!(list_signatures(&conn, "a1").unwrap(), saved);
        let legacy: String = conn
            .query_row("SELECT signature FROM accounts WHERE id='a1'", [], |r| {
                r.get(0)
            })
            .unwrap();
        assert_eq!(legacy, "<p>Short</p>");
    }

    #[test]
    fn first_signature_becomes_default_and_empty_list_clears() {
        let conn = setup();
        let saved = save_signatures(&conn, "a1", &[sig("s1", "A", "a", false)]).unwrap();
        assert!(saved[0].is_default);

        save_signatures(&conn, "a1", &[]).unwrap();
        assert!(list_signatures(&conn, "a1").unwrap().is_empty());
    }

    #[test]
    fn rejects_duplicates_unknown_accounts_and_oversized_bodies() {
        let conn = setup();
        assert!(save_signatures(
            &conn,
            "a1",
            &[sig("x", "A", "", false), sig("x", "B", "", false)]
        )
        .is_err());
        assert!(save_signatures(&conn, "nope", &[sig("x", "A", "", false)]).is_err());
        let huge = "a".repeat(MAX_SIGNATURE_BYTES + 1);
        assert!(save_signatures(&conn, "a1", &[sig("x", "A", &huge, false)]).is_err());
    }

    #[test]
    fn deleting_the_account_removes_its_signatures() {
        let conn = setup();
        save_signatures(&conn, "a1", &[sig("s1", "A", "a", true)]).unwrap();
        conn.execute("DELETE FROM accounts WHERE id='a1'", [])
            .unwrap();
        let count: i64 = conn
            .query_row("SELECT COUNT(*) FROM account_signatures", [], |r| r.get(0))
            .unwrap();
        assert_eq!(count, 0);
    }
}
