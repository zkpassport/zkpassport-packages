use zkpassport_bridge::BridgeSession;
fn main() {
    let s = BridgeSession::new(
        "0256b328b30c8bf5839e24058747879408bdb36241dc9c2e7c619faa12b2920967",
        &[7u8; 32],
    ).unwrap();
    // High-entropy payload like a real proof: LCG bytes → hex, ~36KB
    let mut x: u64 = 12345;
    let proof: String = (0..18000).map(|_| {
        x = x.wrapping_mul(6364136223846793005).wrapping_add(1442695040888963407);
        format!("{:02x}", (x >> 33) as u8)
    }).collect();
    let frames = s.encrypt_messages("proof",
        &serde_json::json!({"proof": proof, "index": 0, "total": 4, "name": "test"}),
        &[3u8; 32]).unwrap();
    println!("{}", serde_json::to_string(&frames).unwrap());
}
