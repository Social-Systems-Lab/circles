// lib.rs
use aes::Aes256;
use base64::{engine::general_purpose, Engine as _};
use block_padding::{generic_array::GenericArray, Pkcs7};
use cbc::{
    cipher::{BlockDecryptMut, BlockEncryptMut, KeyIvInit},
    Decryptor, Encryptor,
};
use hmac::{Hmac, Mac};
use md5;
use once_cell::sync::OnceCell;
use pbkdf2::pbkdf2;
use rand::{rngs::OsRng, Rng};
use rsa::traits::PublicKeyParts;
use rsa::{
    pkcs8::{EncodePrivateKey, EncodePublicKey, LineEnding},
    RsaPrivateKey, RsaPublicKey,
};
use serde_json::json;
use sha2::Sha256;
use std::error::Error;
use tauri::command;

static VAULT_KEY: OnceCell<Vec<u8>> = OnceCell::new();

type HmacSha256 = Hmac<Sha256>;

// Generates a RSA keypair
fn generate_rsa_keypair() -> Result<(RsaPrivateKey, RsaPublicKey), Box<dyn Error>> {
    let mut rng = OsRng;
    let private_key = RsaPrivateKey::new(&mut rng, 2048)?;
    let public_key = RsaPublicKey::from(&private_key);
    Ok((private_key, public_key))
}

// Encrypts a private key using a password
fn encrypt_private_key(
    private_key: &RsaPrivateKey,
    password: &str,
) -> Result<(String, String, String), Box<dyn Error>> {
    let private_key_pem = private_key.to_pkcs8_pem(LineEnding::LF)?; // Store String here
    let private_key_der = private_key_pem.as_bytes(); // Create byte slice

    let salt: [u8; 8] = rand::random();
    let iv: [u8; 16] = rand::random();

    let mut derived_key = [0u8; 32];
    pbkdf2::<HmacSha256>(password.as_bytes(), &salt, 65536, &mut derived_key);

    let iv_ga = GenericArray::from_slice(&iv);
    let derived_key_ga = GenericArray::from_slice(&derived_key);

    let cipher = Encryptor::<Aes256>::new(derived_key_ga, iv_ga);
    let mut encrypted_key = private_key_der.to_vec();
    cipher
        .encrypt_padded_mut::<Pkcs7>(&mut encrypted_key, 16)
        .map_err(|e| Box::<dyn Error>::from(format!("Encryption padding error: {:?}", e)))?;

    Ok((
        general_purpose::STANDARD.encode(&encrypted_key),
        general_purpose::STANDARD.encode(&salt),
        general_purpose::STANDARD.encode(&iv),
    ))
}

// Converts a RSA public key to JWK (JSON Web Key) format
fn public_key_to_jwk(public_key: &RsaPublicKey) -> String {
    let n = base64_url_encode(&public_key.n().to_bytes_be());
    let e = base64_url_encode(&public_key.e().to_bytes_be());

    json!({
        "kty": "RSA",
        "n": n,
        "e": e
    })
    .to_string()
}

// Converts data to base64 URL safe format
fn base64_url_encode(data: &[u8]) -> String {
    let encoded = general_purpose::STANDARD.encode(data);
    encoded.replace('+', "-").replace('/', "_").replace("=", "")
}

#[command]
fn create_identity(name: String, password: String) -> Result<serde_json::Value, String> {
    // Generate RSA key pair
    let (private_key, public_key) =
        generate_rsa_keypair().map_err(|e| format!("Key generation error: {}", e))?;

    // Convert public key to PEM format and hash to create DID
    let public_key_pem = public_key.to_public_key_pem(LineEnding::LF).unwrap();
    let pubkey_hash = md5::compute(public_key_pem.as_bytes());
    let did = format!("did:fan:{:x}", pubkey_hash);

    // Encrypt the private key with the provided password
    let (encrypted_key, salt, iv) = encrypt_private_key(&private_key, &password)
        .map_err(|e| format!("Encryption error: {}", e))?;

    // Convert public key to JWK format for Dexie storage
    let public_key_jwk = public_key_to_jwk(&public_key);

    // Prepare the result as a JSON object to be returned to the frontend
    let identity = json!({
        "did": did,
        "name": name,
        "encrypted_key": encrypted_key,
        "salt": salt,
        "iv": iv,
        "public_key_jwk": public_key_jwk
    });

    Ok(identity)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![create_identity])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
